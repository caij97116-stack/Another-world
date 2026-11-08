# Codebase migration notes

## Current stable entry

The root `index.html` remains the GitHub Pages entrypoint. It loads the extracted stylesheet and the legacy JavaScript files as classic scripts in this order:

1. `src/js/state.js`
2. `src/js/app-core.js`
3. `src/js/worldbook.js`
4. `src/js/preset-core.js`
5. `src/js/preset-logic.js`
6. `src/js/preset-ui.js`
7. `src/js/ui-utils.js`
8. `src/js/dom-events.js`
9. `src/js/app.js`

Keep this order while the legacy scripts share global declarations. UI events are now delegated through `src/js/dom-events.js`, which remains loaded after the legacy function definitions and before `app.js`.

## Build tooling

Vite and TypeScript configuration have been added as preparation only. GitHub Pages is not yet configured to publish the Vite `dist/` output. Do not change the Pages deployment source or replace the existing entrypoint until the migration has a verified build and deployment workflow.

The project-site base path is configured as `/Another-world/`. Revisit it if the repository is later served from a custom domain or a different path.

## Migration sequence

1. Preserve the existing static entry and classic-script behavior.
2. Identify and migrate one UI area at a time, replacing its inline handlers with explicit event listeners.
3. Move migrated logic into TypeScript modules with explicit imports and exports.
4. Keep unmigrated legacy scripts in their original order until no remaining HTML or script depends on their globals.
5. Add and verify the Vite build and preview workflow.
6. Only then configure GitHub Pages to publish the generated `dist/` directory.

## Safety checks

- Do not mark legacy scripts as ES modules while inline handlers still depend on global functions.
- Do not delete or rename import/export fields or data paths as part of this structural migration.
- Keep each migration unit independently committed.
- Distinguish static source checks from an actual browser runtime test.

## Completed event migration

The bottom page navigation, mobile sidebar toggle/overlay, and nine preset collapsible-section controls now use `data-action` attributes handled by `src/js/dom-events.js`. Keep this delegated handler loaded after the legacy function definitions and before `app.js` calls `init()`. This migration has since been extended to the dynamic templates described below.


### Form event migration

The following form interactions now use delegated `input`, `change`, and `focusout` listeners in `src/js/dom-events.js`: worldbook search, worldbook field synchronization, preset field synchronization, prompt character counts, trigger preview, prompt-order JSON application, and raw preset JSON application. Their HTML controls use `data-input-action`, `data-change-action`, or `data-focusout-action` attributes. The original global functions remain in the legacy scripts and are called by the delegated handlers, preserving existing business logic.


### Click and file-input event migration

The remaining editor button interactions have been moved from inline `onclick` attributes to delegated `data-action` handling. This includes worldbook entry creation and bulk selection actions, fullscreen editing, entry copying, preset and prompt-item creation, regex/script creation, JSON refresh/application, and import-modal actions. The two JSON file inputs now use `data-file-action` with a dedicated delegated `change` listener; the original event object is passed through to the legacy file handlers.

At this point, `index.html` contains no inline `onclick`, `onchange`, `oninput`, `onblur`, or `onfocusout` attributes. The delegated handlers still call the existing global functions, so this is an event-wiring migration rather than a business-logic rewrite. Continue checking dynamically generated HTML templates inside JavaScript separately; this count only describes the static entrypoint.


### Dynamic-template event migration

Dynamic UI templates in the worldbook, preset, and toolbar code now emit `data-action` and `data-change-action` attributes instead of inline event attributes. The delegated handlers cover worldbook card selection, checkbox selection, entry reordering/copying, prompt-item reordering/deletion/JSON updates, regex enable/delete and field updates, script enable/delete and field updates, and toolbar actions (undo/redo, import/export, delete, theme, and preset clearing). The worldbook card's former click behavior is preserved by `handleEntryCardClick`; clicks on nested checkboxes and action buttons are handled separately.

A static scan of the current entrypoint and all loaded JavaScript files found no remaining `onclick`, `onchange`, `oninput`, `onblur`, or `onfocusout` attributes. This is a source-level check only; it does not replace browser runtime testing. The next stage can begin extracting individual business-logic units into explicit TypeScript modules while retaining the classic-script compatibility layer until dependencies are verified.


### First TypeScript utility modules

The first standalone TypeScript utilities have been added under `src/ts/utils/`:

- `html.ts` exports the typed, side-effect-free `escapeHtml(value: unknown): string` helper.
- `toast.ts` exports `showToast(message: unknown, type?: string): void` and safely no-ops if the toast container is absent.
- `index.ts` provides a single import surface for both utilities.

These modules are intentionally staged and are not yet wired into the live static entrypoint. The existing classic-script `ui-utils.js` remains active because the current GitHub Pages deployment serves the root HTML directly; browsers cannot execute the unbuilt TypeScript source. Integration will happen only after the Vite build and deployment path are verified, avoiding a premature switch that could make the published site stop loading.


A compatibility bridge, `src/ts/utils/legacy-bridge.ts`, now provides `installLegacyUtilities()`. The future module bootstrap can call it before invoking the legacy `init()`, exposing the typed helpers as `window.escapeHtml` and `window.showToast` so the remaining classic scripts can continue resolving those names. The bridge is not loaded by the current static entrypoint yet.

## Typed state contracts (not yet wired)

