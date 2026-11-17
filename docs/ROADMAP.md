# vHierarchy for Cocos Creator — Unity feature-parity roadmap

Baseline: Unity source supplied as `vHierarchy.zip`, Cocos Editor source supplied as `app.asar.zip` (3.8.8), and hook baseline `hierarchy-visual-hook-ccrecord-nested-fix-v0.8.8-creator-3.8.8.zip`. All work-in-progress plugin builds remain **0.1.0** (`editor: >=3.8.2`), with normal Git commits to `main`. **No tag and no GitHub Release before the owner says “chốt”.**

## Reference audit

Unity source includes feature toggles in `VHierarchyMenu.cs`, row visuals in `VHierarchyGUI.cs`, shortcuts in `VHierarchy.cs`, palette data and editors in `VHierarchyPalette.cs` / `VHierarchyPaletteEditor.cs` / `VHierarchyPaletteWindow.cs`, navigation and bookmarks in `VHierarchyNavbar.cs` / `VHierarchyData.cs`, component inspection in `VHierarchyComponentWindow.cs`, scene navigation in `VHierarchySceneSelectorWindow.cs`, and controller / tree expansion in `VHierarchyController.cs`.

**Asset limitation:** `vHierarchy.zip` contains `.cs`, `.meta`, `.asmdef` and `Read me.pdf`, *no original standalone PNG/SVG icon files*. `VHierarchyPalette.ResetIcons()` references Unity Editor built-in icons **by name**, rather than including them as image assets. `docs/reference/unity-features-menu.png` is an unmodified screenshot extracted from the supplied `Read me.pdf` for review only. For the editor UI we ship 12 original lightweight SVG substitutes in `static/icons/*.svg`, mapped to the Unity palette categories; these are not claimed to be copies of Unity internal icons. When actual custom icon assets are provided in the future, support direct import/mapping.

## Current checkpoint: `0.1.0`, patch 11

- [x] Group four menu commands under **Panel → vHierarchy → ...** using the Creator 3.8 manifest submenu path, no four standalone top-level Panel entries.
- [x] Guide hit-testing port: ancestor rails and direct elbows collapse their associated expanded parent using its **native expand arrow click**; protects control hit targets, modifier clicks, rename state and filtered/gapped trees. Project option `foldOnGuideClick` defaults true; tests cover vertical/lower/last/elbow and margin offsets.
- [ ] Manual Creator 3.8.8 validation of exact visible hit regions, selection/drag effects, multi-pane behavior and zoom/HiDPI.

## Patch 3: focused usability fixes

- [x] `scene:begin-recording` before each Active `scene:set-property`, `scene:end-recording` on success, and `scene:query-dirty` verification (Patch 9). Fallback snapshot is attempted only when native dirty remains false; actual GUI verification pending.
- [x] Observe native `.tree` child insertion/expand attributes and redraw guides before the next paint. Periodic scan is only a recovery fallback.
- [x] Remove component minimap and its saved option (native Cocos icon preference is unaffected).
- [x] Replace Active glyph with a clickable native checkbox, stop row selection/drag event propagation.
- [x] Dedicate a 20px left gutter to the native lock icon; ancestor rails stay in their own lane. Restored on unload.
- [ ] Verify scene dirty marker/Undo, line latency and lock positioning in GUI with Creator 3.8.8.

## Previous checkpoint: `0.1.0`, patch 1

- [x] Active Toggle no longer assigns to Vue tree dumps (immutable/read-only). Scene edits use `scene:query-node` + explicit `begin-recording` / `set-property` / `end-recording`, and reject unexpected dumps/failed responses. Deduplicate in-flight toggles by node UUID; rely on native Scene update to rerender.
- [x] Guides adapt the provided hook's geometry: computed padding/margin, step/depth inference, sibling endings, no guessed links across missing ancestors, elbow stops at native icon/name; CSS `::before/::after` draw in existing gutter.
- [x] 12 compressed editor-safe SVG icon substitutes available in UI palette and displayed on rows; old emoji selections remain readable.
- [x] Compile TypeScript to JavaScript, 13 automated tests (including frozen Scene dumps and guide parity).
- [ ] Real Creator 3.8.8 GUI validation (required before declaring bug fixed in Editor, not runnable in CI).

