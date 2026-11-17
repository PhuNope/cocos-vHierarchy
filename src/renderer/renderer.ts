/**
 * Hierarchy renderer adapter for Cocos Creator 3.8.x.
 * Boundaries: read-only scene tree via Vue props; all data commits use Editor IPC.
 * Uses a reversible private DOM overlay because Cocos exposes no public per-row decorator.
 */
(() => {
  type Flag = 'navigationBar' | 'componentMinimap' | 'activationToggle' | 'hierarchyLines' | 'zebraStriping' | 'minimalMode' | 'sceneSelector' | 'keyboardShortcuts';
  interface Opts extends Record<Flag, boolean> { enabled: boolean; guideMode: 'tree' | 'minimal'; colorSaturation: number; colorBrightness: number; }
  interface Appearance { color?: number; icon?: string; recursiveColor?: boolean; recursiveIcon?: boolean; }
  interface Bookmark { uuid: string; name: string; }
  interface State { options: Opts; appearances: Record<string, Appearance>; bookmarks: Bookmark[]; }
  interface TreeDump { uuid?: string; name?: string; depth?: number; parent?: string; active?: boolean; locked?: boolean; readonly?: boolean; isScene?: boolean; components?: Array<{ type?: string; extends?: string[] }>; prefab?: { state?: number }; }
  interface Item { row: HTMLElement; drag: HTMLElement; node: TreeDump | null; uuid: string; name: string; depth: number; offset: number; components: string[]; }
  interface Hook { refresh(): void; stop(): void; stats(): unknown; applyState(state: State): void; showSettings(): void; }
  const w = window as Window & { __vHierarchy388?: Hook; Editor?: any; require?: (id: string) => any };
  const KEY = '__vHierarchy388';
  if (document.body?.getAttribute('name') !== 'main') return { status: 'not-main' };
  if (w.__vHierarchy388) { w.__vHierarchy388.refresh(); return { status: 'running', reused: true }; }

  const PALETTE = ['#777d89', '#b35e68', '#b48e4f', '#a9a857', '#61a886', '#5d94b5', '#737cc2', '#a36bb4', '#b56e9d'];
  const ICONS = ['⭐', '📁', '📷', '💡', '🎵', '🎮', '🧩', '🎨', '⚙', '🔒', '🎬', '🖼'];
  const OPTIONS: Array<[Flag, string]> = [
    ['navigationBar', 'Navigation bar / Bookmarks'], ['componentMinimap', 'Component minimap'],
    ['activationToggle', 'Active quick toggle'], ['hierarchyLines', 'Hierarchy lines'],
    ['zebraStriping', 'Zebra striping'], ['minimalMode', 'Minimal mode'],
    ['sceneSelector', 'Scene selector (experimental)'], ['keyboardShortcuts', 'Keyboard shortcuts'],
  ];
  const DEFAULT: State = {
    options: { enabled:true, navigationBar:true, componentMinimap:true, activationToggle:true, hierarchyLines:true,
      zebraStriping:true, minimalMode:false, sceneSelector:false, keyboardShortcuts:true,
      guideMode:'tree', colorBrightness:1, colorSaturation:1 }, appearances:{}, bookmarks:[],
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
    .tree-node[data-vh-tint] > .drag-item { background-color:var(--vh-row-color) !important; }
    .tree-node[is-selected="true"] > .drag-item { background-image:linear-gradient(rgba(91,155,239,.25),rgba(91,155,239,.25)); }
    .tree-node[data-vh-dim="true"] > .drag-item { opacity:.24; }
    .tree-node[data-vh-compact="true"] { line-height:18px; }
    .tree-node[data-vh-compact="true"] > .drag-item { height:18px; }
    .vh-guides { position:absolute; top:0; left:0; bottom:0; z-index:0; pointer-events:none; }
    .vh-rail { position:absolute; border-left:1px solid rgba(151,166,187,.43); height:100%; pointer-events:none; }
    .vh-elbow { position:absolute; top:0; height:50%; border-left:1px solid rgba(151,166,187,.54); border-bottom:1px solid rgba(151,166,187,.54); border-bottom-left-radius:3px; pointer-events:none; }
    .vh-icon { position:absolute; right:92px; top:1px; z-index:1; font-size:12px; line-height:17px; pointer-events:none; }
    .vh-components { position:absolute; right:47px; top:0; height:100%; display:flex; align-items:center; gap:2px; z-index:1; pointer-events:auto; max-width:45px; overflow:hidden; }
    .vh-dot { width:5px; height:8px; border-radius:2px; display:block; flex:none; opacity:.8; }
    .vh-active { position:absolute; right:25px; top:1px; width:17px; height:17px; z-index:2; display:none; color:#a2d4aa; border:none; border-radius:3px; background:transparent; cursor:pointer; font-size:13px; line-height:16px; padding:0; }
    .tree-node:hover > .drag-item > .vh-active { display:block; }
    .tree-node[is-active="false"] .vh-active { color:#c77b7b; }
    .vh-layer { position:fixed; inset:0; z-index:100000; pointer-events:none; }
    .vh-pop { pointer-events:auto; position:fixed; z-index:100001; background:#252b32; color:#e4eaf2; border:1px solid #657080; border-radius:7px; box-shadow:0 10px 30px #0009; min-width:216px; max-width:330px; padding:11px; font:12px Arial,sans-serif; }
    .vh-pop { max-height: min(85vh, 640px); overflow:auto; }
    .vh-pop h4 { margin:0 0 8px; font-size:13px; }
    .vh-pop label { display:flex; gap:5px; align-items:center; margin:5px 0; cursor:pointer; }
    .vh-pop input[type=checkbox] { accent-color:#68a4ff; }
    .vh-grid { display:grid; grid-template-columns:repeat(9, 1fr); gap:4px; margin:7px 0; }
    .vh-colors { display:grid; grid-template-columns:repeat(9, 1fr); gap:5px; margin:7px 0; }
    .vh-swatch { width:19px; height:19px; border:1px solid #e1e7e966; border-radius:4px; padding:0; cursor:pointer; }
    .vh-symbol { font-size:15px; width:23px; height:23px; background:#48515c; border:1px solid #ffffff21; border-radius:4px; cursor:pointer; padding:0; }
    .vh-footer { font-size:10px; color:#a8b4c1; margin-top:8px; }
    .vh-pop button { color:inherit; }
  `;

  let state = DEFAULT;
  let stopped = false;
  let queued = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let observer: MutationObserver | null = null;
  let lastHovered: Item | null = null;
  let searchText = '';
  let views: Item[] = [];
  let pop: HTMLElement | null = null;
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
    const offset = Number.parseFloat(getComputedStyle(drag).paddingLeft) || 0;
    const components = (node?.components || []).map(c => c.type || '').filter(Boolean);
    return { row, drag, node, uuid, name, offset, components, depth: node?.depth ?? 0 };
  }
  function nearestAppearance(item: Item, ancestorIds: string[]): Appearance {
    const a = state.appearances[item.uuid] || {};
    let color: number | undefined;
    let icon: string | undefined;
    for (const id of ancestorIds) {
      const parent = state.appearances[id];
      if (parent?.recursiveColor && parent.color !== undefined) color = parent.color;
      if (parent?.recursiveIcon && parent.icon) icon = parent.icon;
    }
    return { ...a, color: a.color ?? color, icon: a.icon ?? icon };
  }
  function componentTone(name: string): string {
    if (/Camera|Light/i.test(name)) return '#e4ae67';
    if (/Animation|Spine|Skeleton|Armature/i.test(name)) return '#caa8ff';
    if (/Collider|RigidBody|Physics/i.test(name)) return '#8cd3dd';
    if (/UITransform|Canvas|Layout|Widget|Label/i.test(name)) return '#7ac5ff';
    if (/Audio/i.test(name)) return '#82ddac';
    return '#a9b5c5';
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
  function putGuides(item: Item, ancestors: Item[], continuation: boolean[], indentStep: number): void {
    const old = item.drag.querySelector(':scope > .vh-guides');
    if (!state.options.hierarchyLines || item.depth <= 0 || item.depth > 24 || ancestors.length < item.depth) { old?.remove(); return; }
    const guides = ensureControl(item, 'vh-guides', () => el('div', 'vh-guides'));
    // Do not draw into the native arrow / native icon; width stays in the gutter.
    const width = Math.max(0, item.offset - 4);
    guides.style.width = `${width}px`;
    const pieces: string[] = [];
    const start = Math.max(0, item.offset - item.depth * indentStep);
    for (let i = 0; i < ancestors.length; i++) if (continuation[i]) {
      pieces.push(`<span class="vh-rail" style="left:${Math.max(0,start+(i+1)*indentStep-8)}px"></span>`);
    }
    const x = Math.max(0, start + item.depth * indentStep - 8);
    if (state.options.guideMode === 'tree') {
      pieces.push(`<span class="vh-elbow" style="left:${x}px;width:${Math.min(13,Math.max(5,width-x-1))}px"></span>`);
      if (continuation[item.depth]) pieces.push(`<span class="vh-rail" style="left:${x}px;top:50%;height:50%"></span>`);
    } else pieces.push(`<span class="vh-rail" style="left:${x}px;opacity:.65"></span>`);
    const html = pieces.join(''); if (guides.innerHTML !== html) guides.innerHTML = html;
  }
  function drawItem(item: Item, index: number, ancestors: Item[], nextSibling: boolean[], step: number): void {
    const opts = state.options;
    const enabled = opts.enabled;
    changeAttr(item.row, 'data-vh-stripe', enabled && opts.zebraStriping ? String(index % 2) : undefined);
    changeAttr(item.row, 'data-vh-compact', enabled && opts.minimalMode ? 'true' : undefined);
    changeAttr(item.row, 'data-vh-dim', enabled && searchText && !item.name.toLowerCase().includes(searchText) ? 'true' : undefined);
    const inherited = item.uuid ? nearestAppearance(item, ancestors.map(a => a.uuid)) : {};
    if (enabled && inherited.color !== undefined) {
      const hex = PALETTE[inherited.color] || PALETTE[0];
      // Unity's source uses low-alpha HSL palette; tint stays intentionally translucent.
      const alpha = Math.min(.36, .10 * opts.colorBrightness);
      const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)).join(',');
      changeAttr(item.row, 'data-vh-tint', '');
      item.row.style.setProperty('--vh-row-color', `rgba(${rgb},${alpha})`);
    } else {
      changeAttr(item.row, 'data-vh-tint'); item.row.style.removeProperty('--vh-row-color');
    }
    const iconEl = item.drag.querySelector(':scope > .vh-icon') as HTMLElement | null;
    const displayIcon = enabled && inherited.icon ? inherited.icon : '';
    if (displayIcon) {
      const marker = iconEl || ensureControl(item, 'vh-icon', () => el('span','vh-icon'));
      if (marker.textContent !== displayIcon) marker.textContent = displayIcon;
    } else iconEl?.remove();
    const dots = item.drag.querySelector(':scope > .vh-components') as HTMLElement | null;
    if (enabled && opts.componentMinimap && item.components.length > 0) {
      const holder = dots || ensureControl(item, 'vh-components', () => el('div','vh-components'));
      const types = item.components.slice(0, 6);
      const html = types.map(c => `<span class="vh-dot" style="background:${componentTone(c)}"></span>`).join('');
      if (holder.innerHTML !== html) holder.innerHTML = html;
      holder.title = item.components.join('\n');
    } else dots?.remove();
    const activeButton = item.drag.querySelector(':scope > .vh-active') as HTMLButtonElement | null;
    if (enabled && opts.activationToggle && item.uuid && !item.node?.isScene && !item.node?.readonly) {
      const target = activeButton || ensureControl(item, 'vh-active', () => btn('◉', 'Toggle node active (A)', () => { void toggleActive(item); }, 'vh-active')) as HTMLButtonElement;
      target.textContent = item.node?.active === false ? '○' : '◉';
    } else activeButton?.remove();
    if (enabled) putGuides(item, ancestors, nextSibling, step);
    else item.drag.querySelector(':scope > .vh-guides')?.remove();
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
  function scan(): void {
    queued = false;
    if (stopped) return;
    scans++; panelCount = 0; vueRows = 0; views = [];
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
          rootHost = tree.getRootNode() as Document | ShadowRoot;
          renderToolbar(tree);
          const rows = [...tree.querySelectorAll(':scope > .tree-node')] as HTMLElement[];
          if (!rows.length) continue;
          const group = rows.map(readItem).filter((x): x is Item => !!x);
          const pad = [...new Set(group.map(i => i.offset))].sort((a,b) => a-b);
          const deltas = pad.slice(1).map((v,i) => v-pad[i]).filter(x => x>=8 && x<=40);
          const step = deltas[0] || 20, base = pad[0] || 0;
          // Flattened depth-first tree: derive actual ancestor/sibling continuation.
          const stack: Item[] = [];
          const continuations: boolean[][] = [];
          for (let i=0;i<group.length;i++) {
            const item=group[i];
            item.depth = item.node?.depth ?? Math.max(0,Math.round((item.offset-base)/step));
            item.depth = Math.min(32,Math.max(0,item.depth));
            const level = item.depth;
            stack.length = Math.min(stack.length, level);
            const parentIds=stack.slice();
            if (level === 0) stack.length=0;
            continuations[i] = [];
            for (let ancestor=0;ancestor<=level;ancestor++) {
              let hasNext=false;
              for(let j=i+1;j<group.length;j++) {
                const d=group[j].node?.depth ?? Math.max(0,Math.round((group[j].offset-base)/step));
                if(d < ancestor)break;
                if(d === ancestor){hasNext=true;break;}
              }
              continuations[i][ancestor]=hasNext;
            }
            views.push(item);
            drawItem(item,i,parentIds,continuations[i],step);
            stack[level] = item;
          }
          listen(rootHost);
        }
      }
    } catch (e) { logError('scan',e); }
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
    root.addEventListener('mouseover', over, true);
    root.addEventListener('contextmenu', menu, true);
    root.addEventListener('keydown', keydown, true);
    listeners.push(() => { root.removeEventListener('mouseover', over, true); root.removeEventListener('contextmenu', menu, true); root.removeEventListener('keydown', keydown, true); });
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
      const dump = await req('scene','query-node',item.uuid);
      const active = dump?.active;
      if (typeof active?.value !== 'boolean') throw new Error('Scene did not return editable active property');
      const outcome = await req('scene','set-property', {uuid:item.uuid,path:'active',dump:{...active,value:!active.value},record:true});
      if(outcome!==true) throw new Error('Editor rejected node active change');
      item.node!.active=!active.value;
      schedule();
    } catch(e) { logError('toggle-active',e); }
  }
  async function persistAppearance(item: Item, next: Appearance): Promise<void> {
    if(!item.uuid) return;
    try { const ok=await req('cocos-vhierarchy','set-appearance',item.uuid,next); if(!ok)throw new Error('Rejected appearance'); }
    catch(e){logError('appearance',e);}
  }
  function popup(title: string, x?: number, y?: number): HTMLElement {
    pop?.remove();
    style(rootHost);
    const wrap=el('div','vh-pop');
    wrap.append(el('h4','',title));
    (rootHost as Document | ShadowRoot).appendChild(wrap);
    wrap.style.left=`${Math.min(window.innerWidth-260, Math.max(8,x ?? window.innerWidth/2-130))}px`;
    wrap.style.top=`${Math.min(window.innerHeight-300, Math.max(8,y ?? 68))}px`;
    pop=wrap;
    return wrap;
  }
  function showPalette(item: Item,x: number,y: number): void {
    const current: Appearance={...(state.appearances[item.uuid] || {})};
    const wrap=popup('Palette · '+item.name,x,y);
    wrap.append(el('span','','Color'));
    const colors=el('div','vh-colors');
    PALETTE.forEach((c,i)=>{ const sw=btn('','Color '+(i+1),()=>{current.color=i;void persistAppearance(item,{...current});},'vh-swatch');sw.style.background=c; colors.append(sw); });
    wrap.append(colors,btn('Clear color','Remove color',()=>{delete current.color;current.recursiveColor=false;void persistAppearance(item,{...current});}));
    const recursive=el('label');const check=el('input') as HTMLInputElement;check.type='checkbox';check.checked=!!current.recursiveColor;
    check.addEventListener('change',()=>{current.recursiveColor=check.checked;void persistAppearance(item,{...current});});
    recursive.append(check,document.createTextNode('Apply color to descendants'));wrap.append(recursive);
    wrap.append(el('span','','Icon'));
    const icons=el('div','vh-grid');
    ICONS.forEach(symbol=>icons.append(btn(symbol,'Icon '+symbol,()=>{current.icon=symbol;void persistAppearance(item,{...current});},'vh-symbol')));
    wrap.append(icons,btn('Clear icon','Remove icon',()=>{delete current.icon;current.recursiveIcon=false;void persistAppearance(item,{...current});}));
    const recursiveIcon=el('label');const iconCheck=el('input') as HTMLInputElement;iconCheck.type='checkbox';iconCheck.checked=!!current.recursiveIcon;
    iconCheck.addEventListener('change',()=>{current.recursiveIcon=iconCheck.checked;void persistAppearance(item,{...current});});
    recursiveIcon.append(iconCheck,document.createTextNode('Apply icon to descendants'));wrap.append(recursiveIcon);
    wrap.append(el('p','vh-footer','Alt + right-click node to open this palette.'));
  }
  function showSettings(): void {
    const wrap=popup('vHierarchy · v0.1.0');
    const master=el('label');const masterCheck=el('input') as HTMLInputElement;
    masterCheck.type='checkbox';masterCheck.checked=state.options.enabled;
    masterCheck.addEventListener('change',()=>{void req('cocos-vhierarchy','set-option','enabled',masterCheck.checked).catch(e=>logError('options',e));});
    master.append(masterCheck, document.createTextNode('Enable vHierarchy'));wrap.append(master);
    for(const [name,label] of OPTIONS) {
      const line=el('label'); const input=el('input') as HTMLInputElement;input.type='checkbox';input.checked=state.options[name];
      input.addEventListener('change',()=>{void req('cocos-vhierarchy','set-option',name,input.checked).catch(e=>logError('options',e));});
      line.append(input,document.createTextNode(label));wrap.append(line);
    }
    const modes=el('div');modes.append(el('span','','Guide style: '));
    for(const mode of ['tree','minimal'] as const) modes.append(btn(mode,mode,()=>{void req('cocos-vhierarchy','set-option','guideMode',mode).catch(e=>logError('guide mode',e));}));
    wrap.append(modes,el('p','vh-footer','Color/icon: Alt + right-click a Hierarchy node. Settings are saved per project.'));
    wrap.append(btn('Close','Close settings',()=>{pop?.remove();pop=null;}));
  }
  async function showScenes(): Promise<void> {
    const wrap=popup('Open Scene');wrap.append(el('p','vh-footer','Loading scenes can discard unsaved changes. Save first.'));
    try {
      const scenes=await req('asset-db','query-assets',{type:'cc.SceneAsset'});
      if(!Array.isArray(scenes))throw new Error('AssetDB scene query unavailable');
      for(const asset of scenes.slice(0,30)) {
        if(typeof asset.uuid!=='string')continue;
        wrap.append(btn('▤ '+String(asset.name||asset.url||'Scene'),String(asset.url||''),()=>{
          if(!window.confirm('Save your current Scene before switching. Continue?'))return;
          editor()?.Message?.send?.('scene','open-scene',asset.uuid);
          wrap.remove();pop=null;
        }));
      }
      if(!scenes.length)wrap.append(el('p','','No scenes found.'));
    } catch(e){wrap.append(el('p','',`Scene selector unsupported: ${String(e)}`));}
  }
  function refresh(): void {schedule();}
  function applyState(input: State): void { if (!input?.options) return; state=input; schedule(); }
  function stats(): unknown { return { version:'0.1.0',scans,panelCount,visibleRows:views.length,vueRows,hasActiveNode:!!lastHovered?.uuid,lastError }; }
  function stop(): void {
    stopped=true; if(timer)clearInterval(timer);observer?.disconnect();pop?.remove();
    for(const release of listeners) release(); listeners.length=0;
    for(const panel of panels())for(const r of roots(panel)){
      for(const row of (r as Element).querySelectorAll?.('.tree-node')||[]){
        const h=row as HTMLElement;
        for(const key of ['data-vh-tint','data-vh-stripe','data-vh-dim','data-vh-compact'])h.removeAttribute(key);
        h.style.removeProperty('--vh-row-color');
        for(const child of h.querySelectorAll(':scope > .drag-item > .vh-guides,:scope > .drag-item > .vh-icon,:scope > .drag-item > .vh-components,:scope > .drag-item > .vh-active'))child.remove();
      }
      for(const bar of (r as Element).querySelectorAll?.('.vh-toolbar')||[])bar.remove();
      for(const css of (r as Element).querySelectorAll?.('style[data-vh-style]')||[])css.remove();
    }
    delete w.__vHierarchy388;
  }
  w.__vHierarchy388={refresh,stop,stats,applyState,showSettings};
  // A bounded periodic scan is robust to panel docking and native Vue rerendering.
  // Mutation observer only tracks opening/docking; overlays are not persisted in Vue.
  observer=new MutationObserver(()=>schedule());
  if(document.body) observer.observe(document.body,{childList:true,subtree:false});
  timer=setInterval(schedule,1400);
  schedule();
  return {status:'running',reused:false};
})();
