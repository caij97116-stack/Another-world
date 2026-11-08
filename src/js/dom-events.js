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
