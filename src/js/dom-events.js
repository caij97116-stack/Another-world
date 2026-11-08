// Centralized event delegation for migrated HTML controls.
// Keep this as a classic script until the remaining legacy globals are migrated.
document.addEventListener('click', (event) => {
    const target = event.target instanceof Element
        ? event.target.closest('[data-action]')
        : null;

    if (!target) return;

    switch (target.dataset.action) {
        case 'toggle-sidebar':
            window.toggleSidebar();
            break;
        case 'close-sidebar':
            window.closeSidebar();
            break;
        case 'switch-page':
            window.switchPage(target.dataset.page);
            break;
        case 'toggle-section':
            window.toggleSection(target.dataset.target);
            break;
        case 'add-new-entry':
            window.addNewEntry();
            break;
        case 'toggle-select-mode':
            window.toggleSelectMode();
            break;
        case 'bulk-enable':
            window.bulkSetEnabled(true);
            break;
        case 'bulk-disable':
            window.bulkSetEnabled(false);
            break;
        case 'bulk-delete':
            window.bulkDelete();
            break;
        case 'clear-selection':
            window.clearSelection();
            break;
        case 'exit-fullscreen-edit':
            window.exitFullscreenEdit();
            break;
        case 'copy-current-entry':
            window.copyCurrentEntry();
            break;
        case 'enter-fullscreen-edit':
            window.enterFullscreenEdit();
            break;
        case 'create-empty-preset':
            window.createEmptyPreset();
            break;
        case 'add-prompt-item':
            window.addPromptItem();
            break;
        case 'refresh-prompt-order':
            window.refreshPromptOrderJson();
            break;
        case 'add-regex-script':
            window.addRegexScript();
            break;
        case 'add-script':
            window.addScript();
            break;
        case 'refresh-raw-json':
            window.refreshRawJson();
            break;
        case 'apply-raw-json':
            window.applyRawJson();
            break;
        case 'import-overwrite':
            window.doImport('overwrite');
            break;
        case 'import-merge':
            window.doImport('merge');
            break;
        case 'close-import-modal':
            window.closeImportModal();
            break;
    }
});


// Delegated form events for migrated editor controls.
document.addEventListener('input', (event) => {
    const target = event.target instanceof Element
        ? event.target.closest('[data-input-action]')
        : null;
    if (!target) return;

    switch (target.dataset.inputAction) {
        case 'render-entry-list':
            window.renderEntryList();
            break;
        case 'sync-current-entry':
            window.syncCurrentEntry();
            break;
        case 'sync-preset':
            window.syncPreset();
            break;
        case 'sync-preset-counts':
            window.syncPreset();
            window.updateCharCounts();
            break;
        case 'trigger-preview':
            window.runTriggerPreview();
            break;
    }
});

document.addEventListener('change', (event) => {
    const target = event.target instanceof Element
        ? event.target.closest('[data-change-action]')
        : null;
    if (!target) return;

    switch (target.dataset.changeAction) {
        case 'sync-current-entry':
            window.syncCurrentEntry();
            break;
        case 'sync-preset':
            window.syncPreset();
            break;
        case 'apply-prompt-order':
            window.applyPromptOrderJson();
            break;
    }
});

document.addEventListener('focusout', (event) => {
    const target = event.target instanceof Element
        ? event.target.closest('[data-focusout-action]')
        : null;
    if (!target) return;

    if (target.dataset.focusoutAction === 'apply-raw-json') {
        window.applyRawJson();
    }
});


// File inputs use a dedicated delegated change action so the original Event
// object is preserved for the legacy import handlers.
document.addEventListener('change', (event) => {
    const target = event.target instanceof Element
        ? event.target.closest('[data-file-action]')
        : null;
    if (!target) return;

    switch (target.dataset.fileAction) {
        case 'worldbook-import':
            window.onFileChosen(event);
            break;
        case 'preset-import':
            window.onPresetFileChosen(event);
            break;
    }
});
