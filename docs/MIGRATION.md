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


### Cross-module dependency audit

A full source-level pass reviewed the current classic-script modules, shared state, delegated events, CSS entrypoint, and staged TypeScript modules before deciding whether further file splitting is justified.

#### Runtime script dependency map

The live entrypoint still loads classic scripts in this order:

`state.js → app-core.js → worldbook.js → preset-core.js → preset-logic.js → preset-ui.js → ui-utils.js → dom-events.js → app.js`

The important cross-file relationships are:

- `state.js` declares the shared world-book and preset state used by the editor modules. It must remain first while the application uses classic scripts.
- `app-core.js` provides page switching and application initialization; `dom-events.js` delegates navigation actions to `switchPage`.
- `preset-core.js` calls `renderFieldOverview` from `preset-ui.js` and uses the shared toast utility. This later-defined function is only called after the page has finished loading, but it is still an explicit ordering dependency.
- `worldbook.js`, `preset-logic.js`, and `app-core.js` use the shared toast utility.
- `dom-events.js` is the delegated interaction boundary. Its selectors cover click, input, change, focus-out, and file actions rather than owning the underlying business logic.
- `app.js` remains the final bootstrap entry and calls initialization after the preceding classic scripts have loaded.

The global-state and function dependencies are intentional consequences of the current classic-script architecture. Converting individual files to ES modules before defining explicit imports and initialization contracts would risk breaking those assumptions.

#### Further split assessment

- `preset-core.js` is the only substantial candidate for a future split (about 645 lines). It contains preset storage and envelope handling, prompt-item operations, UI rendering/synchronization, import/export, raw-JSON editing, and array access helpers. These are distinguishable sub-responsibilities, but they currently share preset state and call one another through global functions. Splitting it now would create additional implicit cross-file dependencies rather than a clean module boundary. Defer this until the TypeScript/module migration can give those dependencies explicit imports.
- `worldbook.js` (about 342 lines) is cohesive: import/export, entry normalization, list selection, editing, and trigger preview all operate on the same world-book entry domain. No further split is justified yet.
- `preset-logic.js` (about 250 lines) groups regex and script editing/normalization. Those two item families share the same editing lifecycle, so keeping them together is preferable to creating tiny files.
- `dom-events.js` (about 233 lines) is a cohesive delegated-event layer and should not be divided by individual event type.
- `preset-ui.js` remains a small but meaningful UI responsibility and should stay separate from preset data editing/normalization.
- `state.js`, `ui-utils.js`, and `app.js` are intentionally small boundary files; their size alone is not a reason to merge them.
- `main.css` is already extracted from the HTML. It is compactly formatted and has only a few section markers, but its rules share page-level tokens and component styling. Splitting it into multiple stylesheets now would add load-order and maintenance overhead without a clear ownership boundary.
- The staged TypeScript state modules intentionally mirror selected legacy contracts and helpers while migration is pending. Similar helper names across legacy JS and TypeScript are not two active runtime implementations: the live page still loads the classic JS files, and the TypeScript modules are not wired into the entrypoint.

#### Conclusion

No additional source files were split or merged in this audit. The current boundaries are reasonable for the live classic-script application. The next meaningful architectural step is not more fragmentation: it is to establish and test explicit module imports and state/function contracts during the TypeScript/Vite migration. Until then, preserve the existing script order and runtime implementation.

This was a static source review only. It did not run npm installation, Vite build, TypeScript type-checking, or browser runtime tests.
## Preset Studio: long-form prompt editor

The first Preset Studio UI pass replaces the prompt-item full-JSON-first workflow with structured editing controls for the common fields: name, role, identifier, enabled state, system-prompt flag, and content. The full JSON editor remains available under an advanced disclosure so uncommon fields can still be edited explicitly.

Important compatibility behavior:

- Ordinary field edits mutate only the selected property on the existing prompt object; they do not rebuild the object from a reduced form schema.
- Unknown prompt properties therefore remain present during normal editing.
- Identifier edits are validated for uniqueness and synchronized to matching entries in each existing prompt_order group.
- Existing prompt ordering, add/delete behavior, and advanced JSON editing remain available.
- Main Prompt, Jailbreak Prompt, System Prompt, and individual prompt content now use larger, automatically resized text areas.
- A prompt item can be opened in a focused full-screen editing mode; only one item can be expanded at a time.
- Prompt content is saved through the existing preset persistence path and the existing raw-JSON view is refreshed.

