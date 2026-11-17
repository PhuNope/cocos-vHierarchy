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
  assert.match(renderer, /padding-left:var\(--vh-action-gutter-width\) !important/);
  assert.match(renderer, /left:calc\(0px - var\(--vh-action-gutter-width\)\) !important/);
  assert.match(renderer, /data-vh-lock-gutter/);
});
test('removes old component dots and never creates component minimap holder',()=>{
  assert.doesNotMatch(renderer,/className.*vh-dot|vh-dot.*background/);
  assert.doesNotMatch(renderer,/\['componentMinimap'/);
  assert.match(renderer,/querySelector\(':scope > \.vh-components'\)\?\.remove\(\)/);
});

test('checkbox stays in the contiguous cell immediately RIGHT of native lock',()=>{
  assert.match(renderer,/\.vh-active-hit\s*\{\s*position:absolute; left:-20px; top:0; width:20px; height:20px/);
  assert.match(renderer,/visibility:hidden; opacity:0; pointer-events:none/);
  assert.match(renderer,/tree-node:hover > \.drag-item > \.vh-active-hit/);
  assert.match(renderer,/holder\.append\(checkbox, box\)/);
  assert.match(renderer,/nativeLock\.insertAdjacentElement\('afterend', holder\)/);
  assert.match(renderer,/checkbox\.type = 'checkbox'/);
  assert.match(renderer,/\.vh-active:checked \+ \.vh-active-box::after/);
  assert.doesNotMatch(renderer,/insertBefore\(checkbox, nativeComponent\)/);
  assert.doesNotMatch(renderer,/nativeComponent\.remove\(/);
});
test('left action slots have gap-free 42px hit regions, preserving guide space',()=>{
  const lock = /left:calc\(0px - var\(--vh-action-gutter-width\)\) !important;\s*width:22px; height:20px/;
  const active = /left:-20px; top:0; width:20px; height:20px/;
  assert.match(renderer,lock);
  assert.match(renderer,active);
  assert.match(renderer,/\.tree\[data-vh-lock-gutter\] \{[\s\S]*?padding-left:var\(--vh-action-gutter-width\) !important/);
  assert.match(renderer,/label, textarea, button, \[contenteditable\], \.vh-active-hit/);
});
test('palette icon is next to node name and does not cover right-aligned layer',()=>{
  assert.match(renderer,/item\.drag\.insertBefore\(paletteIcon, item\.nameEl\)/);
  assert.match(renderer,/\.vh-icon \{ position:relative; flex:0 0 15px/);
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


test('entire left action gutter is hoverable, including empty checkbox area',()=>{
  assert.match(renderer,/\.tree\[data-vh-lock-gutter\] > \.tree-node > \.drag-item > \.vh-action-gutter \{/);
  assert.match(renderer,/left:calc\(0px - var\(--vh-action-gutter-width\)\); top:0;\s*width:var\(--vh-action-gutter-width\); height:100%/);
  assert.match(renderer,/z-index:3; pointer-events:auto/);
  assert.match(renderer,/item\.drag\.prepend\(gutter\)/);
  assert.match(renderer,/gutter\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(renderer,/\.tree-node:hover > \.drag-item > \.vh-active-hit/);
  assert.match(renderer,/\.tree-node:hover > \.drag-item > \.vh-action-gutter/);
  assert.match(renderer,/ui-icon\.lock \{[\s\S]*?z-index:4/);
  assert.match(renderer,/\.vh-active-hit \{[\s\S]*?z-index:5/);
});
test('gutter has distinct subtle background with hover and selection states',()=>{
  assert.match(renderer,/border-right:1px solid rgba\(134,153,173,\.28\)/);
  assert.match(renderer,/background:rgba\(82,100,122,\.19\)/);
  assert.match(renderer,/background:rgba\(100,130,163,\.34\)/);
  assert.match(renderer,/background:rgba\(80,125,175,\.43\)/);
});
test('full gutter and layer spacing are removed when extension is disabled or unloaded',()=>{
  assert.match(renderer,/else\s+priorGutter\?\.remove\(\)/);
  assert.match(renderer,/\.vh-node-layer,:scope > \.drag-item > \.vh-action-gutter/);
  assert.match(renderer,/data-vh-has-layer', 'data-vh-native-component/);
});


test('Quick Toggle off reclaims only its 20px gutter column, preserving native Lock',()=>{
  assert.match(renderer, /--vh-action-gutter-width:22px/);
  assert.match(renderer, /\.tree\[data-vh-lock-gutter\]\[data-vh-quick-toggle\] \{ --vh-action-gutter-width:42px; \}/);
  assert.match(renderer, /changeAttr\(tree, 'data-vh-quick-toggle', state\.options\.enabled && state\.options\.activationToggle \? 'true' : undefined\)/);
  assert.match(renderer, /enabled && opts\.activationToggle && item\.uuid/);
  assert.match(renderer, /else\s+existing\?\.remove\(\)/);
  assert.match(renderer, /tree\.removeAttribute\('data-vh-quick-toggle'\)/);
  assert.doesNotMatch(renderer, /padding-left:42px !important/);
});

test('long node names ellipsize before Layer rather than suppressing metadata',()=>{
  assert.match(renderer, /\.tree-node\[data-vh-has-layer='true'\] > \.drag-item > ui-rename-input\.name/);
  assert.match(renderer, /flex:1 1 0% !important; width:0 !important; min-width:0 !important/);
  assert.match(renderer, /overflow:hidden !important; text-overflow:ellipsis !important/);
  assert.match(renderer, /\.vh-node-layer \{ display:inline-flex; flex:0 0 auto/);
  assert.match(renderer, /badge\.textContent = label/);
  assert.doesNotMatch(renderer, /available < layerWidth \+ 40/);
  assert.doesNotMatch(renderer, /const available = item\.drag\.clientWidth/);
  assert.match(renderer, /item\.row\.getAttribute\('state'\) === 'rename'/);
});

test('Unity gradient styling preserves selection highlight and native right-side icon',()=>{
  assert.match(renderer,/background-image:var\(--vh-row-gradient\) !important/);
  assert.match(renderer,/background-color:var\(--vh-selected-base\) !important/);
  assert.match(renderer,/background-image:var\(--vh-selected-gradient\) !important/);
  assert.match(renderer,/box-shadow:inset 3px 0 0 var\(--vh-selected-accent\) !important/);
  assert.match(renderer,/\.tree-node\[is-selected="true"\]:not\(\[data-vh-tint\]\)/);
  assert.match(renderer,/VHierarchyColors\.rowBackground\(hex, theme, state\.options, false, slot === 0\)/);
  assert.match(renderer,/data-vh-inherited-color/);
  assert.match(renderer,/item\.row\.style\.removeProperty\(prop\)/);
});
test('palette settings expose live preview and persist gradient/saturation/brightness independently',()=>{
  assert.match(renderer,/\['colorGradientsEnabled', 'Use Unity-style color gradients'\]/);
  assert.match(renderer,/addRange\('colorSaturation',\s*'Saturation'\)/);
  assert.match(renderer,/addRange\('colorBrightness',\s*'Brightness'\)/);
  assert.match(renderer,/slider\.addEventListener\('input'/);
  assert.match(renderer,/slider\.addEventListener\('change'/);
  assert.match(renderer,/updatePreview\(\)/);
});

test('Google icon palette uses searchable allowlisted catalog with independent tint controls',()=>{
  assert.match(renderer,/GOOGLE_MATERIAL_CSS = 'https:\/\/fonts\.googleapis\.com\/css2\?/);
  assert.match(renderer,/setMaterialSymbols\(data\)/);
  assert.match(renderer,/search\.type = 'search'/);
  assert.match(renderer,/search\.addEventListener\('input', drawIconGrid\)/);
  assert.match(renderer,/key\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(renderer,/customName\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(renderer,/candidates = filtered\.slice\(0, 72\)/);
  assert.match(renderer,/iconColor\.type = 'color'/);
  assert.match(renderer,/\.vh-tinted-icon \{/);
  assert.match(renderer,/marker\.style\.color = inherited\.iconColor/);
  assert.match(renderer,/delete current\.iconColor/);
  assert.match(renderer,/googleFontLink\?\.remove\(\)/);
});

test('icon palette appearance commits serialized per node to avoid selection races',()=>{
  assert.match(renderer,/appearanceWrites = new Map/);
  assert.match(renderer,/previous\.catch\(\(\) => \{\s*\}\)\.then\(async\s+\(\) =>/);
  assert.match(renderer,/appearanceWrites\.set\(item\.uuid, writing\)/);
  assert.match(renderer,/appearanceWrites\.delete\(item\.uuid\)/);
});

test('popups work in both Document and ShadowRoot, not inserted directly in Document',()=>{
  assert.match(renderer,/rootHost instanceof Document/);
  assert.match(renderer,/rootHost\.body \|\| rootHost\.documentElement/);
  assert.match(renderer,/else\s+rootHost\.appendChild\(wrap\)/);
});

test('palette selection overrides native blue only for tinted rows and keeps rename neutral',()=>{
  assert.match(renderer,/\.tree-node\[is-selected="true"\]\[data-vh-tint\] > \.drag-item,/);
  assert.match(renderer,/background-color:var\(--vh-selected-base\) !important/);
  assert.match(renderer,/\.tree-node\[state="rename"\]\[data-vh-tint\] > \.drag-item,/);
  assert.match(renderer,/background-color:transparent !important/);
  assert.match(renderer,/\.tree-node\[is-selected='true'\]\[data-vh-tint\] > \.drag-item > \.vh-action-gutter/);
  assert.match(renderer,/VHierarchyColors\.selectedRowPaint\(hex, theme, state\.options, false\)/);
  assert.match(renderer,/VHierarchyColors\.selectedRowPaint\(hex, theme, state\.options, true\)/);
  assert.match(renderer,/for \(const prop of PAINT_PROPS\)\s*item\.row\.style\.removeProperty\(prop\)/);
  assert.match(renderer,/for \(const prop of PAINT_PROPS\)\s*h\.style\.removeProperty\(prop\)/);
});

test('palette swatch gets a visible persistent checkmark and inherited distinction',()=>{
  assert.match(renderer,/\.vh-swatch\[aria-pressed='true'\]::after \{ content:'✓'/);
  assert.match(renderer,/\.vh-swatch\[data-vh-inherited='true'\] \{ outline-style:dashed/);
  assert.match(renderer,/const refreshColorSelection\s*=/);
  assert.match(renderer,/sw\.setAttribute\('aria-pressed',\s*String\(pressed\)\)/);
  assert.match(renderer,/current\.color\s*=\s*i;\s*refreshColorSelection\(\)/);
  assert.match(renderer,/delete current\.color;\s*current\.recursiveColor\s*=\s*false;\s*check\.checked\s*=\s*false;\s*refreshColorSelection\(\)/);
});
