// Independent SillyTavern character-card importer (V1/V2/V3).
// Parsing is local-only: imported files are never uploaded or executed.
(function(){
    const PNG_SIGNATURE = [137,80,78,71,13,10,26,10];
    const MAX_FILE_BYTES = 100 * 1024 * 1024;
    let currentCard = null;
    let currentImageUrl = null;
    let currentPngBuffer = null;
    let currentPngName = '';
    let currentCardFile = null;
    let cardDirty = false;
    let stagedResourceBundle = null;
    let bundleImportSequence = 0;
    let pendingImageImportMode = 'new';
    const CARD_DRAFT_DB_NAME = 'another-world-character-card-drafts';
    const CARD_DRAFT_STORE_NAME = 'drafts';
    const CARD_DRAFT_KEY = 'active';
    const CARD_DRAFT_STORAGE_KEY = 'another_world_character_card_draft';
    let cardDraftDbPromise = null;
    let cardDraftSaveTimer = null;


    function isObject(value){
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function getCardData(root){
        if(!isObject(root)) throw new Error('文件内容不是有效的 JSON 对象。');
        const data = isObject(root.data) ? root.data : root;
        const name = typeof data.name === 'string' ? data.name.trim() : '';
        if(!name) throw new Error('未找到角色名称字段 name，文件可能不是有效的角色卡。');
        const spec = typeof root.spec === 'string' ? root.spec : 'chara_card_v1';
        const version = typeof root.spec_version === 'string' ? root.spec_version : (spec === 'chara_card_v3' ? '3.0' : spec === 'chara_card_v2' ? '2.0' : '1.0');
        return {root,data,name,spec,version,shape:isObject(root.data)?'envelope':'flat'};
    }

    function decodeBase64Bytes(value){
        const normalized = value.replace(/\s+/g,'');
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    async function decodePayload(value){
        const raw = String(value).trim();
        try { return JSON.parse(raw); } catch(error) {}
        const bytes = decodeBase64Bytes(raw);
        const decodeJson = input => {
            const text = new TextDecoder('utf-8',{fatal:true}).decode(input);
            return JSON.parse(text);
        };
        try { return decodeJson(bytes); } catch(error) {
            if(typeof DecompressionStream === 'undefined') throw new Error('PNG 中的角色数据无法解码（可能是压缩格式不受当前浏览器支持）。');
            try {
                const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
                const decompressed = new Uint8Array(await new Response(stream).arrayBuffer());
                return decodeJson(decompressed);
            } catch(innerError) {
                throw new Error('PNG 中找到了角色数据块，但内容不是可识别的角色卡 JSON。');
            }
        }
    }

    async function inflateText(bytes){
        if(typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持解压 PNG 文本块。');
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    function findNull(bytes,start){
        for(let i=start;i<bytes.length;i++) if(bytes[i]===0) return i;
        return -1;
    }

    async function readPngTextChunks(buffer){
        const bytes = new Uint8Array(buffer);
        if(bytes.length<PNG_SIGNATURE.length || !PNG_SIGNATURE.every((v,i)=>bytes[i]===v)) throw new Error('这不是有效的 PNG 文件。');
        const found = [];
        let offset=8;
        let sawIend=false;
        while(offset+12<=bytes.length){
            const view = new DataView(buffer,offset,4);
            const length=view.getUint32(0);
            const type=String.fromCharCode(bytes[offset+4],bytes[offset+5],bytes[offset+6],bytes[offset+7]);
            const start=offset+8;
            const end=start+length;
            if(length>bytes.length || end+4>bytes.length) throw new Error('PNG 文件结构不完整，无法安全读取。');
            const chunk=bytes.subarray(start,end);
            const expectedCrc=new DataView(buffer,bytes.byteOffset+end,4).getUint32(0);
            const actualCrc=crc32(bytes.subarray(offset+4,end));
            if(actualCrc!==expectedCrc) throw new Error('PNG 数据块 '+type+' 的 CRC 校验失败，文件可能已损坏。');
            if(type==='tEXt'){
                const split=findNull(chunk,0);
                if(split>0){
                    const key=new TextDecoder('latin1').decode(chunk.subarray(0,split));
                    const text=new TextDecoder('latin1').decode(chunk.subarray(split+1));
                    if(key==='chara'||key==='ccv3') found.push({key,text});
                    else if(['name','description','personality','scenario','first_mes','mes_example','creatorcomment','avatar','talkativeness'].includes(key)) found.push({key:'flat:'+key,text});
                }
            }else if(type==='zTXt'){
                const split=findNull(chunk,0);
                if(split>0 && split+2<=chunk.length){
                    const key=new TextDecoder('latin1').decode(chunk.subarray(0,split));
                    if((key==='chara'||key==='ccv3')&&chunk[split+1]===0){
                        const raw=await inflateText(chunk.subarray(split+2));
                        found.push({key,text:new TextDecoder('utf-8').decode(raw)});
                    }
                }
            }else if(type==='iTXt'){
                const split=findNull(chunk,0);
                if(split>0 && split+3<=chunk.length){
                    const key=new TextDecoder('latin1').decode(chunk.subarray(0,split));
                    if(key==='chara'||key==='ccv3'){
                        const flag=chunk[split+1];
                        let cursor=split+3;
                        let part=findNull(chunk,cursor); if(part<0) part=chunk.length; cursor=part+1;
                        part=findNull(chunk,cursor); if(part<0) part=chunk.length; cursor=part+1;
                        let textBytes=chunk.subarray(cursor);
                        if(flag===1) textBytes=await inflateText(textBytes);
                        found.push({key,text:new TextDecoder('utf-8').decode(textBytes)});
                    }
                }
            }
            offset=end+4;
            if(type==='IEND'){sawIend=true;break;}
        }
        if(!sawIend) throw new Error('PNG 文件缺少完整的 IEND 结束块，文件可能已截断。');
        return found;
    }

    async function parsePng(buffer){
        const chunks=await readPngTextChunks(buffer);
        const ordered=[...chunks.filter(x=>x.key==='ccv3'),...chunks.filter(x=>x.key==='chara')];
        if(!ordered.length){
            const flat=chunks.filter(x=>x.key.startsWith('flat:'));
            if(flat.length){
                const root={};
                flat.forEach(item=>{root[item.key.slice(5)]=item.text;});
                return {...getCardData(root),container:'PNG',chunk:'V1 flat tEXt'};
            }
            throw new Error('图片中没有找到 chara / ccv3 角色数据。请确认上传的是原始角色卡 PNG，而不是截图或被重新压缩过的图片。');
        }
        let lastError=null;
        for(const item of ordered){
            try{
                const root=await decodePayload(item.text);
                return {...getCardData(root),container:'PNG',chunk:item.key};
            }catch(error){lastError=error;}
        }
        throw lastError || new Error('未能解析 PNG 角色卡数据。');
    }

    function escapeCardHtml(value){
        return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    }

    const CARD_LINK_STORAGE_KEY='tavern_character_card_resource_links_v1';
    let currentCardLinkKey='';

    function smallHash(value){
        let hash=2166136261;
        for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
        return (hash>>>0).toString(16).padStart(8,'0');
    }

    function getCardLinkKey(card,file){
        const data=card.data||card;
        const identity=[data.name||'',data.creator||'',data.character_version||'',data.creation_date||'',file&&file.name||''].join('|');
        return 'card_'+smallHash(identity);
    }

    function loadCardLinkStore(){
        try{
            const raw=localStorage.getItem(CARD_LINK_STORAGE_KEY);
            const parsed=raw?JSON.parse(raw):{};
            return isObject(parsed)?parsed:{};
        }catch(error){console.warn('角色卡关联记录读取失败',error);return {}}
    }

    function saveCardLinkStore(store){
        try{localStorage.setItem(CARD_LINK_STORAGE_KEY,JSON.stringify(store));return true}
        catch(error){console.warn('角色卡关联记录保存失败',error);showToast('关联记录保存失败，请检查浏览器本地存储空间','error');return false}
    }

    function resourceFingerprint(value){
        try{return smallHash(JSON.stringify(value)||'')}
        catch(error){return ''}
    }

    function getActiveResourceInfo(kind){
        if(kind==='worldbook'){
            if(typeof worldBookData==='undefined'||!isObject(worldBookData)||!isObject(worldBookData.entries))return null;
            const count=Object.keys(worldBookData.entries).length;
            if(!count)return null;
            return {kind,name:worldBookData.name||worldBookData.title||'当前世界书',count,label:count+' 个条目',fingerprint:resourceFingerprint(worldBookData)};
        }
        if(kind==='preset'){
            if(typeof presetData==='undefined'||!isObject(presetData))return null;
            const name=presetData.name||presetData.preset_name||'当前预设';
            const prompts=Array.isArray(presetData.prompts)?presetData.prompts.length:0;
            return {kind,name,count:prompts,label:prompts+' 个提示词条目',fingerprint:resourceFingerprint(presetData)};
        }
        if(kind==='regex'||kind==='scripts'){
            if(typeof presetData==='undefined'||!isObject(presetData))return null;
            const items=kind==='regex'?(Array.isArray(presetData.regex_scripts)?presetData.regex_scripts:Array.isArray(presetData.regexScripts)?presetData.regexScripts:[]):(Array.isArray(presetData.scripts)?presetData.scripts:[]);
            if(!items.length)return null;
            return {kind,name:(presetData.name||presetData.preset_name||'当前预设')+(kind==='regex'?' · 正则规则':' · 脚本'),count:items.length,label:items.length+(kind==='regex'?' 条正则':' 个脚本'),fingerprint:resourceFingerprint(items)};
        }
        if(kind==='extensions'){
            if(typeof presetData==='undefined'||!isObject(presetData))return null;
            const regex=Array.isArray(presetData.regex_scripts)?presetData.regex_scripts:Array.isArray(presetData.regexScripts)?presetData.regexScripts:[];
            const scripts=Array.isArray(presetData.scripts)?presetData.scripts:[];
            if(!regex.length&&!scripts.length)return null;
            return {kind,name:(presetData.name||presetData.preset_name||'当前预设')+' · 正则 / 脚本',count:regex.length+scripts.length,label:regex.length+' 条正则 · '+scripts.length+' 个脚本',fingerprint:resourceFingerprint({regex,scripts})};
        }
        return null;
    }

    function renderCharacterCardLinks(){
        const host=document.getElementById('characterCardLinks');
        if(!host)return;
        if(!currentCard||!currentCardLinkKey){host.innerHTML='<p class="tool-help">请先载入角色卡。</p>';return}
        const store=loadCardLinkStore();
        const links=store[currentCardLinkKey]||{};
        const labels={worldbook:'独立世界书',preset:'独立预设',regex:'正则规则',scripts:'脚本',extensions:'正则 / 脚本（旧版）'};
        host.innerHTML=['worldbook','preset','regex','scripts'].map(kind=>{
            const link=links[kind];
            const active=getActiveResourceInfo(kind);
            const matches=!!(link&&active&&link.fingerprint===active.fingerprint);
            let status='尚未关联';
            if(link)status=link.snapshot?(matches?'已保存资源快照 · 当前资源一致':'已保存资源快照 · 当前资源已变化或未载入'):matches?'旧版关联 · 当前资源一致，可重新关联以保存快照':active?'旧版关联 · 当前资源已变化':'旧版关联 · 当前未载入对应资源';
            const detail=link?escapeCardHtml(link.name)+' · '+escapeCardHtml(link.label||'')+' · '+escapeCardHtml(new Date(link.linkedAt).toLocaleString()):'';
            const activeText=active?'当前：'+active.name+'（'+active.label+'）':'当前未载入可关联的'+labels[kind];
            return '<div class="character-link-row"><div class="character-link-info"><strong>'+labels[kind]+'</strong><span class="character-link-status '+(matches?'is-match':link?'is-stale':'')+'">'+status+'</span>'+(link?'<small>已关联：'+detail+'</small>':'')+'<small>'+escapeCardHtml(activeText)+'</small></div><div class="character-link-actions"><button class="btn btn-sm btn-primary" type="button" data-action="link-card-resource" data-kind="'+kind+'" '+(active?'':'disabled')+'>'+(link?'重新关联当前':'关联当前')+'</button>'+(link?'<button class="btn btn-sm btn-ghost" type="button" data-action="unlink-card-resource" data-kind="'+kind+'">解除</button>':'')+'</div></div>';
        }).join('');
        const exportButton=document.getElementById('characterCardBundleExport');
        if(exportButton)exportButton.disabled=!(links.worldbook||links.preset||links.regex||links.scripts||links.extensions);
        renderLinkedResourceContents(links);
    }

    function renderLinkedResourceContents(links){
        const host=document.getElementById('characterCardLinkedResourceContents');
        if(!host)return;
        const sections=[];
        const getSnapshot=kind=>{
            const link=links[kind];
            if(link&&Object.prototype.hasOwnProperty.call(link,'snapshot'))return link.snapshot;
            const active=getActiveResourceInfo(kind);
            if(!link||!active||link.fingerprint!==active.fingerprint)return null;
            if(kind==='worldbook')return worldBookData;
            if(kind==='extensions')return {regex_scripts:Array.isArray(presetData.regex_scripts)?presetData.regex_scripts:Array.isArray(presetData.regexScripts)?presetData.regexScripts:[],scripts:Array.isArray(presetData.scripts)?presetData.scripts:[]};
            if(kind==='regex')return Array.isArray(presetData.regex_scripts)?presetData.regex_scripts:Array.isArray(presetData.regexScripts)?presetData.regexScripts:[];
            if(kind==='scripts')return Array.isArray(presetData.scripts)?presetData.scripts:[];
            return presetData;
        };
        const safe=value=>escapeCardHtml(JSON.stringify(previewResourceValue(value),null,2));
        if(links.worldbook){
            const snapshot=getSnapshot('worldbook');
            if(!snapshot)sections.push('<div class="character-resource-empty">这是旧版关联记录，当前没有可用快照。请重新载入对应世界书并点击「重新关联当前」以保存完整内容。</div>');
            else{
                const entries=Object.entries(snapshot.entries||{});
                const rows=entries.map(([uid,item],i)=>'<details class="character-resource-item"><summary><strong>'+escapeCardHtml(item&& (item.comment||item.name||item.title)||('世界书条目 '+(i+1)))+'</strong><span>'+escapeCardHtml(uid)+'</span></summary><pre>'+safe(item)+'</pre></details>').join('');
                sections.push('<details class="character-resource-group" open><summary>独立世界书内容 <span>'+entries.length+' 条</span></summary><div class="character-resource-body">'+(rows||'<p class="tool-help">当前世界书没有条目。</p>')+'</div></details>');
            }
        }
        if(links.preset){
            const snapshot=getSnapshot('preset');
            if(!snapshot)sections.push('<div class="character-resource-empty">这是旧版预设关联，当前没有可用快照。请重新关联当前预设以保存完整内容。</div>');
            else{
                const items=Array.isArray(snapshot.prompts)?snapshot.prompts:[];
                const rows=items.map((item,i)=>'<details class="character-resource-item"><summary><strong>'+escapeCardHtml(item&&(item.name||item.identifier)||('提示词 '+(i+1)))+'</strong><span>'+((item&&item.enabled===false)?'已禁用':'启用')+'</span></summary><pre>'+safe(item)+'</pre></details>').join('');
                sections.push('<details class="character-resource-group"><summary>独立预设内容 <span>'+items.length+' 条提示词</span></summary><div class="character-resource-body">'+(rows||'<p class="tool-help">当前预设没有提示词。</p>')+'</div></details>');
            }
        }
        if(links.regex){
            const snapshot=getSnapshot('regex');
            if(!Array.isArray(snapshot))sections.push('<div class="character-resource-empty">正则快照缺失或格式异常，请重新关联当前正则规则。</div>');
            else{
                const rows=snapshot.map((item,i)=>'<details class="character-resource-item"><summary><strong>'+escapeCardHtml(item&&(item.scriptName||item.name||item.title)||('正则 '+(i+1)))+'</strong></summary><pre>'+safe(item)+'</pre></details>').join('');
                sections.push('<details class="character-resource-group"><summary>已关联正则规则 <span>'+snapshot.length+' 条</span></summary><div class="character-resource-body">'+(rows||'<p class="tool-help">没有正则规则。</p>')+'</div></details>');
            }
        }
        if(links.scripts){
            const snapshot=getSnapshot('scripts');
            if(!Array.isArray(snapshot))sections.push('<div class="character-resource-empty">脚本快照缺失或格式异常，请重新关联当前脚本。</div>');
            else{
                const rows=snapshot.map((item,i)=>'<details class="character-resource-item"><summary><strong>'+escapeCardHtml(item&&(item.name||item.scriptName||item.title)||('脚本 '+(i+1)))+'</strong></summary><pre>'+safe(item)+'</pre></details>').join('');
                sections.push('<details class="character-resource-group"><summary>已关联脚本 <span>'+snapshot.length+' 个</span></summary><div class="character-resource-body">'+(rows||'<p class="tool-help">没有脚本。</p>')+'</div></details>');
            }
        }
        if(links.extensions){
            const snapshot=getSnapshot('extensions');
            if(!snapshot)sections.push('<div class="character-resource-empty">这是旧版正则 / 脚本关联，当前没有可用快照。请重新关联当前预设以保存完整内容。</div>');
            else{
                const regex=Array.isArray(snapshot.regex_scripts)?snapshot.regex_scripts:[];
                const scripts=Array.isArray(snapshot.scripts)?snapshot.scripts:[];
                const regexRows=regex.map((item,i)=>'<details class="character-resource-item"><summary><strong>'+escapeCardHtml(item&&(item.scriptName||item.name||item.title)||('正则 '+(i+1)))+'</strong></summary><pre>'+safe(item)+'</pre></details>').join('');
                const scriptRows=scripts.map((item,i)=>'<details class="character-resource-item"><summary><strong>'+escapeCardHtml(item&&(item.name||item.scriptName||item.title)||('脚本 '+(i+1)))+'</strong></summary><pre>'+safe(item)+'</pre></details>').join('');
                sections.push('<details class="character-resource-group"><summary>正则规则 <span>'+regex.length+' 条</span></summary><div class="character-resource-body">'+(regexRows||'<p class="tool-help">没有正则规则。</p>')+'</div></details>');
                sections.push('<details class="character-resource-group"><summary>脚本内容 <span>'+scripts.length+' 个</span></summary><div class="character-resource-body">'+(scriptRows||'<p class="tool-help">没有脚本。</p>')+'</div></details>');
            }
        }
        host.innerHTML=sections.length?sections.join(''):'<div class="character-resource-empty">尚未关联独立世界书、预设或正则 / 脚本。</div>';
    }

    function linkCurrentCardResource(kind){
        if(!currentCard||!currentCardLinkKey)return;
        const active=getActiveResourceInfo(kind);
        if(!active){showToast('请先载入有效的'+(kind==='worldbook'?'世界书':kind==='preset'?'预设':'包含正则或脚本的预设'),'error');return}
        const store=loadCardLinkStore();
        if(!isObject(store[currentCardLinkKey]))store[currentCardLinkKey]={};
        const source=kind==='worldbook'?worldBookData:presetData;
        let snapshot;
        try{
            if(kind==='extensions')snapshot={regex_scripts:Array.isArray(source.regex_scripts)?source.regex_scripts:Array.isArray(source.regexScripts)?source.regexScripts:[],scripts:Array.isArray(source.scripts)?source.scripts:[]};
            else if(kind==='regex')snapshot=Array.isArray(source.regex_scripts)?source.regex_scripts:Array.isArray(source.regexScripts)?source.regexScripts:[];
            else if(kind==='scripts')snapshot=Array.isArray(source.scripts)?source.scripts:[];
            else snapshot=JSON.parse(JSON.stringify(source));
            snapshot=JSON.parse(JSON.stringify(snapshot));
        }catch(error){showToast('无法生成资源快照：'+error.message,'error');return}
        store[currentCardLinkKey][kind]={name:active.name,label:active.label,fingerprint:active.fingerprint,linkedAt:new Date().toISOString(),snapshot};
        if(saveCardLinkStore(store)){renderCharacterCardLinks();showToast('已关联并保存完整资源快照；后续切换工作区也可查看','success')}
    }

    function unlinkCurrentCardResource(kind){
        if(!currentCard||!currentCardLinkKey)return;
        const store=loadCardLinkStore();
        if(!isObject(store[currentCardLinkKey])||!store[currentCardLinkKey][kind])return;
        delete store[currentCardLinkKey][kind];
        if(!Object.keys(store[currentCardLinkKey]).length)delete store[currentCardLinkKey];
        if(saveCardLinkStore(store)){renderCharacterCardLinks();showToast('已解除关联，原始资源未受影响','success')}
    }

    function refreshCharacterCardLinks(){renderCharacterCardLinks()}

    function exportCharacterResourceBundle(){
        if(!currentCard||!currentCardLinkKey){showToast('请先载入角色卡','error');return}

        const store=loadCardLinkStore();
        const links=store[currentCardLinkKey]||{};
        const resources={};
        const manifestResources=[];
        const stale=[];
        ['worldbook','preset','regex','scripts','extensions'].forEach(kind=>{
            const link=links[kind];
            if(!link)return;
            const active=getActiveResourceInfo(kind);
            let source=link.snapshot;
            const hasSnapshot=source!==undefined&&source!==null&&(isObject(source)||Array.isArray(source));
            if(!hasSnapshot&&active&&active.fingerprint===link.fingerprint)source=kind==='worldbook'?worldBookData:kind==='regex'?(Array.isArray(presetData.regex_scripts)?presetData.regex_scripts:Array.isArray(presetData.regexScripts)?presetData.regexScripts:[]):kind==='scripts'?(Array.isArray(presetData.scripts)?presetData.scripts:[]):presetData;
            if(source===undefined||source===null||(!isObject(source)&&!Array.isArray(source))){stale.push(kind==='worldbook'?'独立世界书':kind==='preset'?'独立预设':kind==='regex'?'正则规则':kind==='scripts'?'脚本':'正则 / 脚本');return}
            if(kind==='extensions'){
                resources.extensions={regex_scripts:Array.isArray(source.regex_scripts)?source.regex_scripts:Array.isArray(source.regexScripts)?source.regexScripts:[],scripts:Array.isArray(source.scripts)?source.scripts:[]};
            }else resources[kind]=JSON.parse(JSON.stringify(source));
            manifestResources.push({
                type:kind,
                name:link.name,
                summary:link.label,
                fingerprint:link.fingerprint,
                linked_at:link.linkedAt
            });
        });
        if(stale.length){
            showToast('关联资源已变化或未载入：'+stale.join('、')+'。请先重新关联再导出。','error');
            renderCharacterCardLinks();
            return;
        }
        if(!manifestResources.length){showToast('请至少关联一个独立世界书或预设，再导出资源包','error');return}
        const data=currentCard.data||currentCard;
        const bundle={
            format:'another-world-character-resource-bundle',
            format_version:1,
            created_at:new Date().toISOString(),
            manifest:{
                character:{name:data.name||'未命名角色',spec:currentCard.spec||'chara_card_v1',spec_version:currentCard.spec_version||'1.0',source_filename:currentCardFile&&currentCardFile.name||''},
                resources:manifestResources,
                notes:['此文件是资源快照包，不会修改原始角色卡、世界书或预设。','角色卡以 JSON 数据形式收录，不包含原始 PNG 图片像素。','关联记录本身仍保存在创建此资源包的浏览器本地。']
            },
            character_card:JSON.parse(JSON.stringify(currentCard)),
            resources
        };
        const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        const anchor=document.createElement('a');
        anchor.href=url;
        anchor.download=(String(data.name||'character').replace(/[\\/:*?"<>|]/g,'_')||'character')+'_resource_bundle.json';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        showToast('关联资源包已导出；原始资源未被修改','success');
    }

    function stageCharacterResourceBundle(file){
        if(!file)return;
        const requestId=++bundleImportSequence;
        stagedResourceBundle=null;
        const previousHost=document.getElementById('characterCardBundleImportPreview');
        if(previousHost){previousHost.hidden=true;previousHost.innerHTML=''}
        if(file.size>MAX_FILE_BYTES)throw new Error('资源包超过 100 MB，已停止读取。');
        const textPromise=file.text();
        textPromise.then(raw=>{
            if(requestId!==bundleImportSequence)return;
            let bundle;
            try{bundle=JSON.parse(raw)}catch(error){throw new Error('资源包 JSON 无法解析：'+error.message)}
            if(!isObject(bundle)||bundle.format!=='another-world-character-resource-bundle'||bundle.format_version!==1)throw new Error('不支持的资源包格式或版本。');
            if(!isObject(bundle.manifest)||!isObject(bundle.manifest.character)||!Array.isArray(bundle.manifest.resources)||!isObject(bundle.character_card)||!isObject(bundle.resources))throw new Error('资源包缺少必要的清单、角色卡或资源数据。');
            const cardInfo=getCardData(bundle.character_card);
            const allowed=new Set(['worldbook','preset','regex','scripts','extensions']);
            const seen=new Set();
            const validated=[];
            bundle.manifest.resources.forEach(item=>{
                if(!isObject(item)||!allowed.has(item.type)||seen.has(item.type))throw new Error('资源清单包含未知或重复的资源类型。');
                seen.add(item.type);
                const payload=bundle.resources[item.type];
                if(item.type==='regex'||item.type==='scripts'){if(!Array.isArray(payload))throw new Error('资源包中的 '+item.type+' 必须是数组。');}
                else if(!isObject(payload))throw new Error('资源包缺少 '+item.type+' 数据。');
                if(item.type==='worldbook'){
                    if(!isObject(payload.entries)||Array.isArray(payload.entries))throw new Error('世界书数据结构无效。');
                    Object.entries(payload.entries).forEach(([uid,entry])=>{if(!uid||!isObject(entry))throw new Error('世界书条目结构无效。')});
                }else if(item.type==='preset'&&!isPresetPayloadObject(payload)){
                    throw new Error('预设数据结构无法识别。');
                }
                else if(item.type==='extensions'&&(!Array.isArray(payload.regex_scripts)||!Array.isArray(payload.scripts)))throw new Error('正则 / 脚本资源结构无效。');
                const fingerprint=item.type==='extensions'?resourceFingerprint({regex:payload.regex_scripts,scripts:payload.scripts}):resourceFingerprint(payload);
                if(item.fingerprint&&item.fingerprint!==fingerprint)throw new Error('资源 '+(item.name||item.type)+' 的内容指纹不匹配，资源包可能已损坏。');
                validated.push({type:item.type,name:String(item.name||item.type),summary:String(item.summary||''),fingerprint});
            });
            if(!validated.length)throw new Error('资源包没有可恢复的独立资源。');
            stagedResourceBundle=bundle;
            const host=document.getElementById('characterCardBundleImportPreview');
            if(host){
                host.hidden=false;
                host.innerHTML='<div class="character-bundle-preview-head"><strong>'+escapeCardHtml(cardInfo.name)+'</strong><span>'+validated.length+' 项独立资源已通过结构检查</span></div>'+validated.map(item=>'<div class="character-bundle-preview-item"><strong>'+escapeCardHtml(item.type==='worldbook'?'独立世界书':item.type==='preset'?'独立预设':item.type==='regex'?'正则规则':item.type==='scripts'?'脚本':'正则 / 脚本')+'</strong><span>'+escapeCardHtml(item.name)+' · '+escapeCardHtml(item.summary)+'</span></div>').join('')+'<div class="character-bundle-import-actions"><button class="btn btn-sm btn-primary" type="button" data-action="bundle-import-card">导入角色卡</button>'+validated.map(item=>'<button class="btn btn-sm" type="button" data-action="bundle-restore-resource" data-kind="'+item.type+'">恢复'+(item.type==='worldbook'?'世界书':item.type==='preset'?'预设':item.type==='regex'?'正则规则':item.type==='scripts'?'脚本':'正则 / 脚本')+'</button>').join('')+'<button class="btn btn-sm btn-ghost" type="button" data-action="bundle-clear-stage">清除待导入包</button></div>';
            }
            showToast('资源包检查完成；尚未修改任何现有资源','success');
        }).catch(error=>{if(requestId===bundleImportSequence)showToast(error.message||'资源包读取失败','error')});
    }

    function triggerCharacterBundleImport(){
        const input=document.getElementById('characterCardBundleFileInput');
        if(input)input.click();
    }

    async function onCharacterBundleFileChosen(event){
        const input=event.target;
        const file=input.files&&input.files[0];
        input.value='';
        if(file){try{stageCharacterResourceBundle(file)}catch(error){showToast(error.message||'资源包读取失败','error')}}
    }

    function clearStagedCharacterResourceBundle(){
        bundleImportSequence++;
        stagedResourceBundle=null;
        const host=document.getElementById('characterCardBundleImportPreview');
        if(host){host.hidden=true;host.innerHTML=''}
    }

    async function importStagedBundleCharacter(){
        if(!stagedResourceBundle)return;
        const card=stagedResourceBundle.character_card;
        const info=getCardData(card);
        const file=new File([JSON.stringify(card)],(info.name||'character')+'_bundle.json',{type:'application/json'});
        await importCharacterCard(file);
    }

    function restoreLastBundleBackup(kind){
        if(!['worldbook','preset','regex','scripts','extensions'].includes(kind))return;
        const key=kind==='worldbook'?'another_world_pre_bundle_worldbook_backup':kind==='preset'?'another_world_pre_bundle_preset_backup':'another_world_pre_bundle_extensions_backup';
        const raw=localStorage.getItem(key);
        if(!raw){showToast('没有找到该工作区的恢复前备份','error');return}
        const backup=JSON.parse(raw);
        if(kind==='worldbook'){
            if(!isObject(backup.data)||!isObject(backup.data.entries))throw new Error('世界书备份结构无效。');
            pushHistory();
            worldBookData=JSON.parse(JSON.stringify(backup.data));
            Object.keys(worldBookData.entries).forEach(uid=>{worldBookData.entries[uid]=sanitizeEntry(worldBookData.entries[uid],uid)});
            const keys=Object.keys(worldBookData.entries);
            activeUid=keys[0]||null;
            selectedUids.clear();selectMode=false;
            renderEntryList();loadActiveEntry();updateEntryCount();scheduleAutoSave();updateToolbar();
        }else{
            const items=backup.items;
            if(!isObject(items))throw new Error('预设备份结构无效。');
            const keys=['tavern_preset_editor_data','tavern_preset_editor_version','tavern_preset_editor_envelope','tavern_preset_editor_array_paths'];
            keys.forEach(storageKey=>{
                const value=Object.prototype.hasOwnProperty.call(items,storageKey)?items[storageKey]:null;
                if(value===null)localStorage.removeItem(storageKey);else localStorage.setItem(storageKey,value);
            });
            presetData=items.tavern_preset_editor_data?JSON.parse(items.tavern_preset_editor_data):null;
            presetVersion=parseInt(items.tavern_preset_editor_version,10)||1;
            presetEnvelope=items.tavern_preset_editor_envelope?JSON.parse(items.tavern_preset_editor_envelope):null;
            presetArrayPaths=items.tavern_preset_editor_array_paths?JSON.parse(items.tavern_preset_editor_array_paths):{};
            renderPresetUI();refreshExtensionWorkspace();updateToolbar();
        }
        const status=document.getElementById('characterCardBundleRestoreStatus');
        if(status)status.textContent='已恢复最近一次资源包导入前备份。';
        showToast('已恢复最近一次本地备份','success');
    }

    function restoreStagedBundleResource(kind){
        if(!stagedResourceBundle||!['worldbook','preset','regex','scripts','extensions'].includes(kind))return;
        const payload=stagedResourceBundle.resources[kind];
        if(kind==='regex'||kind==='scripts'){if(!Array.isArray(payload))throw new Error('资源包中不存在有效的'+kind+'数组。');}
        else if(!isObject(payload))throw new Error('资源包中不存在该资源。');
        const label=kind==='worldbook'?'独立世界书':kind==='preset'?'独立预设':kind==='regex'?'正则规则':kind==='scripts'?'脚本':'正则 / 脚本';
        if(kind==='extensions'||kind==='regex'||kind==='scripts'){
            if(kind==='extensions'&&(!isObject(payload)||(!Array.isArray(payload.regex_scripts)&&!Array.isArray(payload.scripts))))throw new Error('资源包中的正则 / 脚本结构无效。');
            if((kind==='regex'||kind==='scripts')&&!Array.isArray(payload))throw new Error('资源包中的'+label+'数组结构无效。');
            if(!confirm('将用资源包中的'+label+'替换当前预设对应部分，其他预设字段保持不变。是否继续？'))return;
            const backup={saved_at:new Date().toISOString(),items:{}};
            ['tavern_preset_editor_data','tavern_preset_editor_version','tavern_preset_editor_envelope','tavern_preset_editor_array_paths'].forEach(key=>backup.items[key]=localStorage.getItem(key));
            localStorage.setItem('another_world_pre_bundle_extensions_backup',JSON.stringify(backup));
            recordPresetEditHistory(false);
            if(kind==='extensions'||kind==='regex'){
                const regexPayload=kind==='regex'?payload:(payload.regex_scripts||[]);
                if(Array.isArray(presetData.regex_scripts))presetData.regex_scripts=JSON.parse(JSON.stringify(regexPayload));
                else if(Array.isArray(presetData.regexScripts))presetData.regexScripts=JSON.parse(JSON.stringify(regexPayload));
                else presetData.regex_scripts=JSON.parse(JSON.stringify(regexPayload));
            }
            if(kind==='extensions'||kind==='scripts')presetData.scripts=JSON.parse(JSON.stringify(kind==='scripts'?payload:(payload.scripts||[])));
            refreshExtensionWorkspace();schedulePresetSave();updateToolbar();
            showToast(label+'已恢复；其他预设字段未修改','success');
            return;
        }
        if(!confirm('即将用资源包中的'+label+'替换当前工作区内容。\n\n系统会先在本地保存一份恢复前备份。是否继续？'))return;
        if(kind==='worldbook'){
            if(!isObject(payload.entries)||Array.isArray(payload.entries))throw new Error('世界书 entries 结构无效。');
            const backup={saved_at:new Date().toISOString(),data:JSON.parse(JSON.stringify(worldBookData))};
            localStorage.setItem('another_world_pre_bundle_worldbook_backup',JSON.stringify(backup));
            pushHistory();
            const entries={};
            Object.entries(payload.entries).forEach(([uid,entry])=>{entries[String(uid)]=sanitizeEntry(entry,String(uid))});
            worldBookData={...JSON.parse(JSON.stringify(payload)),entries};
            const keys=Object.keys(entries);
            activeUid=keys[0]||null;
            selectedUids.clear();selectMode=false;
            renderEntryList();loadActiveEntry();updateEntryCount();scheduleAutoSave();updateToolbar();
        }else{
            if(!isPresetPayloadObject(payload))throw new Error('预设数据结构无效。');
            const keys=['tavern_preset_editor_data','tavern_preset_editor_version','tavern_preset_editor_envelope','tavern_preset_editor_array_paths'];
            const backup={saved_at:new Date().toISOString(),items:{}};
            keys.forEach(key=>{backup.items[key]=localStorage.getItem(key)});
            localStorage.setItem('another_world_pre_bundle_preset_backup',JSON.stringify(backup));
            setPresetFromParsed(JSON.parse(JSON.stringify(payload)));
            renderPresetUI();
            refreshExtensionWorkspace();
            schedulePresetSave();
            updateToolbar();
        }
        const status=document.getElementById('characterCardBundleRestoreStatus');
        if(status)status.innerHTML=escapeCardHtml(label+'已恢复；恢复前备份已保存在本地浏览器。')+' <button class="btn btn-sm btn-ghost" type="button" data-action="bundle-restore-backup" data-kind="'+kind+'">撤销并恢复导入前备份</button>';
        showToast(label+'恢复完成；原数据备份已保存','success');
    }

    function fieldPreview(data,key){
        const value=data[key];
        if(typeof value==='string' && value.trim()) return value;
        if(Array.isArray(value) && value.length) return value.map(x=>typeof x==='string'?x:JSON.stringify(x)).join('\n');
        return '';
    }

    function previewResourceValue(value,depth=0){
        if(typeof value==='string'){
            if(value.startsWith('data:'))return '[data URL 内容已折叠]';
            return value.length>900?value.slice(0,900)+'…（预览已截断）':value;
        }
        if(value===null||typeof value!=='object')return value;
        if(depth>=4)return '[嵌套层级较深，完整内容请查看高级 JSON]';
        if(Array.isArray(value))return value.slice(0,20).map(item=>previewResourceValue(item,depth+1)).concat(value.length>20?['…其余 '+(value.length-20)+' 项已折叠']:[]);
        const result={};
        Object.keys(value).slice(0,40).forEach(key=>{result[key]=previewResourceValue(value[key],depth+1)});
        if(Object.keys(value).length>40)result['…']=(Object.keys(value).length-40)+' 个字段已折叠';
        return result;
    }

    function renderResourcePreview(data){
        const host=document.getElementById('characterCardResources');
        if(!host)return;
        const book=isObject(data.character_book)?data.character_book:null;
        const entries=book&&Array.isArray(book.entries)?book.entries:[];
        const assets=Array.isArray(data.assets)?data.assets:[];
        const extensions=isObject(data.extensions)?data.extensions:null;
        const sections=[];

        if(book){
            const bookMeta=[book.name?'名称：'+book.name:'',book.scan_depth!==undefined?'扫描深度：'+book.scan_depth:'',book.token_budget!==undefined?'Token 预算：'+book.token_budget:''].filter(Boolean).join(' · ');
            const entryHtml=entries.length?entries.map((entry,index)=>{
                const item=isObject(entry)?entry:{content:String(entry)};
                const title=item.name||item.comment||('世界书条目 '+(index+1));
                const keys=Array.isArray(item.keys)?item.keys.join('、'):(typeof item.keys==='string'?item.keys:'无触发词');
                const enabled=item.enabled===false?'已禁用':'启用状态未关闭';
                const content=typeof item.content==='string'?item.content:JSON.stringify(previewResourceValue(item.content),null,2);
                return '<details class="character-resource-item"><summary><strong>'+escapeCardHtml(title)+'</strong><span>'+escapeCardHtml(enabled)+' · '+escapeCardHtml(keys)+'</span></summary><pre>'+escapeCardHtml(content||'（空内容）')+'</pre></details>';
            }).join(''):'<p class="tool-help">该内嵌世界书目前没有条目。</p>';
            sections.push('<details class="character-resource-group" open><summary>内嵌世界书 <span>'+entries.length+' 条目</span></summary><div class="character-resource-body">'+(bookMeta?'<p class="tool-help">'+escapeCardHtml(bookMeta)+'</p>':'')+entryHtml+'<details class="character-card-embedded-editor"><summary>编辑内嵌世界书数据</summary><p class="tool-help">可编辑完整 character_book，包括全部条目、触发词、位置、深度与扩展字段。应用前会验证 JSON 和 entries 数组；不会影响独立世界书。</p><textarea id="characterCardBookJsonEditor" rows="12" spellcheck="false">'+escapeCardHtml(JSON.stringify(book,null,2))+'</textarea><button class="btn btn-sm btn-primary" type="button" data-action="apply-character-card-book-json">校验并应用内嵌世界书</button></details></div></details>');
        }else{
            sections.push('<div class="character-resource-empty">未包含内嵌 character_book。可在高级 JSON 编辑中新增 character_book。</div>');
        }

        if(assets.length){
            const assetHtml=assets.map((asset,index)=>{
                const item=isObject(asset)?asset:{uri:asset};
                const uri=typeof item.uri==='string'?(item.uri.startsWith('data:')?'data URL（内容已隐藏）':item.uri):'未提供 URI';
                return '<div class="character-resource-asset"><strong>'+escapeCardHtml(item.name||('资源 '+(index+1)))+'</strong><span>'+escapeCardHtml(item.type||'未标注类型')+' · '+escapeCardHtml(item.ext||'未知格式')+'</span><code>'+escapeCardHtml(uri)+'</code></div>';
            }).join('');
            sections.push('<details class="character-resource-group"><summary>V3 附带资源 <span>'+assets.length+' 项</span></summary><div class="character-resource-body">'+assetHtml+'</div></details>');
        }else{
            sections.push('<div class="character-resource-empty">没有检测到 V3 assets 资源。</div>');
        }

        if(extensions){
            const keys=Object.keys(extensions);
            const extensionHtml=keys.length?keys.map(key=>{
                const value=JSON.stringify(previewResourceValue(extensions[key]),null,2);
                const kind=/regex/i.test(key)?'正则相关':/script/i.test(key)?'脚本相关':'扩展字段';
                return '<details class="character-resource-item"><summary><strong>'+escapeCardHtml(key)+'</strong><span>'+kind+' · '+escapeCardHtml(Array.isArray(extensions[key])?'数组':extensions[key]===null?'null':typeof extensions[key])+'</span></summary><pre>'+escapeCardHtml(value??'null')+'</pre></details>';
            }).join(''):'<p class="tool-help">extensions 对象为空。</p>';
            sections.push('<details class="character-resource-group"><summary>扩展数据 <span>'+keys.length+' 个字段</span></summary><div class="character-resource-body">'+extensionHtml+'<details class="character-card-embedded-editor"><summary>编辑角色卡扩展数据</summary><p class="tool-help">这里保留角色卡原有扩展结构。若其中包含 regex_scripts、scripts 或其他插件字段，可在此完整查看和编辑；未知字段不会被丢弃。</p><textarea id="characterCardExtensionsJsonEditor" rows="12" spellcheck="false">'+escapeCardHtml(JSON.stringify(extensions,null,2))+'</textarea><button class="btn btn-sm btn-primary" type="button" data-action="apply-character-card-extensions-json">校验并应用扩展数据</button></details></div></details>');
        }else{
            sections.push('<div class="character-resource-empty">没有检测到 extensions 对象。可在高级 JSON 编辑中新增。</div>');
        }
        host.innerHTML=sections.join('');
    }

    function applyEmbeddedCardResourceJson(kind){
        if(!currentCard||!currentCardFile)throw new Error('请先载入或创建角色卡。');
        const config=kind==='worldbook'
            ?{id:'characterCardBookJsonEditor',key:'character_book',label:'内嵌世界书'}
            :{id:'characterCardExtensionsJsonEditor',key:'extensions',label:'扩展数据'};
        const editor=document.getElementById(config.id);
        if(!editor)throw new Error('找不到'+config.label+'编辑器。');
        let parsed;
        try{parsed=JSON.parse(editor.value)}catch(error){throw new Error(config.label+' JSON 语法错误：'+error.message)}
        if(!isObject(parsed))throw new Error(config.label+'必须是 JSON 对象。');
        if(kind==='worldbook'){
            if(parsed.entries!==undefined&&!Array.isArray(parsed.entries))throw new Error('character_book.entries 必须是数组。');
            if(Array.isArray(parsed.entries)&&parsed.entries.some(entry=>!isObject(entry)))throw new Error('世界书 entries 中的每一项都必须是对象。');
        }
        const data=isObject(currentCard.data)?currentCard.data:currentCard;
        data[config.key]=parsed;
        const card={...getCardData(currentCard),container:'PNG',chunk:'已编辑内嵌资源'};
        renderCard(card,currentCardFile);
        cardDirty=true;
        updateCardSaveStatus();
        scheduleCharacterCardDraftSave();
        showToast(config.label+'已校验并应用；原有未知字段均保留','success');
    }


    function openCardDraftDb(){
        if(!('indexedDB' in window))return Promise.resolve(null);
        if(cardDraftDbPromise)return cardDraftDbPromise;
        cardDraftDbPromise=new Promise(resolve=>{
            let request;
            try{request=indexedDB.open(CARD_DRAFT_DB_NAME,1)}catch(error){resolve(null);return}
            request.onupgradeneeded=()=>{
                const db=request.result;
                if(!db.objectStoreNames.contains(CARD_DRAFT_STORE_NAME))db.createObjectStore(CARD_DRAFT_STORE_NAME,{keyPath:'id'});
            };
            request.onsuccess=()=>resolve(request.result);
            request.onerror=()=>resolve(null);
            request.onblocked=()=>resolve(null);
        });
        return cardDraftDbPromise;
    }

    function scheduleCharacterCardDraftSave(){
        if(!currentCard)return;
        clearTimeout(cardDraftSaveTimer);
        cardDraftSaveTimer=setTimeout(saveCharacterCardDraft,350);
    }

    async function saveCharacterCardDraft(){
        if(!currentCard)return;
        const rawEditor=document.getElementById('characterCardRawJson');
        const payload={
            id:CARD_DRAFT_KEY,
            root:JSON.stringify(currentCard),
            rawJsonText:rawEditor?rawEditor.value:'',
            fileName:currentCardFile&&currentCardFile.name?currentCardFile.name:((currentCard.data?.name||currentCard.name||'character-card')+'.json'),
            fileType:currentCardFile&&currentCardFile.type?currentCardFile.type:'',
            fileBlob:currentCardFile&&String(currentCardFile.type||'').startsWith('image/')?currentCardFile.slice(0,currentCardFile.size,currentCardFile.type):null,
            container:currentCard.container||'JSON',
            chunk:currentCard.chunk||'',
            dirty:!!cardDirty,
            savedAt:new Date().toISOString()
        };
        try{
            const db=await openCardDraftDb();
            if(db){
                await new Promise((resolve,reject)=>{
                    const tx=db.transaction(CARD_DRAFT_STORE_NAME,'readwrite');
                    tx.objectStore(CARD_DRAFT_STORE_NAME).put(payload);
                    tx.oncomplete=resolve;
                    tx.onerror=()=>reject(tx.error||new Error('IndexedDB 写入失败'));
                    tx.onabort=()=>reject(tx.error||new Error('IndexedDB 写入已中止'));
                });
                const status=document.getElementById('characterCardEditStatus');
                if(status)status.textContent='已自动保存在本地浏览器 · '+new Date(payload.savedAt).toLocaleTimeString();
                return true;
            }
        }catch(error){console.warn('角色卡 IndexedDB 自动保存失败：',error)}
        try{
            const fallback={...payload,fileBlob:null};
            localStorage.setItem(CARD_DRAFT_STORAGE_KEY,JSON.stringify(fallback));
            const status=document.getElementById('characterCardEditStatus');
            if(status)status.textContent='角色卡数据已保存在本地浏览器（未缓存原图）';
            return true;
        }catch(error){
            const status=document.getElementById('characterCardEditStatus');
            if(status)status.textContent='本地保存失败：浏览器存储空间可能不足，请立即导出 JSON 备份';
            console.warn('角色卡本地备份失败：',error);
            return false;
        }
    }

    async function readCharacterCardDraft(){
        const db=await openCardDraftDb();
        if(db){
            try{
                const record=await new Promise((resolve,reject)=>{
                    const tx=db.transaction(CARD_DRAFT_STORE_NAME,'readonly');
                    const request=tx.objectStore(CARD_DRAFT_STORE_NAME).get(CARD_DRAFT_KEY);
                    request.onsuccess=()=>resolve(request.result||null);
                    request.onerror=()=>reject(request.error);
                });
                if(record)return record;
            }catch(error){console.warn('读取角色卡 IndexedDB 草稿失败：',error)}
        }
        try{
            const raw=localStorage.getItem(CARD_DRAFT_STORAGE_KEY);
            return raw?JSON.parse(raw):null;
        }catch(error){console.warn('读取角色卡本地草稿失败：',error);return null}
    }

    async function restoreCharacterCardDraft(){
        const draft=await readCharacterCardDraft();
        if(!draft||!draft.root)return;
        try{
            const root=JSON.parse(draft.root);
            const parsed=getCardData(root);
            const file=draft.fileBlob instanceof Blob
                ?new File([draft.fileBlob],draft.fileName||'character-card.png',{type:draft.fileType||draft.fileBlob.type||'image/png',lastModified:Date.now()})
                :new File([JSON.stringify(root,null,2)],draft.fileName||((parsed.name||'character-card')+'.json'),{type:'application/json',lastModified:Date.now()});
            parsed.container=draft.container||'JSON';
            parsed.chunk=draft.chunk||'本地自动恢复';
            currentCardLinkKey=getCardLinkKey(parsed,file);
            renderCard(parsed,file);
            cardDirty=!!draft.dirty;
            const rawEditor=document.getElementById('characterCardRawJson');
            if(rawEditor&&typeof draft.rawJsonText==='string'&&draft.rawJsonText)rawEditor.value=draft.rawJsonText;
            const rawStatus=document.getElementById('characterCardRawStatus');
            if(rawStatus&&draft.rawJsonText&&draft.rawJsonText!==JSON.stringify(root,null,2))rawStatus.textContent='已恢复尚未应用的 JSON 草稿；检查后点击应用';
            updateCardSaveStatus();
            const status=document.getElementById('characterCardEditStatus');
            if(status)status.textContent='已从本地自动恢复：'+parsed.name+' · '+new Date(draft.savedAt||Date.now()).toLocaleString();
            showToast('已恢复上次角色卡：'+parsed.name,'success');
        }catch(error){
            console.warn('恢复角色卡草稿失败：',error);
            showToast('上次角色卡草稿无法恢复，请检查本地存储','error');
        }
    }

    function renderCard(card,file){
        const panel=document.getElementById('characterCardPreview');
        const empty=document.getElementById('characterCardEmpty');
        if(!panel||!empty)return;
        empty.hidden=true;
        panel.hidden=false;
        const data=card.data;
        const fields=[
            ['name','角色名称'],['description','角色描述'],['personality','性格'],['scenario','场景'],['first_mes','开场白'],
            ['mes_example','对话示例'],['creator_notes','作者备注'],['system_prompt','系统提示词'],
            ['post_history_instructions','历史后指令']
        ];
        const known=new Set(['name','description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions','alternate_greetings','tags','character_book','extensions','nickname','source','creator_notes_multilingual','creation_date','modification_date','group_only_greetings','assets']);
        const extra=Object.keys(data).filter(key=>!known.has(key));
        const book=data.character_book;
        const greetings=Array.isArray(data.alternate_greetings)?data.alternate_greetings.length:0;
        const tags=Array.isArray(data.tags)?data.tags:[];
        document.getElementById('characterCardName').textContent=card.name;
        document.getElementById('characterCardMeta').textContent=card.spec+' · '+card.version+' · '+card.container+(card.chunk?' / '+card.chunk:'');
        document.getElementById('characterCardTags').textContent=tags.length?tags.join(' · '):'暂无标签';
        document.getElementById('characterCardStats').innerHTML=[
            ['备用开场白',greetings],['世界书条目',book&&Array.isArray(book.entries)?book.entries.length:0],
            ['扩展字段',isObject(data.extensions)?Object.keys(data.extensions).length:0],['V3 资源',Array.isArray(data.assets)?data.assets.length:0],['未归类字段',extra.length]
        ].map(([label,count])=>'<div class="character-stat"><strong>'+count+'</strong><span>'+label+'</span></div>').join('');
        document.getElementById('characterCardFields').innerHTML=fields.map(([key,label])=>{
            const value=typeof data[key]==='string'?data[key]:'';
            return '<label class="character-edit-field"><span>'+label+'</span><textarea rows="'+(key==='description'||key==='mes_example'?5:3)+'" data-card-field="'+key+'" spellcheck="false">'+escapeCardHtml(value)+'</textarea></label>';
        }).join('') + '<label class="character-edit-field"><span>标签（用逗号分隔）</span><input type="text" data-card-field="tags" value="'+escapeCardHtml(Array.isArray(data.tags)?data.tags.join(', '):'')+'"></label>';
        document.getElementById('characterCardExtra').textContent=extra.length?extra.join(', '):'无';
        document.getElementById('characterCardBookStatus').textContent=book?'已识别内嵌 character_book':'未内嵌世界书';
        renderResourcePreview(data);
        document.getElementById('characterCardFileName').textContent=file.name;
        const isPngFile=file.type==='image/png'||file.name.toLowerCase().endsWith('.png');
        currentPngBuffer=isPngFile?file.slice(0,file.size).arrayBuffer():null;
        currentPngName=isPngFile?file.name:'';
        currentCardFile=file;
        const rawEditor=document.getElementById('characterCardRawJson');
        if(rawEditor)rawEditor.value=JSON.stringify(card.root,null,2);
        const rawStatus=document.getElementById('characterCardRawStatus');
        if(rawStatus)rawStatus.textContent='修改不会自动应用';
        cardDirty=false;
        updateCardSaveStatus();
        const image=document.getElementById('characterCardImage');
        if(currentImageUrl){URL.revokeObjectURL(currentImageUrl);currentImageUrl=null;}
        if(isPngFile){
            currentImageUrl=URL.createObjectURL(file);
            image.src=currentImageUrl;
            image.hidden=false;
        }else{
            image.removeAttribute('src');
            image.hidden=true;
        }
        document.getElementById('characterCardExportJson').disabled=false;
        const toolbarExport=document.getElementById('toolbarExportCharacterCard');
        if(toolbarExport)toolbarExport.disabled=false;
        currentCard=card.root;
        if(!currentCardLinkKey)currentCardLinkKey=getCardLinkKey(card,currentCardFile);
        renderCharacterCardLinks();
        updateCardSaveStatus();
        scheduleCharacterCardDraftSave();
    }

    async function decodeImageFile(file){
        if(!file||!String(file.type||'').startsWith('image/'))throw new Error('请选择有效的图片文件。');
        if(file.size>MAX_FILE_BYTES)throw new Error('图片超过 100 MB，已停止读取。');
        let bitmap=null,objectUrl=null;
        try{
            const decodeWithImageElement=async()=>{
                if(!objectUrl)objectUrl=URL.createObjectURL(file);
                return await new Promise((resolve,reject)=>{
                    const image=new Image();
                    image.onload=()=>resolve(image);
                    image.onerror=()=>reject(new Error('浏览器无法解码该图片格式。'));
                    image.src=objectUrl;
                });
            };
            if(typeof createImageBitmap==='function'){
                try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})}
                catch(firstError){
                    try{bitmap=await createImageBitmap(file)}
                    catch(secondError){bitmap=await decodeWithImageElement()}
                }
            }else{
                bitmap=await decodeWithImageElement();
            }
            const width=bitmap.width||bitmap.naturalWidth;
            const height=bitmap.height||bitmap.naturalHeight;
            if(!width||!height)throw new Error('图片尺寸无效。');
            if(width*height>40000000)throw new Error('图片像素超过 4000 万，为避免浏览器内存不足，暂不处理。');
            const canvas=document.createElement('canvas');
            canvas.width=width;canvas.height=height;
            const context=canvas.getContext('2d',{alpha:true});
            if(!context)throw new Error('浏览器无法创建图片转换画布。');
            context.drawImage(bitmap,0,0,width,height);
            const pngBlob=await new Promise((resolve,reject)=>{
                canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 转换失败，请尝试其他图片。')),'image/png');
            });
            if(pngBlob.size>MAX_FILE_BYTES)throw new Error('转换后的 PNG 超过 100 MB，已停止处理。');
            return {blob:pngBlob,width,height};
        }catch(error){
            if(error&&/无法解码|像素超过|超过 100 MB|PNG 转换失败|尺寸无效|转换画布/.test(error.message||''))throw error;
            throw new Error('浏览器暂时无法解码该图片格式（'+(file.type||'未知格式')+'）。可以先转换为 JPG、PNG 或 WebP 再导入。');
        }finally{
            if(bitmap&&typeof bitmap.close==='function')bitmap.close();
            if(objectUrl)URL.revokeObjectURL(objectUrl);
        }
    }

    function createBlankCharacterCard(name){
        const safeName=String(name||'新角色').replace(/\.[^.]+$/,'').trim()||'新角色';
        const root={
            spec:'chara_card_v2',spec_version:'2.0',
            data:{
                name:safeName,description:'',personality:'',scenario:'',first_mes:'',mes_example:'',
                creator_notes:'',system_prompt:'',post_history_instructions:'',tags:[],
                extensions:{}
            }
        };
        return {...getCardData(root),container:'PNG',chunk:'新建角色卡'};
    }

    async function importCharacterCardImage(file,forceNew=false){
        if(!file)return;
        const converted=await decodeImageFile(file);
        const baseName=String(file.name||'新角色').replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_').slice(0,100)||'新角色';
        const pngFile=new File([converted.blob],baseName+'.png',{type:'image/png',lastModified:Date.now()});
        const creating=!!forceNew||!currentCard;
        const parsed=creating?createBlankCharacterCard(baseName):getCardData(currentCard);
        parsed.container='PNG';
        parsed.chunk=creating?'新建角色卡':'已转换封面';
        if(creating)currentCardLinkKey='';
        renderCard(parsed,pngFile);
        cardDirty= !creating;
        updateCardSaveStatus();
        showToast(creating?'已从图片创建角色卡，接下来可以填写角色资料':'图片已转换为 PNG 并设为角色卡封面','success');
    }

    async function importCharacterCard(file){
        if(!file)return;
        if(file.size>MAX_FILE_BYTES) throw new Error('文件超过 100 MB，已停止读取。');
        const extension=String(file.name||'').toLowerCase().split('.').pop();
        const isJson=extension==='json'||file.type==='application/json';
        const isPng=extension==='png'||file.type==='image/png';
        const isImage=String(file.type||'').startsWith('image/')||['png','jpg','jpeg','webp','gif','bmp','avif','heic','heif','tif','tiff'].includes(extension);
        if(isJson){
            const text=await file.text();
            let root;
            try{root=JSON.parse(text);}catch(error){throw new Error('JSON 语法错误：'+error.message);}
            const card={...getCardData(root),container:'JSON',chunk:''};
            currentCardLinkKey='';
            renderCard(card,file);
            showToast('已在本地载入角色卡：'+card.name,'success');
            return;
        }
        if(!isImage)throw new Error('请选择 PNG / JSON 角色卡，或可由浏览器解码的图片文件。');
        if(isPng){
            try{
                const card=await parsePng(await file.arrayBuffer());
                currentCardLinkKey='';
                renderCard(card,file);
                showToast('已在本地载入角色卡：'+card.name,'success');
                return;
            }catch(error){
                if(!String(error&&error.message||'').includes('没有找到 chara / ccv3'))throw error;
                // A valid ordinary PNG without embedded card metadata is a cover image, not a broken card.
            }
        }
        await importCharacterCardImage(file);
    }

    function updateCardSaveStatus(){
        const status=document.getElementById('characterCardEditStatus');
        const pngButton=document.getElementById('characterCardExportPng');
        if(status)status.textContent=cardDirty?'有未保存的修改':'修改会同步到导出数据';
        if(pngButton)pngButton.disabled=!currentCard||!currentPngBuffer;
    }

    function updateCharacterCardField(field,value){
        if(!currentCard||!field)return;
        const data=isObject(currentCard.data)?currentCard.data:currentCard;
        if(field==='tags'){
            data.tags=String(value).split(',').map(tag=>tag.trim()).filter(Boolean);
        }else{
            data[field]=String(value);
        }
        cardDirty=true;
        const name=data.name||'未命名角色';
        const title=document.getElementById('characterCardName');
        if(title)title.textContent=name;
        const tags=document.getElementById('characterCardTags');
        if(tags)tags.textContent=Array.isArray(data.tags)&&data.tags.length?data.tags.join(' · '):'暂无标签';
        const rawEditor=document.getElementById('characterCardRawJson');
        if(rawEditor)rawEditor.value=JSON.stringify(currentCard,null,2);
        const rawStatus=document.getElementById('characterCardRawStatus');
        if(rawStatus)rawStatus.textContent='结构化字段已同步到 JSON 编辑器';
        updateCardSaveStatus();
        scheduleCharacterCardDraftSave();
    }

    function applyCharacterCardRawJson(){
        const editor=document.getElementById('characterCardRawJson');
        const status=document.getElementById('characterCardRawStatus');
        if(!editor||!currentCardFile)return;
        try{
            const root=JSON.parse(editor.value);
            const parsed=getCardData(root);
            const prior=currentCard;
            const card={...parsed,container:prior.container,chunk:prior.chunk};
            currentCard=root;
            renderCard(card,currentCardFile);
            cardDirty=true;
            updateCardSaveStatus();
            scheduleCharacterCardDraftSave();
            if(status)status.textContent='JSON 已通过校验并应用';
            showToast('完整角色卡 JSON 已应用','success');
        }catch(error){
            if(status)status.textContent='校验失败：'+error.message;
            showToast('JSON 未应用：'+error.message,'error');
        }
    }

    function crc32(bytes){
        let crc=0xffffffff;
        for(let i=0;i<bytes.length;i++){
            crc^=bytes[i];
            for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
        }
        return (crc^0xffffffff)>>>0;
    }

    function makePngChunk(type,data){
        const typeBytes=new TextEncoder().encode(type);
        const payload=new Uint8Array(data.length+4);
        payload.set(typeBytes,0);
        payload.set(data,4);
        const chunk=new Uint8Array(data.length+12);
        const view=new DataView(chunk.buffer);
        view.setUint32(0,data.length);
        chunk.set(payload,4);
        view.setUint32(data.length+8,crc32(payload));
        return chunk;
    }

    function encodeBase64Utf8(value){
        const bytes=new TextEncoder().encode(value);
        let binary='';
        const step=0x8000;
        for(let i=0;i<bytes.length;i+=step) binary+=String.fromCharCode(...bytes.subarray(i,i+step));
        return btoa(binary);
    }

    async function exportCharacterCardPng(){
        if(!currentCard||!currentPngBuffer) return;
        try{
            const source=new Uint8Array(await currentPngBuffer);
            if(source.length<8||!PNG_SIGNATURE.every((v,i)=>source[i]===v)) throw new Error('原始 PNG 数据无效，无法写回。');
            const outputParts=[source.subarray(0,8)];
            let offset=8,inserted=false;
            const cardJson=JSON.stringify(currentCard);
            const charaMetadata=new TextEncoder().encode('chara\0'+encodeBase64Utf8(cardJson));
            const v3Card=isObject(currentCard.data)?{...currentCard,spec:'chara_card_v3',spec_version:'3.0'}:null;
            const ccv3Metadata=v3Card?new TextEncoder().encode('ccv3\0'+encodeBase64Utf8(JSON.stringify(v3Card))):null;
            while(offset+12<=source.length){
                const length=new DataView(source.buffer,source.byteOffset+offset,4).getUint32(0);
                const type=String.fromCharCode(source[offset+4],source[offset+5],source[offset+6],source[offset+7]);
                const end=offset+12+length;
                if(end>source.length) throw new Error('原始 PNG 结构不完整，已取消导出。');
                const chunkData=source.subarray(offset+8,offset+8+length);
                let isCardMetadata=false;
                if(['tEXt','zTXt','iTXt'].includes(type)){
                    const zero=findNull(chunkData,0);
                    if(zero>0){
                        const keyword=new TextDecoder('latin1').decode(chunkData.subarray(0,zero));
                        isCardMetadata=keyword==='chara'||keyword==='ccv3';
                    }
                }
                if(!isCardMetadata){
                    if(type==='IEND'&&!inserted){
                        outputParts.push(makePngChunk('tEXt',charaMetadata));
                        if(ccv3Metadata)outputParts.push(makePngChunk('tEXt',ccv3Metadata));
                        inserted=true;
                    }
                    outputParts.push(source.subarray(offset,end));
                }
                offset=end;
                if(type==='IEND') break;
            }
            if(!inserted) throw new Error('PNG 缺少 IEND 结束块，无法安全写回。');
            const blob=new Blob(outputParts,{type:'image/png'});
            const url=URL.createObjectURL(blob);
            const anchor=document.createElement('a');
            anchor.href=url;
            const base=(currentCard.data?.name||currentCard.name||'character-card').replace(/[\\\\/:*?"<>|]/g,'_');
            anchor.download=base+'.png';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(()=>URL.revokeObjectURL(url),1500);
            cardDirty=false;
            updateCardSaveStatus();
            scheduleCharacterCardDraftSave();
            showToast('已写回角色数据并导出 PNG','success');
        }catch(error){
            showToast(error.message||'PNG 导出失败','error');
        }
    }

    function exportCharacterCardJson(){
        if(!currentCard)return;
        const blob=new Blob([JSON.stringify(currentCard,null,2)],{type:'application/json;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        const anchor=document.createElement('a');
        anchor.href=url;
        anchor.download=(currentCard.data?.name||currentCard.name||'character-card')+'.json';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
    }

    function triggerCharacterCardImport(){
        const input=document.getElementById('characterCardFileInput');
        if(input)input.click();
    }

    async function onCharacterCardFileChosen(event){
        const input=event.target;
        const file=input.files&&input.files[0];
        input.value='';
        try{await importCharacterCard(file);}catch(error){showToast(error.message||'角色卡导入失败','error');}
    }

    window.hasImportedCharacterCard=()=>!!currentCard;
    window.linkCurrentCardResource=linkCurrentCardResource;
    window.unlinkCurrentCardResource=unlinkCurrentCardResource;
    window.refreshCharacterCardLinks=refreshCharacterCardLinks;
    window.exportCharacterResourceBundle=exportCharacterResourceBundle;
    window.stageCharacterResourceBundle=stageCharacterResourceBundle;
    window.triggerCharacterBundleImport=triggerCharacterBundleImport;
    window.onCharacterBundleFileChosen=onCharacterBundleFileChosen;
    window.clearStagedCharacterResourceBundle=clearStagedCharacterResourceBundle;
    window.importStagedBundleCharacter=importStagedBundleCharacter;
    window.restoreStagedBundleResource=restoreStagedBundleResource;
    window.restoreLastBundleBackup=restoreLastBundleBackup;
    window.updateCharacterCardField=updateCharacterCardField;
    window.applyEmbeddedCharacterCardResource=applyEmbeddedCardResourceJson;
    window.applyCharacterCardRawJson=applyCharacterCardRawJson;
    window.exportCharacterCardPng=exportCharacterCardPng;
    window.importCharacterCard=importCharacterCard;
    window.triggerCharacterCardImport=triggerCharacterCardImport;
    window.onCharacterCardFileChosen=onCharacterCardFileChosen;
    window.importCharacterCardImage=importCharacterCardImage;
    window.triggerCharacterCardImageImport=mode=>{pendingImageImportMode=mode==='replace'?'replace':'new';const input=document.getElementById('characterCardImageInput');if(input)input.click()};
    window.onCharacterCardImageChosen=async event=>{const input=event.target;const file=input.files&&input.files[0];input.value='';const forceNew=pendingImageImportMode!=='replace';pendingImageImportMode='new';try{await importCharacterCardImage(file,forceNew)}catch(error){showToast(error.message||'图片导入失败','error')}};
    window.exportCharacterCardJson=exportCharacterCardJson;
    window.scheduleCharacterCardDraftSave=scheduleCharacterCardDraftSave;
    window.saveCharacterCardDraftNow=saveCharacterCardDraft;
    if(typeof window.addEventListener==='function'){
        window.addEventListener('pagehide',()=>{if(currentCard)saveCharacterCardDraft()});
    }
    if(typeof document.addEventListener==='function'){
        document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&currentCard)saveCharacterCardDraft()});
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',restoreCharacterCardDraft,{once:true});
        else restoreCharacterCardDraft();
    }

})();