This is an incremental UI change on the legacy classic-script runtime. The production index.html entrypoint and script load order are unchanged. Static JavaScript parsing and source-level wiring checks passed; no browser interaction test, Vite build, or TypeScript type-check was run in this pass.
## Dedicated regex and script workspace

The regex rules and scripts have been moved out of the preset editor page into a dedicated extension workspace with separate Regex and Script tabs. This is a UI separation only: both collections continue to use the active preset's existing array-alias/path resolution, so edits remain bound to the imported preset and are exported with it. They are not moved into worldbook data and are not stored as an unrelated standalone resource.

The Regex tab retains the existing rule editor and adds a test bench. A test runs the current rule's find/replace against text supplied in that card, using a short-lived Web Worker with a timeout so a problematic expression does not block the main UI. The test output is display-only and never writes back to the preset. This validates the find/replace transformation only; it does not emulate Tavern placement, depth, trim-string, or macro/runtime behavior.

The Script tab retains script metadata and code editing, expands the code editor, and adds an explicit sandbox test action. The test uses a sandboxed iframe with an opaque origin and a restrictive CSP that blocks network connections, external assets, forms, and navigation. It receives only the supplied test input and a small console/context object; it does not receive Tavern/TavernHelper host APIs, page storage, or access to the parent document. Scripts are never executed automatically on import or when opening the workspace. A timeout removes the test frame. This is a lightweight JavaScript test harness, not a full Tavern runtime emulator; scripts that depend on Tavern-specific APIs will need mocks or cannot be meaningfully exercised here.

The bottom navigation now includes the extension workspace. The preset page no longer embeds regex/script editors, while the preset import/export actions remain available from the extension page. The original static `index.html` deployment entrypoint and classic-script load order are unchanged.

Static checks performed for this change: all nine loaded JavaScript files parse with `new Function`; the extension page separation, preset-array binding, delegated actions, worker test, iframe sandbox/CSP, original script order, and responsive styles were checked in source. No browser interaction test, Vite build, TypeScript type-check, or real Tavern runtime test was performed.


## Independent character-card workspace: import and inspection

The character-card workspace is a separate page and resource domain. It currently imports SillyTavern character-card JSON (flat V1 and V2/V3 envelopes) and PNG files containing `chara` or `ccv3` text metadata, plus legacy V1 PNGs that store individual fields in separate text chunks. When both PNG payloads exist, the parser prefers `ccv3`. It reads PNG `tEXt`, `zTXt`, and `iTXt` metadata chunks, including deflate-compressed text where the browser supports `DecompressionStream`.

The imported card is retained as its original parsed JSON object. Common text fields and tags can be edited in place. An advanced JSON editor also allows validated edits to the complete card object, including nested greetings, embedded character books, extension data, and V3 fields; edits update the retained object and are reflected in JSON / PNG exports. JSON export writes the complete preserved object to a standalone `.json` file. For PNG-origin cards, PNG export inserts a new base64 character-data `tEXt` chunk named `chara`, and also inserts a `ccv3` compatibility chunk for envelope-shaped cards. The V3 copy is marked `chara_card_v3` / `3.0`; this lets V3-aware readers prefer `ccv3` while V2-only readers can still read `chara`. Stale `chara` / `ccv3` metadata chunks are removed, and all other original PNG chunks are copied byte-for-byte. This avoids re-encoding the image pixels.

Compatibility and safety boundaries:

- File reading and parsing happen locally in the browser; files are not uploaded to a service.
- Unknown fields and V3-specific fields remain in the retained root object and are included in JSON export.
- Embedded `character_book`, `extensions`, and other nested data remain inside the character card. They are not silently copied into the separate worldbook or preset workspaces.
- Imported script-like fields are treated as inert data and are never executed.
- PNG screenshots or re-encoded images may no longer contain the original character metadata and will be reported as missing `chara` / `ccv3` data.
- The parser supports common V1/V2/V3 JSON and PNG layouts. Editing currently covers name, description, personality, scenario, first message, example dialogue, creator notes, system prompt, post-history instructions, and tags; other nested fields are preserved but not yet edited through dedicated controls.
- PNG writing preserves existing non-character PNG chunks as-is, but the browser implementation has not yet been tested against a broad real-world corpus of PNG variants. It is not a full CHARX archive reader or Tavern runtime emulator.

Static source checks are required before treating this phase as complete. No browser-based PNG fixture round-trip or real SillyTavern import test is claimed unless performed separately.

## Character-card embedded resource inspection

