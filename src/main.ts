/** Editor-main-process composition root. Renderer is isolated and disposable. */
declare const require: (id: string) => any;
declare const __dirname: string;
declare const global: any;
declare const Buffer: any;
declare const console: { log(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
declare function setInterval(handler: () => void, timeout: number): unknown;
declare function clearInterval(handle: unknown): void;
declare function setTimeout(handler: () => void, timeout: number): unknown;
declare function clearTimeout(handle: unknown): void;
import { State, Options, Appearance, Feature, FEATURES, sanitizeState, sanitizeAppearance, isValidAppearance, isNodeId, isPrefabAppearanceKey } from './core/model';
import { MATERIAL_SYMBOL_NAMES, MATERIAL_CODEPOINTS_URL, MAX_CATALOG_BYTES, parseMaterialCache, parseMaterialCodepoints, setMaterialCatalog } from './core/material-catalog';
import { CustomIcon, MAX_CUSTOM_ICONS, MAX_ICON_PNG_BYTES, isCustomIcon, isValidPng, cleanIconName } from './core/custom-icons';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { BrowserWindow } = require('electron');
interface WebContents {
  id: number; isDestroyed(): boolean; isLoading(): boolean;
  executeJavaScript(source: string, userGesture?: boolean): Promise<any>;
  on(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
}
interface Watch { wc: WebContents; loaded: () => void; destroyed: () => void; attached: boolean; inFlight: boolean; }

class ProjectStateRepository {
  private file = '';
  load(): State {
    const projectPath: string | undefined = global.Editor?.Project?.path;
    if (!projectPath || !path.isAbsolute(projectPath)) { this.file = ''; return sanitizeState({}); }
    this.file = path.join(projectPath, 'settings', 'vHierarchy.json');
    try { return sanitizeState(JSON.parse(fs.readFileSync(this.file, 'utf8'))); }
    catch (error) { if (fs.existsSync(this.file)) console.warn('[vHierarchy] invalid configuration, keeping defaults', String(error)); return sanitizeState({}); }
  }
  save(state: State): void {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8' });
    fs.renameSync(temp, this.file);
  }
}

class EditorHierarchyHost {
  private readonly clients = new Map<number, Watch>();
  private timer: unknown;
  private active = false;
  private script = '';
  private icons: Record<string, string> = {};
  private state: State = sanitizeState({});
  private materialSymbols: string[] = [...MATERIAL_SYMBOL_NAMES];
  private materialCatalogFull = false;
  private materialCatalogRequest: Promise<boolean> | null = null;
  private readonly repo = new ProjectStateRepository();
  private readonly dirtyNodeIds = new Set<string>();
  private sceneFlushTimer: unknown = null;
  private invalidateAllNodes = false;

  start(): void {
    this.script = ['guides.js','prefabs.js','prefab-icon.js','scene-commands.js','layers.js','scenes.js','colors.js','icon-files.js','renderer.js']
      .map((name: string)=>fs.readFileSync(path.join(__dirname, 'renderer', name), 'utf8')).join('\n');
    const iconDir=path.join(__dirname, '..','static','icons');
    this.icons={};
    for (const name of ['folder','camera','light','script','particle','physics','audio','material','prefab','canvas','settings','favorite','animation','sprite','atlas','shader','scene','timeline','transform','database','service','network','input','mouse','gamepad','group','grid','eye','lock','key','bug','flag','star','heart','ui_panel','code']){
      try {
        this.icons[name]='data:image/svg+xml;base64,'+fs.readFileSync(path.join(iconDir, name+'.svg')).toString('base64');
      } catch(err) { console.warn('[vHierarchy] Missing icon asset',name,String(err)); }
    }
    this.materialSymbols = [...MATERIAL_SYMBOL_NAMES];
    this.materialCatalogFull = false;
    setMaterialCatalog([]);
    this.loadCachedMaterialCatalog();
    this.state = this.repo.load();
    this.loadCustomIconAssets();
    this.active = true;
    this.poll();
    this.timer = setInterval(() => this.poll(), 1700);
    void this.refreshMaterialCatalog();
    console.log('[vHierarchy] 0.1.0 loaded');
  }
  async stop(): Promise<void> {
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    if (this.sceneFlushTimer) clearTimeout(this.sceneFlushTimer);
    this.sceneFlushTimer = null;
    this.dirtyNodeIds.clear();
    this.invalidateAllNodes = false;
    for (const c of this.clients.values()) {
      c.wc.removeListener('did-finish-load', c.loaded);
      c.wc.removeListener('destroyed', c.destroyed);
    }
    await Promise.all([...this.clients.values()].map(c => this.execute(c.wc, 'window.__vHierarchy388?.stop?.()')));
    this.clients.clear();
  }
  /** Project icons live beside project settings. No absolute path or file name
   * received from renderer is ever used as a filesystem path. */
  private customIconDir(): string {
    const project: string | undefined = global.Editor?.Project?.path;
    if (!project || !path.isAbsolute(project)) throw new Error('No active project path for custom icons');
    return path.join(project, 'settings', 'vHierarchy-icons');
  }
  private loadCustomIconAssets(): void {
    for (const icon of this.state.customIcons) {
      try {
        const bytes = fs.readFileSync(path.join(this.customIconDir(), icon.id.slice(7) + '.png'));
        if (isValidPng(bytes)) this.icons[icon.id] = 'data:image/png;base64,' + bytes.toString('base64');
        else console.warn('[vHierarchy] Invalid stored PNG for icon', icon.id);
      } catch (error) { console.warn('[vHierarchy] Missing project icon', icon.id, String(error)); }
    }
  }
  /** Import a rasterized PNG generated by the renderer's local file picker.
   * Renderer is untrusted: enforce size, PNG signature, dimensions and hashed ID.
   * Reimporting identical bytes is idempotent, including after restarting Editor. */
  async importIcon(name: unknown, dataUrl: unknown): Promise<CustomIcon | null> {
    const title = cleanIconName(name);
    if (!title || typeof dataUrl !== 'string' || dataUrl.length > MAX_ICON_PNG_BYTES * 2 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) return null;
    let png: any;
    try { png = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'); }
    catch { return null; }
    if (!isValidPng(png)) return null;
    const digest = crypto.createHash('sha256').update(png).digest('hex').slice(0,20);
    const id = 'custom:' + digest;
    const found = this.state.customIcons.find(icon => icon.id === id);
    if (found) return found;
    if (this.state.customIcons.length >= MAX_CUSTOM_ICONS) throw new Error('Custom icon library is full (64 icons)');
    const dir = this.customIconDir();
    fs.mkdirSync(dir, { recursive: true });
    const output = path.join(dir, digest + '.png');
    // File name is derived from SHA256, not from the selected local filename.
    if (!fs.existsSync(output)) fs.writeFileSync(output, png, { flag: 'wx' });
    const icon: CustomIcon = {id, name:title};
    const newState: State = {...this.state, customIcons:[...this.state.customIcons, icon]};
    this.repo.save(newState);
    this.state = newState;
    this.icons[id] = 'data:image/png;base64,' + png.toString('base64');
    await this.broadcast('setIcons', this.icons);
    await this.broadcast('applyState', this.state);
    return icon;
  }
  /** Delete a custom icon and clear any nodes referring to it. Import is
   * project-local metadata, so it never modifies Scene/Prefab assets. */
  async removeIcon(id: string): Promise<boolean> {
    if (!isCustomIcon(id) || !this.state.customIcons.some(icon => icon.id === id)) return false;
    const appearances: State['appearances'] = {};
    for (const [uuid, value] of Object.entries(this.state.appearances)) {
      if (value.icon !== id) { appearances[uuid] = value; continue; }
      const next = {...value}; delete next.icon; delete next.iconColor; delete next.recursiveIcon;
      if (Object.keys(next).length) appearances[uuid] = next;
    }
    const prefabAppearances: State['prefabAppearances'] = {};
    for (const [key, value] of Object.entries(this.state.prefabAppearances)) {
      if (value.icon !== id) { prefabAppearances[key] = value; continue; }
      const next = {...value}; delete next.icon; delete next.iconColor; delete next.recursiveIcon;
      if (Object.keys(next).length) prefabAppearances[key] = next;
    }
    const newState: State = {
      ...this.state, appearances, prefabAppearances,
      customIcons: this.state.customIcons.filter(icon => icon.id !== id),
    };
    this.repo.save(newState);
    this.state = newState;
    delete this.icons[id];
    try { fs.unlinkSync(path.join(this.customIconDir(), id.slice(7) + '.png')); }
    catch (error) { console.warn('[vHierarchy] Could not remove old icon file', id, String(error)); }
    await this.broadcast('setIcons', this.icons);
    await this.broadcast('applyState', this.state);
    return true;
  }

  /** Cached catalog is loaded synchronously *before* project appearance
   * validation. Otherwise a previously selected Material icon could be lost
   * during startup if the network is offline. */
  private catalogCacheFile(): string | null {
    const project: string | undefined = global.Editor?.Project?.path;
    return project && path.isAbsolute(project)
      ? path.join(project, 'settings', 'vHierarchy-material-symbols.json') : null;
  }
  private loadCachedMaterialCatalog(): void {
    const cache = this.catalogCacheFile();
    if (!cache) return;
    try {
      const names = parseMaterialCache(JSON.parse(fs.readFileSync(cache, 'utf8')));
      if (!names.length) return;
      this.materialSymbols = names;
      this.materialCatalogFull = true;
      setMaterialCatalog(names);
    } catch { /* No cache on first run; keep curated fallback. */ }
  }
  /** The official codepoints index (~80KB) is fetched as plain text over HTTPS.
   * Limit bytes/time, reject invalid or partial responses, and never execute it.
   * A working cache is kept on transient network failures. */
  private fetchMaterialCodepoints(): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = https.get(MATERIAL_CODEPOINTS_URL, { timeout: 9000 }, (response: any) => {
        if (response.statusCode !== 200) {
          response.resume(); reject(new Error('Google catalog HTTP ' + response.statusCode)); return;
        }
        const chunks: any[] = [];
        let count = 0;
        response.on('data', (chunk: any) => {
          count += chunk.length;
          if (count > MAX_CATALOG_BYTES) {
            request.destroy(new Error('Google catalog exceeds size limit'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        response.on('error', reject);
      });
      request.on('timeout', () => request.destroy(new Error('Google catalog request timed out')));
      request.on('error', reject);
    });
  }
  refreshMaterialCatalog(): Promise<boolean> {
    if (this.materialCatalogRequest) return this.materialCatalogRequest;
    const work = (async (): Promise<boolean> => {
      try {
        const names = parseMaterialCodepoints(await this.fetchMaterialCodepoints());
        if (!names.length) throw new Error('Invalid or incomplete Google catalog');
        if (!this.active) return false;
        const cache = this.catalogCacheFile();
        if (cache) {
          try {
            fs.mkdirSync(path.dirname(cache), {recursive:true});
            const temp = cache + '.tmp';
            fs.writeFileSync(temp, JSON.stringify(names) + '\n', 'utf8');
            fs.renameSync(temp, cache);
          } catch (error) { console.warn('[vHierarchy] Could not cache Material Symbols list', String(error)); }
        }
        this.materialSymbols = names;
        this.materialCatalogFull = true;
        setMaterialCatalog(names);
        await this.broadcast('setMaterialSymbols', {names, full:true});
        console.log('[vHierarchy] Google Material Symbols catalog ready:', names.length, 'icons');
        return true;
      } catch (error) {
        console.warn('[vHierarchy] Google icon catalog unavailable; keeping cached/local names', String(error));
        return false;
      }
    })();
    this.materialCatalogRequest = work;
    void work.finally(() => { if (this.materialCatalogRequest === work) this.materialCatalogRequest = null; });
    return work;
  }

  private poll(): void {
    if (!this.active) return;
    for (const win of BrowserWindow.getAllWindows()) {
      const wc: WebContents = win.webContents;
      if (!wc || wc.isDestroyed()) continue;
      if (!this.clients.has(wc.id)) {
        const c: Watch = { wc, attached: false, inFlight: false, loaded: () => { c.attached = false; void this.inject(c); }, destroyed: () => { this.clients.delete(wc.id); } };
        wc.on('did-finish-load', c.loaded);
        wc.on('destroyed', c.destroyed);
        this.clients.set(wc.id, c);
      }
      void this.inject(this.clients.get(wc.id)!);
    }
  }
  private async execute(wc: WebContents, source: string): Promise<any> {
    if (wc.isDestroyed() || wc.isLoading()) return null;
    try { return await wc.executeJavaScript(source, true); }
    catch (e) { console.warn('[vHierarchy] renderer message failed', String(e)); return null; }
  }
  private async inject(client: Watch): Promise<void> {
    if (!this.active || client.attached || client.inFlight || client.wc.isLoading()) return;
    client.inFlight = true;
    try {
      // Only the main Cocos Editor renderer may own the Hierarchy panel.
      const probe = await this.execute(client.wc, "document.body?.getAttribute('name') === 'main' ? 'main' : 'other'");
      if (probe !== 'main') return;
      const result = await this.execute(client.wc, `${this.script}\n;window.__vHierarchy388?.setIcons(${JSON.stringify(this.icons)});window.__vHierarchy388?.setMaterialSymbols(${JSON.stringify({names:this.materialSymbols,full:this.materialCatalogFull})});window.__vHierarchy388?.applyState(${JSON.stringify(this.state)});({status:'running'});`);
      if (result?.status === 'running') client.attached = true;
    } finally { client.inFlight = false; }
  }
  private async broadcast(method: string, data?: unknown): Promise<void> {
    await Promise.all([...this.clients.values()].map(client => {
      if (!client.attached) return Promise.resolve(null);
      return this.execute(client.wc, `window.__vHierarchy388?.${method}?.(${JSON.stringify(data ?? null)})`);
    }));
  }
  /** Native Hierarchy listens to the same `scene:change-node` broadcast.
   * Scene can emit a UUID string or a node-like payload depending on the operation.
   * Unknown signatures invalidate only currently rendered nodes, never the Scene itself. */
  nodeChanged(...args: unknown[]): void {
    if (!this.active) return;
    const uuids = this.nodeUuids(args);
    if (!uuids.length) this.invalidateAllNodes = true;
    else for (const uuid of uuids) this.dirtyNodeIds.add(uuid);
    this.queueSceneRefresh();
  }
  sceneReady(): void {
    if (!this.active) return;
    this.invalidateAllNodes = true;
    this.queueSceneRefresh();
  }
  private nodeUuids(values: unknown[]): string[] {
    const ids = new Set<string>();
    const traverse = (value: unknown, depth: number): void => {
      if (depth > 3 || ids.size >= 128) return;
      if (typeof value === 'string') {
        if (isNodeId(value)) ids.add(value);
      } else if (Array.isArray(value)) {
        for (const child of value.slice(0, 128)) traverse(child, depth + 1);
      } else if (value && typeof value === 'object') {
        const node = value as Record<string, unknown>;
        for (const key of ['uuid', '_uuid', 'nodeUuid', 'nodeUUID', 'id', 'node', 'nodes']) {
          if (key in node) traverse(node[key], depth + 1);
        }
      }
    };
    for (const value of values) traverse(value, 0);
    return [...ids];
  }
  private queueSceneRefresh(): void {
    if (this.sceneFlushTimer || !this.active) return;
    // Coalesce a burst of native Scene changes without the 12s cache delay.
    this.sceneFlushTimer = setTimeout(() => {
      this.sceneFlushTimer = null;
      const ids = this.invalidateAllNodes ? null : [...this.dirtyNodeIds];
      this.invalidateAllNodes = false;
      this.dirtyNodeIds.clear();
      void this.broadcast('sceneNodeChanged', ids);
    }, 24);
  }
  getState(): State { return JSON.parse(JSON.stringify(this.state)); }
  async setOption(key: keyof Options, value: unknown): Promise<boolean> {
    if (!(key === 'enabled' || key === 'guideMode' || key === 'colorSaturation' || key === 'colorBrightness' || FEATURES.includes(key as Feature))) return false;
    const next = sanitizeState({ ...this.state, options: { ...this.state.options, [key]: value } });
    // Reject malformed changes rather than quietly saving a different value.
    if (next.options[key] !== value) return false;
    this.state = next;
    this.repo.save(this.state);
    await this.broadcast('applyState', this.state);
    return true;
  }
  async setAppearance(uuid: string, input: Appearance, prefabKey?: string): Promise<boolean> {
    if (!isNodeId(uuid)) { console.warn('[vHierarchy] set-appearance: unsupported node ID format', { length: String(uuid ?? '').length }); return false; }
    if (!isValidAppearance(input)) { console.warn('[vHierarchy] set-appearance: invalid appearance fields', Object.keys(input ?? {})); return false; }
    if (prefabKey !== undefined && !isPrefabAppearanceKey(prefabKey)) {
      console.warn('[vHierarchy] set-appearance: invalid prefab appearance key'); return false;
    }
    const next = sanitizeAppearance(input);
    if (next.icon && isCustomIcon(next.icon) && !this.state.customIcons.some(i => i.id === next.icon)) return false;
    // Stage a new state first: a failed disk write must not leave the in-memory
    // appearance changed while the project settings file remains unchanged.
    const appearances = { ...this.state.appearances };
    if (Object.keys(next).length) appearances[uuid] = next;
    else delete appearances[uuid];
    const prefabAppearances = { ...this.state.prefabAppearances };
    if (prefabKey) {
      if (Object.keys(next).length) prefabAppearances[prefabKey] = next;
      else delete prefabAppearances[prefabKey];
    }
    const newState = { ...this.state, appearances, prefabAppearances };
    this.repo.save(newState);
    this.state = newState;
    await this.broadcast('applyState', this.state);
    return true;
  }
  /** One-time migration of pre-Patch-19 node-UUID-only styles. When a
   * decorated node is made into a prefab, its original node UUID may remain,
   * but its visual metadata previously had no reusable prefab key. Never
   * override an existing prefab template, preserving explicitly chosen styles. */
  async promotePrefabAppearance(uuid: string, prefabKey: string): Promise<boolean> {
    if (!isNodeId(uuid) || !isPrefabAppearanceKey(prefabKey)) return false;
    const existing = this.state.appearances[uuid];
    if (!existing || !Object.keys(existing).length) return false;
    if (this.state.prefabAppearances[prefabKey]) return true;
    const prefabAppearances = { ...this.state.prefabAppearances, [prefabKey]: {...existing} };
    const newState: State = {...this.state, prefabAppearances};
    this.repo.save(newState);
    this.state = newState;
    await this.broadcast('applyState', newState);
    return true;
  }
  async toggleBookmark(uuid: string, name: string): Promise<boolean> {
    if (!isNodeId(uuid) || typeof name !== 'string') return false;
    const exists = this.state.bookmarks.some(x => x.uuid === uuid);
    this.state.bookmarks = exists ? this.state.bookmarks.filter(x => x.uuid !== uuid) : [...this.state.bookmarks, { uuid, name: name.slice(0, 80) }].slice(-32);
    this.repo.save(this.state);
    await this.broadcast('applyState', this.state);
    return true;
  }
  openSettings(): Promise<void> { return this.broadcast('showSettings'); }
  async toggleEnabled(): Promise<boolean> { return this.setOption('enabled', !this.state.options.enabled); }
  refresh(): Promise<void> { return this.broadcast('refresh'); }
  async diagnostics(): Promise<void> {
    for (const c of this.clients.values()) if (c.attached) {
      const report = await this.execute(c.wc, 'window.__vHierarchy388?.stats?.()');
      console.log('[vHierarchy] diagnostics', c.wc.id, report);
    }
  }
}
const app = new EditorHierarchyHost();
export const load = (): void => app.start();
export const unload = (): Promise<void> => app.stop();
export const methods = {
  getState: (): State => app.getState(),
  setOption: (key: keyof Options, value: unknown): Promise<boolean> => app.setOption(key, value),
  setAppearance: (uuid: string, appearance: Appearance, prefabKey?: string): Promise<boolean> => app.setAppearance(uuid, appearance, prefabKey),
  importIcon: (name: unknown, dataUrl: unknown): Promise<CustomIcon | null> => app.importIcon(name, dataUrl),
  removeIcon: (id: string): Promise<boolean> => app.removeIcon(id),
  promotePrefabAppearance: (uuid: string, prefabKey: string): Promise<boolean> => app.promotePrefabAppearance(uuid, prefabKey),
  toggleBookmark: (uuid: string, name: string): Promise<boolean> => app.toggleBookmark(uuid, name),
  openSettings: (): Promise<void> => app.openSettings(),
  toggleEnabled: (): Promise<boolean> => app.toggleEnabled(),
  refresh: (): Promise<void> => app.refresh(),
  diagnostics: (): Promise<void> => app.diagnostics(),
  refreshMaterialCatalog: (): Promise<boolean> => app.refreshMaterialCatalog(),
  nodeChanged: (...args: unknown[]): void => app.nodeChanged(...args),
  sceneReady: (): void => app.sceneReady(),
};
