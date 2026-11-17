/** Editor-main-process composition root. Renderer is isolated and disposable. */
declare const require: (id: string) => any;
declare const __dirname: string;
declare const global: any;
declare const console: { log(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
declare function setInterval(handler: () => void, timeout: number): unknown;
declare function clearInterval(handle: unknown): void;
declare function setTimeout(handler: () => void, timeout: number): unknown;
declare function clearTimeout(handle: unknown): void;
import { State, Options, Appearance, Feature, FEATURES, sanitizeState, sanitizeAppearance } from './core/model';

const fs = require('fs');
const path = require('path');
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
  private readonly repo = new ProjectStateRepository();
  private readonly dirtyNodeIds = new Set<string>();
  private sceneFlushTimer: unknown = null;
  private invalidateAllNodes = false;

  start(): void {
    this.script = ['guides.js','scene-commands.js','layers.js','scenes.js','colors.js','renderer.js']
      .map((name: string)=>fs.readFileSync(path.join(__dirname, 'renderer', name), 'utf8')).join('\n');
    const iconDir=path.join(__dirname, '..','static','icons');
    this.icons={};
    for (const name of ['folder','camera','light','script','particle','physics','audio','material','prefab','canvas','settings','favorite']) {
      try {
        this.icons[name]='data:image/svg+xml;base64,'+fs.readFileSync(path.join(iconDir, name+'.svg')).toString('base64');
      } catch(err) { console.warn('[vHierarchy] Missing icon asset',name,String(err)); }
    }
    this.state = this.repo.load();
    this.active = true;
    this.poll();
    this.timer = setInterval(() => this.poll(), 1700);
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
      const result = await this.execute(client.wc, `${this.script}\n;window.__vHierarchy388?.setIcons(${JSON.stringify(this.icons)});window.__vHierarchy388?.applyState(${JSON.stringify(this.state)});({status:'running'});`);
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
        if (/^[\w-]{16,128}$/.test(value) && /[0-9]/.test(value)) ids.add(value);
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
  async setAppearance(uuid: string, input: Appearance): Promise<boolean> {
    if (!/^[\w-]{16,128}$/.test(uuid) || !input || typeof input !== 'object') return false;
    const next = sanitizeAppearance(input);
    if (JSON.stringify(next) !== JSON.stringify(input)) return false;
    if (Object.keys(next).length) this.state.appearances[uuid] = next;
    else delete this.state.appearances[uuid];
    this.repo.save(this.state);
    await this.broadcast('applyState', this.state);
    return true;
  }
  async toggleBookmark(uuid: string, name: string): Promise<boolean> {
    if (!/^[\w-]{16,128}$/.test(uuid) || typeof name !== 'string') return false;
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
  setAppearance: (uuid: string, appearance: Appearance): Promise<boolean> => app.setAppearance(uuid, appearance),
  toggleBookmark: (uuid: string, name: string): Promise<boolean> => app.toggleBookmark(uuid, name),
  openSettings: (): Promise<void> => app.openSettings(),
  toggleEnabled: (): Promise<boolean> => app.toggleEnabled(),
  refresh: (): Promise<void> => app.refresh(),
  diagnostics: (): Promise<void> => app.diagnostics(),
  nodeChanged: (...args: unknown[]): void => app.nodeChanged(...args),
  sceneReady: (): void => app.sceneReady(),
};