The character-card workspace now provides read-only previews for resources already embedded in the imported card:

- `character_book`: displays the book summary and individual entries, including entry names/comments, trigger keys, enabled state, and content.
- V3 `assets`: lists each resource's name, type, extension, and URI. Data URLs are intentionally shown as a placeholder rather than expanded into the page.
- `extensions`: lists extension keys, value types, and a bounded JSON preview. Deeply nested values, long strings, and large arrays are folded or truncated in the preview; the full retained data remains available in the advanced JSON editor and exports.
- The resource count summary now includes V3 assets.

These panels are inspection-only. They do not import, copy, overwrite, or merge embedded resources into the standalone worldbook or preset workspaces. The original character-card object remains the source of truth, and JSON / PNG exports continue to use that retained object.

This phase was checked with source-level assertions and JavaScript syntax parsing. It was not tested through browser interaction or against a broad corpus of real-world character cards.

## Character-card resource associations

The character-card workspace can now link the currently loaded card to the currently loaded standalone worldbook and/or preset. This is an association layer, not a merge/import workflow:

- The user explicitly clicks the association action for the active worldbook or preset. The tool records only a display name, a small count summary, a content fingerprint, and a timestamp in a separate localStorage key (`tavern_character_card_resource_links_v1`).
- No worldbook entries, preset prompts, card fields, embedded `character_book`, or V3 assets are copied or modified by creating or removing a link.
- When the card workspace is opened again, the saved fingerprint is compared with the currently loaded resource. A changed or unavailable resource is marked as stale/unavailable; the tool does not silently relink or sync it.
- Re-associating explicitly replaces the reference metadata with the currently loaded resource. Unlinking removes only the association record.
- Association records are local to the browser profile and are not included in character-card JSON/PNG exports, preset exports, or worldbook exports.
- The card association key is derived from the card's name, creator, character version, creation date, and imported filename. Cards sharing all of those identity fields may share an association key; users should avoid relying on the association layer as a globally unique identifier.

This linking phase supports the currently loaded worldbook and preset only. It does not yet provide a multi-file resource library, file picker for previously imported resources, or automatic synchronization. Source-level checks and JavaScript syntax parsing are required before treating the phase as complete; no browser interaction or multi-card collision test is claimed.

## Validated resource bundle export

The character-card workspace can export a JSON resource bundle after at least one standalone resource has been explicitly associated with the active card:

- The bundle contains a copy of the current character-card JSON object and exact snapshots of only the linked standalone worldbook and/or preset.
- Before export, each linked resource's current content fingerprint is checked against its saved association. If a linked resource is unavailable or has changed, export is blocked until the user explicitly re-associates it.
- Export reads the current in-memory data and does not call editor synchronization functions or mutate the source objects. The normal delegated input handlers remain responsible for reflecting edits into the in-memory data.
- The bundle includes a small manifest with resource names, counts, fingerprints, and association timestamps. It does not include browser-local association records as a reusable global identity system.
- The output is a JSON snapshot package. It includes the character card's JSON data but not the original PNG image pixels; keep the original PNG separately when its artwork is needed.
- The bundle is an export-only container in this phase. It does not yet have an import/restore workflow, ZIP/CHARX packaging, or automatic resource synchronization.

## Resource bundle import and restore

The character-card workspace now accepts the JSON resource bundle format produced by this editor (`another-world-character-resource-bundle`, version 1):

- Selecting a bundle only stages and inspects it. The importer validates the format/version, card `name` and root structure, worldbook `entries`, preset signature, duplicate/unknown resource types, and each included resource fingerprint. It shows a preview and does not mutate the active card, worldbook, or preset during inspection.
- The character card, standalone worldbook, and standalone preset have separate explicit actions. The card is imported as JSON data; its original PNG artwork/pixels are not part of the bundle.
- Restoring a worldbook or preset requires a confirmation. Before replacement, the current workspace is snapshotted to browser localStorage under a dedicated `another_world_pre_bundle_*_backup` key.
- After restoring a worldbook or preset, a one-click rollback action is shown to restore the immediately preceding local snapshot. The rollback target is the most recent bundle-restore backup for that resource type; a later restore replaces that backup.
- The bundle's manifest association records are informational only. Import does not recreate browser-local card/resource association records or automatically link the imported resources.
- Embedded character-book data and V3 assets remain inside the character-card JSON and are not automatically copied into the standalone worldbook.
- Imported scripts remain inert: staging and restore do not execute JavaScript stored in the preset or card.

