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
        case 'toggle-prompt-editor':
            window.togglePromptEditor(Number(target.dataset.index));
            break;
        case 'switch-extension-tab':
            window.switchExtensionTab(target.dataset.tab);
            break;
        case 'trigger-character-card-import':
            window.triggerCharacterCardImport();
            break;
        case 'export-character-card-json':
            window.exportCharacterCardJson();
            break;
        case 'export-character-card-png':
            window.exportCharacterCardPng();
            break;
        case 'apply-character-card-json':
            window.applyCharacterCardRawJson();
            break;
        case 'test-regex-script':
            window.testRegexScript(Number(target.dataset.index));
            break;
        case 'run-script-sandbox':
            window.runScriptSandbox(Number(target.dataset.index));
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
        case 'select-entry-card':
            if (event.target instanceof Element && event.target.closest('.entry-check, .card-btn')) return;
            window.handleEntryCardClick(target.dataset.uid, target);
            break;
        case 'move-entry':
            window.moveEntry(target.dataset.uid, Number(target.dataset.direction));
            break;
        case 'copy-entry':
            window.copyEntryByUid(target.dataset.uid);
            break;
        case 'move-prompt-item':
            window.movePromptItem(Number(target.dataset.index), Number(target.dataset.direction));
            break;
        case 'delete-prompt-item':
            window.deletePromptItem(Number(target.dataset.index));
            break;
        case 'toggle-regex-disabled':
            window.toggleRegexDisabled(Number(target.dataset.index));
            break;
        case 'delete-regex-script':
            window.deleteRegexScript(Number(target.dataset.index));
            break;
        case 'toggle-script-disabled':
            window.toggleScriptDisabled(Number(target.dataset.index));
            break;
        case 'delete-script':
            window.deleteScript(Number(target.dataset.index));
            break;
        case 'undo':
            window.undo();
            break;
        case 'redo':
            window.redo();
            break;
        case 'trigger-worldbook-import':
            window.triggerImport();
            break;
        case 'export-worldbook':
            window.exportWorldBook();
            break;
        case 'delete-current-entry':
            window.deleteCurrentEntry();
            break;
        case 'toggle-theme':
            window.toggleTheme();
            break;
        case 'clear-preset-data':
            window.clearPresetData();
            break;
        case 'trigger-preset-import':
            window.triggerPresetImport();
            break;
        case 'export-preset':
            window.exportPreset();
            break;
    }
});


// Delegated form events for migrated editor controls.
document.addEventListener('input', (event) => {
    const target = event.target instanceof Element
        ? event.target.closest('[data-input-action], [data-card-field]')
        : null;
    if (!target) return;

    if(target.matches('[data-card-field]')){
        window.updateCharacterCardField(target.dataset.cardField,target.value);
        return;
    }

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
            window.autoResizeLongPrompt(target);
            break;
        case 'update-prompt-item-field':
            window.updatePromptItemField(Number(target.dataset.index), target.dataset.field, target.value);
            break;
        case 'update-script-field':
            window.updateScriptField(Number(target.dataset.index), target.dataset.field, target.value);
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
        case 'toggle-entry-selection':
            window.toggleSelect(target.dataset.uid, target.checked);
            break;
        case 'update-prompt-item-json':
            window.updatePromptItemJson(Number(target.dataset.index), target.value);
            break;
        case 'update-prompt-item-field': {
            const value = target.dataset.valueType === 'boolean' ? target.checked : target.value;
            window.updatePromptItemField(Number(target.dataset.index), target.dataset.field, value);
            break;
        }
        case 'update-regex-placement':
            window.updateRegexPlacement(Number(target.dataset.index), target.value);
            break;
        case 'update-regex-field': {
            let value = target.value;
            if (target.dataset.valueType === 'boolean') value = target.checked;
            if (target.dataset.valueType === 'nullable-number') value = value === '' ? null : Number(value);
            window.updateRegexField(Number(target.dataset.index), target.dataset.field, value);
            break;
        }
        case 'update-script-field':
            window.updateScriptField(Number(target.dataset.index), target.dataset.field, target.value);
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
        case 'character-card-import':
            window.onCharacterCardFileChosen(event);
            break;
    }
});
