# vHierarchy for Cocos Creator

**Version:** `0.1.0` (development/test build; no Git tag or GitHub Release)  
**Manifest compatibility:** Cocos Creator `>= 3.8.2`  
**Verified source reference:** Editor 3.8.8 (`app.asar` supplied by project owner). No real Editor GUI run has been performed in this environment.

This is a TypeScript Cocos Editor extension inspired by the provided Unity vHierarchy source. It **never patches `app.asar`**. The renderer layer uses a reversible, private Hierarchy DOM/Vue overlay; it may need adjustments for other 3.8.x builds or future Editor updates. If node UUID metadata is unavailable, customization and node mutations are disabled rather than guessing a node.


## Latest test iteration (still 0.1.0)

- Fixed `toggle-active` attempting to write to a readonly Vue node (`item.node.active = ...`). All mutations now use an isolated Scene IPC command; the native Hierarchy determines the updated state.
- Replaced approximate DOM line segments with the computed-padding/margin guide algorithm from the supplied `hierarchy-visual-hook` v0.8.8. CSS pseudo-elements connect to the actual native icon/text anchor and stop at last siblings.
- Added 12 original SVG assets in `static/icons/` inspired by the categories from Unity `VHierarchyPalette.cs`. The Unity archive has **no standalone image icon files**; built-in Unity Editor icons cannot be copied. Legacy emoji assignments remain compatible.
- `npm test` runs the expanded geometry / readonly Scene regressions, with **14 automated tests**.

See [the full phased feature-parity plan](https://github.com/PhuNope/cocos-vHierarchy/blob/main/docs/ROADMAP.md). A Unity screenshot reference is available in the supplied `Read me.pdf`.

**Important:** Real Cocos Creator Editor UI, Undo/Redo, Scene dirty/save and Prefab regression checks are still required. The automated tests alone do not establish functional parity in Creator 3.8.8.

## Install test build

1. Extract `vHierarchy-0.1.0-test.zip` into your project's `extensions` directory. The resulting path must be `<cocos-project>/extensions/cocos-vhierarchy/package.json`.
2. In Cocos Creator, refresh the extension from **Extension Manager**, or restart the Editor.
3. Open the native **Hierarchy** panel. The top bar displays `vH`. Open the **Panel → vHierarchy: Settings / Palette** menu to configure it.
4. Hover any node, then **Alt + right-click** for color/icon, recursive application, or reset. Hover a row to see the active toggle (if the node is editable).
5. In the toolbar, type a node name to dim nonmatching rows; the star bookmarks the last hovered node. Click a bookmark to select it. Right-click a bookmark to remove it.

### Enabled features in 0.1.0

| Unity vHierarchy reference | Cocos implementation in this test build |
|---|---|
| Hierarchy lines | Tree/minimal connectors (best effort if rows are virtualized) |
| Zebra striping and minimal mode | Visual styles on existing native rows |
| Per-object color palette | 9 slots based on `VHierarchyPalette.cs`; supports recursive inheritance |
| Per-object icons | Emoji icon chooser, recursive inheritance; **not** Unity-specific raster icons |
| Component minimap | Type-color dots on the right of rows; visual only |
| Activation toggle | One-click toggle via `scene:query-node` / `scene:set-property` with `record: true`; rejects unknown/locked/readonly nodes |
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
- [ ] Toggle lines, stripes, minimal and minimap; unload cleans all styles
- [ ] Set color/icon on root and nested children, recursive inheritance, save/reopen Editor
- [ ] Toggle active, Undo, Redo and save/reload Scene/Prefab; test locked nodes
- [ ] Bookmark/unbookmark/select; restart the Editor; verify persistence
- [ ] Open existing scenes with many collapsed nodes; ensure guide connectors never obscure native controls

If a test fails, use **Panel → vHierarchy: Diagnostics** and copy logs from the Editor console. Also inspect `window.__vHierarchy388?.stats()` in the main renderer DevTools.
