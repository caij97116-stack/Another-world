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
