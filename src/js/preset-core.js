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
        function autoResizeLongPrompt(element){
            if(!element)return;
            element.style.height='auto';
            const maxHeight=Math.max(240,Math.floor((window.innerHeight||800)*0.72));
            const nextHeight=Math.min(element.scrollHeight,maxHeight);
            element.style.height=nextHeight+'px';
            element.style.overflowY=element.scrollHeight>maxHeight?'auto':'hidden';
        }
        function renderPromptItems(){
            document.body.classList.remove('prompt-editor-open');
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
                const isObject=item&&typeof item==='object'&&!Array.isArray(item);
                const prompt=isObject?item:{};
                const title=prompt.name||prompt.identifier||('提示词 '+(i+1));
                const content=typeof prompt.content==='string'?prompt.content:'';
                const identifier=typeof prompt.identifier==='string'?prompt.identifier:'';
                const role=typeof prompt.role==='string'?prompt.role:'system';
                const enabled=prompt.enabled!==false;
                const systemPrompt=prompt.system_prompt===true;
                return `
                <article class="regex-card prompt-item-card" id="prompt-item-${i}">
                    <div class="regex-card-header">
                        <label class="prompt-bulk-item-check" title="选择此提示词"><input type="checkbox" class="prompt-item-select" data-index="${i}" aria-label="选择提示词 ${escapeHtml(title)}"></label>
                        <div class="prompt-item-heading">
                            <div class="regex-card-title">${escapeHtml(title)}</div>
                            <div class="prompt-item-meta">${content.length.toLocaleString()} 字 · ${escapeHtml(role)} · ${enabled?'已启用':'已禁用'}</div>
                        </div>
                        <div class="regex-card-actions">
                            <button class="btn btn-sm" type="button" data-action="toggle-prompt-editor" data-index="${i}">展开编辑</button>
                            <button class="btn btn-sm" type="button" data-action="move-prompt-item" data-index="${i}" data-direction="-1" ${i===0?'disabled':''}>上移</button>
                            <button class="btn btn-sm" type="button" data-action="move-prompt-item" data-index="${i}" data-direction="1" ${i===list.length-1?'disabled':''}>下移</button>
                            <button class="btn btn-sm btn-danger" type="button" data-action="delete-prompt-item" data-index="${i}">删除</button>
                        </div>
                    </div>
                    <div class="prompt-item-fields">
                        <div class="form-grid">
                            <div class="regex-field">
                                <label>条目名称</label>
                                <input class="form-control" type="text" value="${escapeHtml(prompt.name||'')}" data-input-action="update-prompt-item-field" data-index="${i}" data-field="name" ${!isObject?'disabled':''}>
                            </div>
                            <div class="regex-field">
                                <label>角色（role）</label>
                                <input class="form-control" type="text" value="${escapeHtml(role)}" data-input-action="update-prompt-item-field" data-index="${i}" data-field="role" ${!isObject?'disabled':''}>
                            </div>
                        </div>
                        <div class="regex-field">
                            <label>唯一标识符（identifier）</label>
                            <input class="form-control" type="text" value="${escapeHtml(identifier)}" data-change-action="update-prompt-item-field" data-index="${i}" data-field="identifier" ${!isObject?'disabled':''}>
                        </div>
                        <div class="prompt-item-switches">
                            <label class="switch-row"><input type="checkbox" ${enabled?'checked':''} data-change-action="update-prompt-item-field" data-index="${i}" data-field="enabled" data-value-type="boolean" ${!isObject?'disabled':''}><span>启用条目</span></label>
                            <label class="switch-row"><input type="checkbox" ${systemPrompt?'checked':''} data-change-action="update-prompt-item-field" data-index="${i}" data-field="system_prompt" data-value-type="boolean" ${!isObject?'disabled':''}><span>System Prompt</span></label>
                        </div>
                        <div class="regex-field prompt-content-field">
                            <label>提示词正文 <span class="char-count" data-prompt-count="${i}">${content.length.toLocaleString()} 字</span></label>
                            <textarea class="form-control prompt-content-editor" rows="14" spellcheck="false" placeholder="在这里编辑完整提示词内容……" data-input-action="update-prompt-item-field" data-index="${i}" data-field="content" ${!isObject?'disabled':''}>${escapeHtml(content)}</textarea>
                        </div>
                        <details class="prompt-render-preview">
                            <summary>Markdown 与宏指令预览 <span class="prompt-preview-count">检测到 <b id="prompt-macro-count-${i}">0</b> 个宏</span></summary>
                            <div class="prompt-preview-legend"><span>Markdown 排版预览</span><span>宏指令仅识别与标记，不会执行或替换</span></div>
                            <div class="prompt-markdown-preview" id="prompt-content-preview-${i}"><p class="prompt-preview-empty">载入预览……</p></div>
                            <div class="prompt-macro-list"><strong>检测到的宏指令</strong><div id="prompt-macro-list-${i}"></div></div>
                        </details>
                        <details class="prompt-advanced">
                            <summary>高级 JSON（保留未识别字段）</summary>
                            <p class="prompt-advanced-hint">适合编辑 role 以外的特殊字段。普通字段编辑不会删除这里未显示的扩展数据。</p>
                            <textarea class="form-control raw-json" rows="8" spellcheck="false" data-change-action="update-prompt-item-json" data-index="${i}">${escapeHtml(JSON.stringify(item,null,2))}</textarea>
                        </details>
                    </div>
                </article>`;
            }).join('');
            container.querySelectorAll('.prompt-content-editor').forEach(autoResizeLongPrompt);
            list.forEach((item,index)=>refreshPromptContentPreview(index));
            container.querySelectorAll('.prompt-item-select').forEach(input=>input.addEventListener('change',updatePromptBulkSelectionUI));
            updatePromptBulkSelectionUI();
            renderPromptOrderPreview();
        }
        function renderPromptMarkdownInline(value){
            const code=[];
            let text=escapeHtml(String(value??''));
            text=text.replace(/`([^`]+)`/g,(_,value)=>'@@INLINE_CODE_'+(code.push(value)-1)+'@@');
            text=text.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>')
                .replace(/~~(.+?)~~/g,'<del>$1</del>')
                .replace(/\\*(?!\\s)(.+?)(?<!\\s)\\*/g,'<em>$1</em>');
            text=text.replace(/@@INLINE_CODE_(\\d+)@@/g,(_,index)=>'<code>'+code[Number(index)]+'</code>');
            return text.replace(/\\{\\{[^{}\\n]{1,120}\\}\\}/g,match=>'<span class="prompt-macro-token">'+match+'</span>');
        }
        function renderPromptMarkdown(content){
            const lines=String(content??'').replace(/\\r\\n?/g,'\\n').split('\\n');
            const output=[];
            let paragraph=[],listType='',listItems=[],codeLines=[],inCode=false;
            const flushParagraph=()=>{if(paragraph.length){output.push('<p>'+paragraph.map(renderPromptMarkdownInline).join('<br>')+'</p>');paragraph=[];}};
            const flushList=()=>{if(listItems.length){const tag=listType==='ol'?'ol':'ul';output.push('<'+tag+'>'+listItems.map(item=>'<li>'+renderPromptMarkdownInline(item)+'</li>').join('')+'</'+tag+'>');listItems=[];listType='';}};
            const flushCode=()=>{if(codeLines.length){output.push('<pre><code>'+escapeHtml(codeLines.join('\\n'))+'</code></pre>');codeLines=[];}};
            for(const line of lines){
                if(/^\\s*```/.test(line)){
                    flushParagraph();flushList();
                    if(inCode){flushCode();inCode=false;}else{inCode=true;}
                    continue;
                }
                if(inCode){codeLines.push(line);continue;}
                if(!line.trim()){flushParagraph();flushList();continue;}
                const heading=line.match(/^\\s{0,3}(#{1,6})\\s+(.+)$/);
                if(heading){flushParagraph();flushList();const level=heading[1].length;output.push('<h'+level+'>'+renderPromptMarkdownInline(heading[2])+'</h'+level+'>');continue;}
                if(/^\\s{0,3}([-*_])(?:\\s*\\1){2,}\\s*$/.test(line)){flushParagraph();flushList();output.push('<hr>');continue;}
                const unordered=line.match(/^\\s*[-*+]\\s+(.+)$/);
                const ordered=line.match(/^\\s*\\d+[.)]\\s+(.+)$/);
                if(unordered||ordered){flushParagraph();const nextType=ordered?'ol':'ul';if(listType&&listType!==nextType)flushList();listType=nextType;listItems.push((unordered||ordered)[1]);continue;}
                const quote=line.match(/^\\s*>\\s?(.*)$/);
                if(quote){flushParagraph();flushList();output.push('<blockquote>'+renderPromptMarkdownInline(quote[1])+'</blockquote>');continue;}
                flushList();paragraph.push(line);
            }
            flushParagraph();flushList();if(inCode){flushCode();}
            return output.join('')||'<p class="prompt-preview-empty">（正文为空）</p>';
        }
        function refreshPromptContentPreview(index){
            const prompt=getPresetPromptItems()[index];
            const preview=document.getElementById('prompt-content-preview-'+index);
            const macros=document.getElementById('prompt-macro-list-'+index);
            if(!preview||!macros)return;
            const content=prompt&&typeof prompt.content==='string'?prompt.content:'';
            preview.innerHTML=renderPromptMarkdown(content);
            const found=[...new Set(content.match(/\\{\\{[^{}\\n]{1,120}\\}\\}/g)||[])];
            macros.innerHTML=found.length?found.map(token=>'<code class="prompt-macro-chip">'+escapeHtml(token)+'</code>').join(''):'<span class="prompt-preview-empty">未检测到 {{...}} 宏指令</span>';
            const count=document.getElementById('prompt-macro-count-'+index);
            if(count)count.textContent=String(found.length);
        }
        function getSelectedPromptIndexes(){
            return [...document.querySelectorAll('.prompt-item-select:checked')]
                .map(input=>Number(input.dataset.index))
                .filter(index=>Number.isInteger(index)&&index>=0&&index<getPresetPromptItems().length)
                .sort((a,b)=>a-b);
        }
        function updatePromptBulkSelectionUI(){
            const selected=getSelectedPromptIndexes();
            const count=document.getElementById('promptBulkSelectionCount');
            const selectAll=document.getElementById('promptSelectAll');
            const total=getPresetPromptItems().length;
            if(count)count.textContent='已选 '+selected.length+' 项';
            if(selectAll){
                selectAll.checked=total>0&&selected.length===total;
                selectAll.indeterminate=selected.length>0&&selected.length<total;
                selectAll.disabled=total===0;
            }
        }
        function setPromptSelectAll(checked){
            document.querySelectorAll('.prompt-item-select').forEach(input=>{input.checked=Boolean(checked)});
            updatePromptBulkSelectionUI();
        }
        function swapPromptOrderReferences(first,second){
            const firstId=first&&typeof first.identifier==='string'?first.identifier:'';
            const secondId=second&&typeof second.identifier==='string'?second.identifier:'';
            if(!firstId||!secondId||firstId===secondId)return false;
            const prompts=getPresetPromptItems();
            if(prompts.filter(item=>item&&item.identifier===firstId).length!==1||
               prompts.filter(item=>item&&item.identifier===secondId).length!==1)return false;
            let safe=true;
            getPromptOrderGroups().forEach(group=>{
                const a=[],b=[];
                group.order.forEach((entry,index)=>{
                    if(!entry||typeof entry!=='object'||Array.isArray(entry))return;
                    if(entry.identifier===firstId)a.push(index);
                    if(entry.identifier===secondId)b.push(index);
                });
                if(a.length===1&&b.length===1)[group.order[a[0]],group.order[b[0]]]=[group.order[b[0]],group.order[a[0]]];
                else if(a.length||b.length)safe=false;
            });
            return safe;
        }
        function bulkPromptAction(action){
            if(!presetData||!Array.isArray(presetData.prompts))return;
            const selected=getSelectedPromptIndexes();
            if(!selected.length){showToast('请先选择至少一条提示词','warning');return;}
            if(action==='clear'){setPromptSelectAll(false);return;}
            const list=presetData.prompts;
            if(action==='enable'||action==='disable'){
                const enabled=action==='enable';
                selected.forEach(index=>{
                    const prompt=list[index];
                    if(prompt&&typeof prompt==='object'&&!Array.isArray(prompt))prompt.enabled=enabled;
                });
                renderPromptItems();refreshPromptOrderAfterSync();
                showToast('已批量'+(enabled?'启用':'禁用')+' '+selected.length+' 项','success');
                return;
            }
            let moved=0,skipped=false;
            const selectedItems=new Set(selected.map(index=>list[index]));
            if(action==='move-up'){
                const itemsInOriginalOrder=selected.map(index=>list[index]);
                itemsInOriginalOrder.forEach(item=>{
                    const index=list.indexOf(item);
                    if(index<=0||selectedItems.has(list[index-1]))return;
                    const first=list[index-1],second=list[index];
                    [list[index-1],list[index]]=[list[index],list[index-1]];
                    if(!swapPromptOrderReferences(first,second))skipped=true;
                    moved++;
                });
            }else if(action==='move-down'){
                const itemsInOriginalOrder=selected.slice().reverse().map(index=>list[index]);
                itemsInOriginalOrder.forEach(item=>{
                    const index=list.indexOf(item);
                    if(index<0||index>=list.length-1||selectedItems.has(list[index+1]))return;
                    const first=list[index],second=list[index+1];
                    [list[index],list[index+1]]=[list[index+1],list[index]];
                    if(!swapPromptOrderReferences(first,second))skipped=true;
                    moved++;
                });
            }
            if(!moved){showToast('所选条目已在可移动边界，顺序未改变','info');return;}
            renderPromptItems();refreshPromptOrderAfterSync();
            if(skipped)showToast('已移动 '+moved+' 项；部分排序组因 identifier 缺失或重复，未能同步对应顺序','warning');
            else showToast('已整体移动 '+moved+' 项','success');
        }
        function getPromptOrderGroups(){
            if(!presetData||!Array.isArray(presetData.prompt_order))return [];
            return presetData.prompt_order.filter(group=>group&&typeof group==='object'&&!Array.isArray(group)&&Array.isArray(group.order));
        }
        function renderPromptOrderPreview(){
            const container=document.getElementById('promptOrderPreview');
            if(!container)return;
            if(!presetData){
                container.innerHTML='<div class="regex-empty">载入预设后显示顺序预览</div>';
                return;
            }
            const prompts=getPresetPromptItems();
            const groups=getPromptOrderGroups();
            const byId=new Map();
            prompts.forEach((prompt,index)=>{
                const id=prompt&&typeof prompt.identifier==='string'?prompt.identifier:'';
                if(!id)return;
                if(!byId.has(id))byId.set(id,[]);
                byId.get(id).push({prompt,index});
            });
            const referenced=new Set();
            let listed=0,unresolved=0,disabled=0,duplicate=0;
            const groupHtml=groups.map((group,groupIndex)=>{
                const characterId=group.character_id??group.characterId??'未指定';
                const rows=group.order.map((entry,orderIndex)=>{
                    const id=entry&&typeof entry==='object'&&!Array.isArray(entry)?entry.identifier:'';
                    if(typeof id!=='string'||!id){
                        unresolved++;
                        return '<li class="prompt-order-row is-warning"><span class="prompt-order-number">'+(orderIndex+1)+'</span><div><strong>无法识别的排序项</strong><small>该项缺少有效 identifier</small></div><span class="prompt-order-state">结构异常</span></li>';
                    }
                    referenced.add(id);
                    const matches=byId.get(id)||[];
                    if(matches.length!==1){
                        unresolved++;
                        if(matches.length>1)duplicate++;
                        return '<li class="prompt-order-row is-warning"><span class="prompt-order-number">'+(orderIndex+1)+'</span><div><strong>'+escapeHtml(id)+'</strong><small>'+(matches.length?'存在 '+matches.length+' 个同标识提示词':'找不到对应提示词')+'</small></div><span class="prompt-order-state">'+(matches.length?'标识重复':'未匹配')+'</span></li>';
                    }
                    const match=matches[0],prompt=match.prompt||{};
                    const promptEnabled=prompt.enabled!==false;
                    const orderEnabled=entry.enabled!==false;
                    const active=promptEnabled&&orderEnabled;
                    listed++;
                    if(!active)disabled++;
                    const title=prompt.name||id||('提示词 '+(match.index+1));
                    const role=typeof prompt.role==='string'?prompt.role:'system';
                    return '<li class="prompt-order-row '+(active?'':'is-disabled')+'"><span class="prompt-order-number">'+(orderIndex+1)+'</span><div class="prompt-order-main"><strong>'+escapeHtml(title)+'</strong><small>'+escapeHtml(id)+' · '+escapeHtml(role)+'</small></div><span class="prompt-order-state">'+(active?'启用':'禁用')+'</span></li>';
                }).join('');
                return '<section class="prompt-order-group"><header><strong>排序组 '+(groupIndex+1)+'</strong><span>character_id：'+escapeHtml(String(characterId))+'</span><span>'+group.order.length+' 项</span></header><ol>'+rows+'</ol></section>';
            }).join('');
            const unlisted=prompts.map((prompt,index)=>{
                const id=prompt&&typeof prompt.identifier==='string'?prompt.identifier:'';
                if(id&&referenced.has(id))return '';
                const title=prompt&&prompt.name||id||('提示词 '+(index+1));
                return '<li><strong>'+escapeHtml(title)+'</strong><small>'+(id?'identifier：'+escapeHtml(id):'缺少 identifier')+' · '+(prompt&&prompt.enabled===false?'已禁用':'已启用')+'</small></li>';
            }).filter(Boolean);
            const totalOrder=groups.reduce((sum,group)=>sum+group.order.length,0);
            const summary='<div class="prompt-order-summary"><span>排序组 '+groups.length+'</span><span>排序项 '+totalOrder+'</span><span>匹配 '+listed+'</span><span>未匹配 '+unresolved+'</span><span>禁用 '+disabled+'</span></div>';
            const notes='<p class="prompt-order-note">这是根据当前 prompt_order 与 prompts.identifier 生成的结构预览。角色上下文、扩展处理、主提示词插入和运行时规则可能改变酒馆最终组装结果；此处不等同于实际发送给模型的完整提示词。</p>';
            if(!groups.length){
                container.innerHTML=summary+'<div class="regex-empty">当前预设没有可识别的 prompt_order 排序组。'+(prompts.length?'以下提示词仅按 prompts 原始数组列出。':'')+'</div>'+(prompts.length?'<ul class="prompt-order-unlisted">'+unlisted.join('')+'</ul>':'')+notes;
                return;
            }
            container.innerHTML=summary+groupHtml+(unlisted.length?'<section class="prompt-order-unlisted-wrap"><h4>未被排序表引用的提示词 <span>'+unlisted.length+'</span></h4><ul class="prompt-order-unlisted">'+unlisted.join('')+'</ul></section>':'')+(duplicate?'<p class="prompt-order-warning">发现 '+duplicate+' 个存在重复 identifier 的排序引用，请检查提示词标识符。</p>':'')+notes;
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
        function togglePromptEditor(index){
            const card=document.querySelector('.prompt-item-card:nth-child('+(Number(index)+1)+')');
            if(!card)return;
            const wasExpanded=card.classList.contains('prompt-editor-expanded');
            document.querySelectorAll('.prompt-item-card.prompt-editor-expanded').forEach(item=>{
                item.classList.remove('prompt-editor-expanded');
                const control=item.querySelector('[data-action="toggle-prompt-editor"]');
                if(control)control.textContent='展开编辑';
            });
            const expanded=!wasExpanded;
            if(expanded){
                card.classList.add('prompt-editor-expanded');
                const control=card.querySelector('[data-action="toggle-prompt-editor"]');
                if(control)control.textContent='收起编辑';
            }
            document.body.classList.toggle('prompt-editor-open',expanded);
        }
        function updatePromptItemField(index,field,value){
            if(!presetData||!Array.isArray(presetData.prompts)||index<0||index>=presetData.prompts.length)return;
            const prompt=presetData.prompts[index];
            if(!prompt||typeof prompt!=='object'||Array.isArray(prompt))return;
            const allowed=['name','role','identifier','content','enabled','system_prompt'];
            if(!allowed.includes(field))return;
            if(field==='enabled'||field==='system_prompt')value=Boolean(value);
            else value=String(value??'');
            if(field==='identifier'){
                const oldId=typeof prompt.identifier==='string'?prompt.identifier:'';
                const newId=value.trim();
                if(oldId&&!newId){showToast('原条目存在 identifier，不能清空','error');renderPromptItems();return}
                if(newId&&presetData.prompts.some((item,i)=>i!==index&&item&&item.identifier===newId)){
                    showToast('identifier 与其他提示词重复，请使用唯一值','error');renderPromptItems();return;
                }
                if(oldId&&oldId!==newId){
                    const duplicate=presetData.prompts.some((item,i)=>i!==index&&item&&item.identifier===oldId);
                    if(duplicate){showToast('原 identifier 存在重复，无法安全同步排序表','error');renderPromptItems();return}
                    getPromptOrderGroups().forEach(group=>group.order.forEach(entry=>{
                        if(entry&&typeof entry==='object'&&!Array.isArray(entry)&&entry.identifier===oldId)entry.identifier=newId;
                    }));
                }
                value=newId;
            }
            prompt[field]=value;
            const card=document.querySelector('.prompt-item-card:nth-child('+(index+1)+')');
            if(card){
                const count=card.querySelector('[data-prompt-count="'+index+'"]');
                if(count&&field==='content')count.textContent=value.length.toLocaleString()+' 字';
                const meta=card.querySelector('.prompt-item-meta');
                if(meta)meta.textContent=(typeof prompt.content==='string'?prompt.content.length:0).toLocaleString()+' 字 · '+(prompt.role||'system')+' · '+(prompt.enabled===false?'已禁用':'已启用');
                const heading=card.querySelector('.regex-card-title');
                if(heading&&field==='name')heading.textContent=value||prompt.identifier||('提示词 '+(index+1));
                if(field==='content'){
                    autoResizeLongPrompt(card.querySelector('.prompt-content-editor'));
                    refreshPromptContentPreview(index);
                }
            }
            if(field==='identifier')refreshPromptOrderAfterSync();
            else{refreshRawJson();schedulePresetSave();renderPromptOrderPreview()}
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
            renderPromptOrderPreview();
        }
        function applyPromptOrderJson(){
            const el=document.getElementById('p_prompt_order');
            if(!el||!presetData)return;
            if(!el.value.trim()){
                delete presetData.prompt_order;
                schedulePresetSave();refreshRawJson();renderPromptOrderPreview();showToast('已清空 prompt_order');return;
            }
            try{
                presetData.prompt_order=JSON.parse(el.value);
                schedulePresetSave();refreshRawJson();renderPromptOrderPreview();showToast('prompt_order 已更新','success');
            }catch(err){showToast('prompt_order JSON 格式错误，请检查后重试','error');refreshPromptOrderJson()}
        }

        function renderPresetUI(){
            if(typeof updatePresetImportBackupButton==='function')updatePresetImportBackupButton();
            const empty=document.getElementById('presetEmpty');
            const editor=document.getElementById('presetEditor');
            if(!presetData){
                empty.style.display='flex';
                editor.style.display='none';
                if(currentPage==='extensions'&&typeof refreshExtensionWorkspace==='function')refreshExtensionWorkspace();
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
            ['p_main_prompt','p_jailbreak','p_system'].forEach(id=>autoResizeLongPrompt(document.getElementById(id)));
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
            if(currentPage==='extensions'&&typeof refreshExtensionWorkspace==='function')refreshExtensionWorkspace();
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
        function countPresetArrayAtPaths(data,paths){
            for(const path of paths){
                let value=data;
                for(const key of path)value=value&&typeof value==='object'?value[key]:undefined;
                if(Array.isArray(value))return value.length;
            }
            return 0;
        }
        function closePresetImportPreview(){
            document.getElementById('presetImportPreviewModal')?.classList.remove('show');
            pendingPresetImport=null;
        }
        function renderPresetImportPreview(parsed,file){
            const result=unwrapPresetObject(parsed);
            const data=result.data;
            const prompts=Array.isArray(data.prompts)?data.prompts:[];
            const enabledPrompts=prompts.filter(item=>item&&typeof item==='object'&&item.enabled!==false).length;
            const regexCount=countPresetArrayAtPaths(data,[['regex_scripts'],['regexScripts'],['regex'],['regexes'],['extensions','regex_scripts'],['extensions','regexScripts'],['tavernhelper','regex_scripts'],['TavernHelper','regex_scripts']]);
            const scriptCount=countPresetArrayAtPaths(data,[['scripts'],['tavern_helper_scripts'],['tavernhelper_scripts'],['tavernHelperScripts'],['extensions','scripts'],['extensions','tavern_helper_scripts'],['tavernhelper','scripts'],['TavernHelper','scripts'],['mjs_scripts']]);
            const topKeys=Object.keys(data).filter(key=>!key.startsWith('_'));
            const recognized=isPresetPayloadObject(data);
            const warnings=[];
            if(!recognized)warnings.push('没有识别到常见预设字段。文件仍可载入，但请确认它确实是目标酒馆或兼容工具的预设。');
            if(prompts.length&&!data.prompt_order)warnings.push('存在 prompts，但没有 prompt_order；提示词顺序可能由导入端自行决定。');
            if(Array.isArray(data.prompt_order)&&!prompts.length)warnings.push('存在 prompt_order，但没有 prompts 数组；请确认是否为特殊预设结构。');
            const summary=document.getElementById('presetImportPreviewContent');
            if(!summary)return;
            const safeName=escapeHtml(file.name||'preset.json');
            const size=(file.size/1024).toFixed(file.size>=1024*1024?0:1);
            const unit=file.size>=1024*1024?'MB':'KB';
            summary.innerHTML=
                '<div class="preset-import-file"><strong>'+safeName+'</strong><span>'+size+' '+unit+'</span></div>'+
                '<div class="preset-import-stats">'+
                '<div><strong>'+topKeys.length+'</strong><span>顶层字段</span></div>'+
                '<div><strong>'+prompts.length+'</strong><span>提示词条目</span></div>'+
                '<div><strong>'+enabledPrompts+'</strong><span>启用提示词</span></div>'+
                '<div><strong>'+regexCount+'</strong><span>正则条目</span></div>'+
                '<div><strong>'+scriptCount+'</strong><span>脚本条目</span></div>'+
                '</div>'+
                '<div class="preset-import-meta"><span>外层包装：'+(result.envelope?'已识别（'+escapeHtml(result.envelope.key)+'）':'无')+'</span><span>预设名称：'+escapeHtml(getStr(data,'name','preset_name')||'未命名')+'</span><span>识别结果：'+(recognized?'检测到常见预设字段':'未识别到常见预设字段')+'</span></div>'+
                '<div class="preset-import-keys"><strong>主要字段</strong><span>'+escapeHtml(topKeys.slice(0,24).join(' · '))+(topKeys.length>24?' · …':'')+'</span></div>'+
                (warnings.length?'<div class="preset-import-warnings">'+warnings.map(item=>'<p>'+escapeHtml(item)+'</p>').join('')+'</div>':'')+
                '<p class="tool-help">预览不会覆盖当前预设。确认导入后会先保存当前预设及包装信息，随后才应用新文件。</p>';
        }
        function onPresetFileChosen(event){
            const file=event.target.files[0];if(!file)return;
            const reader=new FileReader();
            reader.onload=function(e){
                try{
                    const parsed=JSON.parse(e.target.result);
                    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('预设文件必须是 JSON 对象');
                    unwrapPresetObject(parsed);
                    pendingPresetImport={parsed,fileName:file.name,fileSize:file.size};
                    renderPresetImportPreview(parsed,file);
                    document.getElementById('presetImportPreviewModal')?.classList.add('show');
                }catch(err){
                    console.error(err);
                    showToast('预设 JSON 无法解析或根结构不是对象','error');
                }
            };
            reader.onerror=function(){
                console.error('预设文件读取失败',reader.error);
                showToast('预设文件读取失败，请重新选择文件','error');
            };
            reader.onabort=function(){showToast('预设文件读取已取消','error')};
            try{reader.readAsText(file)}
            catch(err){
                console.error('启动预设文件读取失败',err);
                showToast('无法读取该预设文件，请重新选择','error');
            }
            event.target.value='';
        }
        function updatePresetImportBackupButton(){
            const button=document.getElementById('undoPresetImportButton');
            if(!button)return;
            let available=false;
            try{available=!!localStorage.getItem(PRESET_IMPORT_BACKUP_KEY)}catch(e){}
            button.hidden=!available;
        }
        function applyStagedPresetImport(){
            if(!pendingPresetImport)return;
            const backup={
                hadPreset:!!presetData,
                data:presetData?JSON.parse(JSON.stringify(presetData)):null,
                envelope:presetEnvelope?JSON.parse(JSON.stringify(presetEnvelope)):null,
                version:presetVersion,
                arrayPaths:presetArrayPaths?JSON.parse(JSON.stringify(presetArrayPaths)):{},
                savedAt:new Date().toISOString()
            };
            try{
                const serialized=JSON.stringify(backup);
                localStorage.setItem(PRESET_IMPORT_BACKUP_KEY,serialized);
            }catch(err){
                console.error('导入前备份失败',err);
                showToast('无法保存导入前备份，已取消导入以保护当前预设','error');
                return;
            }
            try{
                clearTimeout(presetSaveTimer);
                setPresetFromParsed(pendingPresetImport.parsed);
                renderPresetUI();
                schedulePresetSave();
                updateToolbar();
                if(typeof detectAndNormalizeRegex==='function')detectAndNormalizeRegex();
                if(typeof renderRegexList==='function')renderRegexList();
                if(typeof detectAndNormalizeScripts==='function')detectAndNormalizeScripts();
                if(typeof renderScriptList==='function')renderScriptList();
                const rc=countPresetArrayAtPaths(presetData,[['regex_scripts'],['regexScripts'],['regex'],['regexes'],['extensions','regex_scripts'],['extensions','regexScripts'],['tavernhelper','regex_scripts'],['TavernHelper','regex_scripts']]);
                const sc=countPresetArrayAtPaths(presetData,[['scripts'],['tavern_helper_scripts'],['tavernhelper_scripts'],['tavernHelperScripts'],['extensions','scripts'],['extensions','tavern_helper_scripts'],['tavernhelper','scripts'],['TavernHelper','scripts'],['mjs_scripts']]);
                const filename=pendingPresetImport.fileName;
                closePresetImportPreview();
                updatePresetImportBackupButton();
                let msg='预设导入成功：'+filename;
                if(rc||sc)msg+='（正则 '+rc+' · 脚本 '+sc+'）';
                showToast(msg,'success');
            }catch(err){
                console.error('应用预设失败',err);
                showToast('预设应用失败；可以使用导入前备份恢复','error');
                updatePresetImportBackupButton();
            }
        }
        function undoLastPresetImport(){
            let backup;
            try{
                const raw=localStorage.getItem(PRESET_IMPORT_BACKUP_KEY);
                if(!raw){showToast('没有可恢复的导入前备份','error');updatePresetImportBackupButton();return}
                backup=JSON.parse(raw);
                if(!backup||typeof backup!=='object'||typeof backup.hadPreset!=='boolean')throw new Error('备份结构无效');
                if(!confirm(backup.hadPreset?'确定恢复到上一次导入前的预设吗？当前预设将被替换。':'上一次导入前没有预设。确定清除当前预设并恢复为空状态吗？'))return;
                clearTimeout(presetSaveTimer);
                if(backup.hadPreset){
                    if(!backup.data||typeof backup.data!=='object'||Array.isArray(backup.data))throw new Error('备份预设数据无效');
                    presetData=JSON.parse(JSON.stringify(backup.data));
                    presetEnvelope=backup.envelope?JSON.parse(JSON.stringify(backup.envelope)):null;
                    presetVersion=Number.isFinite(Number(backup.version))&&Number(backup.version)>0?Number(backup.version):1;
                    presetArrayPaths=backup.arrayPaths&&typeof backup.arrayPaths==='object'&&!Array.isArray(backup.arrayPaths)?JSON.parse(JSON.stringify(backup.arrayPaths)):{};
                    schedulePresetSave();
                }else{
                    presetData=null;presetEnvelope=null;presetVersion=1;presetArrayPaths={};
                    [PRESET_STORAGE_KEY,PRESET_ENVELOPE_STORAGE_KEY,PRESET_ARRAY_PATHS_KEY,PRESET_VERSION_KEY].forEach(removePresetStorageItem);
                    presetDirty=false;
                }
                localStorage.removeItem(PRESET_IMPORT_BACKUP_KEY);
                renderPresetUI();
                updateToolbar();
                if(typeof refreshExtensionWorkspace==='function')refreshExtensionWorkspace();
                updatePresetImportBackupButton();
                showToast('已恢复导入前的预设状态','success');
            }catch(err){
                console.error('恢复预设备份失败',err);
                showToast('备份无法读取或内容无效，未执行恢复','error');
            }
        }
        function countPresetJsonNodes(value,ancestors){
            if(value===null||typeof value!=='object')return 1;
            const stack=ancestors||new WeakSet();
            if(stack.has(value))return 1;
            stack.add(value);
            let count=1;
            if(Array.isArray(value)){
                for(const item of value)count+=countPresetJsonNodes(item,stack);
            }else{
                for(const key of Object.keys(value))count+=countPresetJsonNodes(value[key],stack);
            }
            stack.delete(value);
            return count;
        }
        function countPresetExportPath(root,path){
            let value=root;
            for(const key of path)value=value&&typeof value==='object'?value[key]:undefined;
            return Array.isArray(value)?value.length:0;
        }
        function inspectPresetExportRoundTrip(value){
            let serialized;
            try{serialized=JSON.stringify(value,null,2)}
            catch(error){return {serialized:null,issues:[{path:'$',reason:'无法序列化：'+(error&&error.message?error.message:String(error))}],beforeNodes:countPresetJsonNodes(value),afterNodes:0}}
            let parsed;
            try{parsed=JSON.parse(serialized)}
            catch(error){return {serialized:null,issues:[{path:'$',reason:'序列化结果无法重新解析'}],beforeNodes:countPresetJsonNodes(value),afterNodes:0}}
            const issues=[];
            function compare(before,after,path){
                if(issues.length>=30)return;
                if(before===after)return;
                if(before===null||after===null||typeof before!=='object'||typeof after!=='object'){
                    if(typeof before==='number'&&!Number.isFinite(before)&&after===null)return issues.push({path,reason:'非有限数字将变为 null'});
                    issues.push({path,reason:'值或类型在 JSON 往返后发生变化'});return;
                }
                const beforeArray=Array.isArray(before),afterArray=Array.isArray(after);
                if(beforeArray!==afterArray){issues.push({path,reason:'对象与数组类型发生变化'});return}
                if(beforeArray){
                    if(before.length!==after.length)issues.push({path,reason:'数组长度 '+before.length+' → '+after.length});
                    const limit=Math.min(before.length,after.length);
                    for(let i=0;i<limit&&issues.length<30;i++)compare(before[i],after[i],path+'['+i+']');
                    return;
                }
                const beforeKeys=Object.keys(before),afterKeys=Object.keys(after);
                for(const key of beforeKeys){
                    if(!Object.prototype.hasOwnProperty.call(after,key)){
                        issues.push({path:path+'.'+key,reason:'字段在 JSON 导出时丢失'});
                        if(issues.length>=30)return;
                    }else compare(before[key],after[key],path+'.'+key);
                }
                for(const key of afterKeys){
                    if(!Object.prototype.hasOwnProperty.call(before,key)){
                        issues.push({path:path+'.'+key,reason:'序列化后出现额外字段'});
                        if(issues.length>=30)return;
                    }
                }
            }
            compare(value,parsed,'$');
            return {serialized,issues,beforeNodes:countPresetJsonNodes(value),afterNodes:countPresetJsonNodes(parsed),parsed};
        }
        function buildPresetExportSnapshot(){
            const includeDisRegex=presetData._exportIncludeDisabledRegex!==false;
            const includeDisScripts=presetData._exportIncludeDisabledScripts!==false;
            const includeMeta=presetData._exportMeta!==false;
            const exportObj=Object.assign({},presetData);
            function filterExportArrayAtPath(root,path,includeDisabled){
                let source=root;
                for(let i=0;i<path.length-1;i++){
                    if(!source||typeof source!=='object'||!source[path[i]]||typeof source[path[i]]!=='object')return;
                    const key=path[i];
                    const cloned=Array.isArray(source[key])?source[key].slice():Object.assign({},source[key]);
                    source[key]=cloned;source=cloned;
                }
                if(!source||typeof source!=='object')return;
                const key=path[path.length-1];
                if(!Array.isArray(source[key]))return;
                source[key]=includeDisabled?source[key].slice():source[key].filter(item=>!item||!parseEntryBoolean(item.disabled,false));
            }
            const regexPaths=[['regex_scripts'],['regexScripts'],['regex'],['regexes'],['extensions','regex_scripts'],['extensions','regexScripts'],['tavernhelper','regex_scripts'],['TavernHelper','regex_scripts']];
            const scriptPaths=[['scripts'],['tavern_helper_scripts'],['tavernhelper_scripts'],['tavernHelperScripts'],['extensions','scripts'],['extensions','tavern_helper_scripts'],['tavernhelper','scripts'],['TavernHelper','scripts'],['mjs_scripts']];
            regexPaths.forEach(path=>filterExportArrayAtPath(exportObj,path,includeDisRegex));
            scriptPaths.forEach(path=>filterExportArrayAtPath(exportObj,path,includeDisScripts));
            delete exportObj._exportIncludeDisabledRegex;
            delete exportObj._exportIncludeDisabledScripts;
            delete exportObj._exportMeta;
            const nextVersion=presetVersion+1;
            if(includeMeta){exportObj._editorVersion=nextVersion;exportObj._exportedAt=new Date().toISOString()}
            const finalExportObj=buildPresetExportObject(exportObj);
            const checked=inspectPresetExportRoundTrip(finalExportObj);
            const stats={
                topLevelFields:Object.keys(finalExportObj).length,
                prompts:Array.isArray(exportObj.prompts)?exportObj.prompts.length:0,
                promptOrder:Array.isArray(exportObj.prompt_order)?exportObj.prompt_order.length:0,
                regex:countPresetArrayAtPaths(exportObj,regexPaths),
                scripts:countPresetArrayAtPaths(exportObj,scriptPaths)
            };
            return {version:nextVersion,filename:'Preset_'+(getStr(presetData,'name','preset_name')||'unnamed').replace(/[\\/:*?"<>|]/g,'_')+'_v'+nextVersion+'.json',checked,stats};
        }
        function closePresetExportPreview(){
            document.getElementById('presetExportPreviewModal')?.classList.remove('show');
            pendingPresetExport=null;
        }
        function renderPresetExportPreview(snapshot){
            const target=document.getElementById('presetExportPreviewContent');
            if(!target)return;
            const s=snapshot.stats,issues=snapshot.checked.issues;
            const rows=[
                ['顶层字段',s.topLevelFields],['提示词',s.prompts],['提示词顺序组',s.promptOrder],['正则',s.regex],['脚本',s.scripts],
                ['JSON 节点',snapshot.checked.beforeNodes+' → '+snapshot.checked.afterNodes]
            ];
            target.innerHTML='<div class="preset-import-stats">'+rows.map(([label,value])=>'<div><strong>'+escapeHtml(String(value))+'</strong><span>'+escapeHtml(label)+'</span></div>').join('')+'</div>'+
                (issues.length?'<div class="preset-import-warnings"><strong>发现 '+issues.length+(issues.length>=30?' 项或更多':' 项')+' 往返差异</strong>'+issues.map(item=>'<p><code>'+escapeHtml(item.path)+'</code>：'+escapeHtml(item.reason)+'</p>').join('')+'</div>':'<div class="preset-export-pass">JSON 序列化与重新解析检查通过，未发现字段丢失或值变化。</div>')+
                '<p class="tool-help">文件名：'+escapeHtml(snapshot.filename)+'。检查只针对最终导出副本，不会删改当前预设。若你关闭此窗口，本次不会下载文件。</p>';
        }
        function exportPreset(){
            if(!presetData){showToast('请先导入或新建预设','error');return}
            syncPreset();
            try{
                const snapshot=buildPresetExportSnapshot();
                if(!snapshot.checked.serialized)throw new Error(snapshot.checked.issues[0]?.reason||'无法生成 JSON');
                pendingPresetExport=snapshot;
                renderPresetExportPreview(snapshot);
                document.getElementById('presetExportPreviewModal')?.classList.add('show');
            }catch(error){
                console.error('预设导出完整性检查失败',error);
                showToast('导出检查失败：'+(error.message||'未知错误')+'；未生成文件','error');
            }
        }
        function confirmPresetExport(){
            if(!pendingPresetExport||!pendingPresetExport.checked.serialized)return;
            const snapshot=pendingPresetExport;
            try{
                presetVersion=snapshot.version;
                updateToolbar();
                const blob=new Blob([snapshot.checked.serialized],{type:'application/json;charset=utf-8'});
                const url=URL.createObjectURL(blob),a=document.createElement('a');
                a.href=url;a.download=snapshot.filename;
                document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
                closePresetExportPreview();
                schedulePresetSave();
                if(snapshot.checked.issues.length)showToast('已导出，但请留意完整性检查报告中的差异','warning');
                else showToast('预设导出成功，JSON 往返检查通过','success');
            }catch(error){
                console.error('预设文件导出失败',error);
                showToast('文件导出失败，请稍后重试','error');
            }
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


// ========== 预设诊断中心：只读静态检查，不修改预设 ==========
function analyzePresetDiagnostics(data){
    const issues=[];
    const add=(severity,category,target,title,detail,promptIndex=null)=>{
        issues.push({severity,category,target:String(target||''),title,detail,promptIndex});
    };
    if(!data||typeof data!=='object'||Array.isArray(data)){
        add('error','预设结构','','当前没有可检查的预设','请先导入预设或创建空白预设。');
        return issues;
    }
    const numericRules=[
        ['temperature','p_temp','Temperature',0,2],
        ['top_p','p_top_p','Top P',0,1],
        ['top_k','p_top_k','Top K',0,null],
        ['min_p','p_min_p','Min P',0,1],
        ['top_a','p_top_a','Top A',0,null],
        ['typical_p','p_typical_p','Typical P',0,1],
        ['tfs','p_tfs','TFS',0,1],
        ['max_tokens','p_max_tokens','Max Tokens',0,null],
        ['max_length','p_max_tokens','Max Length',0,null],
        ['repetition_penalty','p_rep_pen','Repetition Penalty',0.000001,null],
        ['rep_pen','p_rep_pen','Rep Pen',0.000001,null],
        ['presence_penalty','p_pres_pen','Presence Penalty',null,null],
        ['frequency_penalty','p_freq_pen','Frequency Penalty',null,null],
        ['smoothing_factor','p_smooth','Smoothing Factor',0,null],
        ['mirostat_mode','p_mirostat','Mirostat Mode',0,2],
        ['seed','p_seed','Seed',null,null]
    ];
    const seenNumeric=new Set();
    numericRules.forEach(([key,target,label,min,max])=>{
        if(!Object.prototype.hasOwnProperty.call(data,key)||seenNumeric.has(key))return;
        seenNumeric.add(key);
        const raw=data[key];
        if(raw===null||raw===''||!Number.isFinite(Number(raw))){
            add('error','参数类型',target,label+' 不是有效数字','当前值：'+String(raw));
            return;
        }
        const value=Number(raw);
        if((min!==null&&value<min)||(max!==null&&value>max)){
            const range=min===null?'不大于 '+max:max===null?'不小于 '+min:min+'–'+max;
            add('warning','参数范围',target,label+' 超出常见范围','当前值：'+String(raw)+'；常见范围为 '+range+'。不同 API 后端可能采用不同约束，请以实际服务文档为准。');
        }
        if(key==='mirostat_mode'&&!Number.isInteger(value))add('warning','参数格式',target,'Mirostat Mode 不是整数','该参数通常使用 0、1 或 2。');
        if(key==='seed'&&!Number.isInteger(value))add('warning','参数格式',target,'Seed 不是整数','Seed 通常使用整数；-1 常用于随机种子。');
    });
    const aliasGroups=[
        {keys:['name','preset_name'],label:'预设名称'},
        {keys:['max_tokens','max_length'],label:'最大生成长度'},
        {keys:['repetition_penalty','rep_pen'],label:'重复惩罚'},
        {keys:['main_prompt','prompt','mainPrompt'],label:'Main Prompt'},
        {keys:['jailbreak_prompt','jailbreak','jb'],label:'Jailbreak Prompt'},
        {keys:['system_prompt','system'],label:'System Prompt'},
        {keys:['stream','streaming'],label:'Streaming'}
    ];
    aliasGroups.forEach(group=>{
        const present=group.keys.filter(key=>Object.prototype.hasOwnProperty.call(data,key));
        if(present.length<2)return;
        const values=present.map(key=>data[key]);
        const normalized=values.map(value=>typeof value==='string'&&['true','false'].includes(value.toLowerCase())?value.toLowerCase():JSON.stringify(value));
        if(new Set(normalized).size>1)add('warning','字段一致性',group.keys[0]==='name'?'p_name':'secOverview',group.label+' 存在别名冲突','同时存在 '+present.join(' / ')+'，但数值或内容不一致。不同导入器可能读取不同字段；请确认要保留的值。');
    });
    const stopKeys=['stop_sequence','stop_sequences','stop'];
    const stopPresent=stopKeys.filter(key=>Object.prototype.hasOwnProperty.call(data,key));
    if(stopPresent.length>1){
        const normalized=stopPresent.map(key=>{
            const value=data[key];
            return JSON.stringify((Array.isArray(value)?value:String(value??'').split(/[\n,，]/)).map(item=>String(item).trim()).filter(Boolean));
        });
        if(new Set(normalized).size>1)add('warning','字段一致性','p_stop','Stop Sequences 存在别名冲突','stop_sequence、stop_sequences 或 stop 的内容不一致，请确认目标后端实际读取的字段。');
    }
    ['stream','streaming','nsfw','nsfw_filter'].forEach(key=>{
        if(!Object.prototype.hasOwnProperty.call(data,key))return;
        const value=data[key];
        const valid=typeof value==='boolean'||value===0||value===1||value==='0'||value==='1'||(typeof value==='string'&&['true','false'].includes(value.toLowerCase()));
        if(!valid)add('warning','参数类型',key==='stream'||key==='streaming'?'p_stream':'p_nsfw',key+' 不是常见布尔值','当前值：'+String(value)+'；请确认目标预设格式是否支持该类型。');
    });
    const stopValue=stopPresent.length?data[stopPresent[0]]:undefined;
    if(stopValue!==undefined&&!Array.isArray(stopValue)&&typeof stopValue!=='string')add('warning','参数类型','p_stop','Stop Sequences 类型异常','应为字符串或字符串数组，当前类型为 '+(stopValue===null?'null':typeof stopValue)+'。');
    if(Array.isArray(stopValue)&&stopValue.some(item=>typeof item!=='string'))add('warning','参数类型','p_stop','Stop Sequences 含非字符串元素','请检查数组中的元素类型。');

    const prompts=data.prompts;
    const promptIds=new Map();
    if(prompts!==undefined&&!Array.isArray(prompts)){
        add('error','提示词结构','secPromptItems','prompts 不是数组','提示词条目无法按常见预设结构读取。');
    }else if(Array.isArray(prompts)){
        prompts.forEach((prompt,index)=>{
            const target='prompt-item-'+index;
            if(!prompt||typeof prompt!=='object'||Array.isArray(prompt)){
                add('error','提示词结构',target,'提示词条目不是对象','第 '+(index+1)+' 个 prompts 元素不是 JSON 对象。',index);
                return;
            }
            const id=typeof prompt.identifier==='string'?prompt.identifier.trim():'';
            const enabled=prompt.enabled!==false;
            if(!id)add('warning','提示词标识符',target,'提示词缺少 identifier','第 '+(index+1)+' 个条目没有唯一标识符；prompt_order 无法稳定引用它。',index);
            else{
                if(!promptIds.has(id))promptIds.set(id,[]);
                promptIds.get(id).push(index);
            }
            if(enabled&&typeof prompt.content==='string'&&!prompt.content.trim())add('warning','提示词内容',target,'启用的提示词正文为空','「'+String(prompt.name||id||('提示词 '+(index+1)))+'」已启用，但 content 为空。',index);
            if(prompt.content!==undefined&&typeof prompt.content!=='string')add('warning','提示词类型',target,'提示词 content 不是字符串','当前类型为 '+(prompt.content===null?'null':typeof prompt.content)+'；请确认导入格式。',index);
        });
        promptIds.forEach((indexes,id)=>{
            if(indexes.length>1)indexes.forEach(index=>add('error','提示词标识符','prompt-item-'+index,'identifier 重复','标识符「'+id+'」同时用于第 '+indexes.map(i=>i+1).join('、')+' 个提示词条目。',index));
        });
    }

    if(data.prompt_order!==undefined){
        if(!Array.isArray(data.prompt_order)){
            add('error','提示词排序','secPromptOrder','prompt_order 不是数组','常见酒馆预设使用数组保存一个或多个排序组。');
        }else{
            data.prompt_order.forEach((group,groupIndex)=>{
                if(!group||typeof group!=='object'||Array.isArray(group)||!Array.isArray(group.order)){
                    add('error','提示词排序','secPromptOrder','排序组结构异常','第 '+(groupIndex+1)+' 个排序组缺少有效的 order 数组。');
                    return;
                }
                const seen=new Set();
                group.order.forEach((entry,entryIndex)=>{
                    if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.identifier!=='string'||!entry.identifier.trim()){
                        add('warning','提示词排序','secPromptOrder','排序项缺少 identifier','第 '+(groupIndex+1)+' 组的第 '+(entryIndex+1)+' 项无法关联到提示词条目。');
                        return;
                    }
                    const id=entry.identifier.trim();
                    if(seen.has(id))add('warning','提示词排序','secPromptOrder','同一排序组中 identifier 重复','标识符「'+id+'」在第 '+(groupIndex+1)+' 个排序组中出现多次。');
                    seen.add(id);
                    if(Array.isArray(prompts)&&!promptIds.has(id))add('warning','提示词排序','secPromptOrder','排序表引用了不存在的提示词','标识符「'+id+'」未在 prompts 列表中找到。');
                });
            });
        }
    }
    const rank={error:0,warning:1,info:2};
    issues.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.category.localeCompare(b.category,'zh-CN'));
    return issues;
}
function closePresetDiagnostics(){
    document.getElementById('presetDiagnosticsModal')?.classList.remove('show');
}
function openPresetDiagnostics(){
    const modal=document.getElementById('presetDiagnosticsModal');
    if(!modal)return;
    modal.classList.add('show');
    runPresetDiagnostics();
}
function runPresetDiagnostics(){
    const summary=document.getElementById('presetDiagnosticsSummary');
    const results=document.getElementById('presetDiagnosticsResults');
    if(!summary||!results)return [];
    const issues=analyzePresetDiagnostics(presetData);
    const prompts=Array.isArray(presetData?.prompts)?presetData.prompts.length:0;
    const counts={error:issues.filter(item=>item.severity==='error').length,warning:issues.filter(item=>item.severity==='warning').length,info:issues.filter(item=>item.severity==='info').length};
    summary.innerHTML='<div class="diagnostics-stat"><strong>'+prompts+'</strong><span>提示词条目</span></div><div class="diagnostics-stat is-error"><strong>'+counts.error+'</strong><span>错误</span></div><div class="diagnostics-stat is-warning"><strong>'+counts.warning+'</strong><span>警告</span></div><div class="diagnostics-stat"><strong>'+counts.info+'</strong><span>提示</span></div>';
    if(!issues.length){
        results.innerHTML='<div class="diagnostics-empty"><strong>没有发现明显问题</strong><span>这只是静态结构检查，不代表所有 API 后端都会接受这些参数，也不会模拟酒馆实际提示词构建流程。</span></div>';
        return issues;
    }
    results.innerHTML=issues.map(issue=>{
        const label=issue.severity==='error'?'错误':issue.severity==='warning'?'警告':'提示';
        return '<button class="diagnostic-issue severity-'+issue.severity+'" data-action="jump-preset-diagnostic" data-target-id="'+escapeHtml(issue.target)+'" data-prompt-index="'+(issue.promptIndex===null?'':issue.promptIndex)+'"><span class="diagnostic-issue-top"><span class="diagnostic-severity">'+label+'</span><span class="diagnostic-category">'+escapeHtml(issue.category)+'</span></span><strong>'+escapeHtml(issue.title)+'</strong><span>'+escapeHtml(issue.detail)+'</span><small>点击定位到相关设置</small></button>';
    }).join('');
    return issues;
}
function jumpToPresetDiagnostic(targetId,promptIndex){
    closePresetDiagnostics();
    const sec=document.getElementById('secPrompts');
    if(sec)sec.classList.remove('collapsed');
    if(promptIndex!==null&&promptIndex!==undefined&&promptIndex!==''&&Number.isInteger(Number(promptIndex))){
        const item=document.getElementById('prompt-item-'+Number(promptIndex));
        const itemsSection=document.getElementById('secPromptItems');
        if(itemsSection)itemsSection.classList.remove('collapsed');
        if(item){
            document.querySelectorAll('.prompt-item-card.prompt-editor-expanded').forEach(card=>{
                card.classList.remove('prompt-editor-expanded');
                const button=card.querySelector('[data-action="toggle-prompt-editor"]');
                if(button)button.textContent='展开编辑';
            });
            item.classList.add('prompt-editor-expanded');
            const button=item.querySelector('[data-action="toggle-prompt-editor"]');
            if(button)button.textContent='收起编辑';
            document.body.classList.add('prompt-editor-open');
            item.scrollIntoView({behavior:'smooth',block:'center'});
            return;
        }
    }
    const target=document.getElementById(String(targetId||''));
    if(target){
        let parent=target;
        while(parent&&parent!==document.body){
            if(parent.classList?.contains('collapsible-body'))parent.classList.remove('collapsed');
            parent=parent.parentElement;
        }
        target.scrollIntoView({behavior:'smooth',block:'center'});
        if(target.matches('input,textarea,select'))target.focus({preventScroll:true});
    }
}
