/**
 * Hierarchy renderer adapter for Cocos Creator 3.8.x.
 * Boundaries: read-only scene tree via Vue props; all data commits use Editor IPC.
 * Uses a reversible private DOM overlay because Cocos exposes no public per-row decorator.
 */
(() => {
  type Flag = 'navigationBar' | 'activationToggle' | 'hierarchyLines' | 'zebraStriping' | 'minimalMode' | 'sceneSelector' | 'keyboardShortcuts' | 'foldOnGuideClick' | 'showNodeLayers' | 'colorGradientsEnabled';
  interface Opts extends Record<Flag, boolean> { enabled: boolean; guideMode: 'tree' | 'minimal'; colorSaturation: number; colorBrightness: number; }
  interface Appearance { color?: number; icon?: string; iconColor?: string; recursiveColor?: boolean; recursiveIcon?: boolean; }
  interface Bookmark { uuid: string; name: string; }
  interface CustomIcon { id: string; name: string; }
  interface State { options: Opts; appearances: Record<string, Appearance>; prefabAppearances: Record<string, Appearance>; bookmarks: Bookmark[]; customIcons: CustomIcon[]; }
  interface TreeDump { uuid?: string; name?: string; depth?: number; parent?: string; active?: boolean; locked?: boolean; readonly?: boolean; isScene?: boolean; components?: Array<{ type?: string; extends?: string[] }>; prefab?: { state?: number; assetUuid?: string; isAddedChild?: boolean }; level?: string; path?: string; isPrefabRoot?: boolean; layer?: unknown; }
  interface Item { guide?: { group: Item[]; index: number; result: VHierarchyGuides.Result }; prefabKey?: string | null; ancestorIds?: string[]; row: HTMLElement; drag: HTMLElement; node: TreeDump | null; uuid: string; name: string; nameEl: HTMLElement | null; depth: number; padding: number; margin: number; anchor: number; searching: boolean; }
  interface Hook { buildId?: string; refresh(): void; stop(): void; stats(): unknown; applyState(state: State): void; setIcons(icons: Record<string, string>): void; setMaterialSymbols(data: {names:string[];full:boolean}): void; showSettings(): void; sceneNodeChanged(ids: string[] | null): void; }
  const w = window as Window & { __vHierarchy388?: Hook; Editor?: any; require?: (id: string) => any };
  const KEY = '__vHierarchy388';
  const BUILD_ID = '0.1.1-patch34-single-drop-line';
  if (document.body?.getAttribute('name') !== 'main') return { status: 'not-main' };
  if (w.__vHierarchy388) {
    if (w.__vHierarchy388.buildId === BUILD_ID) {
      w.__vHierarchy388.refresh(); return { status:'running', reused:true, build:BUILD_ID };
    }
    // Replacing ZIP/reloading an extension must not keep an older renderer in
    // the same Editor window. Old builds only refresh their *old* CSS/logic.
    try { w.__vHierarchy388.stop(); }
    catch (err) { console.warn('[vHierarchy] previous renderer cleanup failed:',err); }
    delete w.__vHierarchy388;
  }

  const PALETTE = ['#777d89', '#b35e68', '#b48e4f', '#a9a857', '#61a886', '#5d94b5', '#737cc2', '#a36bb4', '#b56e9d'];
  const ICONS = ['folder','camera','light','script','particle','physics','audio','material','prefab','canvas','settings','favorite','animation','sprite','atlas','shader','scene','timeline','transform','database','service','network','input','mouse','gamepad','group','grid','eye','lock','key','bug','flag','star','heart','ui_panel','code'];
  const MATERIAL_PREFIX = 'material:';
  const GOOGLE_MATERIAL_CSS = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:FILL,GRAD,opsz,wght@0,0,24,400&display=swap';
  const GUIDE_PROPS = ['--vh-guide-images', '--vh-guide-positions', '--vh-guide-sizes', '--vh-guide-width',
    '--vh-guide-left', '--vh-guide-elbow-left', '--vh-guide-elbow-width'];
  const GUIDE_COLOR = 'rgba(151,166,187,.42)';
  const GUIDE_SELECTED_COLOR = 'var(--color-focus-border, #47bdf1)';
  const OPTIONS: Array<[Flag, string]> = [
    ['navigationBar', 'Navigation bar / Bookmarks'],
    ['activationToggle', 'Active quick toggle'], ['hierarchyLines', 'Hierarchy lines'],
    ['zebraStriping', 'Zebra striping'], ['minimalMode', 'Minimal mode'],
    ['foldOnGuideClick', 'Click hierarchy lines to collapse parent'],
    ['sceneSelector', 'Scene selector (experimental)'], ['keyboardShortcuts', 'Keyboard shortcuts'],
    ['showNodeLayers', 'Show node layer next to its name'],
    ['colorGradientsEnabled', 'Use Unity-style color gradients'],
  ];
  const DEFAULT: State = {
    options: { enabled:true, navigationBar:true, activationToggle:true, hierarchyLines:true,
      zebraStriping:true, minimalMode:false, sceneSelector:false, keyboardShortcuts:true, foldOnGuideClick:true,
      showNodeLayers:true, colorGradientsEnabled:true, guideMode:'tree', colorBrightness:1, colorSaturation:1 }, appearances:{}, prefabAppearances:{}, bookmarks:[], customIcons:[],
  };
  const CSS = `
    .vh-toolbar { display:flex; flex:0 0 27px; align-items:center; gap:4px; height:27px; padding:0 6px; box-sizing:border-box; border-bottom:1px solid var(--color-default-border, #3d454c); background:var(--color-normal-fill, #292e35); color:var(--color-normal-contrast,#ced7df); overflow:hidden; font-size:11px; }
    .vh-brand { font-weight:700; letter-spacing:.25px; margin-right:1px; user-select:none; }
    .vh-btn { flex:0 0 auto; border:1px solid transparent; border-radius:3px; background:transparent; color:inherit; height:21px; min-width:21px; cursor:pointer; font:inherit; padding:0 4px; }
    .vh-btn:hover { border-color:#697482; background:#58616d4d; }
    .vh-search { width:56px; flex:1 1 46px; min-width:28px; max-width:115px; background:#1b2025; color:inherit; border:1px solid #565d66; border-radius:3px; padding:2px 5px; font-size:11px; outline:none; }
    .vh-bookmarks { display:flex; gap:2px; flex:0 1 auto; min-width:0; overflow:hidden; }
    .vh-bookmark { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; max-width:65px; color:#ffd18c; }
    .tree-node[data-vh-stripe="1"] > .drag-item { background-color:rgba(125,140,160,.055); }
    .tree-node[data-vh-tint] > .drag-item,
    .tree-node[is-prefab-node][data-vh-tint] > ui-drag-item.drag-item,
    .tree-node[is-prefab-root][data-vh-tint] > ui-drag-item.drag-item {
      background-image:var(--vh-row-gradient) !important;
    }
    /* Native prefab text inherits Cocos' green/red color from is-prefab-node.
       The vHierarchy palette never applies color to ui-rename-input.name. */
    /* Creator applies --color-active-fill as an opaque native selection background.
       Replace it ONLY for palette-colored rows, not for ordinary selections.
       This selected fill and its accent are derived from the actual node color. */
    .tree-node[is-selected="true"][data-vh-tint] > .drag-item,
    .tree-node[is-selected="true"][is-prefab-node][data-vh-tint] > ui-drag-item.drag-item {
      background-color:var(--vh-selected-base) !important;
      background-image:var(--vh-selected-gradient) !important;
      box-shadow:inset 3px 0 0 var(--vh-selected-accent) !important;
    }
    /* Keep Creator's rename editing background neutral. */
    .tree-node[state="rename"][data-vh-tint] > .drag-item,
    .tree-node[state="rename"][is-prefab-node][data-vh-tint] > ui-drag-item.drag-item {
      background-color:transparent !important;
      background-image:none !important;
      box-shadow:none !important;
    }
    .tree-node[is-selected="true"]:not([data-vh-tint]) > .drag-item { background-image:linear-gradient(rgba(91,155,239,.25),rgba(91,155,239,.25)); }
    .tree-node[data-vh-dim="true"] > .drag-item { opacity:.24; }
    .tree-node[data-vh-compact="true"] { line-height:18px; }
    .tree-node[data-vh-compact="true"] > .drag-item { height:18px; }
    /* Draw on native ui-drag-item gutter, matching the tested v0.8.8 hook.
       No extra absolutely-positioned guide nodes or native arrow displacement. */
    .tree-node[data-vh-guide] > ui-drag-item.drag-item::before {
      content:''; position:absolute; left:var(--vh-guide-left,0px); top:0; bottom:0;
      width:var(--vh-guide-width,0px);
      background-image:var(--vh-guide-images,none);
      background-position:var(--vh-guide-positions,0px top);
      background-size:var(--vh-guide-sizes,0px 0px); background-repeat:no-repeat;
      opacity:.82; pointer-events:none; user-select:none; z-index:0;
    }
    .tree-node[data-vh-elbow] > ui-drag-item.drag-item::after {
      content:''; position:absolute; left:var(--vh-guide-elbow-left,0px); top:0;
      width:var(--vh-guide-elbow-width,0px); height:50%; box-sizing:border-box;
      border-left:1px solid rgba(151,166,187,.42);
      border-bottom:1px solid rgba(151,166,187,.42);
      border-bottom-left-radius:4px; opacity:.82; pointer-events:none; user-select:none; z-index:0;
    }
    /* The node's actual selected ancestry/path is emphasized, not every
       ancestor rail or the full gutter. Never changes prefab name color. */
    .tree-node[data-vh-guide-selected-elbow] > ui-drag-item.drag-item::after {
      border-left-color:var(--color-focus-border,#47bdf1) !important;
      border-bottom-color:var(--color-focus-border,#47bdf1) !important;
      opacity:1 !important;
    }
    .tree-node[data-vh-guide-through-elbow]:not([data-vh-guide-selected-elbow]) > ui-drag-item.drag-item::after {
      border-left-color:var(--color-focus-border,#47bdf1) !important;
      opacity:1 !important;
    }
    .tree-node[data-vh-guide-selected] > ui-drag-item.drag-item::before {opacity:1 !important;}
    .tree-node:hover > ui-drag-item.drag-item::before,
    .tree-node:hover > ui-drag-item.drag-item::after,
    .tree-node[is-selected='true'] > ui-drag-item.drag-item::before,
    .tree-node[is-selected='true'] > ui-drag-item.drag-item::after {opacity:1}
    /* Native expander and both native/custom left icons must always sit above
       the decorative guide paint. Geometry already clips the elbow to them,
       but z-order keeps runtime transitions and drag states clean. */
    .tree-node > .drag-item > .arrow,
    .tree-node > .drag-item > ui-icon.arrow,
    .tree-node > .drag-item > ui-asset-image,
    .tree-node > .drag-item > ui-icon:not(.arrow):not(.lock):not(.edit),
    .tree-node > .drag-item > .vh-icon { position:relative; z-index:2; }
    /* Prefab icon replacement: vHierarchy icon occupies the native icon slot.
       Cocos' original ui-asset-image/ui-icon stays in the DOM, transparent and
       overlapped so native locate-asset click/tooltip and Vue bindings survive.
       The component/TypeScript indicator AFTER the name remains untouched. */
    .tree-node[data-vh-prefab-icon-replaced='true'] > .drag-item > .vh-icon {
      flex:0 0 var(--vh-prefab-icon-width,16px) !important;
      width:var(--vh-prefab-icon-width,16px) !important;
      height:16px; margin-left:0 !important; pointer-events:none;
    }
    .tree-node[data-vh-prefab-icon-replaced='true'] > .drag-item > [data-vh-native-prefab-icon='true'] {
      opacity:0 !important;
      margin-left:calc(0px - var(--vh-prefab-icon-width,16px)) !important;
      position:relative !important;
      z-index:2 !important;
      pointer-events:auto !important;
    }
    .vh-icon { position:relative; flex:0 0 15px; width:15px; height:15px; margin-left:2px; z-index:1; pointer-events:none; object-fit:contain; }
    .vh-emoji { width:auto; font-size:12px; line-height:15px; }
    .vh-tinted-icon { display:inline-block; background-color:var(--vh-icon-color,#dce5ef);
      -webkit-mask-image:var(--vh-icon-mask); mask-image:var(--vh-icon-mask);
      -webkit-mask-size:contain; mask-size:contain; -webkit-mask-position:center; mask-position:center;
      -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat; }
    .vh-material-symbol { display:inline-flex; align-items:center; justify-content:center;
      font-family:'Material Symbols Outlined',sans-serif; font-size:16px; font-weight:normal;
      line-height:15px; letter-spacing:normal; white-space:nowrap; overflow:hidden;
      font-feature-settings:'liga'; font-variation-settings:'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      -webkit-font-smoothing:antialiased; }

    /* Quick Toggle off: reclaim exactly the 20px checkbox column, leaving only
       the native 22px Lock column. The whole remaining gutter stays hoverable.
       No native arrow/guide offset is modified. */
    .tree[data-vh-lock-gutter] {
      --vh-action-gutter-width:22px;
      padding-left:var(--vh-action-gutter-width) !important;
    }
    .tree[data-vh-lock-gutter][data-vh-quick-toggle] { --vh-action-gutter-width:42px; }
    /* One horizontal drop indicator, not two.
       Creator's .drop-box has a 2px border on ALL sides. When it spans a
       parent branch, its native top/bottom borders plus a vHierarchy ::before
       line can produce the two cyan horizontals seen in Patch 33. Draw ONE
       horizontal line as a bottom-positioned background gradient instead.
       It starts exactly on the corrected dotted vertical child rail (1px
       inside the native border plus the optional 20px Active column).
       This does not resize/move the native drop-box or intercept any pointer
       events, and its vertical dotted descendant is never clipped. */
    .content > .tree[data-vh-lock-gutter]:not([searching]) + .drop-box {
      --vh-drop-rail-start:0px;
      border-color:transparent !important;
      background-image:linear-gradient(90deg,
        transparent 0,
        transparent calc(var(--vh-drop-rail-start) + 1px),
        var(--color-focus-border) calc(var(--vh-drop-rail-start) + 1px)) !important;
      background-repeat:no-repeat !important;
      background-origin:border-box !important;
      background-position:left bottom !important;
      background-size:100% 2px !important;
    }
    .content > .tree[data-vh-lock-gutter][data-vh-quick-toggle]:not([searching]) + .drop-box {
      --vh-drop-rail-start:20px;
    }
    /* Never recreate the old overlay on top of Creator's native indicator. */
    .content > .tree[data-vh-lock-gutter]:not([searching]) + .drop-box::before {
      content:none !important;
    }
    .content > .tree[data-vh-lock-gutter]:not([searching]) + .drop-box > .vertical-line {
      translate:0px 0 !important;
    }
    .content > .tree[data-vh-lock-gutter][data-vh-quick-toggle]:not([searching]) + .drop-box > .vertical-line {
      translate:20px 0 !important;
    }
    /* Creator's 1px end cap follows the same vertical junction. */
    .content > .tree[data-vh-lock-gutter]:not([searching]) + .drop-box > .horizontal-line {
      translate:var(--vh-drop-rail-start) 0 !important;
    }
    /* The marker must render ABOVE our tinted and selected row backgrounds.
       Creator's default z-index:0 sits underneath the table's z-index:1. */
    .content > .tree[hoving] + .drop-box {
      z-index:2 !important; pointer-events:none !important;
    }
    .tree[data-vh-lock-gutter] > .tree-node > .drag-item > .vh-action-gutter {
      position:absolute; left:calc(0px - var(--vh-action-gutter-width)); top:0;
      width:var(--vh-action-gutter-width); height:100%;
      display:block; box-sizing:border-box; z-index:3; pointer-events:auto;
      cursor:default; border-right:1px solid rgba(134,153,173,.28);
      background:rgba(82,100,122,.19);
    }
    .tree[data-vh-lock-gutter] > .tree-node[data-vh-stripe='1'] > .drag-item > .vh-action-gutter {
      background:rgba(96,113,133,.23);
    }
    .tree[data-vh-lock-gutter] > .tree-node:hover > .drag-item > .vh-action-gutter,
    .tree[data-vh-lock-gutter] > .tree-node:focus-within > .drag-item > .vh-action-gutter {
      background:rgba(100,130,163,.34);
    }
    .tree[data-vh-lock-gutter] > .tree-node[is-selected='true'] > .drag-item > .vh-action-gutter {
      background:rgba(80,125,175,.43);
    }
    .tree[data-vh-lock-gutter] > .tree-node[is-selected='true'][data-vh-tint] > .drag-item > .vh-action-gutter {
      background:var(--vh-selected-base) !important;
      box-shadow:inset 3px 0 0 var(--vh-selected-accent);
    }
    .tree[data-vh-lock-gutter] > .tree-node > .drag-item > ui-icon.lock {
      display:inline-flex !important; align-items:center; justify-content:center;
      left:calc(0px - var(--vh-action-gutter-width)) !important;
      width:22px; height:20px; top:0;
      z-index:4; opacity:0; pointer-events:auto !important;
    }
    .tree[data-vh-lock-gutter] > .tree-node:hover > .drag-item > ui-icon.lock,
    .tree[data-vh-lock-gutter] > .tree-node:focus-within > .drag-item > ui-icon.lock,
    .tree[data-vh-lock-gutter] > .tree-node > .drag-item > ui-icon.lock:hover,
    .tree[data-vh-lock-gutter] > .tree-node > .drag-item > ui-icon.lock[locked='true'] { opacity:1; }
    .tree[data-vh-lock-gutter] > .tree-node > .drag-item > ui-icon.lock[inside-locked] { opacity:.55; }
    /* A label is the hit target, the real native checkbox stays keyboard-accessible.
       The visual square is 14px; the hit target is a contiguous 20px cell. */
    .vh-active-hit {
      position:absolute; left:-20px; top:0; width:20px; height:20px;
      display:flex; align-items:center; justify-content:center;
      z-index:5; cursor:pointer; box-sizing:border-box;
      visibility:hidden; opacity:0; pointer-events:none;
    }
    .tree-node:hover > .drag-item > .vh-active-hit,
    .tree-node:focus-within > .drag-item > .vh-active-hit,
    .tree-node > .drag-item > .vh-active-hit:hover {
      visibility:visible; opacity:1; pointer-events:auto;
    }
    .vh-active {
      position:absolute; inset:0; width:100%; height:100%; margin:0;
      cursor:pointer; opacity:0; z-index:1;
    }
    .vh-active-box {
      display:block; position:relative; width:14px; height:14px;
      box-sizing:border-box; border:1px solid #89949e; border-radius:2px;
      background:rgba(24,30,35,.34); pointer-events:none;
    }
    .vh-active:checked + .vh-active-box::after {
      content:''; position:absolute; left:3px; top:2px; width:6px; height:4px;
      border-left:2px solid #dfe7ee; border-bottom:2px solid #dfe7ee;
      transform:rotate(-45deg);
    }
    .vh-active:hover + .vh-active-box,
    .vh-active:focus-visible + .vh-active-box {
      border-color:#75b6ff; box-shadow:0 0 0 1px rgba(117,182,255,.48);
    }
    .vh-active:disabled + .vh-active-box { opacity:.45; cursor:wait; }
    /* The native rename input is a flex child with min-width:32px in Creator.
       Override only its DISPLAY sizing while Layer is present. The real value,
       edit interactions, native search and node name stay untouched. This lets
       long names render an ellipsis instead of evicting the Layer label. */
    .tree-node[data-vh-has-layer='true'] > .drag-item > ui-rename-input.name {
      flex:1 1 0% !important; width:0 !important; min-width:0 !important;
      overflow:hidden !important; text-overflow:ellipsis !important;
      white-space:nowrap !important;
    }
    .tree-node[data-vh-has-layer='true'] > .drag-item > ui-rename-input.name::part(value) {
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    /* Layer remains allocated at the far right regardless of node-name length.
       The browser shrinks the name, not the metadata. Keep space for the native
       component glyph (or a matching 26px slot when absent). */
    .vh-node-layer { display:inline-flex; flex:0 0 auto; align-items:center;
      min-width:0; margin-left:auto; margin-right:26px; padding-left:6px;
      border-left:1px solid rgba(161,176,192,.4);
      color:var(--color-normal-contrast, #a3b1bf); opacity:.68;
      font:500 10px/15px Arial,sans-serif; white-space:nowrap; user-select:none;
      pointer-events:none; max-width:96px; overflow:hidden; text-overflow:ellipsis;
    }
    .tree-node[data-vh-native-component='true'] .vh-node-layer {margin-right:8px;}
    .tree-node[is-selected='true'] .vh-node-layer {opacity:.84;}
    .tree[searching] .vh-node-layer, .tree-node[state='rename'] .vh-node-layer {display:none !important;}
    .vh-layer { position:fixed; inset:0; z-index:100000; pointer-events:none; }
    .vh-pop { pointer-events:auto; position:fixed; z-index:100001; background:#252b32; color:#e4eaf2; border:1px solid #657080; border-radius:7px; box-shadow:0 10px 30px #0009; min-width:216px; max-width:330px; padding:11px; font:12px Arial,sans-serif; }
    .vh-pop { max-height: min(85vh, 640px); overflow:auto; }
    .vh-pop h4 { margin:0 26px 8px 0; font-size:13px; }
    .vh-pop-close { position:absolute; right:6px; top:5px; border:0; border-radius:4px;
      background:transparent; color:inherit; cursor:pointer; padding:2px 7px; font:18px/19px Arial,sans-serif; }
    .vh-pop-close:hover { background:#ffffff22; }
    .vh-scene-list { display:flex; flex-direction:column; align-items:stretch; gap:3px; margin:7px 0; max-height:330px; overflow:auto; }
    .vh-scene-item { text-align:left; border:1px solid transparent; background:transparent; color:inherit;
      border-radius:4px; padding:6px; cursor:pointer; font:12px Arial,sans-serif; }
    .vh-scene-item:hover { background:#ffffff16; border-color:#ffffff23; }
    .vh-scene-status { font-size:11px; color:#a8b4c1; white-space:normal; }
    .vh-scene-status[data-error='true'] { color:#f2a5a5; }
    .vh-pop label { display:flex; gap:5px; align-items:center; margin:5px 0; cursor:pointer; }
    .vh-pop input[type=checkbox] { accent-color:#68a4ff; }
    .vh-grid { display:grid; grid-template-columns:repeat(8, 1fr); gap:5px; margin:7px 0;
      max-height:236px; overflow:auto; padding:4px; align-content:start; }
    .vh-icon-search { box-sizing:border-box; width:100%; min-width:0; margin-top:7px;
      padding:6px 8px; border:1px solid #68798a; border-radius:5px;
      background:#1d242c; color:#edf3f9; font:12px Arial,sans-serif; }
    .vh-icon-count { color:#a8b4c1; font-size:10px; margin-top:5px; }
    .vh-import-file { box-sizing:border-box; display:block; width:100%; margin:8px 0 4px; padding:5px; font:11px Arial,sans-serif; color:#dce8f7; border:1px dashed #8294a6; border-radius:4px; }
    .vh-import-status { font-size:11px; color:#b8cadc; margin:5px 0; white-space:normal; }
    .vh-import-status[data-error='true'] { color:#f3abab; }
    .vh-icon-palette { display:flex; flex-wrap:wrap; gap:5px; align-items:center; margin-top:6px; }
    .vh-icon-palette input[type=color] { width:32px; height:26px; padding:2px; background:#29323c;
      border:1px solid #7a8796; border-radius:4px; cursor:pointer; }
    .vh-icon-preset { flex:0 0 17px; width:17px; height:17px; border-radius:50%;
      border:1px solid #f5f5f573; cursor:pointer; padding:0; }
    .vh-symbol[aria-pressed='true'] { outline:2px solid #95c6ff; outline-offset:1px; }
    .vh-symbol > .vh-material-symbol { flex:0 0 19px; width:19px; height:19px; line-height:19px; font-size:19px; }
    .vh-symbol > .vh-tinted-icon { width:18px; height:18px; flex:0 0 18px; }
    .vh-colors { display:grid; grid-template-columns:repeat(9, 1fr); gap:5px; margin:7px 0; }
    .vh-swatch { position:relative; width:19px; height:19px; border:1px solid #e1e7e966; border-radius:4px; padding:0; cursor:pointer; }
    .vh-swatch[aria-pressed='true'] { outline:2px solid #edf5ff; outline-offset:2px; border-color:#ffffff; box-shadow:0 0 0 1px #101820; }
    .vh-swatch[aria-pressed='true']::after { content:'✓'; display:flex; align-items:center; justify-content:center;
      position:absolute; inset:0; color:white; background:#0005; border-radius:3px; font:bold 13px/1 Arial,sans-serif; text-shadow:0 1px 2px #000; }
    .vh-swatch[data-vh-inherited='true'] { outline-style:dashed; }
    .vh-selected-color { color:#b8c7d6; font-size:11px; margin:3px 0 7px; }

    .vh-symbol { width:24px; height:24px; background:#48515c; border:1px solid #ffffff21; border-radius:4px; cursor:pointer; padding:3px; display:flex; align-items:center; justify-content:center; }
    .vh-symbol img { width:16px; height:16px; object-fit:contain; pointer-events:none; }
    .vh-footer { font-size:10px; color:#a8b4c1; margin-top:8px; }
    .vh-color-controls { padding:7px 0 2px; }
    .vh-color-range { display:grid !important; grid-template-columns:78px minmax(80px, 1fr) 33px; gap:8px; align-items:center; }
    .vh-color-range > input { width:100%; min-width:0; accent-color:#6b9fd6; }
    .vh-color-value { text-align:right; font-variant-numeric:tabular-nums; color:#acbac8; }
    .vh-color-preview { display:flex; gap:3px; margin:8px 0; }
    .vh-color-preview > span { flex:1; height:14px; border-radius:2px; border:1px solid #ffffff1c; }
    .vh-pop button { color:inherit; }
  `;

  let state = DEFAULT;
  const appearanceWrites = new Map<string, Promise<void>>();
  let iconAssets: Record<string, string> = {};
  let materialSymbols: string[] = [];
  let materialSymbolsSet = new Set<string>();
  let materialCatalogFull = false;
  let materialPaletteRefresh: (() => void) | null = null;
  let materialFontStatus: 'idle'|'loading'|'ready'|'error' = 'idle';
  let googleFontLink: HTMLLinkElement | null = null;
  function materialName(key: string): string { return key.slice(MATERIAL_PREFIX.length); }
  function updateMaterialGlyphs(): void {
    for (const node of rootHost.querySelectorAll('.vh-material-symbol[data-vh-material]')) {
      const span=node as HTMLElement;
      const name=span.getAttribute('data-vh-material') || '';
      span.textContent=materialFontStatus==='ready' ? name : '◇';
      span.title=materialFontStatus==='error' ? `${name} — Google Fonts unavailable (online required)` : name;
    }
  }
  function requestMaterialFont(): void {
    if (materialFontStatus!=='idle') return;
    materialFontStatus='loading';
    const link=document.createElement('link');googleFontLink=link;
    link.rel='stylesheet';link.href=GOOGLE_MATERIAL_CSS;
    link.onload=()=>{
      if (stopped) return;
      void document.fonts.load('18px "Material Symbols Outlined"','home')
        .then(faces=>{materialFontStatus=faces.length ? 'ready':'error'; updateMaterialGlyphs();schedule();})
        .catch(()=>{materialFontStatus='error';updateMaterialGlyphs();});
    };
    link.onerror=()=>{materialFontStatus='error';updateMaterialGlyphs();};
    (document.head || document.documentElement).appendChild(link);
  }
  function materialGlyph(key: string, className=''): HTMLElement {
    requestMaterialFont();
    const glyph=el('span',('vh-material-symbol '+className).trim(),materialFontStatus==='ready'?materialName(key):'◇');
    glyph.setAttribute('data-vh-material',materialName(key));
    glyph.title=materialName(key);
    return glyph;
  }
  let stopped = false;
  let queued = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let observer: MutationObserver | null = null;
  const treeObservers = new Map<HTMLElement, MutationObserver>();
  const layerLookup = new VHierarchyLayers.Lookup(uuid => req('scene','query-node', uuid), () => schedule());
  const prefabPromotions = new Set<string>();
  const priorRows = new WeakMap<HTMLElement, {uuid: string; path: string; appearance: Appearance}>();
  // Same-tree path fallback covers Prefab conversion when Cocos REPLACES the
  // Vue row element entirely. Cleared on native Scene ready/close broadcasts.
  let previousTreePaths = new WeakMap<HTMLElement, Map<string, {uuid: string; path: string; appearance: Appearance}>>();
  let lastHovered: Item | null = null;
  let searchText = '';
  let views: Item[] = [];
  let pop: HTMLElement | null = null;
  let popupCleanup: (() => void) | null = null;
  let rootHost: Document | ShadowRoot = document;
  let listRoot: HTMLElement | null = null;
  let lastError = '';
  let scans = 0;
  let panelCount = 0;
  let vueRows = 0;
  const boundRoots = new WeakSet<object>();
  const listeners: Array<() => void> = [];

  const editor = (): any => w.Editor || (typeof (window as any).Editor !== 'undefined' ? (window as any).Editor : null);
  function req(pkg: string, message: string, ...args: unknown[]): Promise<any> {
    const send = editor()?.Message?.request;
    if (typeof send !== 'function') return Promise.reject(new Error('Editor.Message.request unavailable'));
    return send(pkg, message, ...args);
  }
  function logError(op: string, err: unknown): void {
    lastError = `${op}: ${String(err)}`;
    console.warn('[vHierarchy]', lastError);
  }
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
    const item = document.createElement(tag); item.className = className; item.textContent = text; return item;
  }
  function btn(text: string, title: string, run: (e: MouseEvent) => void, className = 'vh-btn'): HTMLButtonElement {
    const item = el('button', className, text);
    item.type = 'button'; item.title = title;
    item.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); run(e); });
    item.addEventListener('mousedown', e => e.stopPropagation());
    return item;
  }
  function style(root: Document | ShadowRoot): void {
    const existing = root.querySelector('style[data-vh-style]') as HTMLStyleElement | null;
    if (existing) { if (existing.textContent !== CSS) existing.textContent = CSS; return; }
    const node = el('style'); node.setAttribute('data-vh-style', ''); node.textContent = CSS;
    if (root instanceof Document) (root.head || root.documentElement).appendChild(node);
    else root.appendChild(node);
  }
  function roots(target: Document | ShadowRoot | Element): Array<Document | ShadowRoot | Element> {
    const result: Array<Document | ShadowRoot | Element> = [];
    const seen = new Set<object>();
    const walk = (item: Document | ShadowRoot | Element, depth: number): void => {
      if (depth > 9 || seen.has(item)) return;
      seen.add(item); result.push(item);
      if ('shadowRoot' in item && item.shadowRoot) walk(item.shadowRoot, depth + 1);
      if (!item.querySelectorAll) return;
      for (const n of item.querySelectorAll('*')) if (n.shadowRoot) walk(n.shadowRoot, depth + 1);
    };
    walk(target, 0); return result;
  }
  function panels(): Element[] {
    const found = new Set<Element>();
    try {
      const requireFn = w.require || (typeof (window as any).require === 'function' ? (window as any).require : null);
      const manager = requireFn?.('@editor/panel');
      for (const e of Array.from(manager?.query?.('hierarchy') || [])) if (e instanceof Element) found.add(e);
    } catch { /* fallback to DOM */ }
    for (const e of document.querySelectorAll('ui-panel[name="hierarchy"], ui-panel[src*="hierarchy"]')) found.add(e);
    return [...found];
  }
  function readVue(row: HTMLElement): TreeDump | null {
    const drag = row.querySelector(':scope > .drag-item') as HTMLElement | null;
    for (const item of [row, drag]) {
      const raw = item as any;
      const instance = raw?.__vue__ || raw?.__vueParentComponent || raw?.__vnode || raw?._vnode;
      if (!instance) continue;
      for (const candidate of [instance.node, instance.$props?.node, instance.props?.node,
        instance.proxy?.node, instance.proxy?.$props?.node, instance.ctx?.node,
        instance.vnode?.props?.node, instance.component?.props?.node]) {
        if (candidate && typeof candidate === 'object' && typeof candidate.name === 'string') return candidate as TreeDump;
      }
    }
    return null;
  }
  function readItem(row: HTMLElement): Item | null {
    const drag = row.querySelector(':scope > ui-drag-item.drag-item') as HTMLElement | null;
    if (!drag || row.closest('[state="add"]')) return null;
    const node = readVue(row);
    if (node) vueRows++;
    const nameEl = row.querySelector(':scope > .drag-item > ui-rename-input') as any;
    const name = node?.name || String(nameEl?.value ?? nameEl?.getAttribute('value') ?? '');
    const uuid = typeof node?.uuid === 'string' ? node.uuid : '';
    const computed = getComputedStyle(drag);
    const px = (input: string): number => {const n = Number.parseFloat(input); return Number.isFinite(n) && n >= 0 ? n : 0;};
    // Match the native template: arrow, icon and input are direct children.
    const visible = (target: Element): boolean => {
      const computed = getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      return computed.display !== 'none' && computed.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const children = [...drag.children] as HTMLElement[];
    const arrow = children.find(child => visible(child) && (child.classList.contains('arrow') || child.matches('ui-icon.arrow,.arrow'))) as HTMLElement | undefined;
    const icon = children.find(child => visible(child) && (
      child.classList.contains('vh-icon') ||
      (child.tagName.toLowerCase() === 'ui-icon' && !child.classList.contains('arrow') && !child.classList.contains('lock') && !child.classList.contains('edit')) ||
      child.tagName.toLowerCase() === 'ui-asset-image')) as HTMLElement | undefined;
    const label = children.find(child => visible(child) && child.matches('ui-rename-input.name,.name')) as HTMLElement | undefined;
    const stop = [arrow, icon, label]
      .filter((child): child is HTMLElement => !!child)
      .sort((a, b) => a.offsetLeft - b.offsetLeft)[0];
    // Tree elbow must end BEFORE the first native left-side control: expander,
    // then custom/native icon, then finally the name if neither exists.
    const anchor = stop ? Math.max(0, stop.offsetLeft - 1) : Math.max(0, drag.clientWidth - 12);
    return { row, drag, node, uuid, name, nameEl: nameEl || null, padding:px(computed.paddingLeft), margin:px(computed.marginLeft), anchor,
      searching:!!row.closest('.tree[searching]'), depth:node?.depth ?? 0 };
  }
  type ResolvedAppearance = Appearance & { colorInherited: boolean };
  function ownAppearance(item: Item): Appearance {
    return {
      ...(item.prefabKey ? state.prefabAppearances?.[item.prefabKey] : undefined),
      ...(state.appearances[item.uuid] || {}),
    };
  }
  function nearestAppearance(item: Item, ancestors: Item[]): ResolvedAppearance {
    const a = ownAppearance(item);
    let color: number | undefined;
    let icon: string | undefined;
    let iconColor: string | undefined;
    for (const ancestor of ancestors) {
      const parent = ownAppearance(ancestor);
      if (parent.recursiveColor && parent.color !== undefined) color = parent.color;
      if (parent.recursiveIcon && parent.icon) { icon = parent.icon; iconColor = parent.iconColor; }
    }
    return { ...a, color: a.color ?? color, icon: a.icon ?? icon, iconColor: a.iconColor ?? (a.icon ? undefined : iconColor), colorInherited: a.color === undefined && color !== undefined };
  }
  function changeAttr(node: HTMLElement, key: string, value?: string): void {
    if (value === undefined) { if (node.hasAttribute(key)) node.removeAttribute(key); }
    else if (node.getAttribute(key) !== value) node.setAttribute(key, value);
  }
  function ensureControl(item: Item, selector: string, create: () => HTMLElement): HTMLElement {
    const prior = item.drag.querySelector(':scope > .' + selector) as HTMLElement | null;
    if (prior) return prior;
    const element = create(); item.drag.appendChild(element); return element;
  }
  function clearGuides(row: HTMLElement): void {
    for (const name of ['data-vh-guide','data-vh-elbow','data-vh-guide-selected','data-vh-guide-selected-elbow','data-vh-guide-through-elbow']) changeAttr(row,name);
    for (const key of GUIDE_PROPS) row.style.removeProperty(key);
  }
  function guideProp(row: HTMLElement, key: string, value: string): void {
    if (row.style.getPropertyValue(key) !== value) row.style.setProperty(key, value);
  }
  /** Geometry is measured from native drag item styles, not an estimated padding step. */
  function updateGuides(items: Item[]): void {
    if (!state.options.enabled || !state.options.hierarchyLines || items.some(x => x.searching)) {
      items.forEach(x => { x.guide=undefined; clearGuides(x.row); }); return;
    }
    const result = VHierarchyGuides.calculate(items.map(item => ({
      padding:item.padding, margin:item.margin, anchor:item.anchor, searching:item.searching,
      reportedDepth: Number.isInteger(item.node?.depth) ? item.node!.depth : null,
    })));
    const selected = VHierarchyGuides.selectedGuides(result.nodes,
      items.flatMap((item,index)=>item.row.getAttribute('is-selected') === 'true' ? [index] : []));
    for (let i = 0; i < items.length; i++) {
      const {row} = items[i]; const entry = result.nodes[i];
      items[i].guide = entry.valid ? { group:items, index:i, result } : undefined;
      if (!entry.valid || entry.depth < 1 || entry.depth > 32) { clearGuides(row); continue; }
      const {base, step, mode} = result.layout;
      const rails = state.options.guideMode === 'minimal'
        ? [...entry.rails.filter(r => r.shape !== 'lower'), {level:entry.depth, shape:entry.hasNextSibling ? 'full' : 'last'} as VHierarchyGuides.Rail]
        : entry.rails;
      const paint: Array<{image:string;position:string;size:string}> = [];
      for (const rail of rails) {
        const x = base + (rail.level - 0.5) * step;
        if (!(x > 1 && x < entry.indent - 1)) continue;
        paint.push({
          image: rail.shape === 'last'
            ? `linear-gradient(to bottom, ${GUIDE_COLOR} 0%, ${GUIDE_COLOR} 78%, transparent 100%)`
            : `linear-gradient(${GUIDE_COLOR},${GUIDE_COLOR})`,
          position: `${x}px ${rail.shape === 'lower' ? 'bottom' : 'top'}`,
          size:`1px ${rail.shape === 'full' ? '100%' : '50%'}`,
        });
      }
      // Selected vertical segments go IN FRONT of the neutral sibling rails.
      // A selected elbow is highlighted by its existing ::after border; the
      // vertical path through earlier sibling rows is drawn by ::before.
      for (const level of selected[i].rails) {
        const x = base + (level - 0.5) * step;
        if (!(x > 1 && x < entry.indent - 1)) continue;
        paint.unshift({image:`linear-gradient(${GUIDE_SELECTED_COLOR},${GUIDE_SELECTED_COLOR})`,
          position:`${x}px top`, size:'1.5px 100%'});
      }
      changeAttr(row,'data-vh-guide-selected', selected[i].rails.length || selected[i].elbow ? 'true' : undefined);
      changeAttr(row,'data-vh-guide-selected-elbow',selected[i].elbow ? 'true' : undefined);
      changeAttr(row,'data-vh-guide-through-elbow',selected[i].throughElbow ? 'true' : undefined);
      guideProp(row,'--vh-guide-left',`${entry.offset}px`);
      guideProp(row,'--vh-guide-width',`${entry.indent}px`);
      guideProp(row,'--vh-guide-images',paint.length ? paint.map(p=>p.image).join(', ') : 'none');
      guideProp(row,'--vh-guide-positions',paint.length ? paint.map(p=>p.position).join(', ') : '0px top');
      guideProp(row,'--vh-guide-sizes',paint.length ? paint.map(p=>p.size).join(', ') : '0px 0px');
      changeAttr(row,'data-vh-guide',paint.length ? 'true' : undefined);
      if (state.options.guideMode === 'tree' && entry.elbowX > 1 && entry.elbowWidth >= 5) {
        guideProp(row,'--vh-guide-elbow-left',`${entry.offset+entry.elbowX}px`);
        guideProp(row,'--vh-guide-elbow-width',`${entry.elbowWidth}px`);
        changeAttr(row,'data-vh-elbow','true');
      } else {
        changeAttr(row,'data-vh-elbow');
        row.style.removeProperty('--vh-guide-elbow-left');
        row.style.removeProperty('--vh-guide-elbow-width');
      }
    }
  }
  /** Render Layer in the RIGHT metadata area: [truncated name …] [Layer] [Cocos icon].
   * Native ui-rename-input and its value are left unchanged for search/rename.
   * CSS, not a width-based visibility test, truncates long visual node names.
   */
  function drawLayer(item: Item): void {
    const old = item.drag.querySelector(':scope > .vh-node-layer') as HTMLElement | null;
    const clear = (): void => {
      old?.remove();
      changeAttr(item.row, 'data-vh-has-layer');
      changeAttr(item.row, 'data-vh-native-component');
      item.row.style.removeProperty('--vh-node-name-width'); // clean up earlier patches
    };
    if (!state.options.enabled || !state.options.showNodeLayers || !item.uuid || !item.nameEl ||
      item.searching || item.node?.isScene || item.row.getAttribute('state') === 'rename') { clear(); return; }
    const label = layerLookup.get(item.uuid, item.node?.layer);
    if (!label) { clear(); return; }

    const nativeComponent = item.drag.querySelector(':scope > ui-icon[default="asset"][value="typescript"]') as HTMLElement | null;
    // Do NOT hide Layer based on the visible length of the node name. Instead,
    // the native name host shrinks and ellipsizes through the CSS above.
    item.row.style.removeProperty('--vh-node-name-width');
    changeAttr(item.row, 'data-vh-has-layer', 'true');
    changeAttr(item.row, 'data-vh-native-component', nativeComponent ? 'true' : undefined);
    const badge = old || el('span', 'vh-node-layer');
    badge.setAttribute('aria-hidden', 'true');
    badge.title = '';
    if (badge.textContent !== label) badge.textContent = label;
    // A trailing native component icon is LAST in Cocos 3.8.8's template.
    // Position the badge directly before it; otherwise badge is rightmost.
    if (nativeComponent) {
      if (badge.nextElementSibling !== nativeComponent) item.drag.insertBefore(badge, nativeComponent);
    } else if (badge !== item.drag.lastElementChild) item.drag.appendChild(badge);
  }

  interface RowPaint { gradient: string; selected: VHierarchyColors.SelectedPaint; }
  type RowTints = Array<readonly [RowPaint, RowPaint]>;
  const PAINT_PROPS = ['--vh-row-gradient', '--vh-selected-base', '--vh-selected-gradient', '--vh-selected-accent'];
  function drawItem(item: Item, index: number, ancestors: Item[], tints: RowTints): void {
    const opts = state.options;
    const enabled = opts.enabled;
    changeAttr(item.row, 'data-vh-stripe', enabled && opts.zebraStriping ? String(index % 2) : undefined);
    changeAttr(item.row, 'data-vh-compact', enabled && opts.minimalMode ? 'true' : undefined);
    changeAttr(item.row, 'data-vh-dim', enabled && searchText && !item.name.toLowerCase().includes(searchText) ? 'true' : undefined);
    const inherited: ResolvedAppearance = item.uuid ? nearestAppearance(item, ancestors) : { colorInherited: false };
    if (enabled && inherited.color !== undefined) {
      // Precomputed once per scan; avoid per-node HSL conversion in large Scenes.
      const paint = tints[inherited.color]?.[inherited.colorInherited ? 1 : 0] ?? tints[0][0];
      changeAttr(item.row, 'data-vh-tint', '');
      changeAttr(item.row, 'data-vh-inherited-color', inherited.colorInherited ? 'true' : undefined);
      const desired: Record<string, string> = {
        '--vh-row-gradient': paint.gradient,
        '--vh-selected-base': paint.selected.background,
        '--vh-selected-gradient': paint.selected.gradient,
        '--vh-selected-accent': paint.selected.accent,
      };
      for (const prop of PAINT_PROPS) if (item.row.style.getPropertyValue(prop) !== desired[prop])
        item.row.style.setProperty(prop, desired[prop]);
    } else {
      changeAttr(item.row, 'data-vh-tint');
      changeAttr(item.row, 'data-vh-inherited-color');
      for (const prop of PAINT_PROPS) item.row.style.removeProperty(prop);
    }
    const iconEl = item.drag.querySelector(':scope > .vh-icon') as HTMLElement | null;
    const displayIcon = enabled && inherited.icon ? inherited.icon : '';
    if (displayIcon.startsWith(MATERIAL_PREFIX) && materialSymbolsSet.has(materialName(displayIcon))) {
      requestMaterialFont();
      if (iconEl && !iconEl.classList.contains('vh-material-symbol')) iconEl.remove();
      const marker=(item.drag.querySelector(':scope > .vh-icon.vh-material-symbol') as HTMLElement | null)
        || ensureControl(item,'vh-icon',()=>materialGlyph(displayIcon,'vh-icon'));
      marker.setAttribute('data-vh-material',materialName(displayIcon));
      marker.textContent=materialFontStatus==='ready' ? materialName(displayIcon) : '◇';
      marker.style.color=inherited.iconColor || '';
      marker.title=displayIcon;
    } else if (displayIcon && iconAssets[displayIcon] && inherited.iconColor) {
      if (iconEl && !iconEl.classList.contains('vh-tinted-icon')) iconEl.remove();
      const marker=(item.drag.querySelector(':scope > .vh-icon.vh-tinted-icon') as HTMLElement | null)
        || ensureControl(item,'vh-icon',()=>el('span','vh-icon vh-tinted-icon'));
      marker.style.setProperty('--vh-icon-color',inherited.iconColor);
      marker.style.setProperty('--vh-icon-mask',`url("${iconAssets[displayIcon]}")`);
      marker.title=displayIcon;
    } else if (displayIcon && iconAssets[displayIcon]) {
      if (iconEl && iconEl.tagName !== 'IMG') iconEl.remove();
      const marker = (item.drag.querySelector(':scope > img.vh-icon') as HTMLImageElement | null)
        || ensureControl(item, 'vh-icon', () => el('img','vh-icon')) as HTMLImageElement;
      if (marker.src !== iconAssets[displayIcon]) marker.src = iconAssets[displayIcon];
      marker.title = displayIcon;
    } else if (displayIcon) {
      if (iconEl && !iconEl.classList.contains('vh-emoji')) iconEl.remove();
      const marker = (item.drag.querySelector(':scope > span.vh-icon.vh-emoji') as HTMLElement | null)
        || ensureControl(item, 'vh-icon', () => el('span','vh-icon vh-emoji'));
      if (marker.textContent !== displayIcon) marker.textContent = displayIcon;
    } else iconEl?.remove();
    // Prefab nodes REPLACE the original left-hand asset glyph visually rather
    // than showing two side-by-side icons. The original stays clickable (e.g.
    // locate Prefab asset); normal nodes retain the previous icon placement.
    const paletteIcon = item.drag.querySelector(':scope > .vh-icon') as HTMLElement | null;
    VHierarchyPrefabIcons.sync(item, paletteIcon, enabled);
    drawLayer(item);
    // Never hide or replace Cocos' own native component icon on the right.
    // Component minimap has been removed by product request; clean up remnants
    // from any previously injected renderer instance.
    item.drag.querySelector(':scope > .vh-components')?.remove();
    // The gutter itself receives pointer hover even in the empty cell around
    // checkbox/Lock; as a descendant it activates normal .tree-node:hover CSS.
    // No pointer event is intercepted on the node name, component icons or lines.
    const priorGutter = item.drag.querySelector(':scope > .vh-action-gutter');
    if (enabled) {
      if (!priorGutter) {
        const gutter = el('span', 'vh-action-gutter');
        gutter.setAttribute('aria-hidden', 'true');
        item.drag.prepend(gutter);
      }
    } else priorGutter?.remove();
    changeAttr(item.row, 'data-vh-active-control', enabled && opts.activationToggle && !!item.uuid && !item.node?.isScene && !item.node?.readonly ? 'true' : undefined);
    // Remove any direct input from an earlier patch before inserting the
    // left-gutter control. Never insert near the native right-side icon.
    item.drag.querySelector(':scope > input.vh-active')?.remove();
    const existing = item.drag.querySelector(':scope > .vh-active-hit') as HTMLElement | null;
    if (enabled && opts.activationToggle && item.uuid && !item.node?.isScene && !item.node?.readonly) {
      let holder = existing;
      let checkbox = holder?.querySelector('input.vh-active') as HTMLInputElement | null;
      if (!holder || !checkbox) {
        holder?.remove();
        holder = el('label', 'vh-active-hit');
        holder.title = 'Enable / Disable node (A)';
        checkbox = el('input', 'vh-active');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('aria-label', 'Node Active');
        const box = el('span', 'vh-active-box');
        box.setAttribute('aria-hidden', 'true');
        holder.append(checkbox, box);
        holder.addEventListener('mousedown', e => e.stopPropagation());
        holder.addEventListener('click', e => e.stopPropagation());
        holder.addEventListener('dblclick', e => e.stopPropagation());
        checkbox.addEventListener('change', e => {
          e.stopPropagation();
          // Vue's frozen node is read-only: the Scene IPC command is authoritative.
          const clicked = views.find(v => v.row === checkbox!.closest('.tree-node'));
          if (clicked) void toggleActive(clicked);
        });
      }
      // Lock is native absolute-positioned; keep input next in DOM too, and
      // CSS places it in the 20px cell immediately to Lock's right.
      const nativeLock = item.drag.querySelector(':scope > ui-icon.lock');
      if (nativeLock) {
        if (holder.previousElementSibling !== nativeLock) nativeLock.insertAdjacentElement('afterend', holder);
      } else if (holder.parentElement !== item.drag) item.drag.appendChild(holder);
      if (!VHierarchySceneCommands.isPending(item.uuid)) checkbox.checked = item.node?.active !== false;
      checkbox.disabled = VHierarchySceneCommands.isPending(item.uuid) || !!item.node?.locked;
    } else existing?.remove();
  }
  function findToolbar(container: HTMLElement): HTMLElement {
    let bar = container.querySelector(':scope > .vh-toolbar') as HTMLElement | null;
    if (bar) return bar;
    bar = el('div','vh-toolbar');
    bar.append(el('span','vh-brand','vH'));
    const search = el('input','vh-search') as HTMLInputElement;
    search.type = 'search'; search.placeholder = 'Find nodes'; search.title = 'Dim nodes whose names do not match';
    search.value = searchText;
    search.addEventListener('input', () => { searchText = search.value.trim().toLowerCase(); schedule(); });
    search.addEventListener('keydown', e => e.stopPropagation());
    bar.append(search);
    bar.append(btn('☆','Bookmark hovered node', () => { if (lastHovered?.uuid) void req('cocos-vhierarchy','toggle-bookmark',lastHovered.uuid,lastHovered.name).catch(e => logError('bookmark',e)); }));
    bar.append(el('div','vh-bookmarks'));
    if (state.options.sceneSelector) bar.append(btn('▤', 'Scene selector', () => { void showScenes(); }));
    bar.append(btn('⚙','vHierarchy Settings', () => showSettings()));
    // The native .content owns exactly the tree, drop-box and scroll-bar.
    // Inserting a 27px toolbar there shifts the drop-box's absolute coordinate
    // space relative to the tree and breaks Cocos drag/reorder hint geometry.
    // Mount as a flex sibling BEFORE .content, directly in .hierarchy instead.
    const content = container.querySelector(':scope > .content');
    if (content) container.insertBefore(bar, content);
    else bar.remove();
    return bar;
  }
  function renderToolbar(tree: HTMLElement): void {
    const content = tree.parentElement;
    const hierarchy = content?.parentElement;
    if (!content || !hierarchy?.classList.contains('hierarchy') || !content.classList.contains('content')) return;
    // Migrate an older injected toolbar out of the native scroll/drop layer.
    const legacy = content.querySelector(':scope > .vh-toolbar') as HTMLElement | null;
    if (legacy) hierarchy.insertBefore(legacy, content);
    const existing = hierarchy.querySelector(':scope > .vh-toolbar');
    if (!state.options.enabled || !state.options.navigationBar) { existing?.remove(); return; }
    const bar = findToolbar(hierarchy);
    const chips = bar.querySelector('.vh-bookmarks')!;
    const expected = state.bookmarks.map(x => x.uuid).join(',');
    if (chips.getAttribute('data-vh-ids') !== expected) {
      chips.replaceChildren(); chips.setAttribute('data-vh-ids', expected);
      for (const b of state.bookmarks.slice(-4)) chips.append(btn('★ ' + b.name, `Select ${b.name} (right-click to remove)`, () => {
        try { editor()?.Selection?.select('node', b.uuid); } catch(e) { logError('bookmark select',e); }
      }, 'vh-btn vh-bookmark'));
      for (const button of chips.querySelectorAll('button')) button.addEventListener('contextmenu', e => {
        e.preventDefault(); const b = state.bookmarks.slice(-4)[[...chips.children].indexOf(button)];
        if (b) void req('cocos-vhierarchy','toggle-bookmark',b.uuid,b.name).catch(err => logError('bookmark remove',err));
      });
    }
    const scene = bar.querySelector('[title="Scene selector"]');
    if (state.options.sceneSelector && !scene) bar.insertBefore(btn('▤', 'Scene selector', () => { void showScenes(); }), bar.lastElementChild);
    if (!state.options.sceneSelector) scene?.remove();
  }
  /* Native Cocos drag/drop owns .drop-box and its event lifecycle. Its dashed
   * vertical indicator is compensated with CSS only (see gutter rules above).
   * Do not attach drag/drop listeners, mutation observers or animation loops. */
  /** Watch native Vue tree changes so guides render in the expand frame, not at
   * the 1.4s resilience polling interval. Ignore changes from our own controls. */
  function observeTree(tree: HTMLElement): void {
    if (treeObservers.has(tree)) return;
    const watcher = new MutationObserver(records => {
      const nativeChange = records.some(m => {
        if (m.type === 'attributes') return true; // filtered to native Vue attributes
        if (m.target === tree) return true; // added/removed direct rows
        const changed = [...m.addedNodes, ...m.removedNodes];
        return changed.some(n => n instanceof Element && (
          n.matches('.tree-node,ui-rename-input,ui-asset-image,ui-icon:not(.lock),.arrow') ||
          !!n.querySelector('.tree-node,ui-rename-input,ui-asset-image')
        ));
      });
      if (nativeChange) schedule();
    });
    watcher.observe(tree, { childList:true, subtree:true, attributes:true,
      attributeFilter:['is-expand','is-parent','is-active','is-selected','is-animating','state','searching',
        'is-prefab-node','is-prefab-root','is-prefab-nested','hoving'] });
    treeObservers.set(tree, watcher);
  }
  function pruneTreeObservers(): void {
    for (const [tree, watcher] of treeObservers) if (!tree.isConnected) {
      watcher.disconnect(); treeObservers.delete(tree);
    }
  }
  function editorTheme(): VHierarchyColors.Theme {
    const themeHint = [document.documentElement.getAttribute('theme'), document.documentElement.getAttribute('data-theme'), document.documentElement.className, document.body?.getAttribute('theme')].filter(Boolean).join(' ');
    const body = getComputedStyle(document.body);
    const html = getComputedStyle(document.documentElement);
    return VHierarchyColors.detectTheme([body.getPropertyValue('--color-normal-fill'), html.getPropertyValue('--color-normal-fill'), body.backgroundColor, html.backgroundColor], themeHint);
  }
  function scan(): void {
    queued = false;
    if (stopped) return;
    scans++; panelCount = 0; vueRows = 0; views = [];
    const theme = editorTheme();
    const tints: RowTints = PALETTE.map((hex, slot)=>[
      { gradient:VHierarchyColors.rowBackground(hex,theme,state.options,false,slot===0),
        selected:VHierarchyColors.selectedRowPaint(hex,theme,state.options,false) },
      { gradient:VHierarchyColors.rowBackground(hex,theme,state.options,true,slot===0),
        selected:VHierarchyColors.selectedRowPaint(hex,theme,state.options,true) },
    ]);
    const scannedTrees = new Set<Element>();
    try {
      for (const panel of panels()) for (const candidate of roots(panel)) {
        const trees = (candidate as Element).querySelectorAll?.('.tree') || [];
        if (!trees.length) continue;
        panelCount++;
        if (candidate instanceof ShadowRoot || candidate instanceof Document) style(candidate);
        else style(candidate.getRootNode() as Document | ShadowRoot);
        for (const treeEl of trees) {
          const tree = treeEl as HTMLElement;
          if (scannedTrees.has(tree)) continue; scannedTrees.add(tree);
          listRoot = tree;
          observeTree(tree);
          changeAttr(tree, 'data-vh-lock-gutter', state.options.enabled ? 'true' : undefined);
          changeAttr(tree, 'data-vh-quick-toggle', state.options.enabled && state.options.activationToggle ? 'true' : undefined);
          rootHost = tree.getRootNode() as Document | ShadowRoot;
          renderToolbar(tree);
          const rows = [...tree.querySelectorAll(':scope > .tree-node')] as HTMLElement[];
          if (!rows.length) continue;
          const group = rows.map(readItem).filter((x): x is Item => !!x);
          // Compute inheritance from the visible flat native tree.
          const geometry = VHierarchyGuides.calculate(group.map(i=>({padding:i.padding,margin:i.margin,anchor:i.anchor,
            reportedDepth:Number.isInteger(i.node?.depth)?i.node!.depth:null,searching:i.searching})));
          const stack: Item[]=[];
          const earlierPaths = previousTreePaths.get(tree);
          const nextPaths = new Map<string, {uuid: string; path: string; appearance: Appearance}>();
          const ambiguousPaths = new Set<string>();
          for (let i = 0; i < group.length; i++) {
            const item=group[i]; item.depth=geometry.nodes[i].depth;
            if (!geometry.nodes[i].valid) { stack.length=0; drawItem(item,i,[],tints); views.push(item); continue; }
            stack.length=Math.min(stack.length,item.depth);
            item.ancestorIds=stack.map(parent=>parent.uuid).filter(Boolean);
            item.prefabKey=VHierarchyPrefabs.keyFor(item.node,stack.map(parent=>parent.node));
            // Retain decorated nodes when Cocos links them to a prefab and
            // replaces the row's node UUID. Only migrate if the SAME native row
            // still represents the same full hierarchy path, to avoid leaking
            // styles onto unrelated nodes from other scenes.
            const path=item.node?.path || '';
            const previous = priorRows.get(item.row) || (path && !ambiguousPaths.has(path) ? earlierPaths?.get(path) : undefined);
            if (item.prefabKey && previous && previous.uuid !== item.uuid &&
                previous.path && previous.path === item.node?.path &&
                !state.appearances[item.uuid] && !state.prefabAppearances?.[item.prefabKey] &&
                Object.keys(previous.appearance).length) {
              const key=item.prefabKey;
              if (!prefabPromotions.has(key)) {
                prefabPromotions.add(key);
                void req('cocos-vhierarchy','set-appearance',item.uuid,previous.appearance,key)
                  .catch(error=>logError('prefab appearance migration',error))
                  .finally(()=>prefabPromotions.delete(key));
              }
            } else if (item.prefabKey && state.appearances[item.uuid] &&
                       !state.prefabAppearances?.[item.prefabKey]) {
              const key=item.prefabKey;
              if (!prefabPromotions.has(key)) {
                prefabPromotions.add(key);
                void req('cocos-vhierarchy','promote-prefab-appearance',item.uuid,key)
                  .catch(error=>logError('prefab appearance promotion',error))
                  .finally(()=>prefabPromotions.delete(key));
              }
            }
            drawItem(item,i,stack.slice(),tints);
            const snapshot = {uuid:item.uuid,path,appearance:ownAppearance(item)};
            priorRows.set(item.row,snapshot);
            if (path) {
              if (nextPaths.has(path)) { nextPaths.delete(path); ambiguousPaths.add(path); }
              else if (!ambiguousPaths.has(path)) nextPaths.set(path,snapshot);
            }
            views.push(item); stack[item.depth]=item;
          }
          previousTreePaths.set(tree,nextPaths);
          updateGuides(group);
          listen(rootHost);
        }
      }
    } catch (e) { logError('scan',e); }
    finally { pruneTreeObservers(); }
  }
  function schedule(): void { if (!stopped && !queued) { queued=true; requestAnimationFrame(scan); } }
  function listen(root: Document | ShadowRoot): void {
    if (boundRoots.has(root)) return;
    boundRoots.add(root);
    const over = (e: Event): void => {
      const row = (e.target as Element)?.closest?.('.tree-node') as HTMLElement | null;
      const item = views.find(i => i.row === row);
      if (item) lastHovered=item;
    };
    /** Respect native row controls; only clicks on actually-painted guide pixels collapse. */
    const guideParentAt = (e: MouseEvent): Item | null => {
      if (e.button !== 0 || e.altKey || e.shiftKey || e.ctrlKey || e.metaKey ||
        !state.options.enabled || !state.options.hierarchyLines || !state.options.foldOnGuideClick) return null;
      const target = e.target as Element | null;
      if (!(target instanceof Element) || target.closest(
        '.arrow, ui-icon, ui-asset-image, ui-rename-input, input, label, textarea, button, [contenteditable], .vh-active-hit, .vh-toolbar, .vh-components')) return null;
      const row = target.closest('.tree-node') as HTMLElement | null;
      const item = views.find(view => view.row === row);
      if (!item?.guide || item.searching || row?.getAttribute('state') === 'rename') return null;
      const {group,index,result} = item.guide;
      const rect = item.drag.getBoundingClientRect();
      const level = VHierarchyGuides.hitTest(result.nodes[index], result.layout,
        e.clientX - rect.left, e.clientY - rect.top, rect.height, state.options.guideMode);
      if (level === null) return null;
      const parentIndex = VHierarchyGuides.foldParentIndex(result.nodes,index,level);
      if (parentIndex === null) return null;
      const parent = group[parentIndex];
      if (!parent || parent.row.getAttribute('is-expand') !== 'true' || !parent.row.hasAttribute('is-parent') ||
        !parent.drag.querySelector(':scope > .arrow')) return null;
      return parent;
    };
    // Do not cancel mousedown on guides. Creator needs it to initiate normal
    // drag/drop, click, and input focus; the guide shortcut remains click-only.
    const guideClick = (e: Event): void => {
      if (!(e instanceof MouseEvent)) return;
      const parent = guideParentAt(e);
      if (!parent) return;
      e.preventDefault(); e.stopImmediatePropagation();
      parent.drag.querySelector<HTMLElement>(':scope > .arrow')?.click();
      schedule();
    };
    const menu = (e: Event): void => {
      if (!(e instanceof MouseEvent) || !e.altKey || !state.options.enabled) return;
      const row = (e.target as Element)?.closest?.('.tree-node') as HTMLElement | null;
      const item = views.find(i => i.row===row);
      if (!item?.uuid) return;
      e.preventDefault(); e.stopImmediatePropagation(); showPalette(item,e.clientX,e.clientY);
    };
    const keydown = (e: Event): void => {
      const k=e as KeyboardEvent;
      if (!state.options.enabled || !state.options.keyboardShortcuts || k.defaultPrevented || k.repeat) return;
      if ((k.target as Element)?.closest?.('input,textarea,[contenteditable],ui-rename-input[state="rename"]')) return;
      if (!lastHovered || !lastHovered.row.isConnected || !listRoot?.contains(lastHovered.row)) return;
      if (!k.altKey && !k.ctrlKey && !k.metaKey && !k.shiftKey && k.key.toLowerCase()==='e') {
        const arrow=lastHovered.drag.querySelector('.arrow') as HTMLElement | null;
        if (arrow && lastHovered.row.hasAttribute('is-parent')) {k.preventDefault();k.stopPropagation(); arrow.click();}
      } else if (!k.altKey && !k.ctrlKey && !k.metaKey && !k.shiftKey && k.key.toLowerCase()==='a') {
        if(lastHovered.uuid) { k.preventDefault();k.stopPropagation();void toggleActive(lastHovered); }
      } else if (!k.altKey && !k.ctrlKey && !k.metaKey && k.shiftKey && k.key.toLowerCase()==='e') {
        k.preventDefault(); k.stopPropagation(); collapseAll(lastHovered);
      } else if (!k.altKey && (k.ctrlKey || k.metaKey) && k.shiftKey && k.key.toLowerCase()==='e') {
        k.preventDefault(); k.stopPropagation(); collapseAll();
      } else if (!k.altKey && !k.ctrlKey && !k.metaKey && !k.shiftKey && k.key.toLowerCase()==='f') {
        // Native focus command varies between Editor versions; only select reliably.
        if(lastHovered.uuid){ k.preventDefault(); k.stopPropagation();editor()?.Selection?.select?.('node',lastHovered.uuid); }
      }
    };
    root.addEventListener('click', guideClick, true);
    root.addEventListener('mouseover', over, true);
    root.addEventListener('contextmenu', menu, true);
    root.addEventListener('keydown', keydown, true);
    listeners.push(() => { root.removeEventListener('click', guideClick, true); root.removeEventListener('mouseover', over, true); root.removeEventListener('contextmenu', menu, true); root.removeEventListener('keydown', keydown, true); });
  }
  function collapseAll(except?: Item): void {
    const keep = new Set<string>();
    if (except) { const pos=views.indexOf(except); let d=except.depth; for(let i=pos;i>=0;i--) if(views[i].depth<=d){keep.add(views[i].uuid);d=views[i].depth-1;} }
    const open=[...views].filter(i=>i.row.getAttribute('is-expand')==='true' && !keep.has(i.uuid));
    for (const item of open.reverse()) item.drag.querySelector<HTMLElement>('.arrow')?.click();
  }
  async function toggleActive(item: Item): Promise<void> {
    if (!item.uuid || item.node?.locked || item.node?.readonly || item.node?.isScene) return;
    try {
      await VHierarchySceneCommands.toggleActive(item.uuid, req);
      // Vue owns item.node. Never assign to its readonly `active` property.
    } catch(e) { logError('toggle-active',e); }
    finally { schedule(); }
  }
  async function persistAppearance(item: Item, next: Appearance): Promise<void> {
    if(!item.uuid) return;
    // A user may choose icon, tint and recursive options faster than IPC can
    // persist and broadcast them. Serialize full per-node commits so the latest
    // user intent wins instead of an older response overwriting the new state.
    const previous=appearanceWrites.get(item.uuid) || Promise.resolve();
    const writing=previous.catch(()=>{}).then(async()=>{
      const ok=await req('cocos-vhierarchy','set-appearance',item.uuid,next,item.prefabKey || undefined);
      if(!ok)throw new Error(`Appearance rejected by extension (node ID length: ${item.uuid.length}; fields: ${Object.keys(next).join(', ')})`);
    });
    appearanceWrites.set(item.uuid,writing);
    try { await writing; }
    catch(e){logError('appearance',e);}
    finally { if(appearanceWrites.get(item.uuid)===writing)appearanceWrites.delete(item.uuid); }
  }
  function closePopup(): void {
    popupCleanup?.(); popupCleanup=null;
    materialPaletteRefresh=null;
    pop?.remove(); pop=null;
  }
  function popup(title: string, x?: number, y?: number): HTMLElement {
    closePopup();
    style(rootHost);
    const wrap=el('div','vh-pop');
    const heading=el('h4','',title);
    const close=btn('×','Close vHierarchy popup',()=>closePopup(),'vh-pop-close');
    close.setAttribute('aria-label','Close');
    wrap.append(heading,close);
    // A Document cannot contain an arbitrary div as a direct child. Native
    // Cocos often uses ShadowRoots, but docked/undocked panels can differ.
    if(rootHost instanceof Document) (rootHost.body || rootHost.documentElement).appendChild(wrap);
    else rootHost.appendChild(wrap);
    wrap.style.left=`${Math.max(8,Math.min(window.innerWidth-260,x ?? window.innerWidth/2-130))}px`;
    wrap.style.top=`${Math.max(8,Math.min(window.innerHeight-300,y ?? 68))}px`;
    pop=wrap;
    const keydown=(event:KeyboardEvent):void=>{
      if(event.key==='Escape') {event.preventDefault();event.stopPropagation();closePopup();}
    };
    const outside=(event:PointerEvent):void=>{
      if(!event.composedPath().includes(wrap)) closePopup();
    };
    document.addEventListener('keydown',keydown,true);
    // Defer registering outside-click handling until after the toolbar click completes.
    // pointerdown triggers before click; registration now is safe for the current click.
    document.addEventListener('pointerdown',outside,true);
    popupCleanup=()=>{
      document.removeEventListener('keydown',keydown,true);
      document.removeEventListener('pointerdown',outside,true);
    };
    return wrap;
  }
  function showPalette(item: Item,x: number,y: number): void {
    const current: Appearance={...ownAppearance(item)};
    const wrap=popup('Palette · '+item.name,x,y);
    wrap.append(el('span','','Color'));
    const colors=el('div','vh-colors');
    const theme=editorTheme();
    const swatches: HTMLButtonElement[]=[];
    const colorStatus=el('div','vh-selected-color');
    const inheritedColor=():number|undefined=>{
      // Follow the same ancestor order as drawItem; the closest recursive parent wins.
      let slot: number|undefined;
      for(const ancestor of views.filter(v => item.ancestorIds?.includes(v.uuid))) {
        const parent=ownAppearance(ancestor);
        if(parent?.recursiveColor && parent.color!==undefined)slot=parent.color;
      }
      return slot;
    };
    const refreshColorSelection=():void=>{
      const selection=VHierarchyColors.paletteSelection(current.color,inheritedColor(),PALETTE.length);
      swatches.forEach((sw,i)=>{
        const pressed=selection.index===i;
        sw.setAttribute('aria-pressed',String(pressed));
        sw.setAttribute('data-vh-inherited',pressed && selection.inherited ? 'true' : 'false');
        sw.setAttribute('aria-label',`Color ${i+1}${pressed ? (selection.inherited ? ' (inherited from parent)' : ' (selected)') : ''}`);
      });
      colorStatus.textContent=selection.index===undefined ? 'No color selected'
        : `Selected: Color ${selection.index+1}${selection.inherited ? ' · inherited from parent' : ''}`;
    };
    PALETTE.forEach((c,i)=>{
      const sw=btn('','Color '+(i+1),()=>{
        current.color=i;
        refreshColorSelection(); // The popup remains open; update its checkmark immediately.
        void persistAppearance(item,{...current});
      },'vh-swatch');
      sw.style.background=VHierarchyColors.swatch(c,theme,state.options);
      swatches.push(sw);colors.append(sw);
    });
    const clearColor=btn('Clear color','Remove color',()=>{
      delete current.color;current.recursiveColor=false;
      check.checked=false;
      refreshColorSelection();
      void persistAppearance(item,{...current});
    });
    wrap.append(colors,colorStatus,clearColor);
    refreshColorSelection();
    const recursive=el('label');const check=el('input') as HTMLInputElement;check.type='checkbox';check.checked=!!current.recursiveColor;
    check.addEventListener('change',()=>{current.recursiveColor=check.checked;void persistAppearance(item,{...current});});
    recursive.append(check,document.createTextNode('Apply color to descendants'));wrap.append(recursive);
    wrap.append(el('span','','Icon · Local SVG + Custom + Google Material Symbols'));
    const search=el('input','vh-icon-search') as HTMLInputElement;
    search.type='search';search.placeholder='Search icons (home, code, folder…)';
    search.setAttribute('aria-label','Search icons by name');
    const iconCount=el('div','vh-icon-count');
    const icons=el('div','vh-grid');
    const allIcons=[...ICONS,...(state.customIcons || []).map(icon=>icon.id),...materialSymbols.map(name=>MATERIAL_PREFIX+name)];
    const drawIconGrid=():void=>{
      const query=search.value.trim().toLowerCase();
      const filtered=allIcons.filter(key => {
        const customName=state.customIcons?.find(icon=>icon.id===key)?.name || '';
        return key.toLowerCase().includes(query) || customName.toLowerCase().includes(query);
      });
      const candidates=filtered.slice(0,72);
      if(current.icon && filtered.includes(current.icon) && !candidates.includes(current.icon))candidates.unshift(current.icon);
      iconCount.textContent=`${filtered.length} matching icons · showing ${candidates.length} · ${materialCatalogFull ? 'Full Google catalog loaded' : 'Google catalog loading / offline fallback'} · Glyph font requires internet`; 
      icons.replaceChildren();
      for(const key of candidates) {
        const label=state.customIcons?.find(icon=>icon.id===key)?.name || key;
        const b=btn('',label,()=>{
          current.icon=key;
          for(const button of icons.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===b));
          void persistAppearance(item,{...current});
        },'vh-symbol');
        b.setAttribute('aria-pressed',String(current.icon===key));
        if(key.startsWith(MATERIAL_PREFIX)) {
          const glyph=materialGlyph(key);glyph.style.color=current.iconColor || '';
          b.append(glyph);
        } else if(iconAssets[key]) {
          if(current.iconColor) {
            const mask=el('span','vh-tinted-icon');
            mask.style.setProperty('--vh-icon-color',current.iconColor);
            mask.style.setProperty('--vh-icon-mask',`url("${iconAssets[key]}")`);
            b.append(mask);
          } else {
            const img=el('img');img.src=iconAssets[key];img.alt='';b.append(img);
          }
        } else b.textContent=key;
        icons.append(b);
      }
      if(!candidates.length)icons.append(el('p','vh-footer','No icons match your search.'));
    };
    search.addEventListener('input',drawIconGrid);
    const refreshGoogle=btn('Refresh Google icon list','Download the complete official Material Symbols catalog (requires internet)',()=>{
      refreshGoogle.disabled=true;
      iconCount.textContent='Checking Google Material Symbols catalog…';
      void Promise.resolve(req('cocos-vhierarchy','refresh-material-catalog')).then((ok:boolean)=>{
        if(!ok) iconCount.textContent='Could not refresh: offline or Google catalog unavailable. Local icons remain accessible.';
      }).catch((error:unknown)=>{
        iconCount.textContent='Could not refresh Google icon list.';
        logError('material-catalog',error);
      }).finally(()=>{refreshGoogle.disabled=false;});
    });
    wrap.append(search,iconCount,refreshGoogle,icons);
    drawIconGrid();
    materialPaletteRefresh=()=>{
      const keys=[...ICONS,...(state.customIcons || []).map(icon=>icon.id),...materialSymbols.map(name=>MATERIAL_PREFIX+name)];
      allIcons.splice(0,allIcons.length,...keys);
      drawIconGrid();
    };
    search.focus();
    const importFile=el('input','vh-import-file') as HTMLInputElement;
    importFile.type='file'; importFile.accept='.png,.webp,.svg,image/png,image/webp,image/svg+xml';
    importFile.setAttribute('aria-label','Import custom PNG, WebP or SVG icon');
    const importStatus=el('div','vh-import-status','Import an image for offline use in this project (up to 64 icons).');
    importStatus.setAttribute('role','status');
    importFile.addEventListener('change',()=>{
      const file=importFile.files?.[0]; if(!file)return;
      void (async()=>{
        importFile.disabled=true;
        importStatus.textContent='Importing '+file.name+'…';
        importStatus.removeAttribute('data-error');
        try {
          const prepared=await VHierarchyIconFiles.rasterize(file);
          const imported=await req('cocos-vhierarchy','import-icon',prepared.name,prepared.dataUrl) as CustomIcon|null;
          if(!imported?.id || !/^custom:[0-9a-f]{20}$/.test(imported.id)) throw new Error('Extension rejected imported icon');
          iconAssets[imported.id]=prepared.dataUrl;
          state.customIcons=[...(state.customIcons || []).filter(entry=>entry.id!==imported.id),imported];
          if(!allIcons.includes(imported.id)) allIcons.splice(ICONS.length,0,imported.id);
          current.icon=imported.id;
          search.value=''; drawIconGrid();
          await persistAppearance(item,{...current});
          importStatus.textContent=`Imported “${imported.name}” and applied to node (offline).`;
        } catch(error) {
          importStatus.textContent=String(error); importStatus.setAttribute('data-error','true');
          logError('import-icon',error);
        } finally {importFile.disabled=false;importFile.value='';}
      })();
    });
    wrap.append(importFile,importStatus);
    const deleteCustom=btn('Delete custom icon','Remove this icon from the project library',()=>{
      const id=current.icon;
      if(!id?.startsWith('custom:'))return;
      if(!window.confirm('Delete this custom icon from the project? Nodes using it will lose this icon.'))return;
      void (async()=>{
        try {
          if(!await req('cocos-vhierarchy','remove-icon',id))throw new Error('Could not delete custom icon');
          state.customIcons=(state.customIcons || []).filter(icon=>icon.id!==id);
          delete iconAssets[id];
          const index=allIcons.indexOf(id);if(index>=0)allIcons.splice(index,1);
          delete current.icon;delete current.iconColor;current.recursiveIcon=false;
          search.value='';drawIconGrid();
          importStatus.textContent='Custom icon removed from this project.';
        }catch(error){logError('remove-icon',error);importStatus.textContent=String(error);importStatus.setAttribute('data-error','true');}
      })();
    });
    wrap.append(deleteCustom);
    const removeIcon=btn('Clear icon','Remove icon',()=>{
      delete current.icon;delete current.iconColor;current.recursiveIcon=false;
      iconCheck.checked=false;drawIconGrid();void persistAppearance(item,{...current});
    });
    wrap.append(removeIcon);
    const tintArea=el('div','vh-icon-palette');
    const tintTitle=el('span','','Icon tint');
    const iconColor=el('input') as HTMLInputElement;iconColor.type='color';
    iconColor.value=current.iconColor || '#dce5ef';iconColor.title='Choose icon color';
    iconColor.setAttribute('aria-label','Icon tint color');
    const tintStatus=el('span','vh-icon-count',current.iconColor || 'Default');
    const applyTint=(value:string|undefined):void=>{
      if(value)current.iconColor=value;else delete current.iconColor;
      tintStatus.textContent=current.iconColor || 'Default';
      drawIconGrid();void persistAppearance(item,{...current});
    };
    iconColor.addEventListener('change',()=>applyTint(iconColor.value));
    tintArea.append(tintTitle,iconColor,tintStatus);
    const presets=['#ffffff','#dce5ef','#f87171','#fb923c','#facc15','#4ade80','#38bdf8','#a78bfa','#f472b6'];
    const colorsRow=el('div','vh-icon-palette');
    for(const color of presets) {
      const option=btn('',`Icon tint ${color}`,()=>{iconColor.value=color;applyTint(color);},'vh-icon-preset');
      option.style.backgroundColor=color;colorsRow.append(option);
    }
    wrap.append(tintArea,colorsRow,btn('Reset icon tint','Use original icon color',()=>applyTint(undefined)));
    const recursiveIcon=el('label');const iconCheck=el('input') as HTMLInputElement;iconCheck.type='checkbox';iconCheck.checked=!!current.recursiveIcon;
    iconCheck.addEventListener('change',()=>{current.recursiveIcon=iconCheck.checked;void persistAppearance(item,{...current});});
    recursiveIcon.append(iconCheck,document.createTextNode('Apply icon to descendants'));wrap.append(recursiveIcon);
    wrap.append(el('p','vh-footer','Alt + right-click node to open this palette.'));
  }
  function showSettings(): void {
    const wrap=popup('vHierarchy · v0.1.0');
    const draft={...state.options};
    let updatePreview:()=>void=()=>{};
    const master=el('label');const masterCheck=el('input') as HTMLInputElement;
    masterCheck.type='checkbox';masterCheck.checked=state.options.enabled;
    masterCheck.addEventListener('change',()=>{void req('cocos-vhierarchy','set-option','enabled',masterCheck.checked).catch(e=>logError('options',e));});
    master.append(masterCheck, document.createTextNode('Enable vHierarchy'));wrap.append(master);
    for(const [name,label] of OPTIONS) {
      const line=el('label'); const input=el('input') as HTMLInputElement;input.type='checkbox';input.checked=state.options[name];
      input.addEventListener('change',()=>{
        if(name==='colorGradientsEnabled'){draft.colorGradientsEnabled=input.checked;updatePreview();}
        void req('cocos-vhierarchy','set-option',name,input.checked).catch(e=>logError('options',e));
      });
      line.append(input,document.createTextNode(label));wrap.append(line);
    }
    const modes=el('div');modes.append(el('span','','Guide style: '));
    for(const mode of ['tree','minimal'] as const) modes.append(btn(mode,mode,()=>{void req('cocos-vhierarchy','set-option','guideMode',mode).catch(e=>logError('guide mode',e));}));
    wrap.append(modes);
    const colorControls=el('section','vh-color-controls');
    colorControls.append(el('strong','','Palette appearance'));
    const preview=el('div','vh-color-preview');
    const previews=PALETTE.map(hex=>{const cell=el('span');preview.append(cell);return {hex,cell};});
    const theme=editorTheme();
    updatePreview=():void=>{for(const {hex,cell} of previews) cell.style.background=VHierarchyColors.rowBackground(hex,theme,draft,false,hex===PALETTE[0]);};
    const addRange=(key:'colorSaturation'|'colorBrightness',label:string):void=>{
      const row=el('label','vh-color-range');
      const text=el('span','',label);
      const slider=el('input') as HTMLInputElement;slider.type='range';slider.min='0';slider.max='2';slider.step='0.05';slider.value=String(draft[key]);
      const value=el('span','vh-color-value',`${draft[key].toFixed(2)}×`);
      slider.addEventListener('input',()=>{ draft[key]=Number(slider.value);value.textContent=`${draft[key].toFixed(2)}×`;updatePreview(); });
      slider.addEventListener('change',()=>{void req('cocos-vhierarchy','set-option',key,Number(slider.value)).catch(e=>logError('palette slider',e));});
      row.append(text,slider,value);colorControls.append(row);
    };
    addRange('colorSaturation','Saturation');addRange('colorBrightness','Brightness');
    colorControls.append(preview);updatePreview();
    wrap.append(colorControls,el('p','vh-footer','Color/icon: Alt + right-click a Hierarchy node. Settings are saved per project.'));
    wrap.append(btn('Close','Close settings',()=>closePopup()));
  }
  async function showScenes(): Promise<void> {
    const wrap=popup('Open Scene');
    wrap.append(el('p','vh-footer','Only imported .scene assets under db://assets. Save changes before switching.'));
    const status=el('p','vh-scene-status','Loading scenes…');
    status.setAttribute('role','status');
    const list=el('div','vh-scene-list');
    wrap.append(status,list);
    const notify=(message:string,error=false):void=>{
      if(pop!==wrap)return;
      status.textContent=message;
      changeAttr(status,'data-error',error?'true':undefined);
    };
    const showList=async ():Promise<void>=>{
      list.replaceChildren();notify('Loading scenes…');
      try {
        const raw=await req('asset-db','query-assets',{ccType:'cc.SceneAsset',extname:'.scene'});
        if(pop!==wrap)return; // popup was dismissed while AssetDB was loading
        const scenes=VHierarchyScenes.listScenes(raw);
        notify(scenes.length?`${scenes.length} scene(s) found`:'No valid project scenes found.');
        for(const scene of scenes) {
          const button=btn('▤ '+scene.name,scene.url,()=>{
            void (async()=>{
              if(!window.confirm('Save your current Scene before switching. Continue?'))return;
              button.disabled=true;
              notify('Validating and opening '+scene.name+'…');
              try {
                await VHierarchyScenes.openVerified(scene,req);
                if(pop===wrap)closePopup();
              }catch(e) {
                notify(`Cannot open ${scene.name}: ${String(e)}`,true);
                logError('open-scene',e);
              }finally {button.disabled=false;}
            })();
          },'vh-scene-item');
          list.append(button);
        }
      }catch(e){notify('Scene list unavailable: '+String(e),true);logError('list-scenes',e);}
    };
    wrap.append(btn('Refresh','Re-query scenes from AssetDB',()=>{void showList();}));
    await showList();
  }
  /** Forward the native Cocos scene:change-node broadcast to the cached Layer data. */
  function sceneNodeChanged(ids: string[] | null): void {
    if (stopped) return;
    if (ids === null) previousTreePaths = new WeakMap();
    if (state.options.enabled && state.options.showNodeLayers) {
      if (ids?.length) for (const uuid of new Set(ids)) layerLookup.invalidate(uuid);
      else layerLookup.invalidateAll(views.map(item => item.uuid).filter(Boolean));
    }
    // Prefab linking/instantiation changes native row identity and appearance,
    // even when the optional Layer labels feature has been disabled.
    schedule();
  }
  function refresh(): void {schedule();}
  function setIcons(next: Record<string,string>): void { iconAssets={...next};schedule(); }
  function setMaterialSymbols(data: {names:string[];full:boolean} | string[]): void {
    const names=Array.isArray(data) ? data : data?.names;
    if (!Array.isArray(names)) return;
    materialSymbols=[...new Set(names.filter(name=>typeof name==='string' && /^[a-z0-9_]{2,48}$/.test(name)))].slice(0,7000);
    materialSymbolsSet=new Set(materialSymbols);
    materialCatalogFull=!Array.isArray(data) && data.full===true;
    materialPaletteRefresh?.();
    schedule();
  }
  function applyState(input: State): void { if (!input?.options) return; state=input; schedule(); }
  function stats(): unknown { return { version:'0.1.1',build:BUILD_ID,scans,panelCount,visibleRows:views.length,vueRows,hasActiveNode:!!lastHovered?.uuid,lastError }; }
  function stop(): void {
    stopped=true; appearanceWrites.clear(); prefabPromotions.clear(); googleFontLink?.remove();googleFontLink=null; layerLookup.dispose(); if(timer)clearInterval(timer);observer?.disconnect();closePopup();
    for (const watcher of treeObservers.values()) watcher.disconnect();
    treeObservers.clear();
    for(const release of listeners) release(); listeners.length=0;
    for(const panel of panels())for(const r of roots(panel)){
      for(const tree of (r as Element).querySelectorAll?.('.tree[data-vh-lock-gutter],.tree[data-vh-quick-toggle]')||[]) {
        tree.removeAttribute('data-vh-lock-gutter');
        tree.removeAttribute('data-vh-quick-toggle');
      }
      for(const row of (r as Element).querySelectorAll?.('.tree-node')||[]){
        const h=row as HTMLElement;
        // Restore native icon visibility before removing renderer styles.
        const drag = h.querySelector(':scope > .drag-item') as HTMLElement | null;
        if (drag) for (const native of drag.querySelectorAll(':scope > [data-vh-native-prefab-icon]'))
          native.removeAttribute('data-vh-native-prefab-icon');
        h.removeAttribute('data-vh-prefab-icon-replaced');
        h.style.removeProperty('--vh-prefab-icon-width');
        for(const key of ['data-vh-tint','data-vh-stripe','data-vh-dim','data-vh-compact','data-vh-active-control','data-vh-has-layer','data-vh-native-component','data-vh-inherited-color'])h.removeAttribute(key);
        clearGuides(h);
        for (const prop of PAINT_PROPS) h.style.removeProperty(prop);
        h.style.removeProperty('--vh-row-color'); // clean up old patch artifacts
        h.style.removeProperty('--vh-node-name-width');
        for(const child of h.querySelectorAll(':scope > .drag-item > .vh-icon,:scope > .drag-item > .vh-components,:scope > .drag-item > .vh-active,:scope > .drag-item > .vh-active-hit,:scope > .drag-item > .vh-node-layer,:scope > .drag-item > .vh-action-gutter'))child.remove();
      }
      for(const bar of (r as Element).querySelectorAll?.('.vh-toolbar')||[])bar.remove();
      for(const css of (r as Element).querySelectorAll?.('style[data-vh-style]')||[])css.remove();
    }
    delete w.__vHierarchy388;
  }
  w.__vHierarchy388={buildId:BUILD_ID,refresh,stop,stats,applyState,setIcons,setMaterialSymbols,showSettings,sceneNodeChanged};
  // A bounded periodic scan is robust to panel docking and native Vue rerendering.
  // Mutation observer only tracks opening/docking; overlays are not persisted in Vue.
  observer=new MutationObserver(()=>schedule());
  if(document.body) observer.observe(document.body,{childList:true,subtree:false});
  timer=setInterval(schedule,1400);
  schedule();
  return {status:'running',reused:false};
})();
