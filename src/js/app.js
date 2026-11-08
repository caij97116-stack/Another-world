// Application bootstrap: all classic scripts are loaded in dependency order from index.html.
window.addEventListener('beforeunload',()=>{if(isDirty)saveWorldBookToStorage();if(presetDirty)savePresetToStorage()});
init();