This is a JSON bundle workflow, not a ZIP/CHARX importer. Validation is source-level only at this stage; real browser interaction, storage-quota failure, and round-trip testing with multiple real-world bundles remain outstanding.


## Character-card and resource-bundle compatibility tests

A Node.js built-in test suite exercises the live character-card parser and resource-bundle staging logic in an isolated VM context. The test harness exposes only selected internal functions and supplies stub UI/storage dependencies; it does not open or mutate a user's browser data.

Coverage includes:

- Flat V1 JSON, V2 envelope, and V3 envelope recognition.
- Preservation of nested and unknown card fields.
- Rejection of cards without a usable name.
- Legacy V1 PNG text metadata parsing and V3 `ccv3` preference when both `ccv3` and `chara` chunks exist.
- Successful staging of a synthetic resource bundle without applying it.
- Rejection of malformed JSON, unsupported bundle versions, duplicate resource types, malformed worldbook entries, and mismatched resource fingerprints.

Run locally with `npm test` (Node.js 22 or later). GitHub Actions runs the same command on pushes and pull requests to `main`.

Latest CI result: 19 tests passed, 0 failed. The suite also checks structured character-card field/tag edits preserve nested extension and character-book data, invalid raw JSON is not applied, and a failed JSON import leaves the currently loaded card untouched. The suite calls the real resource-bundle export function, reads the generated JSON Blob, stages that exact JSON through the real importer, restores both linked resources, and compares nested payloads including unknown extension fields. Separate tests verify restoring the pre-import worldbook snapshot and preset storage values. PNG coverage verifies chunk CRCs, rejects damaged or truncated files without a complete IEND chunk, and runs the real PNG export function against a synthetic PNG. It checks that the original IDAT image payload is byte-for-byte preserved, stale card metadata is replaced, new chara/ccv3 chunks have valid CRCs, and the exported PNG can be parsed back into the updated card. Oversized card and resource-bundle files are also checked to ensure they are rejected before their contents are read. UI rendering, real-world PNG corpus coverage, storage-quota behavior, and Tavern runtime compatibility are still outside this automated suite.


## Worldbook advanced entry settings

The worldbook entry editor now exposes an expandable advanced-settings panel while keeping the common fields visible. The panel adds SillyTavern-compatible entry properties for selective-key logic (`selectiveLogic`), case-sensitive matching (`caseSensitive`), whole-word matching (`matchWholeWords`), inclusion groups (`group` and `groupWeight`), and per-entry group scoring (`useGroupScoring`).

The editor writes these properties onto the existing entry object instead of rebuilding it from a reduced schema, so unrelated and unknown fields remain intact. Existing entries without these properties display documented defaults in the controls; saving the entry writes the selected values. Regex-style keys continue to use SillyTavern's slash-delimited JavaScript regex convention and do not require a separate enable flag.

The whole-word option is accompanied by a language caveat: it can reduce matches for Chinese and Japanese text because those languages do not generally separate words with spaces. The advanced panel is a data editor only; the local trigger preview remains a simplified keyword preview and does not emulate SillyTavern's complete matching, group-selection, recursion, or generation pipeline.


## Expanded worldbook entry controls

The advanced editor now includes character filtering, generation-type triggers, additional matching sources, per-entry recursion controls, and Outlet insertion. Character filtering edits the SillyTavern `characterFilter` object (`isExclude`, `names`) while preserving any existing `tags` identifiers; the names field expects the character avatar/file identifiers used by SillyTavern. Generation triggers use the documented values `normal`, `continue`, `impersonate`, `swipe`, `regenerate`, and `quiet`; an empty array means all generation types.

Additional matching-source toggles map to the upstream entry fields `matchCharacterDescription`, `matchCharacterPersonality`, `matchScenario`, `matchPersonaDescription`, `matchCharacterDepthPrompt`, and `matchCreatorNotes`. Recursion controls map to `excludeRecursion`, `preventRecursion`, and `delayUntilRecursion`. The delay field accepts a boolean-style enabled state or a positive recursion level. These per-entry controls do not replace SillyTavern's global recursive-scan setting or global maximum recursion steps.

Insertion positions now include example-message top/bottom and Outlet (position values 5, 6, and 7). Outlet names are stored in `outletName`. The editor also corrects the selective-logic enum mapping to match upstream (`0` AND ANY, `1` NOT ALL, `2` NOT ANY, `3` AND ALL). Case sensitivity, whole-word matching, and group scoring now support an explicit inherit-global state (`null`) rather than forcing an entry-level override when the user has not selected one. Inclusion priority maps to `groupOverride`.

