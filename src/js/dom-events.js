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
        case 'undo-preset-edit':
            window.undoPresetEdit();
            break;
        case 'redo-preset-edit':
            window.redoPresetEdit();
            break;
        case 'bulk-prompt-action':
            window.bulkPromptAction(target.dataset.bulkAction);
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
        case 'link-card-resource':
            window.linkCurrentCardResource(target.dataset.kind);
            break;
        case 'unlink-card-resource':
            window.unlinkCurrentCardResource(target.dataset.kind);
            break;
        case 'export-character-resource-bundle':
            window.exportCharacterResourceBundle();
            break;
        case 'trigger-character-bundle-import':
            window.triggerCharacterBundleImport();
            break;
        case 'bundle-import-card':
            window.importStagedBundleCharacter().catch(error=>showToast(error.message||'角色卡导入失败','error'));
            break;
        case 'bundle-restore-resource':
            try{window.restoreStagedBundleResource(target.dataset.kind)}catch(error){showToast(error.message||'资源恢复失败','error')}
            break;
        case 'bundle-restore-backup':
            try{window.restoreLastBundleBackup(target.dataset.kind)}catch(error){showToast(error.message||'备份恢复失败','error')}
            break;
        case 'bundle-clear-stage':
            window.clearStagedCharacterResourceBundle();
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
        case 'duplicate-prompt-item':
            window.duplicatePromptItem(Number(target.dataset.index));
            break;
        case 'toggle-regex-disabled':
            window.toggleRegexDisabled(Number(target.dataset.index));
            break;
        case 'delete-regex-script':
            window.deleteRegexScript(Number(target.dataset.index));
            break;
        case 'duplicate-regex-script':
            window.duplicateRegexScript(Number(target.dataset.index));
            break;
        case 'move-regex-script':
            window.moveRegexScript(Number(target.dataset.index),Number(target.dataset.direction));
            break;
        case 'toggle-extension-card': {
            const card=target.closest('.regex-card,.script-card');
            if(!card)break;
            const collapsed=card.classList.toggle('is-collapsed');
            target.setAttribute('aria-expanded',String(!collapsed));
            target.textContent=collapsed?'展开':'收起';
            break;
        }
        case 'bulk-extension-action':
            window.bulkExtensionAction(target.dataset.kind,target.dataset.bulkAction);
            break;
        case 'toggle-script-disabled':
            window.toggleScriptDisabled(Number(target.dataset.index));
            break;
        case 'delete-script':
            window.deleteScript(Number(target.dataset.index));
            break;
        case 'duplicate-script':
            window.duplicateScript(Number(target.dataset.index));
            break;
        case 'toggle-script-fullscreen':
            window.toggleScriptEditorFocus(Number(target.dataset.index));
            break;
        case 'move-script':
            window.moveScript(Number(target.dataset.index),Number(target.dataset.direction));
            break;
        case 'undo':
            window.undo();
            break;
        case 'redo':
            window.redo();
            break;
        case 'open-preset-diagnostics':
            window.openPresetDiagnostics();
            break;
        case 'run-preset-diagnostics':
            window.runPresetDiagnostics();
            break;
        case 'close-preset-diagnostics':
            window.closePresetDiagnostics();
            break;
        case 'jump-preset-diagnostic':
            window.jumpToPresetDiagnostic(target.dataset.targetId, target.dataset.promptIndex);
            break;
        case 'open-worldbook-diagnostics':
            window.openWorldbookDiagnostics();
            break;
        case 'run-worldbook-diagnostics':
            window.runWorldbookDiagnostics();
            break;
        case 'close-worldbook-diagnostics':
            window.closeWorldbookDiagnostics();
            break;
        case 'jump-diagnostic-entry':
            window.jumpToDiagnosticEntry(target.dataset.uid);
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
        case 'apply-preset-import':
            window.applyStagedPresetImport();
            break;
        case 'close-preset-import-preview':
            window.closePresetImportPreview();
            break;
        case 'undo-preset-import':
            window.undoLastPresetImport();
            break;
        case 'export-preset':
            window.exportPreset();
            break;
        case 'close-preset-export-preview':
            window.closePresetExportPreview();
            break;
        case 'confirm-preset-export':
            window.confirmPresetExport();
            break;
    }
});


// Delegated form events for migrated editor controls.
document.addEventListener('input', (event) => {
    const target = event.target instanceof Element
        ? event.target.closest('[data-input-action], [data-card-field], #regexSearchInput, #scriptSearchInput, #promptSearchInput')
        : null;
    if (!target) return;

    if(target.id==='regexSearchInput'){window.applyExtensionFilters('regex');return}
    if(target.id==='scriptSearchInput'){window.applyExtensionFilters('scripts');return}
    if(target.id==='promptSearchInput'){window.applyPromptFilters();return}
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
        ? event.target.closest('[data-change-action], #regexStatusFilter, #scriptStatusFilter, #promptStatusFilter, [data-extension-select], [data-extension-select-all]')
        : null;
    if (!target) return;

    if(target.id==='regexStatusFilter'){window.applyExtensionFilters('regex');return}
    if(target.id==='scriptStatusFilter'){window.applyExtensionFilters('scripts');return}
    if(target.id==='promptStatusFilter'){window.applyPromptFilters();return}
    if(target.dataset.extensionSelectAll){window.setExtensionSelectVisible(target.dataset.extensionSelectAll,target.checked);return}
    if(target.dataset.extensionSelect){window.updateExtensionSelectionSummary(target.dataset.extensionSelect);return}
    if(target.id==='promptSelectAll'){
        window.setPromptSelectAll(target.checked);
        return;
    }
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
        case 'character-bundle-import':
            window.onCharacterBundleFileChosen(event);
            break;
    }
});

document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
    const key=String(event.key||'').toLowerCase();
    if(!['z','y'].includes(key))return;
    if(!['preset','extensions'].includes(currentPage))return;
    const target=event.target;
    if(target instanceof Element&&target.closest('input,textarea,select,[contenteditable="true"]'))return;
    event.preventDefault();
    if(key==='y'||(key==='z'&&event.shiftKey))window.redoPresetEdit();
    else window.undoPresetEdit();
});

document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('.script-code.is-fullscreen')){event.preventDefault();window.exitScriptEditorFocus()}});
