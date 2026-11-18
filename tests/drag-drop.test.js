const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const renderer = fs.readFileSync(path.join(__dirname, '../dist/renderer/renderer.js'), 'utf8');

/** Minimal DOM for the Cocos 3.8.8 native hierarchy structure:
 * .hierarchy > .content > (.tree + .drop-box + .scroll-bar).
 * No browser/Cocos runtime dependencies are needed for mounting regression. */
class Node {
  constructor(tag, classes = '') {
    this.tagName = tag;
    this.className = classes;
    this.children = [];
    this.attributes = new Map();
    this.parentElement = null;
    this.classList = {contains: cls => this.className.split(/\s+/).includes(cls)};
  }
  get firstChild() {return this.children[0] || null;}
  get lastElementChild() {return this.children.at(-1) || null;}
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.remove();
      node.parentElement = this; this.children.push(node);
    }
  }
  insertBefore(node, before) {
    if (node.parentElement) node.remove();
    const i = this.children.indexOf(before);
    assert.ok(i >= 0, 'anchor must be existing child');
    node.parentElement = this;
    this.children.splice(i, 0, node);
  }
  remove() {
    if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
    this.parentElement = null;
  }
  replaceChildren(...children) {for (const n of [...this.children]) n.remove(); this.append(...children);}
  setAttribute(k,v) {this.attributes.set(k,v);}
  getAttribute(k) {return this.attributes.get(k) ?? null;}
  addEventListener() {}
  querySelector(sel) {
    if (sel.startsWith(':scope > .')) {
      const cls = sel.slice(':scope > .'.length);
      return this.children.find(n => n.classList.contains(cls)) || null;
    }
    if (sel === '[title="Scene selector"]') return null;
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      const search = node => {
        for (const child of node.children) {
          if (child.classList.contains(cls)) return child;
          const deep = search(child); if (deep) return deep;
        }
        return null;
      };
      return search(this);
    }
    throw Error('unsupported mocked selector: ' + sel);
  }
  querySelectorAll(selector) {
    if (selector === 'button') return [];
    throw Error('unexpected selector: ' + selector);
  }
}
function fixture() {
  const hierarchy = new Node('div','hierarchy');
  const header = new Node('header','header');
  const content = new Node('section','content');
  const tree = new Node('ui-drag-area','tree');
  const dropBox = new Node('div','drop-box');
  const scrollBar = new Node('div','scroll-bar');
  content.append(tree,dropBox,scrollBar);
  hierarchy.append(header,content);
  return {hierarchy,content,tree,dropBox,scrollBar};
}
function controls() {
  const start = renderer.indexOf('function findToolbar(container) {');
  const end = renderer.indexOf('function observeTree(tree) {', start);
  assert.ok(start > 0 && end > start, 'compiled renderer must expose toolbar mounting functions');
  const code = renderer.slice(start,end);
  const options = {enabled:true,navigationBar:true,sceneSelector:false};
  const env = {
    state:{options,bookmarks:[]}, searchText:'', lastHovered:null,
    el:(tag,cls,text) => {
      const node = new Node(tag,cls);
      node.textContent = text || '';
      return node;
    },
    btn:(label,title,run,cls='vh-btn') => {
      const node = new Node('button',cls);
      node.title=title;
      node.textContent=label;
      return node;
    },
  };
  vm.runInNewContext(code + '\nthis.renderToolbar=renderToolbar;',env);
  return {mount:env.renderToolbar, options};
}

test('toolbar is mounted OUTSIDE native scroll/drop coordinate system',()=>{
  const f=fixture();const {mount}=controls();
  mount(f.tree);
  assert.deepEqual(f.content.children,[f.tree,f.dropBox,f.scrollBar]);
  assert.equal(f.hierarchy.children[1].className,'vh-toolbar');
  assert.equal(f.hierarchy.children[2],f.content);
  mount(f.tree);
  assert.equal(f.hierarchy.children.filter(n => n.className==='vh-toolbar').length,1);
  assert.deepEqual(f.content.children,[f.tree,f.dropBox,f.scrollBar]);
});

