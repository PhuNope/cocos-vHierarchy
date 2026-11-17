/** Validate project Scene assets before invoking scene:open-scene.
 * AssetDB query results can be stale and include non-scene/invalid entries.
 */
namespace VHierarchyScenes {
  export interface SceneInfo {
    uuid?: unknown;
    name?: unknown;
    url?: unknown;
    type?: unknown;
    invalid?: unknown;
    imported?: unknown;
    isDirectory?: unknown;
  }
  export type Request = (pkg: string, message: string, ...args: unknown[]) => Promise<unknown>;
  export interface SceneEntry { uuid: string; name: string; url: string; }
  export function isSceneInfo(asset: SceneInfo | null | undefined): boolean {
    if (!asset || typeof asset.uuid !== 'string' || !/^[a-f\d-]{32,40}$/i.test(asset.uuid)) return false;
    if (asset.invalid === true || asset.imported === false || asset.isDirectory === true) return false;
    // Filter out UUIDs for other asset types, even if AssetDB returned them.
    if (asset.type !== undefined && asset.type !== 'cc.SceneAsset') return false;
    return typeof asset.url === 'string' && /^db:\/\/assets\//i.test(asset.url) && /\.scene$/i.test(asset.url);
  }
  export function listScenes(raw: unknown): SceneEntry[] {
    if (!Array.isArray(raw)) throw new Error('AssetDB did not return a scene list');
    const result: SceneEntry[] = [];
    const ids = new Set<string>();
    for (const candidate of raw) {
      if (!isSceneInfo(candidate) || ids.has(candidate.uuid)) continue;
      ids.add(candidate.uuid);
      const name = typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name : candidate.url.split('/').pop()?.replace(/\.scene$/i, '') || 'Scene';
      result.push({uuid:candidate.uuid, name, url:candidate.url});
    }
    return result.sort((a,b) => a.name.localeCompare(b.name));
  }
  export async function openVerified(scene: SceneEntry, request: Request): Promise<void> {
    const latest = await request('asset-db', 'query-asset-info', scene.uuid);
    if (!isSceneInfo(latest as SceneInfo) || (latest as SceneInfo).uuid !== scene.uuid ||
      (latest as SceneInfo).url !== scene.url) {
      throw new Error('Scene is missing, moved, unimported or not a valid project .scene file. Refresh the list.');
    }
    // request (not send) allows failed scene operations to be reported in the popup.
    const result = await request('scene', 'open-scene', scene.uuid);
    if (result === false) throw new Error('Cocos declined to open this Scene');
  }
}
