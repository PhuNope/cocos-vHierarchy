# vHierarchy for Cocos Creator

**Version:** `0.1.0` (development/test build; no Git tag or GitHub Release)  
**Manifest compatibility:** Cocos Creator `>= 3.8.2`  
**Verified source reference:** Editor 3.8.8 (`app.asar` supplied by project owner). No real Editor GUI run has been performed in this environment.

This is a TypeScript Cocos Editor extension inspired by the provided Unity vHierarchy source. It **never patches `app.asar`**. The renderer layer uses a reversible, private Hierarchy DOM/Vue overlay; it may need adjustments for other 3.8.x builds or future Editor updates. If node UUID metadata is unavailable, customization and node mutations are disabled rather than guessing a node.


## Patch 6 — Unity-style Active checkbox position / Layer alignment (still 0.1.0)

- Align controls with the provided Unity *Activation toggle* reference: **left to right: native Lock → Active checkbox → native Hierarchy arrow / node**. Reserve a 42px left action gutter (Lock 22px + checkbox 20px), with contiguous hover targets so controls do not disappear during cursor movement. Checkbox looks like a small 14px dark square with a light tick and blue hover outline; it is visible only when hovering the node or focusing a control. Active mutations still use Scene IPC + snapshot, not Vue assignments.
- Right-hand metadata reads **left to right: Layer → original Cocos rightmost component/TypeScript icon**, so reading from the right edge inward gives **Cocos component icon → Layer**. Keep the native icon in place and insert the read-only Layer label just before it; never alter `node.name`, native rename values, or Hierarchy search. Hide metadata when native search/rename is active or the row is narrow; ellipsize the node name using its native flex layout.
- Move optional vHierarchy palette icons near the node's own name/icon, avoiding collisions with the Layer/native-component area. Native component display is always Cocos-owned; no custom component dots are added.
- Regression coverage includes gap-free Lock/checkbox hit areas, Layer adjacency to the native component indicator, and untouched node name/search. **Real Creator 3.8.8 GUI verification is still required**, especially while dragging between native Lock and the hover-only checkbox.

## Patch 5 — Native controls, larger guide hit targets, safe Scene Selector (still 0.1.0)

- Keep **Cocos' native right-side TypeScript/component icon**. The current Patch 6 Active checkbox occupies the separate left gutter next to Lock and is visible only while hovering the row (or while it has keyboard focus). The checkbox does not replace, hide, or overwrite native icon DOM; it commits using Scene IPC and snapshot as before.
- Increase the visible-line click tolerance from 4 to **8 CSS pixels** for easier folding, while excluding the native arrow, icon, rename input, Active checkbox, and keyboard-modifier clicks. The same actual line geometry and parent selection are retained.
- Repair lock hover: retain the native `ui-icon.lock` at the **left gutter**, always keep its hit area present but visually hidden until row hover/lock hover; its 22px hit target overlaps the row by 2px to avoid a gap where it disappears. Locked icons remain visible.
- Scene selector: use AssetDB 3.8.8's `query-assets({ ccType: 'cc.SceneAsset', extname: '.scene' })`, filter valid imported project Scene assets, and **revalidate `query-asset-info` before opening**. Await `scene:open-scene` with `Editor.Message.request` (not `send`) so errors are displayed in the popup instead of silently closing. The popup has **× / Escape / outside-click close**, plus Refresh. Opening still requires the save warning/confirmation. A rejected/stale Scene leaves the popup open with an error.
- **Editor GUI tests still required** for hover behavior, line hit area, Scene Selector, unsaved Scene prompts, and lock navigation; automated regression checks cannot verify the Editor's runtime AssetDB data or custom UI web components.

## Patch 4 — Node Layer labels (still 0.1.0)

