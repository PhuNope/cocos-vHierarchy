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
  assert.match(renderer,/\.content > \.tree\[data-vh-lock-gutter\]\[hoving\]:not\(\[searching\]\) \+ \.drop-box/);
  assert.match(renderer,/transform:translateX\(var\(--vh-action-gutter-width\)\)/);
  assert.match(renderer,/max-width:calc\(100% - var\(--vh-action-gutter-width\)\)/);
  assert.match(renderer,/\.content > \.tree\[hoving\] \+ \.drop-box\s*\{\s*z-index:2 !important; pointer-events:none !important/);
  assert.match(renderer,/--vh-action-gutter-width:22px/);
  assert.match(renderer,/--vh-action-gutter-width:42px/);
  assert.doesNotMatch(renderer,/\.drop-box\s*\{[^}]*pointer-events:auto/);
  assert.doesNotMatch(renderer,/addEventListener\('dragover'/);
  assert.doesNotMatch(renderer,/addEventListener\('drop'/);
});