- Added `src/ts/state/worldbook.ts` for world-book state and storage-key contracts.
- Added `src/ts/state/preset.ts` for open-ended preset payload and state contracts.
- Added `src/ts/state/index.ts` as the type-only export surface.
- The contracts deliberately preserve arbitrary imported Tavern fields; they do not narrow preset payloads to a fixed schema.
- These files currently describe the existing classic-script state only. They do not instantiate a second store, replace `src/js/state.js`, or alter the live GitHub Pages entrypoint.
- The legacy state migration remains pending until the global binding and mutation patterns have been fully mapped and a verified Vite build/deployment path is available.

### World-book undo/redo state contracts

- Added `src/ts/state/history.ts` with explicit snapshot, history-index, and history-limit contracts.
- Confirmed from the legacy implementation that history snapshots are serialized JSON strings; `WorldBookStateContract.historyStack` now reflects `string[]` rather than an unconstrained array.
- Removed the history limit from the storage-key contract because it is a separate configuration value, not a browser storage key.
- The runtime history implementation remains in `src/js/app-core.js`; this step adds types only and does not change undo/redo behavior.

### Preset metadata state contracts

- Refined `src/ts/state/preset.ts` after tracing the legacy import, cache-restore, save, and export paths in `src/js/preset-core.js`.
- Added `PresetEnvelope` to describe the wrapper metadata as a string key plus an open wrapper object. The wrapper remains open-ended so unrelated metadata is preserved when exporting.
- Added `PresetArrayPathMap` to describe alias-to-path mappings used to find nested prompt, regex, and script arrays without moving or flattening the original fields.
- Tightened the four preset storage-key types to the exact existing localStorage key names.
- The runtime validation and persistence functions remain in the legacy JavaScript file. This is a type-contract refinement only; no import/export or storage behavior was changed.

### Preset array-path helper extraction

- Added `src/ts/state/preset-paths.ts` with typed validation and resolution for nested preset arrays.
- `isPresetArrayPath` matches the legacy restore rule: a non-empty array containing only non-empty strings.
- `findPresetArrayAtPath` resolves an existing nested array and returns its owner/key/value without flattening, rewriting, or mutating the imported preset.
- Exported the helpers and their result type from `src/ts/state/index.ts`.
- These are standalone TypeScript helpers and are not yet called by the active classic-script application; integration waits for the verified build and compatibility migration.


### Preset import and wrapper helpers

- Added `src/ts/state/preset-import.ts` with typed, standalone equivalents of the legacy preset payload signature check, wrapper unwrapping, and export-envelope reconstruction.
- Wrapper-key precedence and payload signatures mirror `src/js/preset-core.js`; unrelated wrapper fields remain preserved when rebuilding an export object.
- The unwrapping helper retains the existing Chinese validation error for non-object imports.
- Exported the helpers and parsed-import result type from `src/ts/state/index.ts`.
- These helpers are not wired into the active application yet. The legacy import/export implementation remains authoritative until the TypeScript build and integration path are verified.


### Grouped preset data helpers

- Added `src/ts/state/preset-items.ts` as a cohesive preset-data module rather than splitting each helper into its own file.
- The module groups original-path array lookup and alias selection, active regex/script array access, canonical view-field adapters, and regex/script item normalization.
- Regex and script normalization accept the legacy boolean parser as a dependency, keeping coercion rules supplied by the existing application rather than silently reimplementing them.
- Script normalization preserves unrecognized source keys; array selection continues to prefer populated candidate arrays and records the selected original path.
- Exported the grouped helpers from `src/ts/state/index.ts`. The active classic-script functions remain unchanged and authoritative; this module is not wired into the live entrypoint.


### State module consolidation

- Consolidated the small undo/redo contract file into `worldbook.ts`, because history state is part of the world-book editor state domain.
- Consolidated nested preset array-path validation and lookup into `preset-items.ts`, alongside the existing regex/script array alias handling. The previous separate `preset-paths.ts` file duplicated the same path-resolution responsibility.
- Kept the public helper names exported through `state/index.ts` so future imports can use one consistent state entry point.
- Removed the two redundant files. This is a source-organization change only; the live classic-script entrypoint and runtime behavior remain unchanged.

- Further consolidated `preset-import.ts` into `preset.ts`: wrapper recognition, unwrapping, and export-envelope reconstruction belong with the preset contracts and envelope metadata. The public exports remain available from `state/index.ts`.

### Utility module consolidation

- Grouped `escapeHtml` and `showToast` into `src/ts/utils/ui-utils.ts`, matching the existing legacy `src/js/ui-utils.js` responsibility boundary.
- Kept `index.ts` as the single export surface and left `legacy-bridge.ts` separate because it adapts module exports to the classic-script global interface.
- Removed the two single-purpose files. The active legacy utility script and live HTML script order remain unchanged.

### Existing JavaScript module size review

A follow-up review checked the current classic-script modules before making further consolidation changes:

- `preset-ui.js` remains separate from `preset-logic.js`: it owns field-overview rendering and section expansion, while `preset-logic.js` owns regex/script item editing and normalization. Their responsibilities are adjacent but not duplicates, so merging them solely because the UI file is smaller would blur the boundary.
- `app.js` remains a minimal bootstrap by design; combining it with application logic would make startup order and entrypoint responsibilities less explicit.
- `state.js` remains separate because it defines shared globals consumed by the classic scripts.
- `dom-events.js` remains separate as the centralized delegated-event layer.
- `ui-utils.js` remains the live classic-script utility file until the TypeScript/Vite integration is verified.

No additional JavaScript files were merged in this pass. The review favors keeping these clear responsibility boundaries over reducing the raw file count. A source-level check also confirmed that the current HTML script order remains unchanged.
