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
    }
});
