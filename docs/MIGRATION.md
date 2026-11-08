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
