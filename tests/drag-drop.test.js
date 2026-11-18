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
  assert.match(renderer,/addEventListener\('dragover', passiveDragOver, \{ capture: true, passive: true \}\)/);
  assert.doesNotMatch(renderer,/addEventListener\('drop'/);
  assert.match(renderer,/clearLegacyDropPreview\(tree\)/);
});

test('native Cocos horizontal border is untouched and actual vHierarchy vertical rail changes to dashed',()=>{
  assert.match(renderer,/\.drop-box > \.vertical-line \{\s*translate:var\(--vh-drop-rail-shift\) 0 !important/);
  assert.match(renderer,/--vh-drop-rail-shift:0px/);
  assert.match(renderer,/--vh-drop-rail-shift:20px/);
  assert.match(renderer,/\.drop-box > \.vertical-line \{\s*visibility:hidden !important/);
  assert.match(renderer,/\.tree\[hoving\] > \.tree-node\[data-vh-drop-dashed='true'\] > ui-drag-item\.drag-item::before/);
  assert.match(renderer,/background-image:var\(--vh-guide-drop-images\) !important/);
  assert.match(renderer,/background-position:var\(--vh-guide-drop-positions\) !important/);
  assert.match(renderer,/background-size:var\(--vh-guide-drop-sizes\) !important/);
  assert.match(renderer,/border-left-color:transparent !important/);
  assert.match(renderer,/border-bottom-color:transparent !important/);
  assert.match(renderer,/background-size:100% 1px !important/);
  assert.doesNotMatch(renderer,/border-left-style:dashed !important/);
  assert.match(renderer,/\.drop-box\[data-vh-node-outline='true'\]::before/);
  assert.match(renderer,/\.drop-box\[data-vh-node-outline='true'\] > \.horizontal-line \{\s*visibility:hidden !important/);
  assert.match(renderer,/repeating-linear-gradient\(to bottom/);
  assert.doesNotMatch(renderer,/\.drop-box\[data-vh-thin-insert='true'\] \{/);
  assert.doesNotMatch(renderer,/\.drop-box > \.horizontal-line \{\s*translate:/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*border-color:transparent/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*background-image:linear-gradient/);
  assert.doesNotMatch(renderer,/clip-path:inset/);
  assert.match(renderer,/addEventListener\('dragover', passiveDragOver, \{ capture: true, passive: true \}\)/);
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

test('native Cocos retains its original parent and sibling drop target',()=>{
  assert.match(renderer,/The HORIZONTAL drop border and parent outline are 100% native Cocos/);
  assert.match(renderer,/const nativeBorder\s*=/);
  assert.match(renderer,/function drawDottedGuideRow\(/);
  assert.doesNotMatch(renderer,/const nativeParentArea/);
  assert.doesNotMatch(renderer,/dropMode\(pointer/);
  assert.doesNotMatch(renderer,/setAttribute\('data-vh-drop-mode'/);
  assert.match(renderer,/addEventListener\('dragover', passiveDragOver, \{ capture: true, passive: true \}\)/);
  assert.doesNotMatch(renderer,/const thin = area\.height/);
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
  assert.match(renderer,/const BUILD_ID = '0\.1\.1-patch43-ancestor-drop-path'/);
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

test('four-level hover paints every parent-child vertical half and the target elbow',()=>{
  const start=renderer.indexOf('const DROP_DASH_IMAGE =');
  const end=renderer.indexOf('function observeNativeDropPaint(tree) {',start);
  assert.ok(start>0&&end>start);
  function el(top,bottom,left=50,right=450){
    const a=new Map(),s=new Map();
    return {
      a,s,hasAttribute:k=>a.has(k),getAttribute:k=>a.get(k)||null,
      setAttribute:(k,v)=>a.set(k,v),removeAttribute:k=>a.delete(k),
      matches:()=>false,
      style:{getPropertyValue:k=>s.get(k)||'',setProperty:(k,v)=>s.set(k,v),removeProperty:k=>s.delete(k)},
      getBoundingClientRect:()=>({top,bottom,left,right,height:bottom-top,width:right-left}),
    };
  }
  const tree=el(0,300),box=el(140,160,0,450);
  tree.classList={contains:k=>k==='tree'};
  tree.setAttribute('hoving','');
  box.previousElementSibling=tree;
  const nodes=[0,1,2,3,4].map(depth=>({
    valid:true,depth,indent:20+20*depth,offset:0,parent:depth?depth-1:null,
  }));
  const result={nodes,layout:{base:19,step:20}};
  const items=nodes.map((node,index)=>{
    const row=el(80+index*20,100+index*20);
    row.parentElement=tree;
    if(index)row.setAttribute('data-vh-elbow','true');
    return {row,drag:el(80+index*20,100+index*20),
      guidePaint:index?[{level:index,image:'linear-gradient(gray,gray)',position:'20px top',size:'1px 100%'}]:[],
      guide:{group:null,index,result},
    };
  });
  for(const item of items)item.guide.group=items;
  const nativeDropHover=new WeakMap([[tree,{row:items[3].row,y:150}]]);
  const env={state:{options:{enabled:true,hierarchyLines:true}},
    views:items,nativeDropHover,nativeDropPaintedRows:new Map()};
  vm.runInNewContext(renderer.slice(start,end)+'\nthis.sync=syncNativeDropPaint;',env);

  env.sync(box);
  for(let i=0;i<=3;i++){
    assert.equal(items[i].row.a.get('data-vh-drop-dashed'),'true','level '+i+' has dotted path');
    assert.match(items[i].row.s.get('--vh-guide-drop-images'),/repeating-linear-gradient/);
  }
  assert.equal(items[1].row.s.get('--vh-guide-drop-sizes'),'1px 10px, 1px 10px');
  assert.equal(items[2].row.s.get('--vh-guide-drop-sizes'),'1px 10px, 1px 10px');
  assert.equal(items[3].row.a.get('data-vh-drop-dashed-elbow'),'true');
  assert.equal(box.a.get('data-vh-node-outline'),'true');
  assert.equal(items[4].row.a.has('data-vh-drop-dashed'),false);

  // Inserting below a deeply nested parent extends the branch to the native
  // bottom insertion border, including descendants the previous patch omitted.
  nativeDropHover.set(tree,{row:items[3].row,y:159});
  box.getBoundingClientRect=()=>({top:140,bottom:180,left:0,right:450,height:40,width:450});
  env.sync(box);
  assert.equal(box.a.has('data-vh-node-outline'),false);
  assert.equal(items[4].row.a.get('data-vh-drop-dashed'),'true');
  assert.match(items[4].row.s.get('--vh-guide-drop-sizes'),/1px 20px/);
  assert.match(items[3].row.s.get('--vh-guide-drop-sizes'),/1px 20px/);

  // Inserting before same node stops at its TOP border; do not paint an
  // unrelated dotted route through the destination node itself.
  nativeDropHover.set(tree,{row:items[3].row,y:141});
  box.getBoundingClientRect=()=>({top:140,bottom:160,left:0,right:450,height:20,width:450});
  env.sync(box);
  assert.equal(items[2].row.a.get('data-vh-drop-dashed'),'true');
  assert.equal(items[3].row.a.has('data-vh-drop-dashed'),false);
  assert.equal(items[4].row.a.has('data-vh-drop-dashed'),false);

  tree.removeAttribute('hoving');
  env.sync(box);
  for(const item of items){
    assert.equal(item.row.a.has('data-vh-drop-dashed'),false);
    assert.equal(item.row.a.has('data-vh-drop-dashed-elbow'),false);
    assert.equal(item.row.s.has('--vh-guide-drop-images'),false);
  }
  assert.equal(box.a.has('data-vh-node-outline'),false);
  assert.equal(tree.a.has('data-vh-dotted-native-replaced'),false);
});

test('passive dragover observes position only; does not change native drop actions',()=>{
  assert.match(renderer,/tree\.addEventListener\('dragover', passiveDragOver, \{ capture: true, passive: true \}\)/);
  assert.match(renderer,/tree\.removeEventListener\('dragover', handler, true\)/);
  assert.match(renderer,/const nativeBorder/);
  assert.match(renderer,/function drawDottedGuideRow/);
  const a=renderer.indexOf('const passiveDragOver =');
  const b=renderer.indexOf("tree.addEventListener('dragover', passiveDragOver",a);
  assert.ok(a>0&&b>a);
  const handler=renderer.slice(a,b);
  assert.doesNotMatch(handler,/preventDefault|stopPropagation|stopImmediatePropagation/);
});


test('center-node outline is SOLID from nested branch to far right, excluding Lock and Active',()=>{
  const start=renderer.indexOf('function clearNodeOutline(box) {');
  const end=renderer.indexOf('function clearNativeDropPaint(box) {',start);
  assert.ok(start>0&&end>start);
  const attrs=new Map(),css=new Map();
  const box={
    hasAttribute:k=>attrs.has(k),getAttribute:k=>attrs.get(k)||null,
    setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),
    style:{
      getPropertyValue:k=>css.get(k)||'',
      setProperty:(k,v)=>css.set(k,v),
      removeProperty:k=>css.delete(k),
    },
  };
  const target={
    drag:{getBoundingClientRect:()=>({left:53})},
    guide:{index:3,result:{nodes:[null,null,null,{depth:3,offset:0,valid:true}],
      layout:{base:19,step:20}}},
  };
  const env={NODE_OUTLINE_PROPS:[
    '--vh-node-outline-left','--vh-node-outline-top',
    '--vh-node-outline-width','--vh-node-outline-height',
  ]};
  vm.runInNewContext(renderer.slice(start,end)+'\nthis.sync=syncNodeOutline;this.clear=clearNodeOutline;',env);
  env.sync(box,target,
    {left:0,top:95,right:463,bottom:215},
    {left:53,top:115,right:463,bottom:135});
  assert.equal(attrs.get('data-vh-node-outline'),'true');
  assert.equal(css.get('--vh-node-outline-left'),'120px');
  assert.equal(css.get('--vh-node-outline-top'),'18px');
  assert.equal(css.get('--vh-node-outline-height'),'20px');
  assert.equal(css.get('--vh-node-outline-width'),'340px');
  env.clear(box);
  assert.equal(attrs.has('data-vh-node-outline'),false);
  assert.equal(css.size,0);
});

test('node outline has solid border but sibling horizontal insertion stays Cocos native',()=>{
  assert.match(renderer,/\.drop-box\[data-vh-node-outline='true'\] \{\s*border-color:transparent !important/);
  assert.match(renderer,/border:1px solid var\(--color-focus-border,#47bdf1\)/);
  assert.match(renderer,/background:none !important/);
  assert.match(renderer,/const branchX\s*=/);
  assert.match(renderer,/if \(centerHover\)\s*syncNodeOutline\(box, target, nativeRect, targetRect\)/);
  assert.match(renderer,/else\s*clearNodeOutline\(box\)/);
  assert.match(renderer,/function clearNativeDropPaint\(box\) \{\s*clearNodeOutline\(box\)/);
  assert.match(renderer,/\.content > \.tree\[hoving\] \+ \.drop-box \{\s*z-index:2 !important; pointer-events:none !important/);
  assert.doesNotMatch(renderer,/\.drop-box\[data-vh-thin-insert='true'\]/);
  assert.doesNotMatch(renderer,/\.drop-box > \.horizontal-line \{\s*translate:/);
});
