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
                            <button class="btn btn-sm" type="button" data-action="toggle-regex-disabled" data-index="${i}">${disabled ? '启用' : '禁用'}</button>
                            <button class="btn btn-sm btn-danger" type="button" data-action="delete-regex-script" data-index="${i}">删除</button>
                        </div>
                    </div>
                    <div class="regex-field">
                        <label>名称</label>
                        <input type="text" class="form-control" value="${escapeHtml(r.scriptName || '')}" data-change-action="update-regex-field" data-index="${i}" data-field="scriptName">
                    </div>
                    <div class="regex-field">
                        <label>查找正则 (findRegex)</label>
                        <textarea class="form-control" rows="2" data-change-action="update-regex-field" data-index="${i}" data-field="findRegex">${escapeHtml(r.findRegex || '')}</textarea>
                    </div>
                    <div class="regex-field">
                        <label>替换内容 (replaceString)</label>
                        <textarea class="form-control" rows="2" data-change-action="update-regex-field" data-index="${i}" data-field="replaceString">${escapeHtml(r.replaceString || '')}</textarea>
                    </div>
                    <div class="form-grid" style="margin-top:4px">
                        <div class="regex-field">
                            <label>作用位置 placement</label>
                            <input type="text" class="form-control" value="${escapeHtml((r.placement||[]).join(','))}" placeholder="如 1,2" data-change-action="update-regex-placement" data-index="${i}">
                        </div>
                        <div class="regex-field">
                            <label>最小深度</label>
                            <input type="number" class="form-control" value="${r.minDepth != null ? r.minDepth : ''}" data-change-action="update-regex-field" data-index="${i}" data-field="minDepth" data-value-type="nullable-number">
                        </div>
                        <div class="regex-field">
                            <label>最大深度</label>
                            <input type="number" class="form-control" value="${r.maxDepth != null ? r.maxDepth : ''}" data-change-action="update-regex-field" data-index="${i}" data-field="maxDepth" data-value-type="nullable-number">
                        </div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:6px">
                        <label class="switch-row"><input type="checkbox" ${r.markdownOnly?'checked':''} data-change-action="update-regex-field" data-index="${i}" data-field="markdownOnly" data-value-type="boolean"><span>仅 Markdown</span></label>
                        <label class="switch-row"><input type="checkbox" ${r.promptOnly?'checked':''} data-change-action="update-regex-field" data-index="${i}" data-field="promptOnly" data-value-type="boolean"><span>仅 Prompt</span></label>
                        <label class="switch-row"><input type="checkbox" ${r.runOnEdit?'checked':''} data-change-action="update-regex-field" data-index="${i}" data-field="runOnEdit" data-value-type="boolean"><span>编辑时运行</span></label>
                    </div>
                    <div class="regex-testbench">
                        <div class="regex-testbench-heading"><strong>正则测试台</strong><span>仅测试，不会修改预设</span></div>
                        <textarea class="form-control regex-test-input" rows="4" placeholder="粘贴一段待处理文本……"></textarea>
                        <div class="regex-test-actions"><button class="btn btn-sm btn-primary" type="button" data-action="test-regex-script" data-index="${i}">运行匹配与替换</button></div>
                        <pre class="regex-test-result" id="regex-test-result-${i}" aria-live="polite">等待测试</pre>
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
                            <button class="btn btn-sm" type="button" data-action="toggle-script-disabled" data-index="${i}">${disabled ? '启用' : '禁用'}</button>
                            <button class="btn btn-sm btn-danger" type="button" data-action="delete-script" data-index="${i}">删除</button>
                        </div>
                    </div>
                    <div class="regex-field">
                        <label>名称</label>
                        <input type="text" class="form-control" value="${escapeHtml(s.name || '')}" data-change-action="update-script-field" data-index="${i}" data-field="name">
                    </div>
                    <div class="regex-field">
                        <label>类型 / 触发（可选）</label>
                        <div class="form-grid">
                            <input type="text" class="form-control" value="${escapeHtml(s.type || 'js')}" placeholder="类型 js" data-change-action="update-script-field" data-index="${i}" data-field="type">
                            <input type="text" class="form-control" value="${escapeHtml(s.trigger || '')}" placeholder="触发条件/事件" data-change-action="update-script-field" data-index="${i}" data-field="trigger">
                        </div>
                    </div>
                    <div class="regex-field">
                        <label>脚本内容</label>
                        <textarea class="form-control script-code" rows="16" spellcheck="false" data-change-action="update-script-field" data-index="${i}" data-field="code">${escapeHtml(s.code || '')}</textarea>
                    </div>
                    <div class="script-testbench">
                        <div class="regex-testbench-heading"><strong>脚本沙盒测试</strong><span>不提供酒馆 API / 网络访问</span></div>
                        <textarea class="form-control script-test-input" rows="3" placeholder='测试输入，可填写 JSON，例如 {"text":"hello"}'></textarea>
                        <div class="regex-test-actions"><button class="btn btn-sm btn-primary" type="button" data-action="run-script-sandbox" data-index="${i}">在隔离环境中运行</button></div>
                        <pre class="regex-test-result" id="script-test-result-${i}" aria-live="polite">脚本不会自动执行，点击按钮后才会测试</pre>
                    </div>
                </div>`;
            }).join('');
        }


        // 正则测试在独立 Worker 中运行，避免复杂表达式阻塞主界面。
        function testRegexScript(index){
            const list=getActivePresetArray('regex_scripts')||[];
            const rule=list[index];
            const card=document.querySelector('.regex-card[data-idx="'+index+'"]');
            const input=card&&card.querySelector('.regex-test-input');
            const output=document.getElementById('regex-test-result-'+index);
            if(!rule||!input||!output)return;
            if(!String(rule.findRegex||'')){output.textContent='请先填写查找正则表达式。';return}
            const workerSource=[
                "self.onmessage=function(event){",
                "try{",
                "let source=String(event.data.pattern||'');let flags='g';",
                "if(source.charAt(0)==='/'){const end=source.lastIndexOf('/');if(end>0){flags=source.slice(end+1)||'g';source=source.slice(1,end);}}",
                "if(!flags.includes('g'))flags+='g';",
                "const expression=new RegExp(source,flags);",
                "const input=String(event.data.input||'');",
                "const matches=Array.from(input.matchAll(expression));",
                "const replaced=input.replace(expression,String(event.data.replacement||''));",
                "self.postMessage({ok:true,count:matches.length,result:replaced});",
                "}catch(error){self.postMessage({ok:false,error:String(error&&error.message||error)});}",
                "};"
            ].join("\n");
            let worker,url,timer;
            try{
                url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
                worker=new Worker(url);
                output.textContent='正在测试……';
                output.classList.remove('is-error');
                timer=setTimeout(()=>{worker.terminate();URL.revokeObjectURL(url);output.textContent='测试超时，已终止本次正则运行。';},1500);
                worker.onmessage=event=>{
                    clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);
                    const data=event.data||{};
                    output.textContent=data.ok?'匹配数量：'+data.count+'\n\n替换结果：\n'+data.result:'正则错误：'+data.error;
                    output.classList.toggle('is-error',!data.ok);
                };
                worker.onerror=()=>{
                    clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);
                    output.textContent='测试 Worker 启动失败，请检查浏览器是否允许本地 Worker。';
                    output.classList.add('is-error');
                };
                worker.postMessage({pattern:rule.findRegex,replacement:rule.replaceString,input:input.value});
            }catch(error){
                if(worker)worker.terminate();
                if(url)URL.revokeObjectURL(url);
                output.textContent='无法启动正则测试：'+String(error.message||error);
                output.classList.add('is-error');
            }
        }

        let scriptSandboxSequence=0;
        function runScriptSandbox(index){
            const list=getActivePresetArray('scripts')||[];
            const script=list[index];
            const card=document.querySelector('.script-card[data-idx="'+index+'"]');
            const inputField=card&&card.querySelector('.script-test-input');
            const output=document.getElementById('script-test-result-'+index);
            if(!script||!inputField||!output)return;
            let inputValue=inputField.value;
            try{inputValue=JSON.parse(inputValue)}catch(e){/* 普通文本作为字符串输入 */}
            const id='aw-script-'+(++scriptSandboxSequence);
            const frame=document.createElement('iframe');
            frame.setAttribute('sandbox','allow-scripts');
            frame.setAttribute('aria-hidden','true');
            frame.className='script-sandbox-frame';
            frame.srcdoc='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\'; connect-src \'none\'; img-src \'none\'; media-src \'none\'; font-src \'none\'; style-src \'unsafe-inline\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><script>window.addEventListener("message",async function(event){var data=event.data||{};if(data.type!=="aw-run-script")return;var logs=[];function format(value){try{var json=JSON.stringify(value);return json===undefined?String(value):json}catch(error){return String(value)}}var mockConsole={log:function(){logs.push(Array.from(arguments).map(format).join(" "))},info:function(){logs.push(Array.from(arguments).map(format).join(" "))},warn:function(){logs.push("WARN: "+Array.from(arguments).map(format).join(" "))},error:function(){logs.push("ERROR: "+Array.from(arguments).map(format).join(" "))}};try{var AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;var runner=new AsyncFunction("input","console","context",data.code);var result=await runner(data.input,mockConsole,{sandbox:true});parent.postMessage({type:"aw-script-result",id:data.id,ok:true,result:format(result),logs:logs},"*")}catch(error){parent.postMessage({type:"aw-script-result",id:data.id,ok:false,error:String(error&&error.stack||error),logs:logs},"*")}});</script>';
            let finished=false;
            const cleanup=()=>{window.removeEventListener('message',onMessage);clearTimeout(timeout);frame.remove()};
            const onMessage=event=>{
                if(event.source!==frame.contentWindow||!event.data||event.data.type!=='aw-script-result'||event.data.id!==id)return;
                finished=true;cleanup();
                const data=event.data;
                output.textContent=(data.ok?'执行完成':'执行错误')+
                    (data.result&&data.result!=='undefined'?'\n返回值：\n'+data.result:'')+
                    (data.logs&&data.logs.length?'\n\n控制台：\n'+data.logs.join('\n'):'')+
                    (data.error?'\n\n'+data.error:'');
                output.classList.toggle('is-error',!data.ok);
            };
            window.addEventListener('message',onMessage);
            const timeout=setTimeout(()=>{
                if(finished)return;
                cleanup();output.textContent='运行超时，已销毁测试沙盒。请检查是否存在无限循环或耗时操作。';output.classList.add('is-error');
            },1800);
            frame.addEventListener('load',()=>{
                if(frame.contentWindow)frame.contentWindow.postMessage({type:'aw-run-script',id,code:String(script.code||''),input:inputValue},'*');
            },{once:true});
            output.textContent='正在隔离环境中运行……';output.classList.remove('is-error');
            document.body.appendChild(frame);
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
