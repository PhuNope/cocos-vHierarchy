/**
 * Reversible native Prefab icon-slot adapter for Cocos Creator 3.8.x.
 *
 * The native hierarchy template renders:
 *   ui-icon.arrow -> (ui-asset-image.root | ui-icon asset/component) ->
 *   ui-rename-input.name -> ui-icon.lock/edit -> trailing TS component icon.
 *
 * vHierarchy used to insert its icon before the name, alongside the asset
 * icon. For Prefab rows, use the SAME visual slot while retaining the native
 * element in the DOM for Vue ownership, hover tooltips and locate-asset clicks.
 * This adapter deliberately does not alter native name colors or trailing
 * component icons, and can restore everything when appearance is cleared.
 */
namespace VHierarchyPrefabIcons {
  export interface PrefabRow {
    row: HTMLElement;
    drag: HTMLElement;
    nameEl: HTMLElement | null;
    node: { isScene?: boolean; isPrefabRoot?: boolean; prefab?: { state?: number; assetUuid?: string } } | null;
    prefabKey?: string | null;
  }
  const ROW_FLAG = 'data-vh-prefab-icon-replaced';
  const GLYPH_FLAG = 'data-vh-native-prefab-icon';
  const SLOT_SIZE = '--vh-prefab-icon-width';

  /** Only icons that occur BEFORE the native rename input can be replaced.
   * The TypeScript/component glyph at the right is AFTER the rename input. */
  export function nativeGlyph(drag: HTMLElement, nameEl: HTMLElement | null): HTMLElement | null {
    if (!nameEl) return null;
    for (const child of Array.from(drag.children) as HTMLElement[]) {
      if (child === nameEl) break;
      if (child.classList.contains('vh-icon') || child.classList.contains('arrow') ||
          child.classList.contains('lock') || child.classList.contains('edit')) continue;
      if (child.tagName.toLowerCase() === 'ui-asset-image' || child.tagName.toLowerCase() === 'ui-icon')
        return child;
    }
    return null;
  }

  export function isPrefab(item: PrefabRow): boolean {
    if (item.node?.isScene) return false;
    if (item.prefabKey || item.node?.isPrefabRoot || item.node?.prefab?.assetUuid) return true;
    const root = item.row.getAttribute('is-prefab-root');
    const state = item.row.getAttribute('is-prefab-node');
    return (root !== null && root !== 'false' && root !== '0') ||
      (state !== null && state !== 'false' && state !== '0');
  }

  /** Keep native prefab asset hit-target in place but make it transparent and
   * overlap the chosen icon. The CSS uses the native measured width so this
   * adapter never adds an extra icon column. */
  export function sync(item: PrefabRow, custom: HTMLElement | null, enabled: boolean): void {
    const native = enabled && custom && isPrefab(item) ? nativeGlyph(item.drag, item.nameEl) : null;
    // Cocos may replace its original <ui-asset-image> during Prefab edit.
    // Drop markers from stale native elements, avoiding permanent hiding.
    for (const child of Array.from(item.drag.children) as HTMLElement[]) {
      if (child.hasAttribute(GLYPH_FLAG) && child !== native) child.removeAttribute(GLYPH_FLAG);
    }
    if (native && custom) {
      const box = native.getBoundingClientRect();
      const nativeWidth = box.width > 0 && Number.isFinite(box.width) ? box.width : 16;
      const width = Math.max(12, Math.min(24, Math.round(nativeWidth)));
      item.row.style.setProperty(SLOT_SIZE, `${width}px`);
      item.row.setAttribute(ROW_FLAG, 'true');
      native.setAttribute(GLYPH_FLAG, 'true');
      if (custom.nextElementSibling !== native) item.drag.insertBefore(custom, native);
      return;
    }
    item.row.removeAttribute(ROW_FLAG);
    item.row.style.removeProperty(SLOT_SIZE);
    // Non-Prefab node appearance stays at its existing position next to name.
    if (custom && item.nameEl && custom.nextElementSibling !== item.nameEl)
      item.drag.insertBefore(custom, item.nameEl);
  }

  export function clear(item: PrefabRow): void {
    sync(item, null, false);
  }
}
