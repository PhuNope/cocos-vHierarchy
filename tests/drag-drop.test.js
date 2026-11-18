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

test('drop marker correction affects only its visual overlay while native reorder remains untouched',()=>{
  assert.match(renderer,/\.content > \.tree\[data-vh-lock-gutter\]:not\(\[searching\]\) \+ \.drop-box/);
  assert.match(renderer,/\.content > \.tree\[data-vh-lock-gutter\]:not\(\[searching\]\) \+ \.drop-box > \.vertical-line/);
  assert.match(renderer,/translate:var\(--vh-drop-vertical-shift,0px\) 0 !important/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*transform:translateX/);
    assert.match(renderer,/\.content > \.tree\[hoving\] \+ \.drop-box\s*\{\s*z-index:2 !important; pointer-events:none !important/);
  assert.match(renderer,/--vh-action-gutter-width:22px/);
  assert.match(renderer,/--vh-action-gutter-width:42px/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*pointer-events:auto/);
  assert.match(renderer,/tree.addEventListener\('dragover',\s*onDrag,\s*true\)/);
  assert.match(renderer,/const vertical = hint\.querySelector\(':scope > \.vertical-line'\)/);
  assert.match(renderer,/const renderedX = markerRect\.left \+ markerRect\.width \/ 2/);
  assert.match(renderer,/VHierarchyGuides\.dropTrunkLevel\(result.nodes, index\)/);
  assert.match(renderer,/VHierarchyGuides\.dropTrunkShift\(renderedX, oldShift, guideX, step\)/);
  assert.match(renderer,/tree.addEventListener\('drop',\s*onDrag,\s*true\)/);
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
test('drop-rail correction is visually isolated and cleaned up on release',()=>{
  assert.match(renderer,/hint\.style\.setProperty\('--vh-drop-vertical-shift',\s*value\)/);
  assert.match(renderer,/hint\.style\.removeProperty\('--vh-drop-vertical-shift'\)/);
  assert.match(renderer,/tree\.removeEventListener\('dragover',\s*onDrag,\s*true\)/);
  assert.match(renderer,/dropFrames\.values\(\)/);
  assert.match(renderer,/const oldShift = Number\.parseFloat\(hint\.style\.getPropertyValue\('--vh-drop-vertical-shift'\)\) \|\| 0/);
  assert.match(renderer,/hintWatcher\.observe\(hint/);
  assert.match(renderer,/hintWatcher\.observe\(vertical/);
  assert.doesNotMatch(renderer,/event\.preventDefault\(\).*dragover/);
});
test('drop target alignment reads geometry in logarithmic scans and adapts child drops',()=>{
  assert.match(renderer,/const treeGuideRows = new WeakMap/);
  assert.match(renderer,/const mid = \(low \+ high\) >> 1/);
  assert.match(renderer,/for \(let i\s*=\s*low; i\s*<\s*Math.min\(targets.length, low\s*\+\s*3\); i\+\+\) \{/);
  assert.match(renderer,/The visual insertion marker conceptually belongs to the FIRST visible/);
  assert.doesNotMatch(renderer,/const guessedLevel = /);
  assert.match(renderer,/result.layout.base \+ \(trunkLevel - \.5\) \* step/);
  assert.match(renderer,/treeGuideRows.set\(tree, group\)/);
});

// A geometry-level DOM simulation of the exact screenshot regression:
// Cocos dotted rail x76 beside icon; vHierarchy parent trunk x56. The native
// horizontal line must not be moved or mutated, including after repeated drag
// events that cause reactive drop-box updates.
test('native x76 dotted rail moves to parent trunk x56 and preserves horizontal drop bar',()=>{
  const guidesJs=fs.readFileSync(path.join(__dirname,'../dist/renderer/guides.js'),'utf8');
  const guides=vm.runInNewContext(guidesJs+'\nVHierarchyGuides;',{});
  const rows=[0,1,2].map(depth=>({padding:12+depth*20,margin:0,anchor:90,reportedDepth:depth}));
  const result=guides.calculate(rows);
  const shiftStyle=new Map();
  let sets=0;
  const style={
    getPropertyValue:key=>shiftStyle.get(key)||'',
    setProperty:(key,value)=>{sets++;shiftStyle.set(key,value);},
    removeProperty:key=>shiftStyle.delete(key),
  };
  const horizontal={style:{left:'0px',top:'0px'},getBoundingClientRect:()=>({left:170,width:280})};
  const vertical={getBoundingClientRect:()=>({
    left:75.5+(Number.parseFloat(style.getPropertyValue('--vh-drop-vertical-shift'))||0),
    width:1,height:35,
  })};
  const hint={
    classList:{contains:v=>v==='drop-box'},
    style,
    getBoundingClientRect:()=>({left:75.5,top:160,width:280,height:2}),
    querySelector:selector=>selector===':scope > .vertical-line'?vertical:null,
  };
  const tree={nextElementSibling:hint,parentElement:{},hasAttribute:v=>v==='hoving'||v==='data-vh-lock-gutter'};
  const targets=[120,140,160].map((top,index)=>({
    drag:{getBoundingClientRect:()=>({top,left:34,bottom:top+20,width:400,height:20})},
    guide:{result,index},searching:false,
  }));
  const treeGuideRows=new WeakMap([[tree,targets]]);
  const start=renderer.indexOf('function alignDropGuide(tree) {');
  const end=renderer.indexOf('function syncDropGuide(tree) {',start);
  assert.ok(start>0&&end>start);
  const env={state:{options:{enabled:true,hierarchyLines:true}},treeGuideRows,VHierarchyGuides:guides};
  vm.runInNewContext(renderer.slice(start,end)+'\nthis.alignDropGuide=alignDropGuide;',env);
  env.alignDropGuide(tree);
  assert.equal(style.getPropertyValue('--vh-drop-vertical-shift'),'0px');
  assert.equal(vertical.getBoundingClientRect().left+.5,76);
  assert.equal(sets,1);
  assert.equal(horizontal.style.left,'0px');
  assert.equal(horizontal.style.top,'0px');
  env.alignDropGuide(tree);
  assert.equal(sets,1,'repeated events must converge, not accumulate another correction');
  tree.hasAttribute=v=>v==='data-vh-lock-gutter';
  env.alignDropGuide(tree);
  assert.equal(style.getPropertyValue('--vh-drop-vertical-shift'),'','remove correction when drag ends');
});

test('native drop-box solid left border is suppressed only while the corrected dotted rail is visible',()=>{
  // Creator 3.8.8 uses a 2px border on .drop-box AND a separate dashed vertical child.
  // Leaving the former visible produces the reported cyan line one indent outside.
  assert.match(renderer,/\.tree\[data-vh-lock-gutter\]\[hoving\]:not\(\[searching\]\) \+ \.drop-box \{\s*border-left-color:transparent !important/);
  assert.match(renderer,/\.drop-box > \.vertical-line \{\s*translate:var\(--vh-drop-vertical-shift,0px\) 0 !important/);
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