- Read each visible node's Layer from the supported `scene:query-node` dump. Cocos's Hierarchy tree summary lacks the Layer field. A bounded (3 in-flight) asynchronous cache avoids requesting Layer on every repaint; polling refreshes stale cache data.
- Show a subtle, right-aligned Layer label immediately left of the native rightmost component indicator. The badge is a separate, pointer-transparent sibling of `ui-rename-input`; the real node name, rename value and native search are unmodified. vHierarchy's own toolbar search still matches **node names only**, not Layer labels.
- Hide badges during native Hierarchy search, during rename and when horizontal space is too narrow. Names are truncated only when needed; checkbox, lock and fold guides retain their own hit areas.
- Custom Layer labels come from `layer.enumList` in the Scene dump when present; otherwise use Cocos built-ins or a numeric hex value rather than inventing a custom name. Layer controls are display-only; no Scene snapshot is made.
- The new **Show node layer next to its name** setting is enabled by default and persisted per project. GUI testing on Editor 3.8.8, including custom layers, remains necessary.

## Latest test iteration (still 0.1.0)

- **Patch 2:** Group extension commands in **Panel → vHierarchy → Settings / Palette / Enable / Refresh / Diagnostics**. Clicking a visible hierarchy guide (vertical rail or elbow) invokes the **native arrow of the parent associated with that segment**, collapsing it without writing to Cocos node state. This is a per-project option `foldOnGuideClick` (default on); native labels, icon controls, drag/drop and keyboard modifier-clicks are excluded. Click tolerance is 8 CSS pixels; filtered/virtualized gaps are never guessed. Editor GUI validation remains necessary.


- Fixed `toggle-active` attempting to write to a readonly Vue node (`item.node.active = ...`). All mutations now use an isolated Scene IPC command; the native Hierarchy determines the updated state.
- Replaced approximate DOM line segments with the computed-padding/margin guide algorithm from the supplied `hierarchy-visual-hook` v0.8.8. CSS pseudo-elements connect to the actual native icon/text anchor and stop at last siblings.
- Added 12 original SVG assets in `static/icons/` inspired by the categories from Unity `VHierarchyPalette.cs`. The Unity archive has **no standalone image icon files**; built-in Unity Editor icons cannot be copied. Legacy emoji assignments remain compatible.
- `npm test` runs the expanded geometry / readonly Scene regressions, with **14 automated tests**.

