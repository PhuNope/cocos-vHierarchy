/** All Scene mutations use Cocos' Scene IPC; Vue Hierarchy dumps are read-only. */
namespace VHierarchySceneCommands {
  export type Request = (pkg: string, message: string, ...args: unknown[]) => Promise<any>;
  const running = new Set<string>();
  export function isPending(uuid: string): boolean { return running.has(uuid); }

  /**
   * Record the mutation as one explicit Scene Undo transaction. A bare snapshot
   * after set-property is not reliable as a dirty-state transition after Save.
   * The node, not the DOM, is the undo target; the editor owns Scene dirty state.
   */
  export async function toggleActive(uuid: string, request: Request): Promise<boolean> {
    if (!uuid || running.has(uuid)) return false;
    running.add(uuid);
    let recordingId: unknown;
    let recordingOpen = false;
    try {
      const node = await request('scene', 'query-node', uuid);
      const prop = node?.active;
      if (!prop || typeof prop !== 'object' || typeof prop.value !== 'boolean') {
        throw new Error('scene:query-node returned no editable active dump');
      }
      // Begin BEFORE writing so the Cocos undo manager captures the saved state.
      recordingId = await request('scene', 'begin-recording', uuid);
      if (recordingId === null || recordingId === undefined || recordingId === false) {
        throw new Error('scene:begin-recording did not return an undo transaction ID');
      }
      recordingOpen = true;
      const next = { ...prop, value: !prop.value };
      // Do not set the private/undocumented "record: true" flag: the explicit
      // begin/end pair owns recording and must not produce duplicate undo steps.
      const updated = await request('scene', 'set-property', { uuid, path: 'active', dump: next });
      if (updated !== true) throw new Error('scene:set-property rejected active change');
      const finished = await request('scene', 'end-recording', recordingId);
      // Cocos returns void or truthy on success. Some builds return boolean.
      if (finished === false) throw new Error('scene:end-recording rejected active change');
      recordingOpen = false;

      // Verify against Cocos itself rather than assuming a successful write
      // necessarily dirtied the Scene (notably immediately after Ctrl+S).
      const dirty = await request('scene', 'query-dirty');
      if (dirty !== true) {
        // Compatibility path for Editor builds where end-recording completes
        // before the legacy snapshot dirty notification is processed.
        await request('scene', 'snapshot');
        const afterSnapshot = await request('scene', 'query-dirty');
        if (afterSnapshot !== true) {
          throw new Error('Active changed but Scene is still clean: save/dirty tracking was not recorded by Cocos');
        }
      }
      return true;
    } catch (error) {
      if (recordingOpen) {
        try { await request('scene', 'cancel-recording', recordingId); }
        catch { /* Preserve the original mutation error; Editor may have closed the record. */ }
      }
      throw error;
    } finally { running.delete(uuid); }
  }
}
