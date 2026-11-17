const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const renderer = fs.readFileSync(path.join(__dirname,'../dist/renderer/renderer.js'),'utf8');
test('renderer uses a native checkbox and no active glyph button',()=>{
  assert.match(renderer, /checkbox.type = 'checkbox'/);
  assert.match(renderer, /checkbox.addEventListener\('change'/);
  assert.doesNotMatch(renderer, /btn\('◉'/);
});
test('renderer observes native hierarchy mutations instead of waiting for interval',()=>{
  assert.match(renderer, /watcher.observe\(tree,/);
  assert.match(renderer, /childList: true, subtree: true, attributes: true/);
  assert.match(renderer, /attributeFilter: \['is-expand', 'is-parent', 'is-active'/);
  assert.match(renderer, /for \(const watcher of treeObservers.values\(\)\)\s*watcher.disconnect\(\)/);
});
test('lock moves to dedicated left gutter rather than crossing guide lines',()=>{
  assert.match(renderer, /padding-left:20px !important/);
  assert.match(renderer, /left:-20px !important/);
  assert.match(renderer, /data-vh-lock-gutter/);
});
test('removes old component dots and never creates component minimap holder',()=>{
  assert.doesNotMatch(renderer,/className.*vh-dot|vh-dot.*background/);
  assert.doesNotMatch(renderer,/\['componentMinimap'/);
  assert.match(renderer,/querySelector\(':scope > \.vh-components'\)\?\.remove\(\)/);
});

test('checkbox only shows on node hover and never replaces Cocos component icon',()=>{
  assert.match(renderer,/visibility:hidden; opacity:0; pointer-events:none/);
  assert.match(renderer,/tree-node:hover > \.drag-item > \.vh-active/);
  assert.match(renderer,/ui-icon\[default="asset"\]\[value="typescript"\]/);
  assert.match(renderer,/insertBefore\(checkbox, nativeComponent\)/);
  assert.doesNotMatch(renderer,/nativeComponent\.remove\(/);
});
test('hoverable native lock has a full-width gutter target and never display none',()=>{
  assert.match(renderer,/display:inline-flex !important/);
  assert.match(renderer,/width:22px; height:20px/);
  assert.match(renderer,/ui-icon\.lock:hover/);
  assert.match(renderer,/pointer-events:auto !important/);
});
test('Scene popup can close via explicit button, Escape and outside click',()=>{
  assert.match(renderer,/popupCleanup/);
  assert.match(renderer,/Close vHierarchy popup/);
  assert.match(renderer,/event\.key === 'Escape'/);
  assert.match(renderer,/event\.composedPath\(\)\.includes\(wrap\)/);
  assert.match(renderer,/query-assets', \{ ccType: 'cc.SceneAsset', extname: '\.scene' \}/);
  assert.match(renderer,/await VHierarchyScenes\.openVerified\(scene, req\)/);
  assert.doesNotMatch(renderer,/Message\?\.send\?\.\('scene', 'open-scene'/);
});
