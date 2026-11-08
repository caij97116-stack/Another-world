function showToast(msg,type=''){
            const container=document.getElementById('toastContainer');
            const toast=document.createElement('div');
            toast.className='toast'+(type?' '+type:'');
            toast.textContent=msg;
            container.appendChild(toast);
            setTimeout(()=>{toast.style.opacity='0';toast.style.transform='translateY(8px)';toast.style.transition='all .25s ease';setTimeout(()=>toast.remove(),260)},2200);
        }
        function escapeHtml(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
