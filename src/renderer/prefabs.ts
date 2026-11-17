/**
 * Stable visual metadata identity for nodes belonging to a prefab.
 * A scene instance gets new node UUIDs, but its prefab asset UUID and the
 * relative hierarchy levels remain stable across instantiation/reopening.
 * No native Prefab serialization or node-name styles are modified.
 *
 * Creator 3.8.8 TreeNode (hierarchy/@types/private.d.ts) supplies:
 *   prefab.assetUuid, prefab.isAddedChild, level ('0_1_0'), isPrefabRoot.
 * It does not expose a stable PrefabInfo.fileId in the hierarchy dump.
 */
namespace VHierarchyPrefabs {
  export interface NodeInfo {
    prefab?: { assetUuid?: string; isAddedChild?: boolean; state?: number };
    level?: string;
    isScene?: boolean;
    isPrefabRoot?: boolean;
  }
  const ID = /^(?:[A-Za-z0-9_-]{16,128}|[A-Za-z0-9+/_-]{22})$/;
  const LEVEL = /^\d+(?:_\d+){0,48}$/;
  export function keyFor(node: NodeInfo | null, ancestors: Array<NodeInfo | null>): string | null {
    if (!node || node.isScene || node.prefab?.isAddedChild) return null;
    const chain = [...ancestors, node];
    let lastRoot = -1;
    let assetUuid = '';
    for (let i = chain.length - 1; i >= 0; i--) {
      const n = chain[i];
      const asset = typeof n?.prefab?.assetUuid === 'string' ? n.prefab.assetUuid : '';
      if (asset && ID.test(asset)) { assetUuid = asset; lastRoot = i; break; }
      // Do not borrow an outer prefab's appearance for an explicit nested
      // prefab child with a different asset identity.
      if (n?.prefab?.isAddedChild) break;
    }
    if (!assetUuid || lastRoot === -1) return null;
    // Walk back through contiguous nodes of the same prefab asset. A nested
    // prefab's asset UUID is distinct from its outer prefab's UUID.
    while (lastRoot > 0) {
      const parent = chain[lastRoot - 1];
      if (!parent || parent.isScene || parent.prefab?.isAddedChild) break;
      const parentAsset = parent.prefab?.assetUuid;
      if (parentAsset && parentAsset !== assetUuid) break;
      // An ordinary hierarchy parent with no prefab identity cannot be
      // assumed to be a member. Only extend through explicit same assets.
      if (!parentAsset) break;
      lastRoot--;
    }
    const root = chain[lastRoot];
    const base = root?.level;
    const current = node.level;
    if (!base || !current || !LEVEL.test(base) || !LEVEL.test(current)) return null;
    const relative = current === base ? 'root' : current.startsWith(base + '_') ? current.slice(base.length + 1) : null;
    if (!relative || (relative !== 'root' && !LEVEL.test(relative))) return null;
    return `prefab|${assetUuid}|${relative}`;
  }
}
