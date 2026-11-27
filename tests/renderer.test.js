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
test('palette icon uses Prefab native slot and keeps Layer/component icon on the right',()=>{
  assert.match(renderer,/VHierarchyPrefabIcons\.sync\(item, paletteIcon, enabled\)/);
  assert.match(renderer,/\.vh-icon \{ position:relative; flex:0 0 15px/);
  assert.match(renderer,/\.tree-node\[data-vh-prefab-icon-replaced='true'\]/);
  assert.match(renderer,/\.vh-node-layer/);
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

test('hierarchy line thickness slider displays px preview and persists through set-option',()=>{
  assert.match(renderer,/lineSlider\.type = 'range'/);
  assert.match(renderer,/lineSlider\.min = '0\.5'/);
  assert.match(renderer,/lineSlider\.max = '4'/);
  assert.match(renderer,/lineSlider\.step = '0\.5'/);
  assert.match(renderer,/Hierarchy line thickness/);
  assert.match(renderer,/lineSlider\.addEventListener\('input', updateLinePreview\)/);
  assert.match(renderer,/lineSlider\.addEventListener\('change'/);
  assert.match(renderer,/set-option', 'guideThickness', Number\(lineSlider\.value\)/);
  assert.match(renderer,/--vh-guide-thickness/);
  assert.match(renderer,/--vh-preview-thickness/);
  assert.match(renderer,/size: \`\$\{thickness\}px/);
  assert.match(renderer,/Math\.max\(1\.5, thickness\)/);
  assert.match(renderer,/tree\.style\.removeProperty\('--vh-guide-thickness'\)/);
});

test('keyboard shortcuts remain removed; Ctrl + right-click is the only Palette gesture',()=>{
  assert.doesNotMatch(renderer,/keyboardShortcuts|pressedShortcutKeys|shortcutKeyId|SHORTCUT_REFERENCE|shortcutLabel/);
  assert.doesNotMatch(renderer,/keyboardRoot\.addEventListener|root\.addEventListener\('keydown'/);
  assert.doesNotMatch(renderer,/root\.addEventListener\('keyup'/);
  assert.doesNotMatch(renderer,/function collapseAll\(/);
  assert.doesNotMatch(renderer,/Ctrl \+ left-click a Hierarchy node/);
  assert.match(renderer,/Ctrl \+ right-click a Hierarchy node to open this palette/);
  assert.match(renderer,/Ctrl \+ Right Click/);
  assert.match(renderer,/root\.addEventListener\('mousedown', paletteMouseDown, true\)/);
  assert.match(renderer,/root\.addEventListener\('contextmenu', paletteContextMenu, true\)/);
  assert.match(renderer,/root\.removeEventListener\('mousedown', paletteMouseDown, true\)/);
  assert.match(renderer,/root\.removeEventListener\('contextmenu', paletteContextMenu, true\)/);
  assert.doesNotMatch(renderer,/root\.addEventListener\('click', paletteClick, true\)/);
  // Native multi-selection, collapse, and Active checkbox are still available.
  assert.match(renderer,/root\.addEventListener\('click', guideClick, true\)/);
  assert.match(renderer,/checkbox\.addEventListener\('change'/);
});

test('Ctrl + RIGHT mouse button opens Palette; Ctrl + left-click never steals node multi-selection',()=>{
  const vm=require('node:vm');
  const start=renderer.indexOf('function listen(root) {');
  const end=renderer.indexOf('async function toggleActive(',start);
  assert.ok(start>0&&end>start);
  const listeners=new Map();
  const root={
    addEventListener:(name,fn)=>{
      const handlers=listeners.get(name)||[];
      handlers.push(fn);
      listeners.set(name,handlers);
    },
    removeEventListener:(name,fn)=>{
      listeners.set(name,(listeners.get(name)||[]).filter(x=>x!==fn));
    },
  };
  class MouseEvent {
    constructor({button=0,ctrlKey=false,altKey=false,shiftKey=false,metaKey=false,target}={}){
      Object.assign(this,{button,ctrlKey,altKey,shiftKey,metaKey,
        target,clientX:152,clientY:191,prevented:0,stopped:0});
    }
    preventDefault(){this.prevented++;}
    stopImmediatePropagation(){this.stopped++;}
  }
  const row={isConnected:true};
  const item={uuid:'scene-node-uuid',searching:false,row};
  const opened=[];
  const env={
    MouseEvent,views:[item],boundRoots:new WeakSet(),listeners:[],
    listRoot:{contains:r=>r===row},
    state:{options:{enabled:true,foldOnGuideClick:false}},
    lastHovered:item,
    showPalette:(it,x,y)=>opened.push([it.uuid,x,y]),
  };
  vm.runInNewContext(renderer.slice(start,end)+'\nthis.listen=listen;',env);
  env.listen(root);
  assert.equal(listeners.has('keydown'),false);
  assert.equal(listeners.has('keyup'),false);
  assert.equal(listeners.has('mousedown'),true);
  assert.equal(listeners.has('contextmenu'),true);
  const target={
    closest(selector){return selector==='.tree-node'?row:null;},
  };
  function dispatch(name,args={}){
    const e=new MouseEvent({target,...args});
    for(const fn of listeners.get(name)||[]){
      fn(e);
      if(e.stopped)break;
    }
    return e;
  }
  // Ctrl+left click is native Cocos multi-select; never open the Palette.
  let e=dispatch('mousedown',{button:0,ctrlKey:true});
  assert.equal(e.prevented,0);assert.equal(e.stopped,0);
  e=dispatch('click',{button:0,ctrlKey:true});
  assert.equal(e.prevented,0);assert.equal(e.stopped,0);
  assert.equal(opened.length,0);
  // macOS can synthesize contextmenu after Ctrl+left mouse, sometimes with
  // button 2; the preceding genuine right mouse-down is the necessary gate.
  e=dispatch('contextmenu',{button:2,ctrlKey:true});
  assert.equal(e.stopped,0);assert.equal(opened.length,0);
  // Plain right-click preserves the normal native Cocos node context menu.
  dispatch('mousedown',{button:2,ctrlKey:false});
  e=dispatch('contextmenu',{button:2,ctrlKey:false});
  assert.equal(e.stopped,0);assert.equal(e.prevented,0);
  assert.equal(opened.length,0);
  // Ctrl + physical RIGHT click opens Palette and suppresses only that menu.
  e=dispatch('mousedown',{button:2,ctrlKey:true});
  assert.equal(e.stopped,0,'mousedown must never break Creator drag/selection');
  assert.equal(e.prevented,0);
  e=dispatch('contextmenu',{button:2,ctrlKey:true});
  assert.equal(e.stopped,1);assert.equal(e.prevented,1);
  assert.deepEqual(opened[0],['scene-node-uuid',152,191]);
  // Repeated contextmenu from same press is ignored; no duplicate Palette.
  dispatch('contextmenu',{button:2,ctrlKey:true});
  assert.equal(opened.length,1);
  dispatch('mousedown',{button:2,ctrlKey:true});
  dispatch('contextmenu',{button:2,ctrlKey:true});
  assert.equal(opened.length,2,'second deliberate Ctrl + right-click opens Palette');

  // Other modifiers, a different node and disabled extension do nothing.
  for(const options of [{shiftKey:true},{altKey:true},{metaKey:true}]){
    dispatch('mousedown',{button:2,ctrlKey:true,...options});
    e=dispatch('contextmenu',{button:2,ctrlKey:true,...options});
    assert.equal(e.stopped,0);
  }
  dispatch('mousedown',{button:2,ctrlKey:true});
  e=dispatch('contextmenu',{button:2,ctrlKey:true,
    target:{closest:selector=>selector==='.tree-node'?{isConnected:true}:null}});
  assert.equal(e.stopped,0);
  env.state.options.enabled=false;
  dispatch('mousedown',{button:2,ctrlKey:true});
  e=dispatch('contextmenu',{button:2,ctrlKey:true});
  assert.equal(e.stopped,0);
  assert.equal(opened.length,2);
  env.state.options.enabled=true;
  item.row.isConnected=false;
  dispatch('mousedown',{button:2,ctrlKey:true});
  dispatch('contextmenu',{button:2,ctrlKey:true});
  assert.equal(opened.length,2,'detached node is not acted upon');
  for(const dispose of env.listeners)dispose();
  assert.equal((listeners.get('click')||[]).length,0);
  assert.equal((listeners.get('mouseover')||[]).length,0);
  assert.equal((listeners.get('mousedown')||[]).length,0);
  assert.equal((listeners.get('contextmenu')||[]).length,0);
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


test('guide elbow stops before native expander or custom icon instead of crossing them',()=>{
  assert.match(renderer,/const arrow = children\.find\(child => visible\(child\) && \(child\.classList\.contains\('arrow'\) \|\| child\.matches\('ui-icon\.arrow,\.arrow'\)\)\)/);
  assert.match(renderer,/child\.classList\.contains\('vh-icon'\)/);
  assert.match(renderer,/const stop = \[arrow, icon, label\]/);
  assert.match(renderer,/sort\(\(a, b\) => a\.offsetLeft - b\.offsetLeft\)\[0\]/);
  assert.match(renderer,/const anchor = stop \? Math\.max\(0, stop\.offsetLeft - 1\) : Math\.max\(0, drag\.clientWidth - 12\)/);
});

test('decorative guide paint stays under expander and icon visuals during hover and drag',()=>{
  assert.match(renderer,/Native expander and both native\/custom left icons must always sit above/);
  assert.match(renderer,/\.tree-node > \.drag-item > \.arrow,/);
  assert.match(renderer,/\.tree-node > \.drag-item > ui-icon\.arrow,/);
  assert.match(renderer,/\.tree-node > \.drag-item > ui-asset-image,/);
  assert.match(renderer,/\.tree-node > \.drag-item > \.vh-icon \{ position:relative; z-index:2; \}/);
});