## Milestones and acceptance criteria

### M1 — Solid Hierarchy baseline (P0)

1. Run GUI matrix on 3.8.8: normal Scene, Prefab edit, locked node, disabled node, deeply nested trees, collapsed branches, search, multi-select, theme and HiDPI. Test Active Toggle click / `A` shortcut, Scene dirty indicator, Undo/Redo, save/reopen, no interference with existing Inspector data.
2. Pixel-level comparison of guides vs supplied v0.8.8 hook (alignment with arrow and native icon, last-child stop, scroll/dock/virtualized rows). Screenshots at 100/125/150% UI scale.
3. Defensive DOM adapter: quick disable/enable, cleanup on extension reload, instrumentation, no mutations to Vue scene state, no Editor app.asar patches.

**Exit:** no readonly errors, correct active state after Undo/Redo, guides visually match hook, no uncontrolled DOM duplication or edits to unrelated nodes.

### M2 — Unity row appearance parity (P0/P1)

- [x] Patch 11: color palette 1 gray + 8 hues, theme-aware CSS gradients/brightness/saturation and softer inherited ancestry tints; verify real GUI and Unity visual proportions before accepting parity.
- Replace default row icon in place (native icon slot rather than right-side badge) with context-aware prefab/lock/scene-state indicators; support bundled SVG + project-selected custom images, preserve native hit areas.
- Active-state checkbox, lock hints, zebra striping / minimal mode + selectable density; intentionally no component minimap (removed per request).
- Palette UI at row and keyboard; undoable changes where scene-backed. Avoid repeated full scans for large trees.

**Exit:** paired screenshots of Unity and Cocos for the same hierarchy shape; no clipping at narrow dock widths, icon & color inheritance consistent across reload.

### M3 — Navigation bar, bookmarks and Scene selector (P1)

- Match `VHierarchyNavbar.cs` navigation / bookmark layout: pin/unpin, quick jump, reorder, rename, lost/deleted references, and per-project persistence.
- Match `VHierarchySceneSelectorWindow.cs`: filter, keyboard arrows/Enter/Escape, recently opened and pinned scenes, clear unsaved changes confirmation.
- Handle UUIDs per Scene/Prefab and avoid selecting stale nodes in another scene.

**Exit:** bookmarks survive reload, deleted objects handled gracefully, switching scenes never silently loses unsaved work.

### M4 — Keyboard and Scene workflow parity (P1)

- `E` expand/collapse, `Shift+E` isolate, `Ctrl/Cmd+Shift+E` collapse all; virtualized tree safe.
- `A` toggle active (multi-selection matches Unity when hovered node is selected), `X` delete with Undo/Redo; `F` frame in Scene view using a verified Editor command (selection is not sufficient); `D` assign default parent and `Shift+D` reset only if compatible Creator APIs exist; otherwise implement an extension-scoped equivalent with explicit limitations.
- Configurable shortcuts and conflict detection. No interception while renaming/typing in an input field.

**Exit:** each hotkey has targeted IPC regression tests and GUI validation; commands are undoable where supported and never silently invoke destructive operations.

### M5 — Unity component workflow and advanced palette (P1/P2)

- Optional future component detail popup via Inspector, if requested; minimap is intentionally not displayed. Pin / follow selection / close / reposition; use native Inspector APIs instead of fake component dumps.
- Palette editor: reorder rows, enable/disable icon rows, color slots/gradients, custom icon assets, import/export mapping.
- Prefab and multi-scene handling, selection persistence, undo, collaborative team settings. `VHierarchyDataComponent.cs` team-mode concept adapted to Cocos metadata or project-file strategy, without injecting runtime scripts into games.

**Exit:** popup and palette behave correctly for multiple component types and remain isolated from project runtime builds.

### M6 — Release gate (P0 hardening)

- Compatibility check at least on 3.8.2 and 3.8.8; tests on Windows and ideally macOS where available.
- Memory/timing profiling on 1k/5k+ node scenes, UI reload/docking, asset import, Scene/Prefab editing, error handling.
- Full documentation, migration/backups, asset licensing audit, clean production ZIP only containing manifest, JS, static assets and necessary docs.
- Merge or commit reviewed final code to `main` as usual. **Only after explicit “chốt”** create tag and GitHub Release.

