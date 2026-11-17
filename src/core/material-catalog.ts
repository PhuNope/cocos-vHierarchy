/**
 * Material Symbols Outlined catalog. The 184 names below are the bundled,
 * offline fallback; all names come from Google's official codepoints index.
 * https://github.com/google/material-design-icons/tree/master/variablefont
 * Apache-2.0. The complete index is downloaded by the Editor main process,
 * validated, and cached in the active project's settings directory.
 * No online JavaScript or image files are executed by the extension.
 */
export const MATERIAL_SYMBOL_NAMES = [
  'account_circle','account_tree','add','add_box','add_circle','alarm','all_inclusive','analytics',
  'animation','apps','archive','arrow_back','arrow_downward','arrow_forward','arrow_upward','article',
  'aspect_ratio','attach_file','auto_awesome','autorenew','back_hand','backpack','badge','bar_chart',
  'battery_full','bed','bolt','book','bookmark','brush','build','calendar_month',
  'call','camera','category','celebration','check','check_box','check_circle','chevron_right',
  'circle','close','cloud','code','code_blocks','construction','content_copy','copyright',
  'credit_card','crop','dashboard','database','delete','description','design_services','desktop_windows',
  'devices','directions_car','dns','download','drag_indicator','edit','electric_bolt','emoji_events',
  'error','event','explore','extension','face','factory','favorite','file_copy',
  'filter_alt','flag','flash_on','folder','folder_open','format_paint','forum','functions',
  'gamepad','gesture','gif','grade','grid_view','groups','handyman','headphones',
  'help','hexagon','history','home','hourglass_empty','hub','image','info',
  'input','inventory_2','key','keyboard','language','layers','lightbulb','link',
  'list','local_fire_department','lock','login','logout','mail','map','memory',
  'menu','mic','monitor','more_horiz','movie','music_note','navigation','notifications',
  'open_in_new','palette','pause','payments','person','pets','photo_camera','pin',
  'play_arrow','power','preview','print','psychology','public','push_pin','recycling',
  'redo','refresh','remove','rocket_launch','rule','save','schedule','science',
  'search','security','send','settings','share','shield','shopping_bag','smartphone',
  'sort','sports_esports','star','stars','storage','style','support','sync',
  'table_chart','tag','task_alt','terminal','thumb_up','timeline','tips_and_updates','toggle_on',
  'token','travel_explore','tune','undo','upload','verified','videocam','visibility',
  'visibility_off','volume_up','warning','widgets','wifi','work','workspace_premium','zoom_in',
] as const;

export const MATERIAL_ICON_PREFIX = 'material:';
export const MATERIAL_CODEPOINTS_URL = 'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints';
export const MAX_CATALOG_BYTES = 256 * 1024;
export const MAX_CATALOG_NAMES = 7000;
const NAME = /^[a-z0-9_]{2,48}$/;
let materialNames: ReadonlySet<string> = new Set(MATERIAL_SYMBOL_NAMES);

/** Strict parsing: never trust response content or cache as executable data. */
export function parseMaterialCodepoints(data: unknown): string[] {
  if (typeof data !== 'string' || data.length > MAX_CATALOG_BYTES) return [];
  const found = new Set<string>();
  for (const line of data.split(/\r?\n/)) {
    const match = /^([a-z0-9_]{2,48})\s+([0-9a-f]{4,6})$/.exec(line.trim());
    if (match) found.add(match[1]);
    if (found.size > MAX_CATALOG_NAMES) return [];
  }
  return found.size >= 1000 ? [...found].sort() : [];
}

/** Validate the cached JSON list and permit no arbitrary names. */
export function parseMaterialCache(data: unknown): string[] {
  if (!Array.isArray(data) || data.length < 1000 || data.length > MAX_CATALOG_NAMES) return [];
  const names = new Set<string>();
  for (const name of data) {
    if (typeof name !== 'string' || !NAME.test(name)) return [];
    names.add(name);
  }
  return names.size >= 1000 ? [...names].sort() : [];
}

/** Configure the exact whitelist before reading persisted appearances. */
export function setMaterialCatalog(names: readonly string[]): void {
  materialNames = new Set([...MATERIAL_SYMBOL_NAMES, ...names.filter(name => NAME.test(name))]);
}
export function isMaterialIcon(id: string): boolean {
  return id.startsWith(MATERIAL_ICON_PREFIX) && materialNames.has(id.slice(MATERIAL_ICON_PREFIX.length));
}
export function filterIconNames(names: readonly string[], query: string, limit = 80): string[] {
  const fragments = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return names.filter(name => fragments.every(part => name.toLowerCase().includes(part))).slice(0, Math.max(0, limit));
}
