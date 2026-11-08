// Independent SillyTavern character-card importer (V1/V2/V3).
// Parsing is local-only: imported files are never uploaded or executed.
(function(){
    const PNG_SIGNATURE = [137,80,78,71,13,10,26,10];
    const MAX_FILE_BYTES = 100 * 1024 * 1024;
    let currentCard = null;
    let currentImageUrl = null;
    let currentPngBuffer = null;
    let currentPngName = '';
    let cardDirty = false;

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
        while(offset+12<=bytes.length){
            const view = new DataView(buffer,offset,4);
            const length=view.getUint32(0);
            const type=String.fromCharCode(bytes[offset+4],bytes[offset+5],bytes[offset+6],bytes[offset+7]);
            const start=offset+8;
            const end=start+length;
            if(length>bytes.length || end+4>bytes.length) throw new Error('PNG 文件结构不完整，无法安全读取。');
            const chunk=bytes.subarray(start,end);
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
            if(type==='IEND') break;
        }
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

    function fieldPreview(data,key){
        const value=data[key];
        if(typeof value==='string' && value.trim()) return value;
        if(Array.isArray(value) && value.length) return value.map(x=>typeof x==='string'?x:JSON.stringify(x)).join('\n');
        return '';
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
            ['扩展字段',isObject(data.extensions)?Object.keys(data.extensions).length:0],['未归类字段',extra.length]
        ].map(([label,count])=>'<div class="character-stat"><strong>'+count+'</strong><span>'+label+'</span></div>').join('');
        document.getElementById('characterCardFields').innerHTML=fields.map(([key,label])=>{
            const value=typeof data[key]==='string'?data[key]:'';
            return '<label class="character-edit-field"><span>'+label+'</span><textarea rows="'+(key==='description'||key==='mes_example'?5:3)+'" data-card-field="'+key+'" spellcheck="false">'+escapeCardHtml(value)+'</textarea></label>';
        }).join('') + '<label class="character-edit-field"><span>标签（用逗号分隔）</span><input type="text" data-card-field="tags" value="'+escapeCardHtml(Array.isArray(data.tags)?data.tags.join(', '):'')+'"></label>';
        document.getElementById('characterCardExtra').textContent=extra.length?extra.join(', '):'无';
        document.getElementById('characterCardBookStatus').textContent=book?'已包含 character_book'+(Array.isArray(book.entries)?' · '+book.entries.length+' 条目':''):'未内嵌世界书';
        document.getElementById('characterCardFileName').textContent=file.name;
        const isPngFile=file.type==='image/png'||file.name.toLowerCase().endsWith('.png');
        currentPngBuffer=isPngFile?file.slice(0,file.size).arrayBuffer():null;
        currentPngName=isPngFile?file.name:'';
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
        updateCardSaveStatus();
    }

    async function importCharacterCard(file){
        if(!file)return;
        if(file.size>MAX_FILE_BYTES) throw new Error('文件超过 100 MB，已停止读取。');
        const extension=file.name.toLowerCase().split('.').pop();
        let card;
        if(extension==='json'||file.type==='application/json'){
            const text=await file.text();
            let root;
            try{root=JSON.parse(text);}catch(error){throw new Error('JSON 语法错误：'+error.message);}
            card={...getCardData(root),container:'JSON',chunk:''};
        }else if(extension==='png'||file.type==='image/png'){
            card=await parsePng(await file.arrayBuffer());
        }else{
            throw new Error('目前仅支持 PNG 角色卡和 JSON 角色卡。');
        }
        renderCard(card,file);
        showToast('已在本地载入角色卡：'+card.name,'success');
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
        updateCardSaveStatus();
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
            const charaMetadata=new TextEncoder().encode('chara\\0'+encodeBase64Utf8(cardJson));
            const v3Card=isObject(currentCard.data)?{...currentCard,spec:'chara_card_v3',spec_version:'3.0'}:null;
            const ccv3Metadata=v3Card?new TextEncoder().encode('ccv3\\0'+encodeBase64Utf8(JSON.stringify(v3Card))):null;
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
    window.updateCharacterCardField=updateCharacterCardField;
    window.exportCharacterCardPng=exportCharacterCardPng;
    window.importCharacterCard=importCharacterCard;
    window.triggerCharacterCardImport=triggerCharacterCardImport;
    window.onCharacterCardFileChosen=onCharacterCardFileChosen;
    window.exportCharacterCardJson=exportCharacterCardJson;
})();