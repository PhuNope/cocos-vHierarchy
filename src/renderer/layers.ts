/**
 * Read-only Scene layer labels, isolated from Hierarchy Vue and DOM.
 * query-node returns a serialized property dump (not the TreeNode summary).
 * A bounded asynchronous cache prevents one IPC roundtrip per paint/frame.
 */
namespace VHierarchyLayers {
  type Request = (uuid: string) => Promise<unknown>;
  interface Entry { label: string | null; expires: number; }
  interface EnumEntry { name?: unknown; value?: unknown; }

  const BUILTIN = new Map<number, string>([
    [0, 'NONE'], [1 << 20, 'IGNORE_RAYCAST'], [1 << 21, 'GIZMOS'],
    [1 << 22, 'EDITOR'], [1 << 23, 'UI_3D'], [1 << 24, 'SCENE_GIZMO'],
    [1 << 25, 'UI_2D'], [1 << 28, 'PROFILER'], [1 << 30, 'DEFAULT'],
    [0xffffffff, 'ALL'],
  ]);
  const asRecord = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  const asMask = (v: unknown): number | null => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < -0x80000000 || v > 0xffffffff) return null;
    return v >>> 0;
  };
  const clean = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const result = v.trim().replace(/[\u0000-\u001f\u007f]/g, '');
    return result ? result.slice(0, 80) : null;
  };

  /** Prefers names from the project's actual layer enum, including user layers. */
  export function layerName(dump: unknown): string | null {
    const outer = asRecord(dump);
    const raw = outer && 'layer' in outer ? outer.layer : dump;
    const prop = asRecord(raw);
    const value = prop && 'value' in prop ? prop.value : raw;
    if (typeof value === 'string') return clean(value);
    const mask = asMask(value);
    if (mask === null) return null;
    const lists: unknown[] = [prop?.enumList, prop?.enumOptions, prop?.options];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list as EnumEntry[]) {
        if (asMask(item?.value) === mask) {
          const name = clean(item?.name);
          if (name) return name;
        }
      }
    }
    const builtIn = BUILTIN.get(mask);
    if (builtIn) return builtIn;
    // Do not invent a custom layer's name if the enumList is missing.
    return `0x${mask.toString(16).toUpperCase().padStart(8, '0')}`;
  }

  export class Lookup {
    private readonly cache = new Map<string, Entry>();
    private readonly queue: string[] = [];
    private readonly waiting = new Set<string>();
    private readonly refreshAfterFlight = new Set<string>();
    private readonly activeRequests = new Set<string>();
    private readonly revisions = new Map<string, number>();
    private inFlight = 0;
    private disposed = false;
    constructor(private readonly request: Request, private readonly changed: () => void,
      private readonly now: () => number = () => Date.now(),
      private readonly ttl = 12000, private readonly concurrency = 3) {}

    /** Never blocks a frame; cache always wins over stale Vue TreeNode metadata. */
    get(uuid: string, direct?: unknown): string | null {
      if (!uuid || this.disposed) return null;
      const entry = this.cache.get(uuid);
      if (!entry || entry.expires <= this.now()) this.enqueue(uuid);
      if (entry) return entry.label;
      return direct === undefined ? null : layerName(direct);
    }

    /** React to scene:change-node instead of waiting for the 12-second TTL.
     * A revision prevents an old, in-flight Scene query from overwriting the new Layer. */
    invalidate(uuid: string): void {
      if (!uuid || this.disposed) return;
      this.revisions.set(uuid, (this.revisions.get(uuid) ?? 0) + 1);
      this.cache.delete(uuid);
      if (this.waiting.has(uuid)) {
        // Queued (not yet running) requests will see the new revision already.
        if (this.activeRequests.has(uuid)) this.refreshAfterFlight.add(uuid);
      } else {
        this.enqueue(uuid);
      }
    }

    /** Called on scene:ready/scene:close or when the native message has no UUID. */
    invalidateAll(visibleUuids: Iterable<string>): void {
      for (const uuid of new Set(visibleUuids)) this.invalidate(uuid);
    }

    private enqueue(uuid: string): void {
      if (this.disposed || this.waiting.has(uuid) || this.queue.length >= 320) return;
      this.waiting.add(uuid);
      this.queue.push(uuid);
      this.pump();
    }

    private pump(): void {
      while (!this.disposed && this.inFlight < this.concurrency && this.queue.length) {
        const uuid = this.queue.shift()!;
        const revision = this.revisions.get(uuid) ?? 0;
        this.inFlight++;
        this.activeRequests.add(uuid);
        void Promise.resolve().then(() => this.request(uuid)).then(data => {
          if (this.disposed || (this.revisions.get(uuid) ?? 0) !== revision) return;
          const label = layerName(data);
          const previous = this.cache.get(uuid);
          this.cache.delete(uuid); // Keep insertion order recent for bounded cache.
          this.cache.set(uuid, { label, expires: this.now() + (label === null ? 3000 : this.ttl) });
          if (this.cache.size > 1400) this.cache.delete(this.cache.keys().next().value!);
          if (previous?.label !== label) this.changed();
        }).catch(() => {
          if (!this.disposed && (this.revisions.get(uuid) ?? 0) === revision)
            this.cache.set(uuid, { label: null, expires: this.now() + 3000 });
        }).finally(() => {
          this.waiting.delete(uuid);
          this.activeRequests.delete(uuid);
          this.inFlight--;
          if (this.refreshAfterFlight.delete(uuid) && !this.disposed) this.enqueue(uuid);
          this.pump();
        });
      }
    }
    dispose(): void {
      this.disposed = true;
      this.queue.length = 0;
      this.cache.clear();
      this.refreshAfterFlight.clear();
      this.activeRequests.clear();
      this.revisions.clear();
    }
  }
}
