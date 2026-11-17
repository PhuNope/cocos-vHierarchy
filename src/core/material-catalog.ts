/**
 * Curated ligature names for Google's Material Symbols Outlined family.
 * Google Fonts serves the font only when the user opens the icon palette or
 * when a node with a Material icon is rendered. The catalog itself is local:
 * search does not require Google APIs, keys or network access.
 * Source: https://fonts.google.com/icons (Apache License 2.0).
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

const materialNames: ReadonlySet<string> = new Set(MATERIAL_SYMBOL_NAMES);
export const MATERIAL_ICON_PREFIX = 'material:';
export function isMaterialIcon(id: string): boolean {
  return id.startsWith(MATERIAL_ICON_PREFIX) && materialNames.has(id.slice(MATERIAL_ICON_PREFIX.length));
}
export function filterIconNames(names: readonly string[], query: string, limit = 80): string[] {
  const fragments = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return names.filter(name => fragments.every(part => name.toLowerCase().includes(part))).slice(0, Math.max(0, limit));
}