See [the full phased feature-parity plan](https://github.com/PhuNope/cocos-vHierarchy/blob/main/docs/ROADMAP.md) and [the screenshot from Unity's supplied `Read me.pdf`](https://github.com/PhuNope/cocos-vHierarchy/blob/main/docs/reference/unity-features-menu.png). The reference screenshot is *not* bundled inside the Cocos test extension.

**Important:** Real Cocos Creator Editor UI, Undo/Redo, Scene dirty/save and Prefab regression checks are still required. The automated tests alone do not establish functional parity in Creator 3.8.8.

## Install test build

1. Extract `vHierarchy-0.1.0-test.zip` into your project's `extensions` directory. The resulting path must be `<cocos-project>/extensions/cocos-vhierarchy/package.json`.
2. In Cocos Creator, refresh the extension from **Extension Manager**, or restart the Editor.
3. Open the native **Hierarchy** panel. The top bar displays `vH`. Open the **Panel → vHierarchy → Settings / Palette** menu to configure it.
4. Hover any node, then **Alt + right-click** for color/icon, recursive application, or reset. Hover a node to reveal its Active checkbox directly right of Lock; the native Cocos right-side component icon is preserved, with the Layer just to its left.
5. In the toolbar, type a node name to dim nonmatching rows; the star bookmarks the last hovered node. Click a bookmark to select it. Right-click a bookmark to remove it.

### Enabled features in 0.1.0

| Unity vHierarchy reference | Cocos implementation in this test build |
|---|---|
| Hierarchy lines | Tree/minimal connectors (best effort if rows are virtualized); click a visible line to collapse its parent |
| Zebra striping and minimal mode | Visual styles on existing native rows |
| Per-object color palette | 9 slots based on `VHierarchyPalette.cs`; supports recursive inheritance |
| Per-object icons | Emoji icon chooser, recursive inheritance; **not** Unity-specific raster icons |
| Component minimap | Removed per request; only native component icons (if enabled in Cocos preferences) remain |
| Activation checkbox | Direct checkbox via `scene:query-node` / `scene:set-property` followed by `scene:snapshot`; rejects unknown/locked/readonly nodes |
| Navigation bar and bookmarks | Toolbar, non-destructive search dimming, bookmark selection |
| Shortcut E | Toggle expanded on hovered parent |
| Shortcut Shift+E / Ctrl+Shift+E | Isolate / collapse (best effort, using native expand arrows) |
| Shortcut A | Toggle active on hovered node through Scene IPC |
| Shortcut F | Select hovered node (not equivalent to Unity's SceneView framing) |
| Scene selector | Experimental, **off by default**; save scene before trying |

### Not yet equivalent to Unity

This build does **not** claim parity for Unity's SceneView focus, lighting windows, component window/editor, drag/reorder bookmarks, palette custom textures or asset import, default parent shortcut, X delete shortcut, animated controller scroll, cross-scene bookmark restoration, color gradients/complex blending or prefab propagation semantics. Unity's zip contains C# sources and a PDF, **no standalone image/icon asset files**; the icon names in the source are Unity built-in Editor icons and cannot be extracted as image assets from that archive.

## Persistence and safety

Assignments, bookmarks and toggles are stored in `<project>/settings/vHierarchy.json`. Node appearance is keyed by Cocos node UUID. This is editor metadata and is not a runtime component, scene property, or exported game asset. If a node is removed or its UUID changes, an old appearance entry may remain until data-cleanup is implemented. Back up valuable scenes/prefabs before trying experimental Scene changes.

The extension avoids arbitrary DOM mutation of the Scene's serialized values. Activation uses the Editor's Scene IPC with Undo recording; if Creator 3.8.8 returns a different shape or rejects the request, the plugin logs a warning and does not apply an optimistic state. Undo/Redo and saving/reopening must be tested in the running Editor.

## Development

- `src/core` — editor-independent domain types, guards, palette mapping.
- `src/main.ts` — extension process composition root; JSON repository; webContents lifecycle; message handlers.
- `src/renderer/renderer.ts` — independent DOM adapter, presentation, user commands and IPC ports.
- `tests` — node:test regression and IPC lifecycle smoke tests.
- `dist` — generated JavaScript; build package does not contain `src`, tests, dependencies, archives or Cocos sources.

Requires a recent TypeScript compiler, then `npm run build`, `npm test`, `npm run pack:local`. There are no external runtime dependencies. The TypeScript code intentionally uses no ambient `@types/node` dependency; the injected renderer is compiled as a standalone script.

### Manual smoke test checklist

- [ ] Startup, native Hierarchy select/rename/drag still work
- [ ] Resize, undock/redock, reopen Hierarchy panel; no duplicate toolbar or buttons
- [ ] Toggle lines, stripes, node Layer labels and minimal mode; unload cleans all styles
- [ ] Set color/icon on root and nested children, recursive inheritance, save/reopen Editor
- [ ] Toggle active, Undo, Redo and save/reload Scene/Prefab; test locked nodes
- [ ] Bookmark/unbookmark/select; restart the Editor; verify persistence
- [ ] Open existing scenes with many collapsed nodes; ensure guide connectors never obscure native controls

If a test fails, use **Panel → vHierarchy → Diagnostics** and copy logs from the Editor console. Also inspect `window.__vHierarchy388?.stats()` in the main renderer DevTools.

## Patch 3 (0.1.0)

- Active checkbox commits via Scene IPC and calls `scene:snapshot` after a successful change, allowing Cocos to track unsaved Scene edits and Undo.
- Live DOM observation refreshes lines immediately after expand/fold (1.4s scan is fallback).
- Component dots/minimap are removed from row UI. The native Cocos show-component-icon preference is unchanged.
- Native lock icon is moved into a 20px dedicated left-side gutter so it cannot cover clickable hierarchy guides.
- Please confirm Scene dirty, Undo/Redo, expand latency and lock click behavior in Creator 3.8.8 GUI.
