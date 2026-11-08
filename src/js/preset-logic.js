function normalizeRegexScript(raw, index){
            const view={...(raw||{})};
            definePresetViewField(view,'id',[],'regex_'+Date.now()+'_'+index);
            definePresetViewField(view,'scriptName',['name'],'正则 '+(index+1));
            definePresetViewField(view,'findRegex',['find','pattern'],'');
            definePresetViewField(view,'replaceString',['replace','replacement'],'');
            definePresetViewField(view,'trimStrings',[],[],value=>Array.isArray(value)?value:[]);
            definePresetViewField(view,'placement',[],[1,2],value=>Array.isArray(value)?value:(value!=null?[value]:[1,2]));
            definePresetViewField(view,'disabled',[],false,value=>parseEntryBoolean(value,false));
            definePresetViewField(view,'markdownOnly',[],false,value=>parseEntryBoolean(value,false));
            definePresetViewField(view,'promptOnly',[],false,value=>parseEntryBoolean(value,false));
            definePresetViewField(view,'runOnEdit',[],true,value=>value===undefined?true:parseEntryBoolean(value,true));
            definePresetViewField(view,'substituteRegex',[],0,value=>value===undefined?0:Number(value));
            definePresetViewField(view,'minDepth',[],null);
            definePresetViewField(view,'maxDepth',[],null);
            return view;
        }

        function detectAndNormalizeRegex(){
            if(!presetData) return;
            const list = ensureRegexScripts();
            setActivePresetArray('regex_scripts',list.map((item, i) => normalizeRegexScript(item, i)));
        }

        function renderRegexList(){
            const container = document.getElementById('regexListContainer');
            const badge = document.getElementById('regexCountBadge');
            if(!container) return;
            if(!presetData){ container.innerHTML = ''; if(badge) badge.textContent = '0'; return; }

            detectAndNormalizeRegex();
            const list = getActivePresetArray('regex_scripts') || [];
            if(badge) badge.textContent = String(list.length);

            if(list.length === 0){
                container.innerHTML = '<div class="regex-empty">暂无正则脚本，点击「新建」添加</div>';
                return;
            }

            container.innerHTML = list.map((r, i) => {
                const disabled = parseEntryBoolean(r.disabled,false);
                return `
                <div class="regex-card" data-idx="${i}">
                    <div class="regex-card-header">
                        <div class="regex-card-title">${escapeHtml(r.scriptName || '未命名正则')} ${disabled ? '<span class="regex-badge off">已禁用</span>' : '<span class="regex-badge">启用</span>'}</div>
                        <div class="regex-card-actions">
                            <button class="btn btn-sm" type="button" onclick="toggleRegexDisabled(${i})">${disabled ? '启用' : '禁用'}</button>
                            <button class="btn btn-sm btn-danger" type="button" onclick="deleteRegexScript(${i})">删除</button>
                        </div>
                    </div>
                    <div class="regex-field">
                        <label>名称</label>
                        <input type="text" class="form-control" value="${escapeHtml(r.scriptName || '')}" onchange="updateRegexField(${i},'scriptName',this.value)">
                    </div>
                    <div class="regex-field">
                        <label>查找正则 (findRegex)</label>
                        <textarea class="form-control" rows="2" onchange="updateRegexField(${i},'findRegex',this.value)">${escapeHtml(r.findRegex || '')}</textarea>
                    </div>
                    <div class="regex-field">
                        <label>替换内容 (replaceString)</label>
                        <textarea class="form-control" rows="2" onchange="updateRegexField(${i},'replaceString',this.value)">${escapeHtml(r.replaceString || '')}</textarea>
                    </div>
                    <div class="form-grid" style="margin-top:4px">
                        <div class="regex-field">
                            <label>作用位置 placement</label>
                            <input type="text" class="form-control" value="${escapeHtml((r.placement||[]).join(','))}" placeholder="如 1,2" onchange="updateRegexPlacement(${i},this.value)">
                        </div>
                        <div class="regex-field">
                            <label>最小深度</label>
                            <input type="number" class="form-control" value="${r.minDepth != null ? r.minDepth : ''}" onchange="updateRegexField(${i},'minDepth',this.value===''?null:Number(this.value))">
                        </div>
                        <div class="regex-field">
                            <label>最大深度</label>
                            <input type="number" class="form-control" value="${r.maxDepth != null ? r.maxDepth : ''}" onchange="updateRegexField(${i},'maxDepth',this.value===''?null:Number(this.value))">
                        </div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:6px">
                        <label class="switch-row"><input type="checkbox" ${r.markdownOnly?'checked':''} onchange="updateRegexField(${i},'markdownOnly',this.checked)"><span>仅 Markdown</span></label>
                        <label class="switch-row"><input type="checkbox" ${r.promptOnly?'checked':''} onchange="updateRegexField(${i},'promptOnly',this.checked)"><span>仅 Prompt</span></label>
                        <label class="switch-row"><input type="checkbox" ${r.runOnEdit?'checked':''} onchange="updateRegexField(${i},'runOnEdit',this.checked)"><span>编辑时运行</span></label>
                    </div>
                </div>`;
            }).join('');
        }

        function updateRegexField(idx, key, value){
            if(!presetData || !getActivePresetArray('regex_scripts') || !getActivePresetArray('regex_scripts')[idx]) return;
            getActivePresetArray('regex_scripts')[idx][key] = value;
            if(key === 'scriptName' || key === 'disabled') renderRegexList();
            schedulePresetSave();
        }
        function updateRegexPlacement(idx, str){
            if(!presetData || !getActivePresetArray('regex_scripts') || !getActivePresetArray('regex_scripts')[idx]) return;
            const arr = String(str).split(/[,，\s]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n));
            getActivePresetArray('regex_scripts')[idx].placement = arr.length ? arr : [1, 2];
            schedulePresetSave();
        }
        function toggleRegexDisabled(idx){
            if(!presetData || !getActivePresetArray('regex_scripts') || !getActivePresetArray('regex_scripts')[idx]) return;
            getActivePresetArray('regex_scripts')[idx].disabled = !getActivePresetArray('regex_scripts')[idx].disabled;
            renderRegexList();
            schedulePresetSave();
        }
        function deleteRegexScript(idx){
            if(!presetData || !getActivePresetArray('regex_scripts')) return;
            const name = getActivePresetArray('regex_scripts')[idx]?.scriptName || '该正则';
            if(!confirm('确定删除「' + name + '」？')) return;
            getActivePresetArray('regex_scripts').splice(idx, 1);
            renderRegexList();
            schedulePresetSave();
            showToast('已删除正则');
        }
        function addRegexScript(){
            if(!presetData){ createEmptyPreset(); }
            ensureRegexScripts();
            const i = getActivePresetArray('regex_scripts').length;
            getActivePresetArray('regex_scripts').push(normalizeRegexScript({
                scriptName: '新正则 ' + (i + 1),
                findRegex: '',
                replaceString: '',
                placement: [1, 2],
                disabled: false,
                runOnEdit: true
            }, i));
            renderRegexList();
            schedulePresetSave();
            showToast('已新建正则');
            // 展开区块
            const sec = document.getElementById('secRegex');
            if(sec) sec.classList.remove('collapsed');
        }

        
        // ========== 脚本管理（酒馆助手等） ==========
        function ensureScripts(){
            return ensurePresetArrayAlias('scripts',[
                ['scripts'],['tavern_helper_scripts'],['tavernhelper_scripts'],['tavernHelperScripts'],
                ['extensions','scripts'],['extensions','tavern_helper_scripts'],
                ['tavernhelper','scripts'],['TavernHelper','scripts'],['mjs_scripts']
            ]);
        }

        function normalizeScript(raw, index){
            const view={...(raw||{})};
            definePresetViewField(view,'id',[],'script_'+Date.now()+'_'+index);
            definePresetViewField(view,'name',['scriptName','title'],'脚本 '+(index+1));
            definePresetViewField(view,'code',['content','script','js','value'],'',value=>typeof value==='string'?value:String(value||''));
            definePresetViewField(view,'disabled',[],false,value=>parseEntryBoolean(value,false));
            definePresetViewField(view,'type',['kind'],'js');
            definePresetViewField(view,'trigger',['event'],'');
            return view;
        }

        function detectAndNormalizeScripts(){
            if(!presetData) return;
            const list = ensureScripts();
            setActivePresetArray('scripts',list.map((item, i) => {
                const n = normalizeScript(item, i);
                // 合并回原始未知键（浅拷贝保留）
                const known = new Set(['id','name','scriptName','title','code','content','script','js','value','disabled','type','kind','trigger','event']);
                Object.keys(item || {}).forEach(k => {
                    if(!known.has(k) && n[k] === undefined) n[k] = item[k];
                });
                return n;
            }));
        }

        function renderScriptList(){
            const container = document.getElementById('scriptListContainer');
            const badge = document.getElementById('scriptCountBadge');
            if(!container) return;
            if(!presetData){ container.innerHTML = ''; if(badge) badge.textContent = '0'; return; }

            detectAndNormalizeScripts();
            const list = getActivePresetArray('scripts') || [];
            if(badge) badge.textContent = String(list.length);

            if(list.length === 0){
                container.innerHTML = '<div class="regex-empty">暂无脚本，点击「新建」添加</div>';
                return;
            }

            container.innerHTML = list.map((s, i) => {
                const disabled = parseEntryBoolean(s.disabled,false);
                return `
                <div class="script-card" data-idx="${i}">
                    <div class="script-card-header">
                        <div class="script-card-title">${escapeHtml(s.name || '未命名脚本')} ${disabled ? '<span class="regex-badge off">已禁用</span>' : '<span class="regex-badge">启用</span>'}</div>
                        <div class="regex-card-actions">
                            <button class="btn btn-sm" type="button" onclick="toggleScriptDisabled(${i})">${disabled ? '启用' : '禁用'}</button>
                            <button class="btn btn-sm btn-danger" type="button" onclick="deleteScript(${i})">删除</button>
                        </div>
                    </div>
                    <div class="regex-field">
                        <label>名称</label>
                        <input type="text" class="form-control" value="${escapeHtml(s.name || '')}" onchange="updateScriptField(${i},'name',this.value)">
                    </div>
                    <div class="regex-field">
                        <label>类型 / 触发（可选）</label>
                        <div class="form-grid">
                            <input type="text" class="form-control" value="${escapeHtml(s.type || 'js')}" placeholder="类型 js" onchange="updateScriptField(${i},'type',this.value)">
                            <input type="text" class="form-control" value="${escapeHtml(s.trigger || '')}" placeholder="触发条件/事件" onchange="updateScriptField(${i},'trigger',this.value)">
                        </div>
                    </div>
                    <div class="regex-field">
                        <label>脚本内容</label>
                        <textarea class="form-control script-code" rows="8" onchange="updateScriptField(${i},'code',this.value)">${escapeHtml(s.code || '')}</textarea>
                    </div>
                </div>`;
            }).join('');
        }

        function updateScriptField(idx, key, value){
            if(!presetData || !getActivePresetArray('scripts') || !getActivePresetArray('scripts')[idx]) return;
            getActivePresetArray('scripts')[idx][key] = value;
            if(key === 'name' || key === 'disabled') renderScriptList();
            schedulePresetSave();
        }
        function toggleScriptDisabled(idx){
            if(!presetData || !getActivePresetArray('scripts') || !getActivePresetArray('scripts')[idx]) return;
            getActivePresetArray('scripts')[idx].disabled = !getActivePresetArray('scripts')[idx].disabled;
            renderScriptList();
            schedulePresetSave();
        }
        function deleteScript(idx){
            if(!presetData || !getActivePresetArray('scripts')) return;
            const name = getActivePresetArray('scripts')[idx]?.name || '该脚本';
            if(!confirm('确定删除「' + name + '」？')) return;
            getActivePresetArray('scripts').splice(idx, 1);
            renderScriptList();
            schedulePresetSave();
            showToast('已删除脚本');
        }
        function addScript(){
            if(!presetData) createEmptyPreset();
            ensureScripts();
            const i = getActivePresetArray('scripts').length;
            getActivePresetArray('scripts').push(normalizeScript({
                name: '新脚本 ' + (i + 1),
                code: '// 在此编写脚本\n',
                type: 'js',
                disabled: false
            }, i));
            renderScriptList();
            schedulePresetSave();
            showToast('已新建脚本');
            const sec = document.getElementById('secScripts');
            if(sec) sec.classList.remove('collapsed');
        }
