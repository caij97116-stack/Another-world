function renderFieldOverview(){
            const box = document.getElementById('fieldOverviewContainer');
            if(!box) return;
            if(!presetData){ box.innerHTML = ''; return; }
            const skip = new Set(['_editorVersion','_exportedAt','_exportIncludeDisabledRegex','_exportIncludeDisabledScripts','_exportMeta']);
            const keys = Object.keys(presetData).filter(k => !skip.has(k));
            if(keys.length === 0){
                box.innerHTML = '<div class="regex-empty">无字段</div>';
                return;
            }
            box.innerHTML = keys.map(k => {
                let val = presetData[k];
                let preview = '';
                if(val === null || val === undefined) preview = 'null';
                else if(Array.isArray(val)) preview = '数组[' + val.length + '] ' + (val.length ? JSON.stringify(val[0]).slice(0,80) + (val.length>1?', …':'') : '');
                else if(typeof val === 'object') preview = '对象{ ' + Object.keys(val).slice(0,6).join(', ') + (Object.keys(val).length>6?'…':'') + ' }';
                else {
                    preview = String(val);
                    if(preview.length > 120) preview = preview.slice(0,120) + '…';
                }
                return '<div class="field-overview-row"><span class="field-overview-key">' + escapeHtml(k) + '</span><span class="field-overview-val">' + escapeHtml(preview) + '</span></div>';
            }).join('');
        }

        function autoExpandPresetSections(){
            const rc = (presetData && getActivePresetArray('regex_scripts')) ? getActivePresetArray('regex_scripts').length : 0;
            const sc = (presetData && getActivePresetArray('scripts')) ? getActivePresetArray('scripts').length : 0;
            const secR = document.getElementById('secRegex');
            const secS = document.getElementById('secScripts');
            const secO = document.getElementById('secOverview');
            if(secR){ if(rc > 0) secR.classList.remove('collapsed'); }
            if(secS){ if(sc > 0) secS.classList.remove('collapsed'); }
            if(secO) secO.classList.remove('collapsed');
        }
