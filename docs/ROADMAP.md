# vHierarchy for Cocos Creator — Unity feature parity roadmap

Baseline inputs: supplied Unity `vHierarchy.zip`, Cocos 3.8.8 `app.asar.zip`, and supplied `hierarchy-visual-hook` v0.8.8.

**Development contract:** `0.1.0`, manifest `editor: >=3.8.2`, push normal commits to `main` after each iteration; **no Git tag / GitHub Release until the owner explicitly says “chốt”.**

## Reference audit
- `VHierarchyMenu.cs`: toggles for Navigation Bar, Scene Selector, Component Minimap, Activation Toggle, Hierarchy Lines, Zebra Striping, Minimal Mode; shortcuts A/F/X/E/Shift-E/Ctrl-Shift-E/D.
- `VHierarchyGUI.cs`: row background, icons, lines, minimap and active toggle.
- `VHierarchyPalette.cs`, `VHierarchyPaletteEditor.cs`, `VHierarchyPaletteWindow.cs`: 1 gray + 8 rainbow colors, recursive flags, icon rows, editor and custom icons.
- `VHierarchyData.cs`, `VHierarchyDataComponent.cs`, `VHierarchyNavbar.cs`: persistence/team mode, bookmarks and navigation.
- `VHierarchyComponentWindow.cs`: popup/pinned component inspector.
- `VHierarchySceneSelectorWindow.cs`: scene selection and search.
- `VHierarchyController.cs`: hierarchy expansion/state management.

**Assets:** The supplied Unity ZIP includes no original standalone PNG/SVG UI icons. `VHierarchyPalette.ResetIcons()` lists **Unity built-in Editor icon names**. 12 original SVG replacements in `static/icons` map their semantic categories; these are not the original Unity icon bitmaps. The supplied `Read me.pdf` contains an actual Unity menu screenshot for visual reference.

## Patch 2 — implemented, pending GUI validation

- [x] Group existing commands under **Panel → vHierarchy → ...**.
- [x] Click directly on the guides to collapse the associated native expanded parent (ancestor rail and elbow). Hits are limited to visible line geometry and ignore native controls and modifier clicks.
- [x] Project-scoped `foldOnGuideClick` option, default enabled; pure geometry tests include margin-indented rows, invalid virtualized gaps, last branches, lower rails, and elbows.
- [ ] Validate the behavior manually in Cocos Creator 3.8.8, including narrow panes and DPI/zoom changes.

## M0 — Patch 1 (implemented)
- [x] Active Toggle uses isolated `scene:query-node` + `scene:set-property` (record true), no Vue data mutation, duplicate-operation guard.
- [x] Native padding/margin-derived Hierarchy line geometry aligned with tested v0.8.8 hook, computed icon/text anchor, last-sibling endings and missing-ancestor handling.
- [x] 12 SVG icons integrated into palette and row, compatible with old emoji selections.
- [x] TypeScript transpile / 14 automated tests.
- [ ] Real running Cocos Creator 3.8.8 GUI smoke/regression test.

## M1 — Stabilize the native Hierarchy (P0)
Validate Active click/A shortcut, dirty state, Undo/Redo, save/reopen, locked nodes, Prefab isolation, Scene switching and multi-selection. Compare guides pixel-by-pixel against the supplied v0.8.8 hook at multiple DPI/zoom settings. Check collapse, search, virtualization and panel docking, and disable/reload cleanup. **Exit:** no readonly errors, no scene corruption, accurate guides, reproducible Creator UI behavior.

## M2 — Row visual parity with Unity (P0/P1)
Theme-aware color gradients, saturation/brightness and true ancestor inheritance; icon replacement in native row slot rather than badge; custom icons (asset picker), prefab/lock/inactive decoration, rich component minimap and tooltip/Alt-click semantics, zebra striping and minimal density. **Exit:** paired reference screenshots, no clipping, no disabled native controls.

## M3 — Navbar and Scene Selector (P1)
Bookmark pin/unpin, reorder, rename, stale/deleted references; navigation between Scene/Prefab; Scene selector search, keyboard navigation, pinned/recent items, unsaved-change confirmation, project-persistent settings. **Exit:** bookmarks survive reopen and no silent unsaved-scene loss.

## M4 — Keyboard/Scene commands (P1)
`E` expand/collapse, `Shift+E` isolate, `Ctrl/Cmd+Shift+E` collapse all; `A` multi-node active when selected; `X` delete with native Undo; `F` frame Scene camera (not just select); `D` assign default parent and `Shift+D` reset only where Creator exposes safe APIs, otherwise implement a documented extension-scoped equivalent. Shortcut conflict and input-focus guards. **Exit:** each command covered by IPC regressions + Creator integration test.

## M5 — Component and advanced palette workflow (P1/P2)
Component Window popover with pin/follow selection, supported native Inspector API; editable palette icon rows, custom image assets, color presets and import/export; Prefab/multi-scene and team persistence. **Exit:** cross-scene interactions and edits avoid data loss and runtime-game script injection.

## M6 — Release readiness (P0)
Check 3.8.2 and 3.8.8 compatibility, Windows and other supported platforms, 1k/5k hierarchy performance, memory/reload, security and asset permissions. Keep deploy ZIP compact with only manifest, compiled JS, assets and required README. Publish tag and GitHub Release **only** on explicit “chốt”.

## Architecture
`src/core/`: pure model/validation; `src/renderer/scene-commands.ts`: Scene mutation boundary; `src/renderer/guides.ts`: pure guide geometry; `src/renderer/renderer.ts`: private DOM/Vue visual adapter; `src/main.ts`: main Editor composition root / injection; `static/icons/`: vector resources; `tests/`: automated regressions. No direct Vue writes or modification to `app.asar`.

**Limitations:** Unity SceneView/Default Parent/etc. may lack exact Cocos IPC equivalents. Guard unverified APIs rather than simulate an unsafe mutation. CI tests do not establish behavior in a live Creator Editor.
