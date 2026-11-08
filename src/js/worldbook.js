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
                card.dataset.action='select-entry-card';
                const safeUid=escapeHtml(uid);
                const tagsHtml=listFieldItems(entry.tags).map(t=>`<span class="tag-chip">${escapeHtml(t)}</span>`).join('');
                card.innerHTML=`${selectMode?`<input type="checkbox" class="entry-check" data-change-action="toggle-entry-selection" data-uid="${safeUid}" ${isSelected?'checked':''}>`:''}<div class="entry-card-body"><div class="entry-status ${isEnabled?'':'off'}"></div><div class="entry-card-title">${escapeHtml(title)}</div><div class="entry-card-keys">${escapeHtml(keys||'无关键词')}</div>${tagsHtml?`<div class="entry-card-tags">${tagsHtml}</div>`:''}${!selectMode?`<div class="entry-card-actions"><button class="card-btn" data-action="move-entry" data-uid="${safeUid}" data-direction="-1">↑</button><button class="card-btn" data-action="move-entry" data-uid="${safeUid}" data-direction="1">↓</button><button class="card-btn" data-action="copy-entry" data-uid="${safeUid}">复制</button></div>`:''}</div>`;
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