## Architecture / safeguards

`src/core/` pure domain and validated persisted data; `src/renderer/scene-commands.ts` Scene IPC boundary; `src/renderer/guides.ts` deterministic guide geometry; `src/renderer/renderer.ts` adapter to private native Hierarchy UI; `src/main.ts` extension composition root and asset serving. `static/icons/` contains original vector assets. Avoid direct Vue writes, avoid patching `app.asar`; use `Editor.Message` for scene mutations. Tests live in `tests/` and cover persistence, geometry, IPC state transitions, and renderer activation. Test ZIP excludes source, test utilities and PDF screenshots.

## Known risks / decisions

- Private Hierarchy DOM/Vue APIs may change between Creator versions: detection and graceful no-op are required.
- Unity Editor built-in icons cannot be copied from the supplied archive because they are not included. The bundled SVGs are **replacements**, not original Unity asset bytes.
- Certain Unity functions have no direct Cocos counterpart (Unity default parent, SceneView frame, global multi-scene navigation): implement only with verified Cocos Editor equivalents, document any differences.
- This code has automated test coverage but **has not been executed inside a real Cocos Creator 3.8.8 GUI in this environment**. The user’s installed Editor is the final integration gate.


### Patch 4 (0.1.0): Layer badges and search safety

- Node Layer badges are read-only, after native rename-input; layer metadata is not included in node names or searches.
- `scene:query-node` results are cached with bounded concurrency and refreshed asynchronously.
- Hide Layer badges for Scene roots, native searching, rename mode and narrow rows; preserve guide click targets and native controls.
- Test switching Layer in Inspector, named custom Layer, searching names, Scene/Prefab, and deep indentation on Creator 3.8.8.

### 0.1.0 Patch 5 regression (2026-11-17)

- [x] Native right-side component icon preserved; Active checkbox visible on row hover only.
- [x] Guide hit tolerance increased to 8 px; arrow/icon/name/control clicks remain excluded.
- [x] Lock's left-gutter pointer target remains present across the hover corridor.
- [x] Scene Selector supports close button, Escape, outside click, Refresh, asset validation and IPC error reporting.
- [x] TypeScript build and Node regression tests.
- [ ] Verify actual rendering, scene loading, lock clicks and search behavior in Cocos Creator 3.8.8 GUI.


### 0.1.0 Patch 11: color gradients and palette controls

- [x] Add isolated `src/renderer/colors.ts` with theme detection, HSL conversion, configurable saturation/brightness, flat grey, optional gradient and inherited tint. Inspired by `VHierarchyPalette.GetDefaultColor` and `VHierarchyGUI.backgroundColor`, not a direct pixel-perfect port.
- [x] Persist `colorGradientsEnabled` and previously-unused `colorSaturation` / `colorBrightness` as validated project settings. Live nine-color preview in Settings, palette swatches honor current tint.
- [x] Precompute 18 color gradients per scan and preserve selected-row highlight above tint. No injection into runtime GameObjects.
- [ ] Validate appearance manually on Cocos Creator 3.8.8, including dark/light theme, roots/children, narrow Hierarchy, active checkbox, native component icon and Scene search; automated tests alone cannot verify native CSS integration.

### 0.1.0 Patch 12 — Palette appearance validation

- [x] Fix false `Rejected appearance` response when an appearance object contains valid fields in a different insertion order from `sanitizeAppearance` (e.g. selecting icon before color).
- [x] Keep strict allowlist validation and stage configuration updates before committing in-memory state. Add focused regression tests for successive Palette actions.
- [ ] Confirm color/icon selection and recursive toggles in Creator 3.8.8, including restarting Editor and project settings persistence.


### M2 update — Patch 14 (still version 0.1.0)

Curated searchable Material Symbols Outlined catalog with official Google Fonts lazy loading; per-node icon tint presets and custom hex color; recursive icon/tint inheritance and strict settings validation. Remains to validate Google Fonts CSP support in live Creator 3.8.8 and add optional offline font/SVG pack if required. No tag or GitHub Release.

### M2 update — Patch 15: selected row color correctness (still 0.1.0)

