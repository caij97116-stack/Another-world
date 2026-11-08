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
8. `src/js/app.js`

Keep this order until the legacy functions and inline HTML handlers have been migrated. These classic scripts share global declarations, and the HTML currently calls many functions through inline event attributes.

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
