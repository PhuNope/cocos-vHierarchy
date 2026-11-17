# vHierarchy for Cocos Creator

**Version:** `0.1.0` (development/test build; no Git tag or GitHub Release)  
**Manifest compatibility:** Cocos Creator `>= 3.8.2`  
**Verified source reference:** Editor 3.8.8 (`app.asar` supplied by project owner). No real Editor GUI run has been performed in this environment.

This is a TypeScript Cocos Editor extension inspired by the provided Unity vHierarchy source. It **never patches `app.asar`**. The renderer layer uses a reversible, private Hierarchy DOM/Vue overlay; it may need adjustments for other 3.8.x builds or future Editor updates. If node UUID metadata is unavailable, customization and node mutations are disabled rather than guessing a node.


## Patch 10 — Compact Quick Toggle gutter and name ellipsis (still 0.1.0)

- **Quick Toggle off:** when `activationToggle` is disabled in **Panel → vHierarchy → Settings / Palette**, reclaim its 20px checkbox column. The existing 22px native Lock control remains in a separate hoverable gutter; enabling Quick Toggle restores the 42px gutter (22px Lock + 20px checkbox). Native fold guides and arrows are unaffected, and settings persist as before.
- **Long node names:** reserve the Layer label and native right-side component icon. The native `ui-rename-input.name` host becomes a shrinkable flex item with CSS `text-overflow: ellipsis`, so long visible names truncate with `…` rather than causing the Layer badge to disappear. No write to `node.name` or the rename input value; search and rename remain native. Layer is still hidden in native search and rename modes, as in earlier patches.
- Regression tests verify the dynamic gutter widths, overlay cleanup, and that no Layer visibility check depends on node-name length. A separate Chromium layout smoke check confirmed 42px → 22px gutter and a visible Layer beside an ellipsized name. **Real Creator 3.8.8 GUI verification is still required.**

## Patch 9 — Scene dirty after Ctrl+S when toggling Active (still 0.1.0)

- Fixed the Active checkbox / `A` shortcut transaction order. Previously `scene:set-property` with an undocumented `record: true` flag was followed by `scene:snapshot` **after** the property changed; this is not a reliable Undo/dirty transaction after saving.
- Now `scene:begin-recording(nodeUuid)` is called **before** `scene:set-property`; `scene:end-recording(undoId)` commits a single Undo step after a successful mutation. On failure before commit, `scene:cancel-recording(undoId)` is called. The renderer never edits the read-only Hierarchy node directly.
- A post-commit `scene:query-dirty` check verifies the Editor's unsaved status. If the Editor still reports `false`, try `scene:snapshot` once and query again. If the Scene remains clean, emit a visible console warning rather than silently treating the dirty transition as successful. **The successful property change is never automatically reverted or saved.**
- Regression tests cover **Ctrl+S → toggle → dirty**, multiple save/toggle cycles, failed set-property, rollback of an open Undo transaction, and clean-state detection. The Editor 3.8.8 GUI still needs to confirm the actual title asterisk, Ctrl+Z/Ctrl+Y and save/reopen persistence. The local tests simulate the Editor IPC; they cannot prove Cocos runtime behavior.

## Patch 8 — Row-wide hover + action strip background + Layer icon spacing (still 0.1.0)

- The **42px left Lock/Active strip** now has an actual full-height, pointer-receiving background element. Hovering its empty area triggers the same native row hover as hovering the node name; Lock remains to the left of the checkbox. The strip uses a subtle slate background with clearer hover/selection states, while native guide lines and click targets stay to its right. Background is behind both controls; no Scene data is modified.
- The read-only **Layer label reserves a 26px empty component area** on rows without a native right-side component indicator. When the native Cocos TypeScript/component icon exists, Layer receives an **8px gap** from that icon. The native name now shrinks first and ellipsizes rather than hiding the Layer when the name is long (Patch 10). Very narrow/deeply-indented Hierarchies still need GUI validation. Node name, search and native component icons remain untouched.
- The strip/metadata are removed when the extension is disabled/unloaded. **Real GUI verification on Creator 3.8.8 is still required**, especially hovering empty gutter space across locked, selected, and deeply nested nodes.

## Patch 6 — Unity-style Active checkbox position / Layer alignment (still 0.1.0)

- Align controls with the provided Unity *Activation toggle* reference: **left to right: native Lock → Active checkbox → native Hierarchy arrow / node**. Reserve a 42px left action gutter (Lock 22px + checkbox 20px), with contiguous hover targets so controls do not disappear during cursor movement. Checkbox looks like a small 14px dark square with a light tick and blue hover outline; it is visible only when hovering the node or focusing a control. Active mutations still use Scene IPC + snapshot, not Vue assignments.
- Right-hand metadata reads **left to right: Layer → original Cocos rightmost component/TypeScript icon**, so reading from the right edge inward gives **Cocos component icon → Layer**. Keep the native icon in place and insert the read-only Layer label just before it; never alter `node.name`, native rename values, or Hierarchy search. Hide metadata when native search/rename is active or the row is narrow; ellipsize the node name using its native flex layout.
- Move optional vHierarchy palette icons near the node's own name/icon, avoiding collisions with the Layer/native-component area. Native component display is always Cocos-owned; no custom component dots are added.
- Regression coverage includes gap-free Lock/checkbox hit areas, Layer adjacency to the native component indicator, and untouched node name/search. **Real Creator 3.8.8 GUI verification is still required**, especially while dragging between native Lock and the hover-only checkbox.

