/** Core domain objects. No Editor, Electron or DOM dependencies. */
export const FEATURES = [
  'navigationBar', 'activationToggle', 'hierarchyLines',
  'zebraStriping', 'minimalMode', 'sceneSelector', 'keyboardShortcuts', 'foldOnGuideClick', 'showNodeLayers', 'colorGradientsEnabled',
] as const;
export type Feature = typeof FEATURES[number];
export type GuideMode = 'tree' | 'minimal';
export interface Options extends Record<Feature, boolean> {
  enabled: boolean;
  guideMode: GuideMode;
  colorSaturation: number;
  colorBrightness: number;
}
export interface Appearance { color?: number; icon?: string; recursiveColor?: boolean; recursiveIcon?: boolean; }
export interface Bookmark { uuid: string; name: string; }
export interface State { options: Options; appearances: Record<string, Appearance>; bookmarks: Bookmark[]; }

/** Based on the 1 grey + 8 rainbow slots in Unity VHierarchyPalette.cs. */
export const PALETTE = ['#777d89', '#b35e68', '#b48e4f', '#a9a857', '#61a886', '#5d94b5', '#737cc2', '#a36bb4', '#b56e9d'];
export const ICONS = ['folder','camera','light','script','particle','physics','audio','material','prefab','canvas','settings','favorite'];
/** Legacy 0.1.0 emojis continue to load in saved project settings. */
export const LEGACY_ICONS = ['⭐', '📁', '📷', '💡', '🎵', '🎮', '🧩', '🎨', '⚙', '🔒', '🎬', '🖼'];
export const DEFAULT_OPTIONS: Options = {
  enabled: true, navigationBar: true, activationToggle: true,
  hierarchyLines: true, zebraStriping: true, minimalMode: false, sceneSelector: false,
  keyboardShortcuts: true, foldOnGuideClick: true, showNodeLayers: true, colorGradientsEnabled: true, guideMode: 'tree', colorSaturation: 1, colorBrightness: 1,
};
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
export function sanitizeAppearance(input: unknown): Appearance {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const out: Appearance = {};
  if (typeof raw.color === 'number' && Number.isInteger(raw.color) && raw.color >= 0 && raw.color < PALETTE.length) out.color = raw.color;
  if (typeof raw.icon === 'string' && raw.icon.length <= 16 && (raw.icon === '' || (ICONS.includes(raw.icon) || LEGACY_ICONS.includes(raw.icon)))) out.icon = raw.icon;
  if (typeof raw.recursiveColor === 'boolean') out.recursiveColor = raw.recursiveColor;
  if (typeof raw.recursiveIcon === 'boolean') out.recursiveIcon = raw.recursiveIcon;
  return out;
}
/**
 * Verify every editor-provided appearance field without relying on the order of
 * object properties. JSON.stringify equality is incorrect here: e.g. selecting
 * an icon then a color can serialize {icon, color} while sanitizeAppearance
 * produces the equally valid {color, icon}.
 *
 * Unknown keys and invalid field values are still rejected instead of being
 * silently dropped. Empty objects intentionally clear a node appearance.
 */
export function isValidAppearance(input: unknown): input is Appearance {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const raw = input as Record<string, unknown>;
  const cleaned = sanitizeAppearance(input) as Record<string, unknown>;
  const keys = Object.keys(raw);
  return keys.length === Object.keys(cleaned).length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(cleaned, key) && Object.is(raw[key], cleaned[key]));
}
export function sanitizeState(input: unknown): State {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const opt = raw.options && typeof raw.options === 'object' ? raw.options as Record<string, unknown> : {};
  const options = { ...DEFAULT_OPTIONS };
  for (const key of ['enabled', ...FEATURES]) if (typeof opt[key] === 'boolean') (options as unknown as Record<string, unknown>)[key] = opt[key];
  if (opt.guideMode === 'tree' || opt.guideMode === 'minimal') options.guideMode = opt.guideMode;
  if (typeof opt.colorSaturation === 'number' && Number.isFinite(opt.colorSaturation)) options.colorSaturation = clamp(opt.colorSaturation, 0, 2);
  if (typeof opt.colorBrightness === 'number' && Number.isFinite(opt.colorBrightness)) options.colorBrightness = clamp(opt.colorBrightness, 0, 2);
  const appearances: Record<string, Appearance> = Object.create(null);
  if (raw.appearances && typeof raw.appearances === 'object') for (const [id, value] of Object.entries(raw.appearances as Record<string, unknown>)) {
    if (/^[\w-]{16,128}$/.test(id)) appearances[id] = sanitizeAppearance(value);
  }
  const bookmarks = Array.isArray(raw.bookmarks) ? raw.bookmarks.filter((v): v is Bookmark =>
    !!v && typeof v === 'object' && typeof v.uuid === 'string' && /^[\w-]{16,128}$/.test(v.uuid) && typeof v.name === 'string'
  ).slice(0, 32).map(({uuid, name}) => ({uuid, name: name.slice(0, 80)})) : [];
  return { options, appearances, bookmarks };
}
export function resolveAppearance(uuid: string, ancestors: string[], data: Record<string, Appearance>): Appearance {
  const current = data[uuid] ?? {};
  let inheritedColor: number | undefined;
  let inheritedIcon: string | undefined;
  for (const id of ancestors) {
    const ancestor = data[id];
    if (ancestor?.recursiveColor && ancestor.color !== undefined) inheritedColor = ancestor.color;
    if (ancestor?.recursiveIcon && ancestor.icon) inheritedIcon = ancestor.icon;
  }
  return { ...current, color: current.color ?? inheritedColor, icon: current.icon ?? inheritedIcon };
}
