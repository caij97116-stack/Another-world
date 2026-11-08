        let currentPage='worldbook';
        let worldBookData={entries:{}};
        let activeUid=null;
        let exportVersion=1;
        let saveTimer=null;
        let isDirty=false;
        let selectMode=false;
        let selectedUids=new Set();
        let pendingImportData=null;
        let isFullscreen=false;
        let historyStack=[];
        let historyIndex=-1;
        const MAX_HISTORY=40;
        const WB_STORAGE_KEY='tavern_worldbook_editor_data';
        const WB_VERSION_KEY='tavern_worldbook_editor_version';

        // 预设状态
        let presetData=null;          // 完整原始对象，保留未知字段
        let presetVersion=1;
        let presetSaveTimer=null;
        let presetDirty=false;
        const PRESET_STORAGE_KEY='tavern_preset_editor_data';
        const PRESET_VERSION_KEY='tavern_preset_editor_version';
        let presetEnvelope=null;
        const PRESET_ENVELOPE_STORAGE_KEY='tavern_preset_editor_envelope';
        const PRESET_ARRAY_PATHS_KEY='tavern_preset_editor_array_paths';
        let presetArrayPaths={};

        function switchPage(page){
            if(page===currentPage)return;
            currentPage=page;
            document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
            document.getElementById('page-'+page).classList.add('active');
            document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.page===page));
            updateToolbar();
            const toggleBtn=document.getElementById('btnSidebarToggle');
            if(page==='worldbook'){
                if(window.innerWidth<=860)toggleBtn.style.display='flex';
            }else{
                toggleBtn.style.display='none';
                closeSidebar();
                exitFullscreenEdit();
                renderPresetUI();
            }
        }

        function updateToolbar(){
            const titleEl=document.getElementById('toolbarTitle');
            const iconEl=document.getElementById('brandIcon');
            const badgeEl=document.getElementById('versionBadge');
            const actionsEl=document.getElementById('toolbarActions');
            if(currentPage==='worldbook'){
                titleEl.textContent='世界书编辑器';
                iconEl.textContent='📘';
                badgeEl.textContent='v'+exportVersion;
                actionsEl.innerHTML=`
                    <button class="btn btn-ghost" onclick="undo()" id="btnUndo" title="撤销" ${historyIndex<=0?'disabled':''}>↶</button>
                    <button class="btn btn-ghost" onclick="redo()" id="btnRedo" title="重做" ${historyIndex>=historyStack.length-1?'disabled':''}>↷</button>
                    <button class="btn" onclick="triggerImport()">导入</button>
                    <button class="btn btn-primary" onclick="exportWorldBook()">导出</button>
                    <button class="btn btn-danger" onclick="deleteCurrentEntry()" id="btnDelete" style="display:none">删除</button>`;
                if(activeUid&&worldBookData.entries[activeUid]){
                    const btn=document.getElementById('btnDelete');
                    if(btn)btn.style.display='inline-flex';
                }
            }else{
                titleEl.textContent='预设编辑器';
                iconEl.textContent='⚙️';
                badgeEl.textContent='v'+presetVersion;
                actionsEl.innerHTML=`
                    <button class="btn btn-ghost" onclick="toggleTheme()" title="切换主题" id="btnTheme">${document.body.classList.contains('dark-theme')?'☀️':'🌙'}</button>
                    <button class="btn btn-ghost" onclick="clearPresetData()">清空</button>
                    <button class="btn" onclick="triggerPresetImport()">导入</button>
                    <button class="btn btn-primary" onclick="exportPreset()">导出</button>`;
            }
        }

        
        const THEME_KEY = 'tavern_editor_theme';
        function toggleTheme(){
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
            const meta = document.querySelector('meta[name="theme-color"]');
            if(meta) meta.setAttribute('content', isDark ? '#0c1929' : '#e0f2fe');
            updateToolbar();
            showToast(isDark ? '已切换深色模式' : '已切换浅色模式');
        }
        function loadTheme(){
            const saved = localStorage.getItem(THEME_KEY);
            if(saved === 'dark'){
                document.body.classList.add('dark-theme');
                const meta = document.querySelector('meta[name="theme-color"]');
                if(meta) meta.setAttribute('content', '#0c1929');
            }
        }

        function init(){
            loadTheme();
            loadWorldBookFromStorage();
            loadPresetFromStorage();
            pushHistory();
            renderEntryList();
            loadActiveEntry();
            updateToolbar();
            updateEntryCount();
            updateFullscreenBtn();
            window.addEventListener('resize',()=>{
                const toggleBtn=document.getElementById('btnSidebarToggle');
                if(currentPage==='worldbook'&&window.innerWidth<=860)toggleBtn.style.display='flex';
                else{toggleBtn.style.display='none';closeSidebar()}
                updateFullscreenBtn();
            });
            if(window.innerWidth<=860)document.getElementById('btnSidebarToggle').style.display='flex';
        }

        // ========== 世界书历史 ==========
        function pushHistory(){
            if(historyIndex<historyStack.length-1)historyStack=historyStack.slice(0,historyIndex+1);
            const snapshot=JSON.stringify(worldBookData);
            if(historyStack.length&&historyStack[historyStack.length-1]===snapshot)return;
            historyStack.push(snapshot);
            if(historyStack.length>MAX_HISTORY)historyStack.shift();
            historyIndex=historyStack.length-1;
            updateToolbar();
        }
        function undo(){
            if(historyIndex<=0)return;
            historyIndex--;
            worldBookData=JSON.parse(historyStack[historyIndex]);
            if(activeUid&&!worldBookData.entries[activeUid]){const keys=Object.keys(worldBookData.entries);activeUid=keys[0]||null}
            selectedUids.clear();
            renderEntryList();loadActiveEntry();scheduleAutoSave();updateToolbar();
            showToast('已撤销');
        }
        function redo(){
            if(historyIndex>=historyStack.length-1)return;
            historyIndex++;
            worldBookData=JSON.parse(historyStack[historyIndex]);
            if(activeUid&&!worldBookData.entries[activeUid]){const keys=Object.keys(worldBookData.entries);activeUid=keys[0]||null}
            selectedUids.clear();
            renderEntryList();loadActiveEntry();scheduleAutoSave();updateToolbar();
            showToast('已重做');
        }

        // ========== 世界书存储 ==========
        function loadWorldBookFromStorage(){
            try{
                const raw=localStorage.getItem(WB_STORAGE_KEY);
                const ver=localStorage.getItem(WB_VERSION_KEY);
                if(ver)exportVersion=parseInt(ver,10)||1;
                if(raw){
                    const parsed=JSON.parse(raw);
                    if(parsed&&parsed.entries){
                        worldBookData=parsed;
                        Object.keys(worldBookData.entries).forEach(uid=>{worldBookData.entries[uid]=sanitizeEntry(worldBookData.entries[uid],uid)});
                        const keys=Object.keys(worldBookData.entries);
                        if(keys.length>0&&!activeUid)activeUid=keys[0];
                        showToast('已恢复世界书上次内容','success');
                    }
                }
            }catch(e){console.warn(e)}
        }
        function scheduleAutoSave(){
            isDirty=true;
            const dot=document.getElementById('saveDot'),status=document.getElementById('saveStatus');
            if(dot){dot.classList.add('saving');status.textContent='保存中...'}
            clearTimeout(saveTimer);
            saveTimer=setTimeout(saveWorldBookToStorage,600);
        }
        function saveWorldBookToStorage(){
            try{
                localStorage.setItem(WB_STORAGE_KEY,JSON.stringify(worldBookData));
                localStorage.setItem(WB_VERSION_KEY,String(exportVersion));
                isDirty=false;
                const dot=document.getElementById('saveDot'),status=document.getElementById('saveStatus');
                if(dot){dot.classList.remove('saving');status.textContent='已自动保存'}
            }catch(e){showToast('自动保存失败','error')}
        }

        function toggleSidebar(){
            const sidebar=document.getElementById('sidebar'),overlay=document.getElementById('sidebarOverlay');
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('show',sidebar.classList.contains('mobile-open'));
        }
        function closeSidebar(){
            document.getElementById('sidebar').classList.remove('mobile-open');
            document.getElementById('sidebarOverlay').classList.remove('show');
        }

        // ========== 世界书导入导出 ==========
        function makeUniqueEntryUid(preferred){
            const entries=worldBookData&&worldBookData.entries?worldBookData.entries:{};
            const base=preferred!==undefined&&preferred!==null&&String(preferred)!==''?String(preferred):String(Date.now());
            let uid=base,suffix=1;
            while(Object.prototype.hasOwnProperty.call(entries,uid)){uid=base+'_'+suffix++;}
            return uid;
        }
        function triggerImport(){document.getElementById('fileInput').click()}
        function onFileChosen(event){
            const file=event.target.files[0];if(!file)return;
            const reader=new FileReader();
            reader.onload=function(e){
                try{
                    const parsed=JSON.parse(e.target.result);
                    if(!parsed||typeof parsed!=='object')throw new Error('文件顶层必须是对象或条目数组');
                    let normalizedEntries={};
                    const appendArrayEntry=(item,index)=>{
                        if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('第 '+(index+1)+' 个条目不是有效对象');
                        const preferred=(item.uid!==undefined&&item.uid!==null&&String(item.uid)!=='')?String(item.uid):String(index);
                        let uid=preferred,suffix=1;
                        while(Object.prototype.hasOwnProperty.call(normalizedEntries,uid))uid=preferred+'_import_'+suffix++;
                        normalizedEntries[uid]=item;
                    };
                    if(parsed.entries&&typeof parsed.entries==='object'&&!Array.isArray(parsed.entries))normalizedEntries=parsed.entries;
                    else if(Array.isArray(parsed.entries))parsed.entries.forEach(appendArrayEntry);
                    else if(Array.isArray(parsed))parsed.forEach(appendArrayEntry);
                    else if(Object.values(parsed).some(v=>v&&typeof v==='object'&&('key' in v||'content' in v||'comment' in v)))normalizedEntries=parsed;
                    else throw new Error('无法识别世界书结构');
                    const orderedUids=Object.keys(normalizedEntries);
                    orderedUids.forEach((uid,index)=>{
                        const sourceEntry=normalizedEntries[uid];
                        if(!sourceEntry||typeof sourceEntry!=='object'||Array.isArray(sourceEntry))throw new Error('条目 '+uid+' 不是有效对象');
                        const entry=sanitizeEntry(sourceEntry,uid);
                        if(sourceEntry.order===undefined||sourceEntry.order===null||sourceEntry.order==='')entry.order=(index+1)*10;
                        normalizedEntries[uid]=entry;
                    });
                    pendingImportData={source:parsed,entries:normalizedEntries,version:parsed._editorVersion?parseInt(parsed._editorVersion,10):null};
                    if(Object.keys(worldBookData.entries).length===0)doImport('overwrite');
                    else document.getElementById('importModal').classList.add('show');
                }catch(err){console.error(err);showToast('导入失败：'+err.message,'error')}
            };
            reader.readAsText(file);event.target.value='';
        }
        function closeImportModal(){document.getElementById('importModal').classList.remove('show');pendingImportData=null}
        function doImport(mode){
            if(!pendingImportData)return;
            pushHistory();
            const previousActiveUid=activeUid;
            const incoming=pendingImportData.entries;
            if(mode==='overwrite'){
                const sourceEnvelope=pendingImportData.source&&typeof pendingImportData.source==='object'&&!Array.isArray(pendingImportData.source)?pendingImportData.source:{};
                worldBookData={...sourceEnvelope,entries:incoming};
                if(pendingImportData.version)exportVersion=pendingImportData.version;
            }else{
                let added=0,remapped=0;
                Object.keys(incoming).forEach(uid=>{
                    let targetUid=uid;
                    if(Object.prototype.hasOwnProperty.call(worldBookData.entries,targetUid)){
                        targetUid=makeUniqueEntryUid(uid);
                        remapped++;
                    }
                    const entry={...incoming[uid],uid:targetUid};
                    worldBookData.entries[targetUid]=sanitizeEntry(entry,targetUid);
                    added++;
                });
                pendingImportData.mergeStats={added,remapped};
            }
            const keys=Object.keys(worldBookData.entries);
            activeUid=mode!=='overwrite'&&previousActiveUid&&worldBookData.entries[String(previousActiveUid)]?String(previousActiveUid):(keys[0]||null);
            selectedUids.clear();selectMode=false;updateSelectModeUI();
            renderEntryList();loadActiveEntry();scheduleAutoSave();updateEntryCount();updateToolbar();
            const stats=pendingImportData.mergeStats;
            closeImportModal();
            const message=mode==='overwrite'?'覆盖导入 '+keys.length+' 个条目':(stats.remapped?'合并完成：新增 '+stats.added+' 条，重复 UID 已重新分配 '+stats.remapped+' 条':'合并完成：新增 '+stats.added+' 条');
            showToast(message,'success');
        }

        // 列表字段只在 UI 层拆分；数据层保留导入时的原始类型（字符串仍是字符串，数组仍是数组）。
        function listFieldItems(value){
            if(Array.isArray(value))return value.map(v=>String(v));
            if(typeof value==='string')return value.split(/[,，]/).map(v=>v.trim()).filter(Boolean);
            return [];
        }
        function listFieldText(value){return listFieldItems(value).join(', ')}
        function writeListPreservingType(previousValue,text){
            const items=String(text??'').split(/[,，]/).map(v=>v.trim()).filter(Boolean);
            return typeof previousValue==='string'?items.join(', '):items;
        }
        function writeNumberPreservingType(previousValue,text,fallback){
            const parsed=Number(text);
            const value=Number.isFinite(parsed)?parsed:fallback;
            return typeof previousValue==='string'?String(value):value;
        }
        function parseEntryBoolean(value,fallback=false){
            if(value===undefined||value===null)return fallback;
            if(typeof value==='string'){
                const normalized=value.trim().toLowerCase();
                if(['false','0','no','off',''].includes(normalized))return false;
                if(['true','1','yes','on'].includes(normalized))return true;
            }
            return Boolean(value);
        }
        function getEntryEnabled(entry){
            if(Object.prototype.hasOwnProperty.call(entry,'disable'))return !parseEntryBoolean(entry.disable,false);
            if(Object.prototype.hasOwnProperty.call(entry,'enabled'))return parseEntryBoolean(entry.enabled,true);
            return true;
        }
        function setEntryEnabled(entry,enabled){
            const hasDisable=Object.prototype.hasOwnProperty.call(entry,'disable');
            const hasEnabled=Object.prototype.hasOwnProperty.call(entry,'enabled');
            if(hasDisable)entry.disable=!enabled;
            if(hasEnabled)entry.enabled=enabled;
            if(!hasDisable&&!hasEnabled)entry.enabled=enabled;
        }
        function sanitizeEntry(raw,uid){
            raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
            const enabled=getEntryEnabled(raw);
            // 始终以 entries 的键为准，避免 entry.uid 与键不一致导致点击后“消失”
            const canonicalUid = (uid !== undefined && uid !== null && uid !== '') ? String(uid) : String(raw.uid !== undefined && raw.uid !== null ? raw.uid : Date.now());
            // 以原始条目为底稿，只覆盖编辑器明确管理的字段；未知字段/嵌套扩展原样保留。
            const normalized={...raw,uid:canonicalUid,comment:raw.comment||raw.title||'未命名条目',content:raw.content||'',order:raw.order!==undefined?raw.order:100,position:raw.position!==undefined?raw.position:0,probability:raw.probability!==undefined?raw.probability:100};
            if(Object.prototype.hasOwnProperty.call(raw,'constant'))normalized.constant=parseEntryBoolean(raw.constant);
            if(Object.prototype.hasOwnProperty.call(raw,'selective'))normalized.selective=parseEntryBoolean(raw.selective);
            if(Object.prototype.hasOwnProperty.call(raw,'disable'))normalized.disable=!enabled;
            if(Object.prototype.hasOwnProperty.call(raw,'enabled'))normalized.enabled=enabled;
            return normalized;
        }
        function exportWorldBook(){
            if(!worldBookData.entries||Object.keys(worldBookData.entries).length===0){showToast('当前没有可导出的条目','error');return}
            exportVersion+=1;updateToolbar();localStorage.setItem(WB_VERSION_KEY,String(exportVersion));
            if(activeUid)syncCurrentEntry(true);
            const exportData={...worldBookData,entries:worldBookData.entries,_editorVersion:exportVersion,_exportedAt:new Date().toISOString()};
            const blob=new Blob([JSON.stringify(exportData,null,2)],{type:'application/json;charset=utf-8'});
            const url=URL.createObjectURL(blob);const a=document.createElement('a');
            a.href=url;a.download=`WorldBook_v${exportVersion}.json`;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
            scheduleAutoSave();showToast(`已导出 WorldBook_v${exportVersion}.json`,'success');
        }

        // ========== 多选批量 ==========
        function toggleSelectMode(){selectMode=!selectMode;if(!selectMode)selectedUids.clear();updateSelectModeUI();renderEntryList()}
        function updateSelectModeUI(){
            const btn=document.getElementById('btnSelectMode'),bar=document.getElementById('bulkBar');
            if(btn)btn.textContent=selectMode?'完成':'多选';
            if(bar){bar.classList.toggle('show',selectMode&&selectedUids.size>0);document.getElementById('bulkCount').textContent=`已选 ${selectedUids.size}`}
        }
        function toggleSelect(uid,checked){
            uid=String(uid);
            if(checked)selectedUids.add(uid);else selectedUids.delete(uid);
            updateSelectModeUI();
            const card=Array.from(document.querySelectorAll('.entry-card')).find(item=>item.dataset.uid===uid);
            if(card)card.classList.toggle('selected',checked);
        }
        function clearSelection(){selectedUids.clear();selectMode=false;updateSelectModeUI();renderEntryList()}
        function bulkSetEnabled(enabled){
            if(selectedUids.size===0)return;pushHistory();
            selectedUids.forEach(uid=>{if(worldBookData.entries[uid])setEntryEnabled(worldBookData.entries[uid],enabled)});
            renderEntryList();loadActiveEntry();scheduleAutoSave();showToast(`已${enabled?'启用':'禁用'} ${selectedUids.size} 个条目`);clearSelection();
        }
        function bulkDelete(){
            if(selectedUids.size===0)return;if(!confirm(`确定删除选中的 ${selectedUids.size} 个条目吗？`))return;
            pushHistory();selectedUids.forEach(uid=>{delete worldBookData.entries[uid]});
            if(activeUid&&selectedUids.has(String(activeUid))){const keys=Object.keys(worldBookData.entries);activeUid=keys[0]||null}
            clearSelection();renderEntryList();loadActiveEntry();scheduleAutoSave();updateEntryCount();showToast('已批量删除');
        }

        // ========== 全屏 ==========
        function updateFullscreenBtn(){const btn=document.getElementById('btnFullscreen');if(!btn)return;btn.style.display=(window.innerWidth<=860&&activeUid)?'inline-flex':'none'}
        function enterFullscreenEdit(){if(!activeUid)return;isFullscreen=true;document.getElementById('wbContainer').classList.add('fullscreen-mode');document.getElementById('fsTitle').textContent=worldBookData.entries[activeUid]?.comment||'编辑条目';closeSidebar()}
        function exitFullscreenEdit(){isFullscreen=false;document.getElementById('wbContainer').classList.remove('fullscreen-mode')}

        // ========== 世界书列表与编辑 ==========
        function renderEntryList(){
            const container=document.getElementById('entryListContainer');
            const searchVal=(document.getElementById('searchInput').value||'').toLowerCase().trim();
            container.innerHTML='';
            const entries=Object.entries(worldBookData.entries||{}).map(([k,v])=>{
                // 强制 uid 与键一致
                if(v && String(v.uid)!==String(k)) v.uid=String(k);
                return v;
            });
            entries.sort((a,b)=>(Number(a.order)||100)-(Number(b.order)||100));
            if(entries.length===0){container.innerHTML=`<div style="text-align:center;color:var(--text-muted);padding:18px 10px;font-size:.78rem">暂无条目<br>点击上方按钮新建</div>`;updateEntryCount();return}
            let visibleCount=0;
            entries.forEach(entry=>{
                const uid=String(entry.uid);
                const title=entry.comment||'未命名条目',keys=listFieldText(entry.key),tags=listFieldText(entry.tags);
                if(searchVal&&!title.toLowerCase().includes(searchVal)&&!keys.toLowerCase().includes(searchVal)&&!tags.toLowerCase().includes(searchVal)&&!(entry.content||'').toLowerCase().includes(searchVal))return;
                visibleCount++;
                const isEnabled=getEntryEnabled(entry),isSelected=selectedUids.has(uid);
                const card=document.createElement('div');
                card.className=`entry-card ${String(activeUid)===uid?'active':''} ${!isEnabled?'disabled-entry':''} ${isSelected?'selected':''}`;
                card.dataset.uid=uid;
                card.onclick=e=>{
                    if(e.target.classList.contains('entry-check')||e.target.closest('.card-btn'))return;
                    if(selectMode){const check=card.querySelector('.entry-check');check.checked=!check.checked;toggleSelect(uid,check.checked);return}
                    activeUid=uid;renderEntryList();loadActiveEntry();closeSidebar();updateFullscreenBtn();
                };
                const tagsHtml=listFieldItems(entry.tags).map(t=>`<span class="tag-chip">${escapeHtml(t)}</span>`).join('');
                card.innerHTML=`${selectMode?`<input type="checkbox" class="entry-check" ${isSelected?'checked':''} onchange="toggleSelect('${entry.uid}',this.checked)">`:''}<div class="entry-card-body"><div class="entry-status ${isEnabled?'':'off'}"></div><div class="entry-card-title">${escapeHtml(title)}</div><div class="entry-card-keys">${escapeHtml(keys||'无关键词')}</div>${tagsHtml?`<div class="entry-card-tags">${tagsHtml}</div>`:''}${!selectMode?`<div class="entry-card-actions"><button class="card-btn" onclick="event.stopPropagation();moveEntry('${entry.uid}',-1)">↑</button><button class="card-btn" onclick="event.stopPropagation();moveEntry('${entry.uid}',1)">↓</button><button class="card-btn" onclick="event.stopPropagation();copyEntryByUid('${entry.uid}')">复制</button></div>`:''}</div>`;
                container.appendChild(card);
            });
            if(visibleCount===0&&searchVal)container.innerHTML=`<div style="text-align:center;color:var(--text-muted);padding:18px 10px;font-size:.78rem">没有匹配的条目</div>`;
            updateEntryCount();updateSelectModeUI();
        }
        function updateEntryCount(){const count=Object.keys(worldBookData.entries||{}).length;const el=document.getElementById('entryCount');if(el)el.textContent=`${count} 条目`}
        function moveEntry(uid,direction){
            pushHistory();
            const entries=Object.values(worldBookData.entries);entries.sort((a,b)=>(Number(a.order)||100)-(Number(b.order)||100));
            const idx=entries.findIndex(e=>e.uid==uid);if(idx<0)return;
            const newIdx=idx+direction;if(newIdx<0||newIdx>=entries.length)return;
            const tempOrder=entries[idx].order;entries[idx].order=entries[newIdx].order;entries[newIdx].order=tempOrder;
            if(entries[idx].order===entries[newIdx].order)entries[idx].order=(Number(entries[idx].order)||100)+direction*10;
            renderEntryList();scheduleAutoSave();
        }
        function loadActiveEntry(){
            const form=document.getElementById('editorForm'),empty=document.getElementById('editorEmpty'),preview=document.getElementById('previewPanel'),btnDelete=document.getElementById('btnDelete');
            const lookupUid=activeUid!=null?String(activeUid):null;
            if(!lookupUid||!worldBookData.entries[lookupUid]){form.style.display='none';empty.style.display='flex';if(preview)preview.style.display='none';if(btnDelete)btnDelete.style.display='none';updateFullscreenBtn();return}
            const entry=worldBookData.entries[lookupUid];
            activeUid=lookupUid;
            form.style.display='block';empty.style.display='none';if(preview)preview.style.display='block';if(btnDelete)btnDelete.style.display='inline-flex';
            document.getElementById('field_enabled').checked=getEntryEnabled(entry);
            document.getElementById('field_comment').value=entry.comment||'';
            document.getElementById('field_tags').value=listFieldText(entry.tags);
            document.getElementById('field_key').value=listFieldText(entry.key);
            document.getElementById('field_keysecondary').value=listFieldText(entry.keysecondary);
            document.getElementById('field_content').value=entry.content||'';
            document.getElementById('field_position').value=entry.position!==undefined?entry.position:0;
            document.getElementById('field_order').value=entry.order!==undefined?entry.order:100;
            document.getElementById('field_depth').value=entry.scanDepth!==undefined?entry.scanDepth:(entry.depth!==undefined?entry.depth:4);
            document.getElementById('field_probability').value=entry.probability!==undefined?entry.probability:100;
            document.getElementById('field_constant').checked=parseEntryBoolean(entry.constant);
            document.getElementById('field_selective').checked=parseEntryBoolean(entry.selective);
            if(isFullscreen)document.getElementById('fsTitle').textContent=entry.comment||'编辑条目';
            updateFullscreenBtn();runTriggerPreview();
        }
        function syncCurrentEntry(skipRender){
            if(!activeUid||!worldBookData.entries[String(activeUid)])return;
            const entry=worldBookData.entries[String(activeUid)],isEnabled=document.getElementById('field_enabled').checked;
            setEntryEnabled(entry,isEnabled);
            entry.comment=document.getElementById('field_comment').value;
            entry.tags=writeListPreservingType(entry.tags,document.getElementById('field_tags').value);
            entry.key=writeListPreservingType(entry.key,document.getElementById('field_key').value);
            entry.keysecondary=writeListPreservingType(entry.keysecondary,document.getElementById('field_keysecondary').value);
            entry.content=document.getElementById('field_content').value;
            entry.position=writeNumberPreservingType(entry.position,document.getElementById('field_position').value,0);
            entry.order=writeNumberPreservingType(entry.order,document.getElementById('field_order').value,100);
            const depthValue=document.getElementById('field_depth').value;
            if(Object.prototype.hasOwnProperty.call(entry,'scanDepth'))entry.scanDepth=writeNumberPreservingType(entry.scanDepth,depthValue,4);
            if(Object.prototype.hasOwnProperty.call(entry,'depth'))entry.depth=writeNumberPreservingType(entry.depth,depthValue,4);
            if(!Object.prototype.hasOwnProperty.call(entry,'scanDepth')&&!Object.prototype.hasOwnProperty.call(entry,'depth'))entry.scanDepth=writeNumberPreservingType(undefined,depthValue,4);
            const probabilityValue=Math.min(100,Math.max(0,Number(document.getElementById('field_probability').value)||100));
            entry.probability=typeof entry.probability==='string'?String(probabilityValue):probabilityValue;
            entry.constant=document.getElementById('field_constant').checked;
            entry.selective=document.getElementById('field_selective').checked;
            if(!skipRender)renderEntryList();scheduleAutoSave();runTriggerPreview();
        }
        function addNewEntry(){
            pushHistory();
            const newUid=makeUniqueEntryUid(Date.now().toString());
            // 计算插入位置：当前选中条目后面
            let newOrder = 100;
            const entries = Object.values(worldBookData.entries || {});
            entries.sort((a,b)=>(Number(a.order)||100)-(Number(b.order)||100));
            if(activeUid && worldBookData.entries[activeUid]){
                const idx = entries.findIndex(e => e.uid == activeUid);
                if(idx >= 0){
                    const cur = Number(entries[idx].order) || 100;
                    if(idx < entries.length - 1){
                        const next = Number(entries[idx+1].order) || (cur + 10);
                        // 插在当前与下一条之间
                        newOrder = (cur + next) / 2;
                        // 若间距过小，拉开后面的 order
                        if(next - cur < 2){
                            for(let i = idx + 1; i < entries.length; i++){
                                entries[i].order = (Number(entries[i].order) || 100) + 10;
                            }
                            newOrder = cur + 5;
                        }
                    } else {
                        newOrder = cur + 10;
                    }
                }
            } else if(entries.length > 0){
                const last = Number(entries[entries.length-1].order) || 100;
                newOrder = last + 10;
            }
            worldBookData.entries[newUid]=sanitizeEntry({uid:newUid,comment:'新条目',key:[],tags:[],content:'',order:newOrder,position:0},newUid);
            activeUid=newUid;
            renderEntryList();loadActiveEntry();scheduleAutoSave();updateEntryCount();
            showToast('已在当前位置后新建条目');
            setTimeout(()=>{const input=document.getElementById('field_comment');if(input){input.focus();input.select()}},50);
        }
        function copyCurrentEntry(){if(activeUid)copyEntryByUid(activeUid)}
        function copyEntryByUid(uid){
            const src=worldBookData.entries[uid];if(!src)return;pushHistory();
            const newUid=makeUniqueEntryUid(Date.now().toString());const copy=JSON.parse(JSON.stringify(src));
            copy.uid=newUid;copy.comment=(copy.comment||'未命名')+' (副本)';copy.order=(Number(copy.order)||100)+5;
            worldBookData.entries[newUid]=sanitizeEntry(copy,newUid);activeUid=newUid;
            renderEntryList();loadActiveEntry();scheduleAutoSave();updateEntryCount();showToast('已复制条目');
        }
        function deleteCurrentEntry(){
            if(!activeUid||!worldBookData.entries[activeUid])return;
            const name=worldBookData.entries[activeUid].comment||'该条目';
            if(!confirm(`确定删除「${name}」吗？`))return;pushHistory();
            delete worldBookData.entries[activeUid];
            const keys=Object.keys(worldBookData.entries);activeUid=keys.length>0?keys[0]:null;
            renderEntryList();loadActiveEntry();scheduleAutoSave();updateEntryCount();showToast('已删除条目');
        }
        function runTriggerPreview(){
            const text=(document.getElementById('previewText')?.value||'').toLowerCase();
            const resultEl=document.getElementById('previewResult');if(!resultEl)return;
            if(!text.trim()){resultEl.innerHTML='<div class="preview-miss">输入文本后显示匹配结果</div>';return}
            const hits=[];
            Object.values(worldBookData.entries||{}).forEach(entry=>{
                if(!getEntryEnabled(entry))return;
                if(parseEntryBoolean(entry.constant,false)){hits.push({entry,reason:'常驻'});return}
                const keys=listFieldItems(entry.key),keysec=listFieldItems(entry.keysecondary);
                const hasKey=keys.length===0||keys.some(k=>k&&text.includes(k.toLowerCase()));
                const hasExclude=keysec.some(k=>k&&text.includes(k.toLowerCase()));
                if(hasKey&&!hasExclude)hits.push({entry,reason:keys.filter(k=>k&&text.includes(k.toLowerCase())).join(', ')||'匹配'});
            });
            hits.sort((a,b)=>(Number(a.entry.order)||100)-(Number(b.entry.order)||100));
            if(hits.length===0)resultEl.innerHTML='<div class="preview-miss">当前文本没有触发任何启用中的条目</div>';
            else resultEl.innerHTML=hits.map(h=>`<div class="preview-hit"><strong>${escapeHtml(h.entry.comment||'未命名')}</strong><span style="opacity:.75;font-size:.72rem"> · ${escapeHtml(h.reason)}</span></div>`).join('');
        }

        // ========== 预设功能 ==========
        function isPresetPayloadObject(value){
            if(!value||typeof value!=='object'||Array.isArray(value))return false;
            const signatures=['prompts','prompt_order','temperature','top_p','top_k','max_tokens','max_length','main_prompt','system_prompt','jailbreak_prompt','stop_sequence','stop_sequences','regex_scripts','regexScripts','regex','regexes','scripts','tavern_helper_scripts','tavernhelper_scripts','tavernHelperScripts','mjs_scripts','repetition_penalty','rep_pen'];
            if(signatures.some(key=>Object.prototype.hasOwnProperty.call(value,key)))return true;
            const nestedArrays=[
                [value.extensions,'regex_scripts'],[value.extensions,'regexScripts'],[value.extensions,'scripts'],[value.extensions,'tavern_helper_scripts'],
                [value.tavernhelper,'regex_scripts'],[value.tavernhelper,'scripts'],
                [value.TavernHelper,'regex_scripts'],[value.TavernHelper,'scripts']
            ];
            return nestedArrays.some(([owner,key])=>owner&&typeof owner==='object'&&Array.isArray(owner[key]));
        }
        function unwrapPresetObject(parsed){
            if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('预设文件必须是 JSON 对象');
            const wrapperKeys=['preset','data','settings','config','completion_preset','completionPreset'];
            for(const key of wrapperKeys){
                const candidate=parsed[key];
                if(isPresetPayloadObject(candidate)){
                    return {data:candidate,envelope:{key,wrapper:parsed}};
                }
            }
            return {data:parsed,envelope:null};
        }
        function setPresetFromParsed(parsed){
            const result=unwrapPresetObject(parsed);
            presetArrayPaths={};
            presetData=result.data;
            presetEnvelope=result.envelope;
            // 新导入的文件没有版本元数据时，不沿用上一个预设的版本号。
            presetVersion=1;
            if(presetData._editorVersion!==undefined&&presetData._editorVersion!==null&&presetData._editorVersion!==''){
                const importedVersion=parseInt(presetData._editorVersion,10);
                if(Number.isFinite(importedVersion)&&importedVersion>0)presetVersion=importedVersion;
            }
            return result;
        }
        function buildPresetExportObject(payload){
            if(!presetEnvelope||!presetEnvelope.wrapper||!presetEnvelope.key)return payload;
            return Object.assign({},presetEnvelope.wrapper,{[presetEnvelope.key]:payload});
        }

        function readPresetStorageItem(key){
            try{return localStorage.getItem(key)}
            catch(e){console.warn('无法读取预设缓存：'+key,e);return null}
        }

        function loadPresetFromStorage(){
            const raw=readPresetStorageItem(PRESET_STORAGE_KEY);
            const ver=readPresetStorageItem(PRESET_VERSION_KEY);
            const envelopeRaw=readPresetStorageItem(PRESET_ENVELOPE_STORAGE_KEY);
            const arrayPathsRaw=readPresetStorageItem(PRESET_ARRAY_PATHS_KEY);

            // 辅助元数据分别恢复；某一项损坏不应阻断主体预设数据。
            presetVersion=1;
            if(ver){
                const parsedVersion=parseInt(ver,10);
                if(Number.isFinite(parsedVersion)&&parsedVersion>0)presetVersion=parsedVersion;
            }

            presetEnvelope=null;
            if(envelopeRaw){
                try{
                    const parsedEnvelope=JSON.parse(envelopeRaw);
                    if(parsedEnvelope&&typeof parsedEnvelope==='object'&&!Array.isArray(parsedEnvelope)
                        &&typeof parsedEnvelope.key==='string'
                        &&parsedEnvelope.wrapper&&typeof parsedEnvelope.wrapper==='object'&&!Array.isArray(parsedEnvelope.wrapper)
                        &&Object.prototype.hasOwnProperty.call(parsedEnvelope.wrapper,parsedEnvelope.key)){
                        presetEnvelope=parsedEnvelope;
                    }
                }catch(e){console.warn('预设包装缓存无效，已忽略',e)}
            }

            presetArrayPaths={};
            if(arrayPathsRaw){
                try{
                    const parsedPaths=JSON.parse(arrayPathsRaw);
                    if(parsedPaths&&typeof parsedPaths==='object'&&!Array.isArray(parsedPaths)){
                        Object.keys(parsedPaths).forEach(alias=>{
                            const path=parsedPaths[alias];
                            if(Array.isArray(path)&&path.length>0&&path.every(part=>typeof part==='string'&&part.length>0)){
                                presetArrayPaths[alias]=path.slice();
                            }
                        });
                    }
                }catch(e){console.warn('预设数组路径缓存无效，已忽略',e)}
            }

            if(raw){
                try{
                    const parsedData=JSON.parse(raw);
                    if(!parsedData||typeof parsedData!=='object'||Array.isArray(parsedData))throw new Error('预设缓存主体不是有效对象');
                    presetData=parsedData;
                    showToast('已恢复预设上次内容','success');
                }catch(e){
                    presetData=null;
                    presetEnvelope=null;
                    presetArrayPaths={};
                    console.warn('预设主体缓存无效，无法恢复',e);
                }
            }
        }
        function schedulePresetSave(){
            presetDirty=true;
            const dot=document.getElementById('presetSaveDot'),status=document.getElementById('presetSaveStatus');
            if(dot)dot.classList.add('saving');
            if(status)status.textContent='保存中...';
            clearTimeout(presetSaveTimer);
            presetSaveTimer=setTimeout(savePresetToStorage,600);
        }
        function writePresetStorageItem(key,value){
            try{localStorage.setItem(key,value);return true}
            catch(e){console.warn('预设缓存写入失败：'+key,e);return false}
        }
        function savePresetToStorage(){
            let success=true;
            try{
                if(presetData&&!writePresetStorageItem(PRESET_STORAGE_KEY,JSON.stringify(presetData)))success=false;
                if(presetEnvelope){
                    if(!writePresetStorageItem(PRESET_ENVELOPE_STORAGE_KEY,JSON.stringify(presetEnvelope)))success=false;
                }else if(!removePresetStorageItem(PRESET_ENVELOPE_STORAGE_KEY))success=false;
                if(!writePresetStorageItem(PRESET_ARRAY_PATHS_KEY,JSON.stringify(presetArrayPaths)))success=false;
                if(!writePresetStorageItem(PRESET_VERSION_KEY,String(presetVersion)))success=false;
            }catch(e){
                console.error('预设缓存序列化失败',e);
                success=false;
            }
            presetDirty=!success;
            const dot=document.getElementById('presetSaveDot'),status=document.getElementById('presetSaveStatus');
            if(dot)dot.classList.toggle('saving',!success);
            if(status)status.textContent=success?'已自动保存':'保存失败，修改仍保留在当前页面';
            if(!success)showToast('预设自动保存失败，请导出备份','error');
            return success;
        }
        function removePresetStorageItem(key){
            try{localStorage.removeItem(key);return true}
            catch(e){console.warn('无法清理预设缓存：'+key,e);return false}
        }

        function clearPresetData(){
            if(!presetData)return;
            if(!confirm('确定清空当前预设数据？'))return;
            presetData=null;presetEnvelope=null;presetVersion=1;presetArrayPaths={};
            [PRESET_STORAGE_KEY,PRESET_ENVELOPE_STORAGE_KEY,PRESET_ARRAY_PATHS_KEY,PRESET_VERSION_KEY].forEach(removePresetStorageItem);
            renderPresetUI();updateToolbar();showToast('已清空预设数据');
        }
        function createEmptyPreset(){
            presetEnvelope=null;
            presetArrayPaths={};
            presetData={
                name:'新预设',temperature:0.8,top_p:0.9,top_k:0,min_p:0,top_a:0,
                typical_p:1,tfs:1,repetition_penalty:1.1,presence_penalty:0,frequency_penalty:0,
                smoothing_factor:0,mirostat_mode:0,max_tokens:0,seed:-1,
                main_prompt:'',jailbreak_prompt:'',system_prompt:'',stop_sequence:[],
                stream:true,nsfw:false,regex_scripts:[]
            };
            renderPresetUI();schedulePresetSave();showToast('已创建空白预设');
        }        function getPresetPromptItems(){
            if(!presetData) return [];
            return Array.isArray(presetData.prompts) ? presetData.prompts : [];
        }
        function renderPromptItems(){
            const container=document.getElementById('promptItemsContainer');
            const badge=document.getElementById('promptItemsBadge');
            if(!container) return;
            const list=getPresetPromptItems();
            if(badge) badge.textContent=String(list.length);
            if(!list.length){
                container.innerHTML='<div class="regex-empty">当前预设没有 prompts 条目，点击「新建条目」添加</div>';
                return;
            }
            container.innerHTML=list.map((item,i)=>{
                const title=item && typeof item==='object' ? (item.name||item.identifier||('提示词 '+(i+1))) : ('提示词 '+(i+1));
                return `
                <div class="regex-card">
                    <div class="regex-card-header">
                        <div class="regex-card-title">${escapeHtml(title)}</div>
                        <div class="regex-card-actions">
                            <button class="btn btn-sm" type="button" onclick="movePromptItem(${i},-1)" ${i===0?'disabled':''}>上移</button>
                            <button class="btn btn-sm" type="button" onclick="movePromptItem(${i},1)" ${i===list.length-1?'disabled':''}>下移</button>
                            <button class="btn btn-sm btn-danger" type="button" onclick="deletePromptItem(${i})">删除</button>
                        </div>
                    </div>
                    <div class="regex-field">
                        <label>完整条目 JSON</label>
                        <textarea class="form-control" rows="8" spellcheck="false" onchange="updatePromptItemJson(${i},this.value)">${escapeHtml(JSON.stringify(item,null,2))}</textarea>
                    </div>
                </div>`;
            }).join('');
        }
        function getPromptOrderGroups(){
            if(!presetData||!Array.isArray(presetData.prompt_order))return [];
            return presetData.prompt_order.filter(group=>group&&typeof group==='object'&&!Array.isArray(group)&&Array.isArray(group.order));
        }
        function refreshPromptOrderAfterSync(){
            refreshPromptOrderJson();
            refreshRawJson();
            schedulePresetSave();
        }
        function makeUniquePromptIdentifier(){
            const prompts=getPresetPromptItems();
            const used=new Set(prompts.map(item=>item&&typeof item.identifier==='string'?item.identifier:'').filter(Boolean));
            let id='custom_prompt_'+Date.now();
            let suffix=1;
            while(used.has(id)){id='custom_prompt_'+Date.now()+'_'+suffix++;}
            return id;
        }
        function updatePromptItemJson(index,raw){
            try{
                const parsed=JSON.parse(raw);
                if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error('每条提示词必须是 JSON 对象');
                if(!Array.isArray(presetData.prompts)) presetData.prompts=[];
                if(index<0||index>=presetData.prompts.length) throw new Error('条目位置已变化，请重新载入');
                const previous=presetData.prompts[index]||{};
                const oldId=typeof previous.identifier==='string'?previous.identifier:'';
                const newId=typeof parsed.identifier==='string'?parsed.identifier:'';
                if(oldId&&!newId)throw new Error('原条目存在 identifier，不能直接删除或清空；请填写新的唯一 identifier');
                if(newId&&presetData.prompts.some((item,i)=>i!==index&&item&&item.identifier===newId))throw new Error('identifier 与其他提示词重复，请使用唯一值');
                if(oldId&&oldId!==newId){
                    const oldMatches=presetData.prompts.filter((item,i)=>i!==index&&item&&item.identifier===oldId).length;
                    if(oldMatches)throw new Error('原 identifier 在其他提示词中也存在，无法安全同步排序表');
                    getPromptOrderGroups().forEach(group=>{
                        group.order.forEach(entry=>{
                            if(entry&&typeof entry==='object'&&!Array.isArray(entry)&&entry.identifier===oldId)entry.identifier=newId;
                        });
                    });
                }
                presetData.prompts[index]=parsed;
                renderPromptItems();refreshPromptOrderAfterSync();
                showToast('提示词条目已更新','success');
            }catch(err){showToast('条目 JSON 无效：'+err.message,'error');renderPromptItems()}
        }
        function addPromptItem(){
            if(!presetData) return;
            if(!Array.isArray(presetData.prompts)) presetData.prompts=[];
            const prompt={name:'New Prompt',system_prompt:false,role:'system',content:'',identifier:makeUniquePromptIdentifier(),enabled:true};
            presetData.prompts.push(prompt);
            getPromptOrderGroups().forEach(group=>{
                if(!group.order.some(entry=>entry&&entry.identifier===prompt.identifier)){
                    group.order.push({identifier:prompt.identifier,enabled:prompt.enabled!==false});
                }
            });
            renderPromptItems();refreshPromptOrderAfterSync();
            const sec=document.getElementById('secPromptItems');if(sec)sec.classList.remove('collapsed');
            showToast('已新增提示词条目','success');
        }
        function deletePromptItem(index){
            if(!presetData||!Array.isArray(presetData.prompts)||index<0||index>=presetData.prompts.length)return;
            const prompt=presetData.prompts[index];
            const id=prompt&&typeof prompt.identifier==='string'?prompt.identifier:'';
            const duplicate=id&&presetData.prompts.some((item,i)=>i!==index&&item&&item.identifier===id);
            presetData.prompts.splice(index,1);
            if(id&&!duplicate){
                getPromptOrderGroups().forEach(group=>{
                    group.order=group.order.filter(entry=>!(entry&&typeof entry==='object'&&!Array.isArray(entry)&&entry.identifier===id));
                });
            }
            renderPromptItems();refreshPromptOrderAfterSync();
            showToast(duplicate?'已删除提示词；因 identifier 重复，未改动排序表':'已删除提示词条目'+(id?'并同步清理排序表':''));
        }
        function movePromptItem(index,delta){
            if(!presetData||!Array.isArray(presetData.prompts))return;
            const target=index+delta;
            if(index<0||target<0||target>=presetData.prompts.length)return;
            const list=presetData.prompts;
            const first=list[index],second=list[target];
            const firstId=first&&typeof first.identifier==='string'?first.identifier:'';
            const secondId=second&&typeof second.identifier==='string'?second.identifier:'';
            [list[index],list[target]]=[list[target],list[index]];
            const firstPromptCount=firstId?list.filter(item=>item&&item.identifier===firstId).length:0;
            const secondPromptCount=secondId?list.filter(item=>item&&item.identifier===secondId).length:0;
            let skipped=false;
            if(firstId&&secondId&&firstId!==secondId&&firstPromptCount===1&&secondPromptCount===1){
                getPromptOrderGroups().forEach(group=>{
                    const firstIndexes=[],secondIndexes=[];
                    group.order.forEach((entry,i)=>{
                        if(!entry||typeof entry!=='object'||Array.isArray(entry))return;
                        if(entry.identifier===firstId)firstIndexes.push(i);
                        if(entry.identifier===secondId)secondIndexes.push(i);
                    });
                    if(firstIndexes.length===1&&secondIndexes.length===1){
                        const a=firstIndexes[0],b=secondIndexes[0];
                        [group.order[a],group.order[b]]=[group.order[b],group.order[a]];
                    }else if(firstIndexes.length||secondIndexes.length)skipped=true;
                });
            }else if(firstId||secondId)skipped=true;
            renderPromptItems();refreshPromptOrderAfterSync();
            if(skipped)showToast('提示词列表已调整；部分排序组因缺少或重复 identifier，未同步移动','warning');
        }
        function refreshPromptOrderJson(){
            const el=document.getElementById('p_prompt_order');
            if(!el||!presetData)return;
            el.value=Object.prototype.hasOwnProperty.call(presetData,'prompt_order')?JSON.stringify(presetData.prompt_order,null,2):'';
        }
        function applyPromptOrderJson(){
            const el=document.getElementById('p_prompt_order');
            if(!el||!presetData)return;
            if(!el.value.trim()){
                delete presetData.prompt_order;
                schedulePresetSave();refreshRawJson();showToast('已清空 prompt_order');return;
            }
            try{
                presetData.prompt_order=JSON.parse(el.value);
                schedulePresetSave();refreshRawJson();showToast('prompt_order 已更新','success');
            }catch(err){showToast('prompt_order JSON 格式错误，请检查后重试','error');refreshPromptOrderJson()}
        }

        function renderPresetUI(){
            const empty=document.getElementById('presetEmpty');
            const editor=document.getElementById('presetEditor');
            if(!presetData){
                empty.style.display='flex';
                editor.style.display='none';
                return;
            }
            empty.style.display='none';
            editor.style.display='block';
            // 填充字段（兼容多种命名）
            document.getElementById('p_name').value=(typeof getStr==='function'?getStr(presetData,'name','preset_name'):(presetData.name||presetData.preset_name||''))||'';
            const elMax=document.getElementById('p_max_tokens'); if(elMax) elMax.value=getNum(presetData,'max_tokens',getNum(presetData,'max_length',0));
            const elSeed=document.getElementById('p_seed'); if(elSeed) elSeed.value=getNum(presetData,'seed',-1);
            document.getElementById('p_temp').value=getNum(presetData,'temperature',0.8);
            document.getElementById('p_top_p').value=getNum(presetData,'top_p',0.9);
            document.getElementById('p_top_k').value=getNum(presetData,'top_k',0);
            document.getElementById('p_min_p').value=getNum(presetData,'min_p',0);
            document.getElementById('p_top_a').value=getNum(presetData,'top_a',0);
            const elTyp=document.getElementById('p_typical_p'); if(elTyp) elTyp.value=getNum(presetData,'typical_p',1);
            const elTfs=document.getElementById('p_tfs'); if(elTfs) elTfs.value=getNum(presetData,'tfs',1);
            document.getElementById('p_rep_pen').value=getNum(presetData,'repetition_penalty',getNum(presetData,'rep_pen',1.1));
            document.getElementById('p_pres_pen').value=getNum(presetData,'presence_penalty',0);
            document.getElementById('p_freq_pen').value=getNum(presetData,'frequency_penalty',0);
            const elSm=document.getElementById('p_smooth'); if(elSm) elSm.value=getNum(presetData,'smoothing_factor',0);
            const elMi=document.getElementById('p_mirostat'); if(elMi) elMi.value=getNum(presetData,'mirostat_mode',0);
            document.getElementById('p_main_prompt').value=presetData.main_prompt||presetData.prompt||presetData.mainPrompt||'';
            document.getElementById('p_jailbreak').value=presetData.jailbreak_prompt||presetData.jailbreak||presetData.jb||'';
            document.getElementById('p_system').value=presetData.system_prompt||presetData.system||'';
            const elStop=document.getElementById('p_stop');
            if(elStop){const stop=presetData.stop_sequence||presetData.stop||presetData.stop_sequences||'';elStop.value=Array.isArray(stop)?stop.join(', '):String(stop)}
            document.getElementById('p_stream').checked=parseEntryBoolean(presetData.stream??presetData.streaming,true);
            const nsfwEnabled=Object.prototype.hasOwnProperty.call(presetData,'nsfw')?parseEntryBoolean(presetData.nsfw,false):(Object.prototype.hasOwnProperty.call(presetData,'nsfw_filter')?!parseEntryBoolean(presetData.nsfw_filter,true):false);
            document.getElementById('p_nsfw').checked=nsfwEnabled;
            // 插入与导出选项
            const elInst=document.getElementById('p_instruct_mode');
            if(elInst){
                const v=presetData.instruct_mode!==undefined?presetData.instruct_mode:(presetData.instructMode!==undefined?presetData.instructMode:'');
                elInst.value=(v===''||v===null||v===undefined)?'':String(parseEntryBoolean(v,false)?1:0);
            }
            const elSys=document.getElementById('p_system_same');
            if(elSys){
                const v=presetData.system_same_as_main!==undefined?presetData.system_same_as_main:(presetData.systemSameAsMain!==undefined?presetData.systemSameAsMain:'');
                elSys.value=(v===''||v===null||v===undefined)?'':String(parseEntryBoolean(v,false)?1:0);
            }
            const elEdR=document.getElementById('p_export_disabled_regex');
            if(elEdR) elEdR.checked=presetData._exportIncludeDisabledRegex!==false;
            const elEdS=document.getElementById('p_export_disabled_scripts');
            if(elEdS) elEdS.checked=presetData._exportIncludeDisabledScripts!==false;
            const elMeta=document.getElementById('p_export_meta');
            if(elMeta) elMeta.checked=presetData._exportMeta!==false;
            if(typeof updateCharCounts==='function')updateCharCounts();
            if(typeof refreshRawJson==='function')refreshRawJson();
            if(typeof renderRegexList==='function')renderRegexList();
            if(typeof renderPromptItems==='function')renderPromptItems();
            if(typeof refreshPromptOrderJson==='function')refreshPromptOrderJson();
            if(typeof renderScriptList==='function')renderScriptList();
            if(typeof renderFieldOverview==='function')renderFieldOverview();
            if(typeof autoExpandPresetSections==='function')autoExpandPresetSections();
        }
        function getNum(obj,key,def){
            if(obj[key]!==undefined&&obj[key]!==null&&obj[key]!=='')return Number(obj[key]);
            return def;
        }
        // 按原始预设已有的字段名写回；若存在多个同义字段则同步更新，避免产生互相矛盾的值。
        function writePresetField(obj,canonical,aliases,value){
            const keys=[canonical,...aliases];
            const existing=keys.filter(key=>Object.prototype.hasOwnProperty.call(obj,key));
            const targets=existing.length?existing:[canonical];
            targets.forEach(key=>{obj[key]=value});
        }
        function writePresetStopField(obj,value){
            const keys=['stop_sequence','stop_sequences','stop'];
            const existing=keys.filter(key=>Object.prototype.hasOwnProperty.call(obj,key));
            const targets=existing.length?existing:['stop_sequence'];
            targets.forEach(key=>{
                const oldValue=obj[key];
                obj[key]=Array.isArray(oldValue)?value.slice():value.join(', ');
            });
        }
        function syncPreset(){
            if(!presetData)return;
            writePresetField(presetData,'name',['preset_name'],document.getElementById('p_name').value);
            const elMax=document.getElementById('p_max_tokens'); if(elMax) writePresetField(presetData,'max_tokens',['max_length'],Number(elMax.value)||0);
            const elSeed=document.getElementById('p_seed'); if(elSeed) presetData.seed=Number(elSeed.value);
            presetData.temperature=Number(document.getElementById('p_temp').value)||0;
            presetData.top_p=Number(document.getElementById('p_top_p').value)||0;
            presetData.top_k=Number(document.getElementById('p_top_k').value)||0;
            presetData.min_p=Number(document.getElementById('p_min_p').value)||0;
            presetData.top_a=Number(document.getElementById('p_top_a').value)||0;
            const elTyp=document.getElementById('p_typical_p'); if(elTyp) presetData.typical_p=Number(elTyp.value)||1;
            const elTfs=document.getElementById('p_tfs'); if(elTfs) presetData.tfs=Number(elTfs.value)||1;
            writePresetField(presetData,'repetition_penalty',['rep_pen'],Number(document.getElementById('p_rep_pen').value)||1);
            presetData.presence_penalty=Number(document.getElementById('p_pres_pen').value)||0;
            presetData.frequency_penalty=Number(document.getElementById('p_freq_pen').value)||0;
            const elSm=document.getElementById('p_smooth'); if(elSm) presetData.smoothing_factor=Number(elSm.value)||0;
            const elMi=document.getElementById('p_mirostat'); if(elMi) presetData.mirostat_mode=Number(elMi.value)||0;
            writePresetField(presetData,'main_prompt',['prompt','mainPrompt'],document.getElementById('p_main_prompt').value);
            writePresetField(presetData,'jailbreak_prompt',['jailbreak','jb'],document.getElementById('p_jailbreak').value);
            writePresetField(presetData,'system_prompt',['system'],document.getElementById('p_system').value);
            const elStop=document.getElementById('p_stop');
            if(elStop){const stopRaw=elStop.value.trim();writePresetStopField(presetData,stopRaw?stopRaw.split(/[\n,，]/).map(s=>s.trim()).filter(Boolean):[])}
            writePresetField(presetData,'stream',['streaming'],document.getElementById('p_stream').checked);
            // nsfw_filter 与 nsfw 语义相反，单独反向写回，不能作为普通别名处理。
            const nsfwValue=document.getElementById('p_nsfw').checked;
            const hasNsfw=Object.prototype.hasOwnProperty.call(presetData,'nsfw');
            const hasNsfwFilter=Object.prototype.hasOwnProperty.call(presetData,'nsfw_filter');
            if(hasNsfw) presetData.nsfw=nsfwValue;
            if(hasNsfwFilter) presetData.nsfw_filter=!nsfwValue;
            if(!hasNsfw&&!hasNsfwFilter) presetData.nsfw=nsfwValue;
            const elInst=document.getElementById('p_instruct_mode');
            if(elInst && elInst.value!==''){ writePresetField(presetData,'instruct_mode',['instructMode'],Number(elInst.value)); }
            const elSys=document.getElementById('p_system_same');
            if(elSys && elSys.value!==''){ writePresetField(presetData,'system_same_as_main',['systemSameAsMain'],Number(elSys.value)===1); }
            const elEdR=document.getElementById('p_export_disabled_regex');
            if(elEdR) presetData._exportIncludeDisabledRegex=elEdR.checked;
            const elEdS=document.getElementById('p_export_disabled_scripts');
            if(elEdS) presetData._exportIncludeDisabledScripts=elEdS.checked;
            const elMeta=document.getElementById('p_export_meta');
            if(elMeta) presetData._exportMeta=elMeta.checked;
            schedulePresetSave();
        }
        function triggerPresetImport(){document.getElementById('presetFileInput').click()}
        function onPresetFileChosen(event){
            const file=event.target.files[0];if(!file)return;
            const reader=new FileReader();
            reader.onload=function(e){
                try{
                    const parsed=JSON.parse(e.target.result);
                    const imported=setPresetFromParsed(parsed);
                    renderPresetUI();
                    schedulePresetSave();
                    updateToolbar();
                    if(typeof detectAndNormalizeRegex==='function')detectAndNormalizeRegex();
                    if(typeof renderRegexList==='function')renderRegexList();
                    if(typeof detectAndNormalizeScripts==='function')detectAndNormalizeScripts();
                    if(typeof renderScriptList==='function')renderScriptList();
                    const rc=(getActivePresetArray('regex_scripts')||[]).length, sc=(getActivePresetArray('scripts')||[]).length;
                    const topKeys=Object.keys(presetData).filter(k=>!k.startsWith('_')).length;
                    let msg=imported.envelope?'预设导入成功（已识别并保留外层包装）':'预设导入成功';
                    if(rc||sc) msg += `（正则 ${rc} · 脚本 ${sc}）`;
                    else msg += `（${topKeys} 个顶层字段）`;
                    showToast(msg,'success');
                }catch(err){
                    console.error(err);
                    showToast('预设 JSON 解析失败或数据无法载入','error');
                }
            };
            reader.onerror=function(){
                console.error('预设文件读取失败',reader.error);
                showToast('预设文件读取失败，请重新选择文件','error');
            };
            reader.onabort=function(){
                showToast('预设文件读取已取消','error');
            };
            try{reader.readAsText(file)}
            catch(err){
                console.error('启动预设文件读取失败',err);
                showToast('无法读取该预设文件，请重新选择','error');
            }
            event.target.value='';
        }
        function exportPreset(){
            if(!presetData){showToast('请先导入或新建预设','error');return}
            syncPreset();
            presetVersion+=1;
            updateToolbar();
            // 版本号由后续自动保存统一写入；缓存不可用时也不能阻断文件导出。

            // 按开关过滤正则/脚本
            const includeDisRegex = presetData._exportIncludeDisabledRegex !== false;
            const includeDisScripts = presetData._exportIncludeDisabledScripts !== false;
            const includeMeta = presetData._exportMeta !== false;

            const exportObj = Object.assign({}, presetData);
            // 按原始存储路径过滤，兼容顶层别名及 extensions / TavernHelper 等嵌套结构。
            function filterExportArrayAtPath(root, path, includeDisabled){
                let source=root;
                for(let i=0;i<path.length-1;i++){
                    if(!source || typeof source!=='object' || !source[path[i]] || typeof source[path[i]]!=='object') return;
                    const key=path[i];
                    const cloned=Array.isArray(source[key])?source[key].slice():Object.assign({},source[key]);
                    source[key]=cloned;
                    source=cloned;
                }
                if(!source || typeof source!=='object') return;
                const key=path[path.length-1];
                if(!Array.isArray(source[key])) return;
                source[key]=includeDisabled
                    ? source[key].slice()
                    : source[key].filter(item=>!item || !parseEntryBoolean(item.disabled,false));
            }
            const regexExportPaths=[
                ['regex_scripts'],['regexScripts'],['regex'],['regexes'],
                ['extensions','regex_scripts'],['extensions','regexScripts'],
                ['tavernhelper','regex_scripts'],['TavernHelper','regex_scripts']
            ];
            const scriptExportPaths=[
                ['scripts'],['tavern_helper_scripts'],['tavernhelper_scripts'],['tavernHelperScripts'],
                ['extensions','scripts'],['extensions','tavern_helper_scripts'],
                ['tavernhelper','scripts'],['TavernHelper','scripts'],['mjs_scripts']
            ];
            regexExportPaths.forEach(path=>filterExportArrayAtPath(exportObj,path,includeDisRegex));
            scriptExportPaths.forEach(path=>filterExportArrayAtPath(exportObj,path,includeDisScripts));
            // 不把内部导出开关写进文件（可选保留也可去掉）
            delete exportObj._exportIncludeDisabledRegex;
            delete exportObj._exportIncludeDisabledScripts;
            delete exportObj._exportMeta;

            if(includeMeta){
                exportObj._editorVersion = presetVersion;
                exportObj._exportedAt = new Date().toISOString();
            }

            const finalExportObj=buildPresetExportObject(exportObj);
            const blob=new Blob([JSON.stringify(finalExportObj,null,2)],{type:'application/json;charset=utf-8'});
            const url=URL.createObjectURL(blob);const a=document.createElement('a');
            a.href=url;a.download=`Preset_${(getStr(presetData,'name','preset_name')||'unnamed').replace(/[\\/:*?"<>|]/g,'_')}_v${presetVersion}.json`;
            document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
            schedulePresetSave();showToast(`已导出预设 v${presetVersion}`,'success');
        }

        function updateCharCounts(){
            const m=document.getElementById('p_main_prompt')?.value||'';
            const j=document.getElementById('p_jailbreak')?.value||'';
            const s=document.getElementById('p_system')?.value||'';
            const elM=document.getElementById('cnt_main'),elJ=document.getElementById('cnt_jb'),elS=document.getElementById('cnt_sys');
            if(elM)elM.textContent=m.length+' 字';
            if(elJ)elJ.textContent=j.length+' 字';
            if(elS)elS.textContent=s.length+' 字';
        }
        function toggleSection(id){const el=document.getElementById(id);if(el)el.classList.toggle('collapsed')}
        function refreshRawJson(){
            const ta=document.getElementById('p_raw_json');
            if(!ta||!presetData)return;
            const copy=Object.assign({},presetData);
            delete copy._editorVersion;delete copy._exportedAt;
            ta.value=JSON.stringify(copy,null,2);
        }
        function applyRawJson(){
            const ta=document.getElementById('p_raw_json');
            if(!ta||!ta.value.trim())return;
            try{
                const parsed=JSON.parse(ta.value);
                setPresetFromParsed(parsed);renderPresetUI();schedulePresetSave();showToast('已应用原始 JSON','success');
            }catch(e){showToast('JSON 解析失败，请检查格式','error')}
        }
        function getStr(obj,...keys){for(const k of keys){if(obj[k]!==undefined&&obj[k]!==null)return String(obj[k])}return ''}

        
        // ========== 正则脚本管理 ==========
        function getPresetArrayAtPath(path){
            let current=presetData;
            for(let i=0;i<path.length-1;i++) current=current && current[path[i]];
            const key=path[path.length-1];
            return current && Array.isArray(current[key]) ? {owner:current,key} : null;
        }

        function ensurePresetArrayAlias(alias, paths){
            if(!presetData) return [];
            const savedPath=presetArrayPaths[alias];
            if(Array.isArray(savedPath)){
                const saved=getPresetArrayAtPath(savedPath);
                if(saved) return saved.owner[saved.key];
            }

            const candidates=paths.map(path=>({path,found:getPresetArrayAtPath(path)})).filter(item=>item.found);
            // 有内容的数组优先于空数组；同类候选仍按预设原始路径顺序选择。
            const selected=candidates.find(item=>item.found.owner[item.found.key].length>0) || candidates[0];
            if(selected){
                presetArrayPaths[alias]=selected.path.slice();
                return selected.found.owner[selected.found.key];
            }

            // 原预设没有对应数组时，创建标准字段，后续编辑仍沿用该路径。
            presetData[alias]=[];
            presetArrayPaths[alias]=[alias];
            return presetData[alias];
        }

        function getActivePresetArray(alias){
            const paths=alias==='regex_scripts'?[
                ['regex_scripts'],['regexScripts'],['regex'],['regexes'],
                ['extensions','regex_scripts'],['extensions','regexScripts'],
                ['tavernhelper','regex_scripts'],['TavernHelper','regex_scripts']
            ]:[
                ['scripts'],['tavern_helper_scripts'],['tavernhelper_scripts'],['tavernHelperScripts'],
                ['extensions','scripts'],['extensions','tavern_helper_scripts'],
                ['tavernhelper','scripts'],['TavernHelper','scripts'],['mjs_scripts']
            ];
            return ensurePresetArrayAlias(alias,paths);
        }

        function setActivePresetArray(alias,value){
            getActivePresetArray(alias);
            const path=presetArrayPaths[alias];
            const target=getPresetArrayAtPath(path);
            if(target) target.owner[target.key]=value;
            else presetData[alias]=value;
            return value;
        }

        function ensureRegexScripts(){
            return getActivePresetArray('regex_scripts');
        }

        function definePresetViewField(view, canonical, aliases, fallback, readTransform){
            const keys=[canonical,...aliases];
            const present=keys.filter(k=>Object.prototype.hasOwnProperty.call(view,k));
            const storageKey=present.find(k=>view[k]!==undefined && view[k]!==null && view[k]!=='') || present[0] || null;
            const canonicalPresent=Object.prototype.hasOwnProperty.call(view,canonical);
            let current=storageKey ? view[storageKey] : fallback;
            if(readTransform) current=readTransform(current);

            // 标准字段保持原有可枚举状态；旧字段作为底层存储时，统一视图字段不参与序列化。
            const descriptor=canonicalPresent?Object.getOwnPropertyDescriptor(view,canonical):null;
            Object.defineProperty(view,canonical,{
                configurable:true,
                enumerable:canonicalPresent ? !!(descriptor && descriptor.enumerable) : false,
                get(){ return current; },
                set(value){
                    current=value;
                    if(present.length){
                        // 如果原对象同时存在标准字段和一个或多个别名，编辑时同步更新它们。
                        present.forEach(key=>{
                            if(key!==canonical) view[key]=value;
                        });
                    }else{
                        // 原对象没有任何对应字段时，首次编辑才创建标准字段。
                        Object.defineProperty(view,canonical,{
                            value,
                            writable:true,
                            configurable:true,
                            enumerable:true
                        });
                    }
                }
            });
        }

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

        function showToast(msg,type=''){
            const container=document.getElementById('toastContainer');
            const toast=document.createElement('div');
            toast.className='toast'+(type?' '+type:'');
            toast.textContent=msg;
            container.appendChild(toast);
            setTimeout(()=>{toast.style.opacity='0';toast.style.transform='translateY(8px)';toast.style.transition='all .25s ease';setTimeout(()=>toast.remove(),260)},2200);
        }
        function escapeHtml(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
        window.addEventListener('beforeunload',()=>{if(isDirty)saveWorldBookToStorage();if(presetDirty)savePresetToStorage()});
        init();