## Patch 12 — Fix palette color/icon persistence (still 0.1.0)

- Fixed **Rejected appearance** when choosing a color after an icon (or recursive options after a color). The validation previously compared `JSON.stringify` output against a sanitized object whose property order could differ; two semantically identical appearances were incorrectly rejected.
- Validate each allowed field by key/value independently of insertion order, while still rejecting invalid colors, unrecognized icon keys and unknown settings. Clearing an appearance with `{}` remains supported.
- Stage and persist a copy of the appearance state before publishing it, avoiding changes to in-memory state when saving fails. Error reports now include only the node-ID length and requested field names to aid diagnosis without dumping scene data.
- Added regression coverage for icon → color → recursive color/icon and for invalid payloads. This project-level palette data does **not** mark the Cocos Scene dirty; it lives in `settings/vHierarchy.json`.
- GUI verification on Cocos Creator 3.8.8 is still needed; automated tests can verify persistence and IPC wiring but not the live Hierarchy surface.

## Patch 5 — Native controls, larger guide hit targets, safe Scene Selector (still 0.1.0)

- Keep **Cocos' native right-side TypeScript/component icon**. The current Patch 6 Active checkbox occupies the separate left gutter next to Lock and is visible only while hovering the row (or while it has keyboard focus). The checkbox does not replace, hide, or overwrite native icon DOM; it commits using Scene IPC and snapshot as before.
- Increase the visible-line click tolerance from 4 to **8 CSS pixels** for easier folding, while excluding the native arrow, icon, rename input, Active checkbox, and keyboard-modifier clicks. The same actual line geometry and parent selection are retained.
- Repair lock hover: retain the native `ui-icon.lock` at the **left gutter**, always keep its hit area present but visually hidden until row hover/lock hover; its 22px hit target overlaps the row by 2px to avoid a gap where it disappears. Locked icons remain visible.
- Scene selector: use AssetDB 3.8.8's `query-assets({ ccType: 'cc.SceneAsset', extname: '.scene' })`, filter valid imported project Scene assets, and **revalidate `query-asset-info` before opening**. Await `scene:open-scene` with `Editor.Message.request` (not `send`) so errors are displayed in the popup instead of silently closing. The popup has **× / Escape / outside-click close**, plus Refresh. Opening still requires the save warning/confirmation. A rejected/stale Scene leaves the popup open with an error.
- **Editor GUI tests still required** for hover behavior, line hit area, Scene Selector, unsaved Scene prompts, and lock navigation; automated regression checks cannot verify the Editor's runtime AssetDB data or custom UI web components.

## Patch 4 — Node Layer labels (still 0.1.0)

