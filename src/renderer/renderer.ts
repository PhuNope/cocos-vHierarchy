/**
 * Hierarchy renderer adapter for Cocos Creator 3.8.x.
 * Boundaries: read-only scene tree via Vue props; all data commits use Editor IPC.
 * Uses a reversible private DOM overlay because Cocos exposes no public per-row decorator.
 */
(() => {
  type Flag = 'navigationBar' | 'activationToggle' | 'hierarchyLines' | 'zebraStriping' | 'minimalMode' | 'sceneSelector' | 'keyboardShortcuts' | 'foldOnGuideClick' | 'showNodeLayers' | 'colorGradientsEnabled';
  interface Opts extends Record<Flag, boolean> { enabled: boolean; guideMode: 'tree' | 'minimal'; colorSaturation: number; colorBrightness: number; }
  interface Appearance { color?: number; icon?: string; recursiveColor?: boolean; recursiveIcon?: boolean; }
  interface Bookmark { uuid: string; name: string; }
  interface State { options: Opts; appearances: Record<string, Appearance>; bookmarks: Bookmark[]; }
  interface TreeDump { uuid?: string; name?: string; depth?: number; parent?: string; active?: boolean; locked?: boolean; readonly?: boolean; isScene?: boolean; components?: Array<{ type?: string; extends?: string[] }>; prefab?: { state?: number }; layer?: unknown; }
  interface Item { guide?: { group: Item[]; index: number; result: VHierarchyGuides.Result }; row: HTMLElement; drag: HTMLElement; node: TreeDump | null; uuid: string; name: string; nameEl: HTMLElement | null; depth: number; padding: number; margin: number; anchor: number; searching: boolean; }
  interface Hook { refresh(): void; stop(): void; stats(): unknown; applyState(state: State): void; setIcons(icons: Record<string, string>): void; showSettings(): void; sceneNodeChanged(ids: string[] | null): void; }
  const w = window as Window & { __vHierarchy388?: Hook; Editor?: any; require?: (id: string) => any };
  const KEY = '__vHierarchy388';
  if (document.body?.getAttribute('name') !== 'main') return { status: 'not-main' };
  if (w.__vHierarchy388) { w.__vHierarchy388.refresh(); return { status: 'running', reused: true }; }

  const PALETTE = ['#777d89', '#b35e68', '#b48e4f', '#a9a857', '#61a886', '#5d94b5', '#737cc2', '#a36bb4', '#b56e9d'];
  const ICONS = ['folder','camera','light','script','particle','physics','audio','material','prefab','canvas','settings','favorite'];
  const GUIDE_PROPS = ['--vh-guide-images', '--vh-guide-positions', '--vh-guide-sizes', '--vh-guide-width',
    '--vh-guide-left', '--vh-guide-elbow-left', '--vh-guide-elbow-width'];
  const GUIDE_COLOR = 'rgba(151,166,187,.42)';
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
      showNodeLayers:true, colorGradientsEnabled:true, guideMode:'tree', colorBrightness:1, colorSaturation:1 }, appearances:{}, bookmarks:[],
  };
  const CSS = `
    .vh-toolbar { display:flex; align-items:center; gap:4px; height:27px; padding:0 6px; box-sizing:border-box; border-bottom:1px solid var(--color-default-border, #3d454c); background:var(--color-normal-fill, #292e35); color:var(--color-normal-contrast,#ced7df); overflow:hidden; font-size:11px; }
    .vh-brand { font-weight:700; letter-spacing:.25px; margin-right:1px; user-select:none; }
    .vh-btn { flex:0 0 auto; border:1px solid transparent; border-radius:3px; background:transparent; color:inherit; height:21px; min-width:21px; cursor:pointer; font:inherit; padding:0 4px; }
    .vh-btn:hover { border-color:#697482; background:#58616d4d; }
    .vh-search { width:56px; flex:1 1 46px; min-width:28px; max-width:115px; background:#1b2025; color:inherit; border:1px solid #565d66; border-radius:3px; padding:2px 5px; font-size:11px; outline:none; }
    .vh-bookmarks { display:flex; gap:2px; flex:0 1 auto; min-width:0; overflow:hidden; }
    .vh-bookmark { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; max-width:65px; color:#ffd18c; }
    .tree-node[data-vh-stripe="1"] > .drag-item { background-color:rgba(125,140,160,.055); }
    .tree-node[data-vh-tint] > .drag-item { background-image:var(--vh-row-gradient) !important; }
    .tree-node[is-selected="true"][data-vh-tint] > .drag-item { background-image:linear-gradient(rgba(91,155,239,.25),rgba(91,155,239,.25)),var(--vh-row-gradient) !important; }
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
    .tree-node:hover > ui-drag-item.drag-item::before,
    .tree-node:hover > ui-drag-item.drag-item::after,
    .tree-node[is-selected='true'] > ui-drag-item.drag-item::before,
    .tree-node[is-selected='true'] > ui-drag-item.drag-item::after {opacity:1}
    .vh-icon { position:relative; flex:0 0 15px; width:15px; height:15px; margin-left:2px; z-index:1; pointer-events:none; object-fit:contain; }
    .vh-emoji { width:auto; font-size:12px; line-height:15px; }

    /* Quick Toggle off: reclaim exactly the 20px checkbox column, leaving only
       the native 22px Lock column. The whole remaining gutter stays hoverable.
       No native arrow/guide offset is modified. */
    .tree[data-vh-lock-gutter] {
      --vh-action-gutter-width:22px;
      padding-left:var(--vh-action-gutter-width) !important;
    }
    .tree[data-vh-lock-gutter][data-vh-quick-toggle] { --vh-action-gutter-width:42px; }
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
    .vh-grid { display:grid; grid-template-columns:repeat(9, 1fr); gap:4px; margin:7px 0; }
    .vh-colors { display:grid; grid-template-columns:repeat(9, 1fr); gap:5px; margin:7px 0; }
    .vh-swatch { width:19px; height:19px; border:1px solid #e1e7e966; border-radius:4px; padding:0; cursor:pointer; }
    .vh-swatch[aria-pressed='true'] { outline:2px solid #c5d9f0; outline-offset:1px; }
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
  let iconAssets: Record<string, string> = {};
  let stopped = false;
  let queued = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let observer: MutationObserver | null = null;
  const treeObservers = new Map<HTMLElement, MutationObserver>();
  const layerLookup = new VHierarchyLayers.Lookup(uuid => req('scene','query-node', uuid), () => schedule());
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
    if (root.querySelector('style[data-vh-style]')) return;
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
    const children = [...drag.children];
    const icon = children.find(child => visible(child) && (child.tagName.toLowerCase() === 'ui-icon' && !child.classList.contains('arrow') && !child.classList.contains('lock') && !child.classList.contains('edit') || child.tagName.toLowerCase() === 'ui-asset-image')) as HTMLElement | undefined;
    const label = children.find(child => visible(child) && child.matches('ui-rename-input.name,.name')) as HTMLElement | undefined;
    const anchor = icon ? Math.max(0, icon.offsetLeft - 1) : label ? Math.max(0, label.offsetLeft - 1) : Math.max(0, drag.clientWidth - 12);
    return { row, drag, node, uuid, name, nameEl: nameEl || null, padding:px(computed.paddingLeft), margin:px(computed.marginLeft), anchor,
      searching:!!row.closest('.tree[searching]'), depth:node?.depth ?? 0 };
  }
  type ResolvedAppearance = Appearance & { colorInherited: boolean };
  function nearestAppearance(item: Item, ancestorIds: string[]): ResolvedAppearance {
    const a = state.appearances[item.uuid] || {};
    let color: number | undefined;
    let icon: string | undefined;
    for (const id of ancestorIds) {
      const parent = state.appearances[id];
      if (parent?.recursiveColor && parent.color !== undefined) color = parent.color;
      if (parent?.recursiveIcon && parent.icon) icon = parent.icon;
    }
    return { ...a, color: a.color ?? color, icon: a.icon ?? icon, colorInherited: a.color === undefined && color !== undefined };
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
    changeAttr(row, 'data-vh-guide');changeAttr(row, 'data-vh-elbow');
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

  type RowTints = Array<readonly [string, string]>;
  function drawItem(item: Item, index: number, ancestors: Item[], tints: RowTints): void {
    const opts = state.options;
    const enabled = opts.enabled;
    changeAttr(item.row, 'data-vh-stripe', enabled && opts.zebraStriping ? String(index % 2) : undefined);
    changeAttr(item.row, 'data-vh-compact', enabled && opts.minimalMode ? 'true' : undefined);
    changeAttr(item.row, 'data-vh-dim', enabled && searchText && !item.name.toLowerCase().includes(searchText) ? 'true' : undefined);
    const inherited: ResolvedAppearance = item.uuid ? nearestAppearance(item, ancestors.map(a => a.uuid)) : { colorInherited: false };
    if (enabled && inherited.color !== undefined) {
      // Precomputed once per scan; avoid per-node HSL conversion in large Scenes.
      const gradient = tints[inherited.color]?.[inherited.colorInherited ? 1 : 0] ?? tints[0][0];
      changeAttr(item.row, 'data-vh-tint', '');
      changeAttr(item.row, 'data-vh-inherited-color', inherited.colorInherited ? 'true' : undefined);
      if (item.row.style.getPropertyValue('--vh-row-gradient') !== gradient)
        item.row.style.setProperty('--vh-row-gradient', gradient);
    } else {
      changeAttr(item.row, 'data-vh-tint');
      changeAttr(item.row, 'data-vh-inherited-color');
      item.row.style.removeProperty('--vh-row-gradient');
    }
    const iconEl = item.drag.querySelector(':scope > .vh-icon') as HTMLElement | null;
    const displayIcon = enabled && inherited.icon ? inherited.icon : '';
    if (displayIcon && iconAssets[displayIcon]) {
      if (iconEl && iconEl.tagName !== 'IMG') iconEl.remove();
      const marker = (item.drag.querySelector(':scope > img.vh-icon') as HTMLImageElement | null)
        || ensureControl(item, 'vh-icon', () => el('img','vh-icon')) as HTMLImageElement;
      if (marker.src !== iconAssets[displayIcon]) marker.src = iconAssets[displayIcon];
      marker.title = displayIcon;
    } else if (displayIcon) {
      if (iconEl && iconEl.tagName !== 'SPAN') iconEl.remove();
      const marker = (item.drag.querySelector(':scope > span.vh-icon') as HTMLElement | null)
        || ensureControl(item, 'vh-icon', () => el('span','vh-icon vh-emoji'));
      if (marker.textContent !== displayIcon) marker.textContent = displayIcon;
    } else iconEl?.remove();
    // Custom palette icon belongs beside the native node-type glyph, NOT on
    // the far right where Cocos' component indicator and Layer now live.
    const paletteIcon = item.drag.querySelector(':scope > .vh-icon');
    if (paletteIcon && item.nameEl && paletteIcon.nextElementSibling !== item.nameEl)
      item.drag.insertBefore(paletteIcon, item.nameEl);
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
    container.insertBefore(bar, container.firstChild);
    return bar;
  }
  function renderToolbar(tree: HTMLElement): void {
    const parent = tree.parentElement;
    if (!parent) return;
    const existing = parent.querySelector(':scope > .vh-toolbar');
    if (!state.options.enabled || !state.options.navigationBar) { existing?.remove(); return; }
    const bar = findToolbar(parent);
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
  /** Watch native Vue tree changes so guides render in the expand frame, not at
   * the 1.4s resilience polling interval. Ignore changes from our own controls. */
  function observeTree(tree: HTMLElement): void {
    if (treeObservers.has(tree)) return;
    const watcher = new MutationObserver(records => {
      const nativeChange = records.some(m => {
        if (m.type === 'attributes') return true; // filtered to native Vue attributes
        if (m.target === tree) return true; // added/removed direct rows
        const changed = [...m.addedNodes, ...m.removedNodes];
        return changed.some(n => n instanceof Element &&
          (n.matches('.tree-node') || !!n.querySelector('.tree-node')));
      });
      if (nativeChange) schedule();
    });
    watcher.observe(tree, { childList:true, subtree:true, attributes:true,
      attributeFilter:['is-expand','is-parent','is-active','is-selected','is-animating','state','searching'] });
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
      VHierarchyColors.rowBackground(hex,theme,state.options,false,slot===0),
      VHierarchyColors.rowBackground(hex,theme,state.options,true,slot===0),
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
          for (let i = 0; i < group.length; i++) {
            const item=group[i]; item.depth=geometry.nodes[i].depth;
            if (!geometry.nodes[i].valid) { stack.length=0; drawItem(item,i,[],tints); views.push(item); continue; }
            stack.length=Math.min(stack.length,item.depth);
            drawItem(item,i,stack.slice(),tints);
            views.push(item); stack[item.depth]=item;
          }
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
    const guideDown = (e: Event): void => {
      if (!(e instanceof MouseEvent) || !guideParentAt(e)) return;
      // Block native drag/select handling on the small (4px) line hit area.
      e.preventDefault(); e.stopImmediatePropagation();
    };
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
    root.addEventListener('mousedown', guideDown, true);
    root.addEventListener('click', guideClick, true);
    root.addEventListener('mouseover', over, true);
    root.addEventListener('contextmenu', menu, true);
    root.addEventListener('keydown', keydown, true);
    listeners.push(() => { root.removeEventListener('mousedown', guideDown, true); root.removeEventListener('click', guideClick, true); root.removeEventListener('mouseover', over, true); root.removeEventListener('contextmenu', menu, true); root.removeEventListener('keydown', keydown, true); });
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
    try { const ok=await req('cocos-vhierarchy','set-appearance',item.uuid,next); if(!ok)throw new Error('Rejected appearance'); }
    catch(e){logError('appearance',e);}
  }
  function closePopup(): void {
    popupCleanup?.(); popupCleanup=null;
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
    (rootHost as Document | ShadowRoot).appendChild(wrap);
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
    const current: Appearance={...(state.appearances[item.uuid] || {})};
    const wrap=popup('Palette · '+item.name,x,y);
    wrap.append(el('span','','Color'));
    const colors=el('div','vh-colors');
    const theme=editorTheme();
    PALETTE.forEach((c,i)=>{ const sw=btn('','Color '+(i+1),()=>{current.color=i;void persistAppearance(item,{...current});},'vh-swatch');sw.style.background=VHierarchyColors.swatch(c,theme,state.options); sw.setAttribute('aria-pressed',String(current.color===i)); colors.append(sw); });
    wrap.append(colors,btn('Clear color','Remove color',()=>{delete current.color;current.recursiveColor=false;void persistAppearance(item,{...current});}));
    const recursive=el('label');const check=el('input') as HTMLInputElement;check.type='checkbox';check.checked=!!current.recursiveColor;
    check.addEventListener('change',()=>{current.recursiveColor=check.checked;void persistAppearance(item,{...current});});
    recursive.append(check,document.createTextNode('Apply color to descendants'));wrap.append(recursive);
    wrap.append(el('span','','Icon'));
    const icons=el('div','vh-grid');
    ICONS.forEach(symbol=>{ const b=btn('', 'Icon '+symbol,()=>{current.icon=symbol;void persistAppearance(item,{...current});},'vh-symbol');
      const url=iconAssets[symbol];if(url){const im=el('img');im.src=url;im.alt=symbol;b.append(im);} else b.textContent=symbol;
      icons.append(b); });
    wrap.append(icons,btn('Clear icon','Remove icon',()=>{delete current.icon;current.recursiveIcon=false;void persistAppearance(item,{...current});}));
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
    if (stopped || !state.options.enabled || !state.options.showNodeLayers) return;
    if (ids?.length) for (const uuid of new Set(ids)) layerLookup.invalidate(uuid);
    else layerLookup.invalidateAll(views.map(item => item.uuid).filter(Boolean));
    // The query completion schedules a render only if the resolved label changed.
    // Keep the native node name and search inputs untouched.
  }
  function refresh(): void {schedule();}
  function setIcons(next: Record<string,string>): void { iconAssets={...next};schedule(); }
  function applyState(input: State): void { if (!input?.options) return; state=input; schedule(); }
  function stats(): unknown { return { version:'0.1.0',scans,panelCount,visibleRows:views.length,vueRows,hasActiveNode:!!lastHovered?.uuid,lastError }; }
  function stop(): void {
    stopped=true; layerLookup.dispose(); if(timer)clearInterval(timer);observer?.disconnect();closePopup();
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
        for(const key of ['data-vh-tint','data-vh-stripe','data-vh-dim','data-vh-compact','data-vh-active-control','data-vh-has-layer','data-vh-native-component','data-vh-inherited-color'])h.removeAttribute(key);
        clearGuides(h);
        h.style.removeProperty('--vh-row-gradient');
        h.style.removeProperty('--vh-row-color'); // clean up old patch artifacts
        h.style.removeProperty('--vh-node-name-width');
        for(const child of h.querySelectorAll(':scope > .drag-item > .vh-icon,:scope > .drag-item > .vh-components,:scope > .drag-item > .vh-active,:scope > .drag-item > .vh-active-hit,:scope > .drag-item > .vh-node-layer,:scope > .drag-item > .vh-action-gutter'))child.remove();
      }
      for(const bar of (r as Element).querySelectorAll?.('.vh-toolbar')||[])bar.remove();
      for(const css of (r as Element).querySelectorAll?.('style[data-vh-style]')||[])css.remove();
    }
    delete w.__vHierarchy388;
  }
  w.__vHierarchy388={refresh,stop,stats,applyState,setIcons,showSettings,sceneNodeChanged};
  // A bounded periodic scan is robust to panel docking and native Vue rerendering.
  // Mutation observer only tracks opening/docking; overlays are not persisted in Vue.
  observer=new MutationObserver(()=>schedule());
  if(document.body) observer.observe(document.body,{childList:true,subtree:false});
  timer=setInterval(schedule,1400);
  schedule();
  return {status:'running',reused:false};
})();
