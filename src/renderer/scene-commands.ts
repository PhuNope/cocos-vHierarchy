/** All scene mutation lives behind an IPC port; Vue tree dumps are NEVER writable. */
namespace VHierarchySceneCommands {
  export type Request = (pkg: string, message: string, ...args: unknown[]) => Promise<any>;
  const running = new Set<string>();
  export function isPending(uuid: string): boolean { return running.has(uuid); }
  export async function toggleActive(uuid: string, request: Request): Promise<boolean> {
    if (!uuid || running.has(uuid)) return false;
    running.add(uuid);
    try {
      const node = await request('scene', 'query-node', uuid);
      const prop = node?.active;
      if (!prop || typeof prop !== 'object' || typeof prop.value !== 'boolean') {
        throw new Error('scene:query-node returned no editable active dump');
      }
      // Clone the dump to prevent writes to readonly Scene/Vue snapshots.
      const newDump = { ...prop, value: !prop.value };
      const result = await request('scene', 'set-property', { uuid, path: 'active', dump: newDump, record: true });
      if (result !== true) throw new Error('scene:set-property rejected active change');
      // Creator 3.8's public Scene message persists the undo snapshot and marks
      // the scene dirty. Never snapshot before a rejected/no-op mutation.
      await request('scene', 'snapshot');
      // Authoritative native Hierarchy update follows Cocos' Scene change notification.
      return true;
    } finally { running.delete(uuid); }
  }
}
