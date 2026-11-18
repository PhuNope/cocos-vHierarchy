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


test('native Cocos owns both parent and sibling drop intent: no custom row classifier',()=>{
  assert.doesNotMatch(renderer,/function dropMode\(/);
  assert.doesNotMatch(renderer,/function updateDropTarget\(/);
  assert.doesNotMatch(renderer,/function observeDropTarget\(/);
  assert.doesNotMatch(renderer,/data-vh-drop-parent',\s*'true'/);
  assert.doesNotMatch(renderer,/setAttribute\('data-vh-drop-mode'/);
  assert.doesNotMatch(renderer,/querySelector\(':scope > \.tree-node:hover'/);
  assert.doesNotMatch(renderer,/addEventListener\('dragover'/);
  assert.doesNotMatch(renderer,/addEventListener\('drop'/);
  assert.match(renderer,/clearLegacyDropPreview\(tree\)/);
});

test('visual-only native dotted marker aligns with hierarchy 20px Active gutter',()=>{
  assert.match(renderer,/\.tree\[data-vh-lock-gutter\]:not\(\[searching\]\) \+ \.drop-box > \.vertical-line,/);
  assert.match(renderer,/\.drop-box > \.horizontal-line \{\s*translate:var\(--vh-drop-rail-shift\) 0 !important/);
  assert.match(renderer,/--vh-drop-rail-shift:0px/);
  assert.match(renderer,/--vh-drop-rail-shift:20px/);
  assert.doesNotMatch(renderer,/clip-path:inset\(-1000px -1000px -1000px 20px\)/);
  assert.doesNotMatch(renderer,/border-left-color:transparent !important/);
  assert.match(renderer,/\.tree\[hoving\] > \.tree-node > \.drag-item > \.vh-action-gutter \{\s*pointer-events:none !important/);
  assert.match(renderer,/\.drop-box\[data-vh-thin-insert='true'\] \{/);
  assert.match(renderer,/transparent var\(--vh-insert-rail-x\)/);
  assert.match(renderer,/display:block !important; visibility:visible !important/);
  assert.match(renderer,/\.drop-box\[data-vh-thin-insert='true'\] > \.horizontal-line \{\s*visibility:hidden !important/);
  assert.doesNotMatch(renderer,/addEventListener\(['"]dragover/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*transform:translateX/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*pointer-events:auto/);
  assert.match(renderer,/--vh-action-gutter-width:22px/);
  assert.match(renderer,/--vh-action-gutter-width:42px/);
});

test('native Cocos box height, border and background remain under its control',()=>{
  assert.doesNotMatch(renderer,/background-image:linear-gradient\(90deg,\s*transparent 0,\s*transparent calc\(var\(--vh-drop-rail-start\)/);
  assert.doesNotMatch(renderer,/\.drop-box\[data-vh-drop-mode='parent'\]/);
  assert.doesNotMatch(renderer,/\.tree-node\[data-vh-drop-parent\]::before/);
  assert.doesNotMatch(renderer,/\.drop-box::before\s*\{/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*border-top-color:transparent/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*border-bottom-color:transparent/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*height:/);
  assert.match(renderer,/\.content > \.tree\[hoving\] \+ \.drop-box \{\s*z-index:2 !important; pointer-events:none !important/);
});

test('reorder and parent drop keep native indicator without injecting false parent attrs',()=>{
  const start=renderer.indexOf('function clearLegacyDropPreview(tree) {');
  const end=renderer.indexOf('function observeTree(',start);
  assert.ok(start>0&&end>start);
  const row={removed:[],removeAttribute(name){this.removed.push(name);}};
  const box={removed:[],classList:{contains:name=>name==='drop-box'},removeAttribute(name){this.removed.push(name);}};
  const tree={nextElementSibling:box,querySelectorAll(selector){
    assert.equal(selector,':scope > .tree-node[data-vh-drop-parent]');
    return [row];
  }};
  const scope={};
  vm.runInNewContext(renderer.slice(start,end)+'\nthis.clean=clearLegacyDropPreview;',scope);
  scope.clean(tree);
  assert.deepEqual(row.removed,['data-vh-drop-parent']);
  assert.deepEqual(box.removed,['data-vh-drop-mode']);
});

test('legacy drop markup is removed when upgrading from Patch 36, not reintroduced',()=>{
  assert.match(renderer,/function clearLegacyDropPreview\(tree\)/);
  assert.match(renderer,/row\.removeAttribute\('data-vh-drop-parent'\)/);
  assert.match(renderer,/box\.removeAttribute\('data-vh-drop-mode'\)/);
  assert.doesNotMatch(renderer,/setAttribute\('data-vh-drop-parent'/);
  assert.doesNotMatch(renderer,/setAttribute\('data-vh-drop-mode'/);
});

test('native Cocos determines drop intent; only clearly thin insertion preview changes paint',()=>{
  assert.match(renderer,/Native Cocos alone determines parent versus sibling insertion/);
  assert.match(renderer,/const thin = area\.height > 0 && area\.height <= 5/);
  assert.match(renderer,/const x = Math\.round\(rail\.left - area\.left\)/);
  assert.match(renderer,/const valid = Number\.isFinite\(x\)/);
  assert.doesNotMatch(renderer,/const nativeParentArea/);
  assert.doesNotMatch(renderer,/dropMode\(pointer/);
  assert.doesNotMatch(renderer,/setAttribute\('data-vh-drop-mode'/);
  assert.doesNotMatch(renderer,/addEventListener\(['"]dragover/);
});

test('selected normal guide highlight and native Prefab text are unchanged',()=>{
  assert.match(renderer,/VHierarchyGuides\.selectedGuides\(result\.nodes/);
  assert.match(renderer,/item\.row\.getAttribute\('is-selected'\) === 'true'/);
  assert.match(renderer,/data-vh-guide-selected-elbow/);
  assert.match(renderer,/data-vh-guide-through-elbow/);
  assert.match(renderer,/border-left-color:var\(--color-focus-border,#47bdf1\) !important/);
  assert.match(renderer,/border-bottom-color:var\(--color-focus-border,#47bdf1\) !important/);
  assert.doesNotMatch(renderer,/\.tree-node\[data-vh-drop-parent\] > \.drag-item/);
});

test('guide shortcuts never cancel mousedown or pointerdown required for native drag and HUD clicks',()=>{
  assert.doesNotMatch(renderer,/addEventListener\(['"]mousedown['"],\s*guideDown/);
  assert.doesNotMatch(renderer,/addEventListener\(['"]pointerdown['"],\s*guideDown/);
  assert.match(renderer,/root\.addEventListener\('click', guideClick, true\)/);
  assert.match(renderer,/root\.removeEventListener\('click', guideClick, true\)/);
});

test('new plugin build replaces stale renderer and CSS',()=>{
  assert.match(renderer,/const BUILD_ID = '0\.1\.1-patch39-native-rail-junction'/);
  assert.match(renderer,/if \(w\.__vHierarchy388\.buildId === BUILD_ID\)/);
  assert.match(renderer,/w\.__vHierarchy388\.stop\(\)/);
  assert.match(renderer,/delete w\.__vHierarchy388/);
  assert.match(renderer,/w\.__vHierarchy388 = \{ buildId: BUILD_ID,/);
  assert.match(renderer,/if \(existing\) \{\s*if \(existing\.textContent !== CSS\)\s*existing\.textContent = CSS;/);
});

test('regular tree updates still detect native expand/select without drag observers',()=>{
  assert.match(renderer,/observeTree\(tree\)/);
  assert.match(renderer,/pruneTreeObservers\(\)/);
  assert.doesNotMatch(renderer,/dropObservers/);
  assert.doesNotMatch(renderer,/MutationObserver\(\(\) => requestDropUpdate/);
});

test('thin native insertion line begins at actual dotted X without changing parent preview',()=>{
  const start=renderer.indexOf('function syncNativeDropPaint(box) {');
  const end=renderer.indexOf('function observeNativeDropPaint(tree) {',start);
  assert.ok(start>0&&end>start);
  const env={state:{options:{enabled:true}}};
  vm.runInNewContext(renderer.slice(start,end)+'\nthis.sync=syncNativeDropPaint;',env);
  const attrs=new Map(),css=new Map();
  const style={getPropertyValue:k=>css.get(k)||'',setProperty:(k,v)=>css.set(k,v),removeProperty:k=>css.delete(k)};
  let height=2,left=69;
  const marker={getBoundingClientRect:()=>({left,height:10})};
  const tree={classList:{contains:k=>k==='tree'},hasAttribute:k=>k==='hoving'};
  const box={previousElementSibling:tree,querySelector:()=>marker,
    getBoundingClientRect:()=>({left:27,height,width:420}),style,
    getAttribute:k=>attrs.get(k)||null,
    setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
  env.sync(box);
  assert.equal(attrs.get('data-vh-thin-insert'),'true');
  assert.equal(css.get('--vh-insert-rail-x'),'42px');
  height=40;env.sync(box);
  assert.equal(attrs.has('data-vh-thin-insert'),false);
  assert.equal(css.has('--vh-insert-rail-x'),false);
  height=2;left=500;env.sync(box);
  assert.equal(attrs.has('data-vh-thin-insert'),false);
});
