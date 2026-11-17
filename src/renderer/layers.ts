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
    private inFlight = 0;
    private disposed = false;
    constructor(private readonly request: Request, private readonly changed: () => void,
      private readonly now: () => number = () => Date.now(),
      private readonly ttl = 12000, private readonly concurrency = 3) {}

    /** Never blocks a frame. Missing layer information is omitted, not guessed. */
    get(uuid: string, direct?: unknown): string | null {
      const known = direct === undefined ? null : layerName(direct);
      if (known !== null) return known;
      if (!uuid || this.disposed) return null;
      const entry = this.cache.get(uuid);
      if ((!entry || entry.expires <= this.now()) && !this.waiting.has(uuid) && this.queue.length < 320) {
        this.waiting.add(uuid);
        this.queue.push(uuid);
        this.pump();
      }
      return entry?.label ?? null;
    }

    private pump(): void {
      while (!this.disposed && this.inFlight < this.concurrency && this.queue.length) {
        const uuid = this.queue.shift()!;
        this.inFlight++;
        void Promise.resolve().then(() => this.request(uuid)).then(data => {
          if (this.disposed) return;
          const label = layerName(data);
          const previous = this.cache.get(uuid);
          // Use a shorter retry for errors or a scene that has no layer property.
          this.cache.delete(uuid); // Keep insertion order recent for bounded cache.
          this.cache.set(uuid, { label, expires: this.now() + (label === null ? 3000 : this.ttl) });
          if (this.cache.size > 1400) this.cache.delete(this.cache.keys().next().value!);
          if (previous?.label !== label) this.changed();
        }).catch(() => {
          if (!this.disposed) this.cache.set(uuid, {label: null, expires: this.now() + 5000});
        }).finally(() => {
          this.waiting.delete(uuid);
          this.inFlight--;
          this.pump();
        });
      }
    }
    dispose(): void {
      this.disposed = true;
      this.queue.length = 0;
      this.cache.clear();
    }
  }
}