test('legacy toolbar injected inside .content is migrated before drag drop',()=>{
  const f=fixture(); const {mount,options}=controls();
  const legacy=new Node('div','vh-toolbar');
  legacy.append(new Node('div','vh-bookmarks'));
  f.content.insertBefore(legacy,f.tree);
  assert.equal(f.content.children[0],legacy);
  mount(f.tree);
  assert.deepEqual(f.content.children,[f.tree,f.dropBox,f.scrollBar]);
  assert.equal(f.hierarchy.children[1],legacy);
  options.navigationBar=false;
  mount(f.tree);
  assert.equal(legacy.parentElement,null);
  assert.deepEqual(f.content.children,[f.tree,f.dropBox,f.scrollBar]);
});

test('native horizontal insertion line is painted once at the dotted trunk without moving the drop target',()=>{
  assert.match(renderer,/\.tree\[data-vh-lock-gutter\]:not\(\[searching\]\) \+ \.drop-box > \.vertical-line \{\s*translate:0px 0 !important/);
  assert.match(renderer,/\.tree\[data-vh-lock-gutter\]\[data-vh-quick-toggle\]:not\(\[searching\]\) \+ \.drop-box > \.vertical-line \{\s*translate:20px 0 !important/);
  assert.match(renderer,/border-color:transparent !important/);
  assert.match(renderer,/\.content > \.tree\[hoving\] \+ \.drop-box \{\s*z-index:2 !important; pointer-events:none !important/);
  assert.match(renderer,/\.drop-box > \.horizontal-line \{\s*translate:var\(--vh-drop-rail-start\) 0 !important/);
  assert.match(renderer,/background-position:left bottom !important/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*transform:translateX/);
  assert.match(renderer,/--vh-action-gutter-width:22px/);
  assert.match(renderer,/--vh-action-gutter-width:42px/);
});
test('selected guide path uses native is-selected, keeps parent elbow distinct, and cleans up',()=>{
  assert.match(renderer,/VHierarchyGuides\.selectedGuides\(result\.nodes/);
  assert.match(renderer,/item\.row\.getAttribute\('is-selected'\) === 'true'/);
  assert.match(renderer,/data-vh-guide-selected-elbow/);
  assert.match(renderer,/data-vh-guide-through-elbow/);
  assert.match(renderer,/border-left-color:var\(--color-focus-border,#47bdf1\) !important/);
  assert.match(renderer,/border-bottom-color:var\(--color-focus-border,#47bdf1\) !important/);
  assert.match(renderer,/for \(const name of \['data-vh-guide',\s*'data-vh-elbow',\s*'data-vh-guide-selected'/);
});
test('native drag/drop owns events and no custom correction loop interferes with clicks or prefab drag',()=>{
  assert.doesNotMatch(renderer,/function alignDropGuide/);
  assert.doesNotMatch(renderer,/observeDropGuide\(tree\)/);
  assert.doesNotMatch(renderer,/treeGuideRows\.set/);
  assert.doesNotMatch(renderer,/--vh-drop-vertical-shift/);
  assert.doesNotMatch(renderer,/addEventListener\(['"]dragover['"]/);
  assert.doesNotMatch(renderer,/addEventListener\(['"]drop['"]/);
  assert.doesNotMatch(renderer,/addEventListener\(['"]mousedown['"],\s*guideDown/);
});
test('native drop-box borders are transparent and only one bottom background line is drawn',()=>{
  // Creator 3.8.8 uses a 2px border on .drop-box AND a separate dashed vertical child.
  // Leaving the former visible produces the reported cyan line one indent outside.
  assert.match(renderer,/\.tree\[data-vh-lock-gutter\]:not\(\[searching\]\) \+ \.drop-box \{\s*--vh-drop-rail-start:0px;\s*border-color:transparent !important/);
  assert.match(renderer,/\.drop-box > \.vertical-line \{\s*translate:0px 0 !important/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*border-left-width:0/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*display:none/);
  assert.match(renderer,/\.content > \.tree\[hoving\] \+ \.drop-box \{\s*z-index:2 !important; pointer-events:none !important/);
});
test('guide shortcuts never cancel mousedown or pointerdown required for native drag and HUD clicks',()=>{
  assert.doesNotMatch(renderer,/addEventListener\(['"]mousedown['"],\s*guideDown/);
  assert.doesNotMatch(renderer,/addEventListener\(['"]pointerdown['"],\s*guideDown/);
  assert.match(renderer,/root\.addEventListener\('click', guideClick, true\)/);
  assert.match(renderer,/root\.removeEventListener\('click', guideClick, true\)/);
});
test('new plugin build replaces a stale renderer instead of reusing its old CSS',()=>{
  assert.match(renderer,/const BUILD_ID = '0\.1\.1-patch34-single-drop-line'/);
  assert.match(renderer,/if \(w\.__vHierarchy388\.buildId === BUILD_ID\)/);
  assert.match(renderer,/w\.__vHierarchy388\.stop\(\)/);
  assert.match(renderer,/delete w\.__vHierarchy388/);
  assert.match(renderer,/w\.__vHierarchy388 = \{ buildId: BUILD_ID,/);
});
test('existing renderer stylesheet is updated whenever injected CSS changes',()=>{
  assert.match(renderer,/if \(existing\) \{\s*if \(existing\.textContent !== CSS\)\s*existing\.textContent = CSS;/);
  assert.match(renderer,/function stats\(\) \{ return \{ version: '0\.1\.1', build: BUILD_ID,/);
});

test('drag dotted rail aligns to guide trunk instead of custom prefab icon for both toggle widths',()=>{
  // Screenshot regression: native rail x35, visible vHierarchy trunk x55,
  // unwanted Patch 31 dot at x75 beside the prefab icon.
  const nativeRailX=35;
  const expectedPaintedRail=(quickToggle)=>nativeRailX+(quickToggle?20:0);
  assert.equal(expectedPaintedRail(true),55);
  assert.equal(expectedPaintedRail(false),35);
  assert.notEqual(expectedPaintedRail(true),75, 'must not move one indent too far toward icon');
  assert.match(renderer,/It starts exactly on the corrected dotted vertical child rail/);
  assert.doesNotMatch(renderer,/translate:40px 0 !important/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*translate:/);
  assert.match(renderer,/\.drop-box > \.horizontal-line \{\s*translate:var\(--vh-drop-rail-start\) 0 !important/);
  assert.match(renderer,/background-position:left bottom !important/);
});


// Regression for screenshot where both a cyan bar at the top and a second cyan
// bar at the intended drop boundary were visible. The old ::before + native
// two-sided border combination must never return.
test('one horizontal rule at the bottom of short and tall native drop boxes',()=>{
  assert.match(renderer,/background-image:linear-gradient\(90deg,/);
  assert.match(renderer,/transparent calc\(var\(--vh-drop-rail-start\) \+ 1px\)/);
  assert.match(renderer,/var\(--color-focus-border\) calc\(var\(--vh-drop-rail-start\) \+ 1px\)/);
  assert.match(renderer,/background-repeat:no-repeat !important/);
  assert.match(renderer,/background-origin:border-box !important/);
  assert.match(renderer,/background-position:left bottom !important/);
  assert.match(renderer,/background-size:100% 2px !important/);
  assert.match(renderer,/border-color:transparent !important/);
  assert.match(renderer,/\.drop-box::before \{\s*content:none !important/);
  assert.doesNotMatch(renderer,/\.drop-box::before \{[^}]*height:2px/);
  assert.doesNotMatch(renderer,/\.drop-box::before \{[^}]*background:var\(--color-focus-border\)/);
  assert.match(renderer,/\.drop-box > \.horizontal-line \{\s*translate:var\(--vh-drop-rail-start\) 0 !important/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*transform:translateX/);
  // Source geometry for native marker: border box starts x34, dotted child
  // left x35. Only the optional Active column shifts both junctions +20.
  const boxX=34;
  for (const active of [false,true]) {
    const shift=active?20:0;
    const dotX=boxX+1+shift;
    const horizontalStart=boxX+1+shift;
    assert.equal(horizontalStart,dotX);
    assert.equal(dotX,active?55:35);
  }
});
test('native Cocos pointer/drop handling and unrelated search marker remain intact',()=>{
  assert.match(renderer,/\.tree\[data-vh-lock-gutter\]:not\(\[searching\]\) \+ \.drop-box/);
  assert.doesNotMatch(renderer,/addEventListener\(['"]dragover['"]/);
  assert.doesNotMatch(renderer,/addEventListener\(['"]mousedown['"],\s*guideDown/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*pointer-events:auto/);
});