The local trigger preview remains intentionally simplified and does not simulate character filtering, generation triggers, additional matching sources, recursive passes, or Outlet resolution. Character-tag filtering remains preserved in imported data but is not yet edited through a tag-name picker because the standalone editor has no authoritative SillyTavern tag registry.


## Worldbook diagnostics center

A read-only diagnostics center is available from the worldbook sidebar. It scans the currently loaded entries without modifying them and reports structural or likely configuration issues: empty content, missing activation keys, selective entries without secondary keys, invalid probabilities/order/depth/positions, unsupported trigger values, malformed character-filter shapes, missing Outlet names, invalid slash-delimited regex keys, duplicate plain-text keys, and possible recursive cycles inferred from entry content mentioning other entries' keys.

Findings are classified as errors, warnings, or informational notes. Selecting a finding navigates to its entry. Duplicate keywords and recursive cycles are informational because they can be intentional authoring patterns; they are not automatically treated as defects. The scan is heuristic and data-only: it does not emulate SillyTavern's prompt-building engine, global settings, actual chat context, vector search, extension hooks, or generation-time activation. It never edits or repairs data automatically.


## Preset diagnostics center

The Preset Studio now includes a read-only diagnostics center. It checks common sampling-parameter types and ranges, conflicting aliases for fields such as prompt text and generation length, malformed `prompts` / `prompt_order` structures, missing or duplicate prompt identifiers, empty enabled prompt content, and order entries that reference identifiers absent from the prompt list.

Findings are grouped as errors or warnings and can navigate to the related parameter control, prompt item, or prompt-order section. The scanner does not repair data, rewrite identifiers, reorder prompts, or change export content. A warning about a parameter range is advisory rather than a guarantee of backend rejection: API providers and compatible preset formats can differ.

This is static JSON inspection only. It does not emulate a particular Tavern version's prompt assembly, provider-side parameter validation, script execution, or the active chat context. The diagnostics scanner has isolated Node tests for malformed structures, alias conflicts, identifier references, empty enabled prompts, and read-only behavior.


## Preset import preview and rollback

Preset JSON imports are now staged before application. Selecting a file parses it locally and opens a preview showing the file name and size, preset name, outer-wrapper recognition, top-level field count, prompt count, enabled prompt count, and detected regex/script array counts. A few structural cautions are displayed when the payload does not match common preset signatures or when prompt/order collections appear incomplete. Previewing does not replace the active preset or execute imported script data.

The user must explicitly confirm the import. Before applying it, the editor serializes a snapshot of the current preset data and its associated metadata (outer wrapper, editor version, and original regex/script array paths) to the dedicated localStorage key `tavern_preset_editor_import_backup`. If this backup cannot be written, the import is cancelled rather than replacing the current preset without a rollback point.

After a successful import, the preset status area exposes `撤销上次导入`. Undo requires confirmation and restores the prior preset snapshot, including wrapper and array-path metadata; if there was no preset before import, undo returns the editor to its empty state. The backup is one-level and is cleared after a successful undo; a subsequent import replaces the previous rollback point. The backup is browser-local and is not included in preset exports.

The preview is a structural summary, not a full schema validator. Provider-specific fields and nested extension data are preserved as-is. LocalStorage quota or browser storage restrictions can prevent backup creation; in that case the import is blocked and the existing preset remains active. Browser UI interaction and real Tavern compatibility still require separate testing.


## Preset export integrity preview

Preset export now opens a pre-download report after synchronizing the visible editor fields and applying the user's disabled-regex / disabled-script export choices. The report summarizes top-level fields, prompts, prompt-order groups, regex entries, script entries, and JSON node counts before and after serialization.

The final export object (including its recognized outer wrapper) is serialized and parsed again in memory. A recursive comparison reports fields dropped by JSON serialization, type/value changes, array-length changes, and non-finite numbers. Values that JSON cannot serialize, such as cyclic structures or BigInt, block export rather than producing a broken file. The report lists a bounded set of differences; it does not modify the active preset.

The user must explicitly confirm the export from the preview. Cancelling closes the preview without downloading or incrementing the export version. A successful confirmation downloads the exact JSON string that was inspected. The check validates JSON serialization integrity, not semantic compatibility with every Tavern fork or provider. Browser download behavior and real Tavern import round-trips still require separate runtime testing.


## Preset prompt-order preview