- Read each visible node's Layer from the supported `scene:query-node` dump. Cocos's Hierarchy tree summary lacks the Layer field. A bounded (3 in-flight) asynchronous cache avoids requesting Layer on every repaint; polling refreshes stale cache data.
- Show a subtle, right-aligned Layer label immediately left of the native rightmost component indicator. The badge is a separate, pointer-transparent sibling of `ui-rename-input`; the real node name, rename value and native search are unmodified. vHierarchy's own toolbar search still matches **node names only**, not Layer labels.
- Hide badges during native Hierarchy search and during rename, but not solely because the node name is long. Names are truncated with CSS ellipsis when needed; checkbox, lock and fold guides retain their own hit areas.
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
| Per-object color palette | 1 gray + 8 hues, theme-aware gradients (optional), saturation/brightness sliders, muted recursive inheritance |
| Per-object icons | Emoji icon chooser, recursive inheritance; **not** Unity-specific raster icons |
| Component minimap | Removed per request; only native component icons (if enabled in Cocos preferences) remain |
| Activation checkbox | Direct checkbox via `scene:query-node`, explicit `scene:begin-recording` / `scene:set-property` / `scene:end-recording`, and `scene:query-dirty`; rejects unknown/locked/readonly nodes |
| Navigation bar and bookmarks | Toolbar, non-destructive search dimming, bookmark selection |
| Shortcut E | Toggle expanded on hovered parent |
| Shortcut Shift+E / Ctrl+Shift+E | Isolate / collapse (best effort, using native expand arrows) |
| Shortcut A | Toggle active on hovered node through Scene IPC |
| Shortcut F | Select hovered node (not equivalent to Unity's SceneView framing) |
| Scene selector | Experimental, **off by default**; save scene before trying |

### Not yet equivalent to Unity

This build does **not** claim parity for Unity's SceneView focus, lighting windows, component window/editor, drag/reorder bookmarks, palette custom textures or asset import, default parent shortcut, X delete shortcut, animated controller scroll, cross-scene bookmark restoration, per-row Unity texture gradients beyond the current CSS approximation, or prefab propagation semantics. Unity's zip contains C# sources and a PDF, **no standalone image/icon asset files**; the icon names in the source are Unity built-in Editor icons and cannot be extracted as image assets from that archive.

## Persistence and safety

Assignments, bookmarks and toggles are stored in `<project>/settings/vHierarchy.json`. Node appearance is keyed by Cocos node UUID. This is editor metadata and is not a runtime component, scene property, or exported game asset. If a node is removed or its UUID changes, an old appearance entry may remain until data-cleanup is implemented. Back up valuable scenes/prefabs before trying experimental Scene changes.

The extension avoids arbitrary DOM mutation of the Scene's serialized values. Activation uses an explicit begin/set/end Scene Undo transaction and checks native `query-dirty`; if Creator 3.8.8 returns a different shape or rejects the request, the plugin logs a warning and does not apply an optimistic state. Undo/Redo and saving/reopening must be tested in the running Editor.

## Development

- `src/core` — editor-independent domain types, guards, palette mapping.
- `src/main.ts` — extension process composition root; JSON repository; webContents lifecycle; message handlers.
- `src/renderer/renderer.ts` — independent DOM adapter, presentation, user commands and IPC ports.
- `src/renderer/colors.ts` — pure color math, dark/light theme detection, gradient generation and inherited tints (no Editor dependency).
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

- In Patch 3, Active checkbox originally called `scene:snapshot` after the change. This approach is superseded by the explicit Undo transaction and native dirty verification in Patch 9.
- Live DOM observation refreshes lines immediately after expand/fold (1.4s scan is fallback).
- Component dots/minimap are removed from row UI. The native Cocos show-component-icon preference is unchanged.
- Native lock icon is moved into a 20px dedicated left-side gutter so it cannot cover clickable hierarchy guides.
- Please confirm Scene dirty, Undo/Redo, expand latency and lock click behavior in Creator 3.8.8 GUI.

### Patch 7: Immediate Layer refresh

The Layer badge now listens to Cocos Creator's native `scene:change-node` broadcast,
which the built-in Hierarchy panel also uses. Only affected node IDs are invalidated
(the visible tree is refreshed when the broadcast contains no usable UUID), so the
previous 12-second cache TTL no longer delays Inspector Layer edits. A revision-aware
cache discards in-flight stale responses. `scene:ready` / `scene:close` additionally
refresh the visible labels. Native component icons and the node name/search remain
untouched. The 12-second TTL is retained solely as a fallback if the native event is
not emitted by a future Editor build.


## Patch 11 (0.1.0): Unity-inspired palette tint controls

- Added **Use Unity-style color gradients** under **Panel → vHierarchy → Settings / Palette** (enabled by default). The grey slot stays flat, matching Unity's source. With gradients disabled, all slots render uniform translucent tints.
- Added **Saturation** and **Brightness** sliders (`0.00×`–`2.00×`), with a live nine-color preview. Changes persist in `settings/vHierarchy.json` and immediately repaint visible rows. The option names match `VHierarchyPalette.cs` concepts.
- Color calculation adapts to Editor light/dark theme, and recursively inherited parent colors are intentionally softer than direct assignments. Native selection highlight is composited *above* the color tint; native Layer labels, right-side component indicators, Lock, checkbox and text ellipsis are unchanged.
- Per-scan color output is computed only for 9×2 palette states, not once per node. The palette color UI matches the same saturation/brightness calculations. Existing settings are migrated with safe defaults; no Scene data is changed by cosmetic color settings.
- Actual styling remains an approximation of Unity's row gradients, not pixel-perfect Unity parity. Please test changing theme, disabling gradients, selecting colored nodes, and color inheritance (root → child → overridden grandchild) inside Cocos Creator 3.8.8 before declaring M2 complete.

## Patch 13 (0.1.0): Compressed node UUID fix

- Cocos Creator Hierarchy node UUIDs may use the 22-character compressed base64 form, including `+` and `/`. Patch 12's `[\w-]` guard rejected these valid IDs, causing **Appearance rejected by extension** even for a valid `{color}` change.
- Centralized the node ID guard and reused it for Palette assignments, persisted settings, bookmarks, and Scene node change notifications. Existing hyphenated UUID and earlier project entries remain supported; suspicious IDs/path fragments are still rejected.
- Color/icon/recursive metadata remains stored in `settings/vHierarchy.json` and does not change serialized Scene data. Test by assigning a color and icon, restarting Creator, and confirming they persist. Check the Console for `set-appearance: unsupported node ID format` if a future Editor changes its identifier encoding.