- [x] Use selected background color derived from the assigned palette tint instead of Creator's opaque blue active fill for palette-colored nodes only.
- [x] Preserve distinct selection affordance with inset accent and matching left control gutter; do not change native selections without custom tint.
- [x] Preserve neutral Rename state and clean up CSS variables on unpaint/extension unload.
- [x] Unit and renderer regressions for different hues, dark/light theme, inheritance and gradient toggle.
- [ ] Confirm selected color in Cocos Creator 3.8.8 GUI on both themes and when changing palette while a node remains selected.

### M2 update — Patch 16: Palette swatch selection synchronization (0.1.0)

- [x] Mark the selected color in the open palette immediately on click, with a visible checkmark and high-contrast outline.
- [x] Display the saved color when reopening the palette; clearing a color removes the direct selection.
- [x] Indicate inherited color from a recursive parent distinctly, without persisting it as an explicit child override.
- [x] Exercise the compiled popup logic with DOM doubles and add regression tests for selection precedence.
- [ ] Confirm swatch selected-state visuals in Creator 3.8.8 GUI, including selection while IPC is pending.


### M2 update — Patch 17 (0.1.0): offline SVG library + custom icon import

- [x] 36 bundled local SVG icons (24 new original assets, tintable and searchable), no runtime network dependency.
- [x] Import SVG/PNG/WebP through the Palette; rasterize safely to project-local PNG, SHA256-derived identifiers, atomic project settings and Editor-restart persistence.
- [x] Custom icon name search, per-node tint and recursive behavior, confirmation-based deletion with assignment cleanup, size/dimension/input sanitization.
- [x] Main process tests for byte validation, persistence, deduplication, deletion and invalid IDs, plus renderer SVG validation and Palette wiring tests.
- [ ] Test actual Creator 3.8.8 GUI, file picker, Blob CSP behavior, and import/reload on Windows. The 184 Google Material Symbols continue to require a network font; offline import is their alternative, not a claim that all Google icons are bundled.


### M2 — Patch 18: full Google Material Symbols index

- [x] Download and validate the *entire* official Material Symbols Outlined codepoints index via HTTPS, with bounds and timeout.
- [x] Cache all indexed icon names per project; restore whitelist before reading user appearance metadata.
- [x] Palette search over loaded names, limit visible tiles to 72, refresh list without closing Palette.
- [x] Add retry action and offline fallback; support existing icon tint and recursive assignment.
- [x] Mock official response in tests to verify catalog persistence, safe icon validation and restart.
- [ ] Test networking, Material font loading, cache and visual rendering in Cocos Creator 3.8.8 on Windows.
- [ ] Optional future: full local SVG/bitmap icon pack independent of Google font service, classic Material Icons and style selector.

**Important:** Only the icon *index* is cached. Glyph font is still served by Google Fonts and not included in the distributed plugin. The Google source repository and documentation grant Apache-2.0 use.

### M2 — Patch 19: Prefab-aware visual persistence (0.1.0)

- [x] Keep row gradient, selected tint and injected icon when native Prefab state/row DOM changes
- [x] Stable prefab-template appearance mapping based on asset UUID + relative Hierarchy level, separate from instance UUID
- [x] Keep child color/icon inheritance and independent instance overrides
- [x] Promote old UUID-only appearance after converting an existing node into a Prefab (with safe same-row/path fallback)
- [x] Keep Cocos native Prefab name colors and built-in component glyphs intact
- [x] Regression coverage for prefab root, child, nested asset, invalid identifiers, and persistence/reload
- [ ] Verify Creator 3.8.8 GUI workflows: drag/drop prefab asset, prefab mode, duplicated instances, nested prefab, child reordering
- [ ] Consider PrefabInfo.fileId-based mapping if a stable ID becomes available through a supported Scene API (current `level` mapping changes when sibling order changes)

### M2 — Patch 20: Native Prefab icon-slot parity

- [x] Replace native Prefab asset/root glyph visually in the same left-hand slot rather than appending an extra icon near the name
- [x] Preserve original native Prefab DOM click/locate asset hit target and native component/TypeScript icon on far right
- [x] Clear replacement state on appearance removal, extension disable/unload or native icon recreation
- [x] Keep Prefab name color (green/red) unchanged by icon replacement
- [ ] Verify icon slot, click to locate asset, Prefab editing, nested Prefab and drag instance directly in Creator 3.8.8
