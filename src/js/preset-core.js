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
                            <button class="btn btn-sm" type="button" data-action="move-prompt-item" data-index="${i}" data-direction="-1" ${i===0?'disabled':''}>上移</button>
                            <button class="btn btn-sm" type="button" data-action="move-prompt-item" data-index="${i}" data-direction="1" ${i===list.length-1?'disabled':''}>下移</button>
                            <button class="btn btn-sm btn-danger" type="button" data-action="delete-prompt-item" data-index="${i}">删除</button>
                        </div>
                    </div>
                    <div class="regex-field">
                        <label>完整条目 JSON</label>
                        <textarea class="form-control" rows="8" spellcheck="false" data-change-action="update-prompt-item-json" data-index="${i}">${escapeHtml(JSON.stringify(item,null,2))}</textarea>
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
