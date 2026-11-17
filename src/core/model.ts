/** Core domain objects. No Editor, Electron or DOM dependencies. */
import { isMaterialIcon } from './material-catalog';
import { CustomIcon, isCustomIcon, sanitizeCustomIcons } from './custom-icons';
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
export interface Appearance { color?: number; icon?: string; iconColor?: string; recursiveColor?: boolean; recursiveIcon?: boolean; }
export interface Bookmark { uuid: string; name: string; }
export interface State { options: Options; appearances: Record<string, Appearance>; prefabAppearances: Record<string, Appearance>; bookmarks: Bookmark[]; customIcons: CustomIcon[]; }

/** Based on the 1 grey + 8 rainbow slots in Unity VHierarchyPalette.cs. */
export const PALETTE = ['#777d89', '#b35e68', '#b48e4f', '#a9a857', '#61a886', '#5d94b5', '#737cc2', '#a36bb4', '#b56e9d'];
export const ICONS = ['folder','camera','light','script','particle','physics','audio','material','prefab','canvas','settings','favorite','animation','sprite','atlas','shader','scene','timeline','transform','database','service','network','input','mouse','gamepad','group','grid','eye','lock','key','bug','flag','star','heart','ui_panel','code'];
/** Legacy 0.1.0 emojis continue to load in saved project settings. */
export const LEGACY_ICONS = ['⭐', '📁', '📷', '💡', '🎵', '🎮', '🧩', '🎨', '⚙', '🔒', '🎬', '🖼'];
/**
 * Cocos Creator exposes 22-character compressed UUIDs for scene nodes. Unlike
 * URL-safe base64, the Editor's compressed format may contain '+' and '/'.
 * Earlier versions accepted only [\w-], so valid nodes were rejected by
 * set-appearance and silently discarded when loading saved settings.
 *
 * Retain the original 16–128-character identifier allowance for existing
 * project settings and bookmarks; add only the 22-character compressed form.
 * The value is always used as a JSON object key, never interpolated into a
 * filesystem path or selector.
 */
const LEGACY_NODE_ID = /^[A-Za-z0-9_-]{16,128}$/;
const COCOS_COMPRESSED_NODE_ID = /^[A-Za-z0-9+/_-]{22}$/;
export function isNodeId(value: unknown): value is string {
  return typeof value === 'string' &&
    (LEGACY_NODE_ID.test(value) || COCOS_COMPRESSED_NODE_ID.test(value));
}
/** Prefab appearance is project-only metadata keyed by prefab asset UUID and
 * relative editor hierarchy level. It survives new instance node UUIDs while
 * remaining separate from native Prefab and Scene serialization. */
export function isPrefabAppearanceKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 256 || !value.startsWith('prefab|')) return false;
  const pieces = value.split('|');
  return pieces.length === 3 && isNodeId(pieces[1]) &&
    (pieces[2] === 'root' || /^\d+(?:_\d+){0,48}$/.test(pieces[2]));
}
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
  if (typeof raw.icon === 'string' && (raw.icon === '' || ICONS.includes(raw.icon) || LEGACY_ICONS.includes(raw.icon) || isMaterialIcon(raw.icon) || isCustomIcon(raw.icon))) out.icon = raw.icon;
  if (typeof raw.iconColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.iconColor)) out.iconColor = raw.iconColor;
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
    if (isNodeId(id)) appearances[id] = sanitizeAppearance(value);
  }
  const prefabAppearances: Record<string, Appearance> = Object.create(null);
  if (raw.prefabAppearances && typeof raw.prefabAppearances === 'object' && !Array.isArray(raw.prefabAppearances)) {
    for (const [key, value] of Object.entries(raw.prefabAppearances as Record<string, unknown>)) {
      if (isPrefabAppearanceKey(key)) prefabAppearances[key] = sanitizeAppearance(value);
    }
  }
  const bookmarks = Array.isArray(raw.bookmarks) ? raw.bookmarks.filter((v): v is Bookmark =>
    !!v && typeof v === 'object' && isNodeId(v.uuid) && typeof v.name === 'string'
  ).slice(0, 32).map(({uuid, name}) => ({uuid, name: name.slice(0, 80)})) : [];
  return { options, appearances, prefabAppearances, bookmarks, customIcons: sanitizeCustomIcons(raw.customIcons) };
}
export function resolveAppearance(uuid: string, ancestors: string[], data: Record<string, Appearance>): Appearance {
  const current = data[uuid] ?? {};
  let inheritedColor: number | undefined;
  let inheritedIcon: string | undefined;
  let inheritedIconColor: string | undefined;
  for (const id of ancestors) {
    const ancestor = data[id];
    if (ancestor?.recursiveColor && ancestor.color !== undefined) inheritedColor = ancestor.color;
    if (ancestor?.recursiveIcon && ancestor.icon) { inheritedIcon = ancestor.icon; inheritedIconColor = ancestor.iconColor; }
  }
  const resolved: Appearance = { ...current, color: current.color ?? inheritedColor, icon: current.icon ?? inheritedIcon };
  if (current.iconColor === undefined && !current.icon && inheritedIconColor !== undefined) resolved.iconColor = inheritedIconColor;
  return resolved;
}