The Preset Studio now shows a read-only structural preview beneath the raw `prompt_order` JSON editor. It groups entries by each order group's `character_id`, resolves order references against `prompts[].identifier`, displays each referenced prompt's name, role, and combined enabled state, and lists prompts that are not referenced by any recognized order group. Missing identifiers, unresolved references, and duplicate identifiers are surfaced as warnings rather than silently omitted.

The preview refreshes when prompt fields or the raw order JSON are updated. It does not rewrite `prompt_order`, reorder the source `prompts` array, or change export data. This is deliberately not presented as the exact final prompt sent to a model: character-specific context, extension processing, primary prompt insertion, and runtime rules can affect the final assembled context. No Tavern runtime emulation is performed.


## Prompt Markdown and macro preview

Each prompt item now has an expandable, read-only content preview. It renders a safe subset of Markdown for headings, paragraphs, emphasis, inline code, fenced code blocks, lists, blockquotes, and horizontal rules. The preview is updated as the prompt content is edited.

Double-braced tokens such as `{{char}}`, `{{user}}`, and other `{{...}}` forms are highlighted and listed once per prompt. This is inspection only: macro values are not substituted, chat variables are not read, and no Tavern or extension macro is executed. Raw prompt text remains unchanged and is still the exported source.


## Bulk prompt editing

The preset prompt list supports selecting individual prompts or selecting all prompts currently displayed. Bulk actions can enable or disable selected prompts, move the selected block up or down by one position while preserving its relative order, or clear the selection.

When moving prompts, the editor attempts to mirror each adjacent swap in every recognized `prompt_order` group only when both identifiers are unique and have exactly one corresponding order item in that group. If a mapping is ambiguous or missing, the prompt array is still moved and a warning is shown; the editor does not guess how to rewrite ambiguous order references. Bulk changes are saved through the existing preset save flow and remain part of the normal preset export.


## Preset edit undo and redo

The Preset Studio now has a separate, bounded undo/redo history for edits made through the main preset fields and prompt editor. It records prompt field changes, prompt JSON replacement, prompt addition/deletion/reordering, bulk prompt actions, and prompt-order JSON changes. Consecutive typing is coalesced into one history step rather than storing every keystroke. The history holds up to 50 snapshots in memory for the current page session.

Undo and redo restore the preset payload together with its recognized outer wrapper, editor version, and array-path metadata, then refresh the editor and schedule local persistence. This history is independent of the one-level “撤销上次导入” rollback and the worldbook's own history. It is session-local and is cleared when a new empty preset is created or the page is reloaded; it is not embedded in exported preset JSON. Regex/script-specific editing controls are not yet included in this history scope.


### Regex and script editor history coverage

The shared preset edit history also covers Regex and Scripts workspace changes: regex field edits and placement updates, enable/disable, add, and delete; script name/type/trigger/code edits, enable/disable, add, and delete. Script code typing is coalesced into a single undo step while the user continues typing. Test runs and sandbox output are intentionally excluded because they do not mutate preset data. Undo/redo restores the same preset snapshot and refreshes the extension lists, so these edits remain part of the active preset and its normal import/export data.


### Regex and script ordering

The Regex and Scripts cards include adjacent move-up and move-down controls. Boundary controls are disabled, array order is preserved in the preset payload, and each reorder is recorded in the shared preset undo/redo history.


### Extension workspace search, filters, and motion

Regex and Scripts now each have a live search field and an enabled/disabled status filter. Search covers regex names, find/replace expressions and placement values; script search covers names, type, trigger and source code. Filtering is presentation-only: it hides nonmatching cards without changing the preset arrays or their order. Each toolbar reports visible versus total entries and provides an accessible empty-result message. Cards and tabs use restrained transition/entry effects, with motion disabled when the operating system requests reduced motion. The search field is filtered in place without rebuilding the input on each keystroke.


### Extension card compact mode and bulk controls

Regex and script cards can be individually collapsed to keep long workspaces navigable. Both workspaces also support selecting visible cards, selecting all currently filtered results, and batch enable/disable/delete. Batch deletion requires confirmation; each batch mutation creates one preset undo-history entry. Search and status filters do not modify the underlying arrays, and batch actions are scoped to selected cards that remain visible under the current filter.


### Preset history keyboard shortcuts

When focus is outside editable fields, Ctrl/⌘ + Z triggers preset undo, Ctrl/⌘ + Shift + Z or Ctrl/⌘ + Y triggers redo. Native text-editing undo inside inputs, textareas, selects, and contenteditable elements is left untouched.
