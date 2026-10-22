// This small classic script is inlined into the delivered HTML before the form.
// Protect typing and navigation even if any application module cannot load.
(() => {
  let nativeActive=null;try{const v=JSON.parse(localStorage.getItem('gongwen-writer-active-v1'));if(v?.kind==='word')nativeActive=v.id;}catch{}
  const key='gongwen-writer-pending-v1';
  async function nativeBackup(){
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('gongwen-web-v1',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('无法读取Word工作稿，原数据未改变。'));});
    const get=key=>new Promise((resolve,reject)=>{const tx=db.transaction('files'),q=tx.objectStore('files').get(key);tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(Error('工作稿读取未完成。'));});
    try{const value=await get('writer-word:'+nativeActive);if(!value)throw Error('当前Word记录没有找到，其他记录未改变。');const data=value.document?.sourceId?(await get('writer-source:'+value.document.sourceId)||await get('source:'+value.document.sourceId)):null;const blob=new Blob([JSON.stringify({...value,source:data?{name:value.origin?.name||value.name,data}:null},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Word-恢复工作稿.gongwen-word.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}finally{db.close();}
  }

  const recoveryPrefix='gongwen-writer-recovery-v1:', recoveryId=crypto.randomUUID();
  let recoveryKey='';
  let acknowledgements=[];
  const materialNames=['sourceMaterial','pendingMaterial'];
  const metadataNames=['signer','issuer','issueDate'];
  const names=['title','recipient','agency','reference','body','signature','date','attachments','copyTo','postscript',...materialNames,...metadataNames];
  function normalizeFields(fields){
    if(!fields||typeof fields!=='object')return fields;
    const next={};for(const name of names){const value=fields[name]===undefined&&(materialNames.includes(name)||name==='postscript'||metadataNames.includes(name))?'':fields[name];next[name]=materialNames.includes(name)&&typeof value==='string'?value.replace(/\r\n?/g,'\n'):value;}
    next.letterhead=fields.letterhead;return next;
  }
  const touched=new Set();let pending=null,failed=false,stored=true,savedDraft=null;
  function recoveries(){
    const values=[];
    try{for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key?.startsWith(recoveryPrefix))continue;
      const raw=localStorage.getItem(key);let value;try{value=JSON.parse(raw);if(value?.fields)value.fields=normalizeFields(value.fields);}catch{continue;}
      if(value?.version===1&&value.fields&&names.every(name=>typeof value.fields[name]==='string')&&typeof value.fields.letterhead==='boolean'&&Array.isArray(value.touched))values.push({key,raw,value,id:typeof value.recoveryId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value.recoveryId)?value.recoveryId:key.slice(recoveryPrefix.length)});
    }}catch{}
    return values.sort((a,b)=>(b.value.savedAt||0)-(a.value.savedAt||0));
  }
  try{const value=JSON.parse(sessionStorage.getItem(key));if(value?.fields)value.fields=normalizeFields(value.fields);if(value?.version===1&&value.fields&&Array.isArray(value.touched)){pending=value;value.touched.forEach(name=>{if(names.includes(name)||name==='letterhead')touched.add(name);});}}catch{}
  if(!pending){const latest=recoveries()[0];if(latest){pending={...latest.value,source:'durable-recovery'};pending.touched.forEach(name=>touched.add(name));}}
  let source=pending?.source || '',baseId=pending?.baseId || '';
  try{const value=JSON.parse(localStorage.getItem('gongwen-writer-v1'));if(value?.fields)value.fields=normalizeFields(value.fields);if(value?.type==='gongwen-form'&&[1,2,3,4,5,6,7].includes(value.version)&&value.fields&&names.every(name=>typeof value.fields[name]==='string')&&typeof value.fields.letterhead==='boolean')savedDraft=value;if(!baseId)baseId=value?.id || '';}catch{}
  const query=new URLSearchParams(location.search);
  if(!pending&&query.has('title')&&query.has('body')&&query.has('recipient')&&query.has('format')){
    const fields={};for(const name of names){fields[name]=query.get(name)||'';touched.add(name);}fields.letterhead=query.has('letterhead');touched.add('letterhead');
    source='legacy-submit';pending={version:1,fields,touched:[...touched],step:0,source,baseId};
  }
  let contentSnapshot=pending?pending.content||null:savedDraft?.content||null;
  const read=()=>{
    const fields={};for(const name of names)fields[name]=document.getElementById(name)?.value || '';
    fields.letterhead=Boolean(document.getElementById('letterhead')?.checked);return fields;
  };
  function snapshot(){
    if(nativeActive&&!window.writerReady)return pending;
    const fields=read();const step=Number(document.querySelector('[data-panel]:not([hidden])')?.dataset.panel || 0);
    const count=document.getElementById('body-count');if(count)count.textContent=fields.body.length.toLocaleString('zh-CN')+' 字';
    if(!touched.size){
      for(const name of names)if(fields[name]!== (savedDraft?.fields[name]||''))touched.add(name);
      if(fields.letterhead!==Boolean(savedDraft?.fields.letterhead))touched.add('letterhead');
    }
    if(!touched.size)return pending;
    // Closing/reloading a tab must not make its unchanged, older text look newer
    // than content edited in another tab.
    const savedAt=pending&&JSON.stringify(pending.fields)===JSON.stringify(fields)?pending.savedAt||Date.now():Date.now();
    pending={version:1,fields,touched:[...touched],step,source,baseId,savedAt,recoveryId,...(contentSnapshot?{content:contentSnapshot}:{})};
    const raw=JSON.stringify(pending);
    try{sessionStorage.setItem(key,raw);}catch{}
    // Versions are immutable: another tab can safely archive/delete an observed
    // version while this page writes its next version under a different key.
    const nextKey=recoveryPrefix+crypto.randomUUID();
    try{localStorage.setItem(nextKey,raw);const priorKey=recoveryKey;recoveryKey=nextKey;stored=true;if(priorKey)localStorage.removeItem(priorKey);}catch{stored=false;}
    return pending;
  }
  function status(message){
    const notice=document.getElementById('startup-notice');if(!notice)return;
    notice.hidden=false;document.getElementById('startup-message').textContent=message;
  }
  function fail(){failed=true;if(nativeActive){status('Word工作稿尚未完整打开，原件与工作稿均保留。可下载包含原件的恢复工作稿后重试。');return;}status(contentSnapshot?'段落与表格编辑暂未打开，当前稿已保留。可继续填写其他信息，或先下载草稿再重试。':'页面暂时没有完整打开。已填文字仍在，可以继续写或先下载一份草稿，再重新打开。');}
  function move(next,push=true){
    if(nativeActive&&!window.writerReady){fail();return;}
    const current=Number(document.querySelector('[data-panel]:not([hidden])')?.dataset.panel || 0);
    const fields=read();let invalid='';
    if(next>current){if(!fields.title.trim())invalid='title';else if(fields.letterhead&&!fields.agency.trim())invalid='agency';else if(next===2&&!fields.body.trim()&&!contentSnapshot?.blocks?.some(block=>block.type==='table'))invalid='body';}
    if(invalid){
      const input=document.getElementById(invalid),message=document.getElementById(invalid+'-error');
      if(message){message.hidden=false;message.textContent=invalid==='body'?'请填写正文。':invalid==='agency'?'显示红头时，请填写发文单位。':'请填写一个文档标题。';}
      input?.setAttribute('aria-invalid','true');input?.focus();return;
    }
    document.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=Number(panel.dataset.panel)!==next);
    document.querySelectorAll('[data-action-panel]').forEach(panel=>panel.hidden=Number(panel.dataset.actionPanel)!==next);
    document.querySelectorAll('[data-step]').forEach(button=>{if(Number(button.dataset.step)===next)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    if(push&&location.hash!=='#step-'+(next+1))history.pushState({writerStep:next},'', '#step-'+(next+1));
    snapshot();document.querySelector(`[data-panel="${next}"] h1`)?.focus();
    if(next===2)status('正在准备预览和下载，填写内容已保留。');
  }
  document.addEventListener('submit',event=>{
    if(!['writer-form','common-form'].includes(event.target.id))return;
    event.preventDefault();
    if(!window.writerReady){event.stopImmediatePropagation();snapshot();if(event.target.id==='writer-form'){const step=Number(document.querySelector('[data-panel]:not([hidden])')?.dataset.panel || 0);if(step<2)move(step+1);}}
  },true);
  document.addEventListener('keydown',event=>{
    if(!window.writerReady&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
      event.preventDefault();event.stopImmediatePropagation();snapshot();document.getElementById('save-status').textContent=stored?'已保存到此浏览器':'保存失败，请下载草稿';return;
    }
    if(event.key!=='Enter'||event.isComposing||event.keyCode===229||event.target.tagName!=='INPUT'||event.target.type==='date'||!names.includes(event.target.id)||!event.target.closest('#writer-form'))return;
    event.preventDefault();document.getElementById('writer-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  },true);
  document.addEventListener('input',event=>{
    if(!event.target.closest?.('#writer-form'))return;
    const name=event.target.id;if(!names.includes(name)&&name!=='letterhead')return;
    touched.add(name);snapshot();
    if(name==='letterhead'){document.getElementById('agency-field').hidden=!event.target.checked;document.getElementById('agency').setAttribute('aria-required',String(event.target.checked));}
  },true);
  document.addEventListener('paste',event=>{
    if(window.writerReady||!['pendingMaterial','postscript'].includes(event.target.id))return;
    const pasted=event.clipboardData?.getData('text/plain');if(typeof pasted!=='string')return;
    const input=event.target;
    if(input.value.length-(input.selectionEnd-input.selectionStart)+pasted.replace(/\r\n?/g,'\n').length>input.maxLength){event.preventDefault();status('输入超过 '+input.maxLength+' 字符，未替换当前输入。请拆成两份整理。');}
  },true);
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-next],[data-back],[data-step]');
    if(button&&!window.writerReady){event.preventDefault();event.stopImmediatePropagation();snapshot();move(Number(button.dataset.next ?? button.dataset.back ?? button.dataset.step));return;}
    if(event.target.closest?.('#save-document')&&!window.writerReady){event.preventDefault();event.stopImmediatePropagation();snapshot();document.getElementById('save-status').textContent=stored?'已保存到此浏览器':'保存失败，请下载草稿';return;}
    if(!window.writerReady&&event.target.closest?.('button')&&!event.target.closest?.('#startup-download,#startup-retry')){event.preventDefault();event.stopImmediatePropagation();status('页面正在恢复草稿，已填内容会保留。可以继续填写，或先下载填写草稿。');return;}
    if(event.target.closest?.('#startup-download')&&nativeActive&&!window.writerReady){event.preventDefault();nativeBackup().catch(e=>status(e.message));return;}
    if(event.target.closest?.('#startup-download')){
      const value=snapshot() || {fields:read(),step:0};
      const blob=new Blob([JSON.stringify({type:'gongwen-form',version:metadataNames.some(name=>value.fields[name]?.trim())?7:contentSnapshot?.annexes?.length||contentSnapshot?.postscript?.annexes?.length?6:contentSnapshot?.postscript?5:contentSnapshot?4:value.fields.postscript?3:value.fields.sourceMaterial||value.fields.pendingMaterial?2:1,fields:value.fields,...(contentSnapshot?{content:contentSnapshot}:{}),step:value.step},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='未丢失的填写草稿.gongwen.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }
    if(event.target.closest?.('#startup-retry')){snapshot();if(stored)location.reload();else status('浏览器暂存失败，请先下载填写草稿，避免刷新时丢失。');}
  },true);
  window.addEventListener('pagehide',()=>{if(!window.writerReady)snapshot();});
  window.addEventListener('popstate',()=>{if(!window.writerReady)move(Number(location.hash.match(/^#step-([123])$/)?.[1] || 1)-1,false);});
  window.addEventListener('beforeunload',event=>{if(!window.writerReady&&pending&&!stored){event.preventDefault();event.returnValue='';}});
  window.writerBoot={
    pending:()=>pending,fail,recoveries,acknowledge(records){acknowledgements=records;},
    hydrate(){
      if(nativeActive){document.documentElement.classList.add('word-restoring');const style=document.createElement('style');style.textContent='.word-restoring #writer-form,.word-restoring .workflow-actions{visibility:hidden}';document.head.append(style);status('正在恢复原Word工作稿。原件和填写稿分别保留，可下载恢复稿。');document.getElementById('startup-download').textContent='下载Word恢复工作稿';return;}

      const initial=pending || savedDraft;if(!initial)return;
      for(const name of names){const input=document.getElementById(name);if(input&&typeof initial.fields[name]==='string')input.value=initial.fields[name].slice(0,input.maxLength>0?input.maxLength:100000);}
      document.getElementById('letterhead').checked=initial.fields.letterhead===true;
      document.getElementById('agency-field').hidden=!initial.fields.letterhead;
      document.getElementById('agency').setAttribute('aria-required',String(initial.fields.letterhead));
      document.getElementById('letterhead').closest('details').open=Boolean(initial.fields.letterhead||initial.fields.reference||initial.fields.signer);
      document.getElementById('body-count').textContent=initial.fields.body.length.toLocaleString('zh-CN')+' 字';
      if(contentSnapshot){document.getElementById('body').readOnly=true;if(contentSnapshot.postscript)document.getElementById('postscript').readOnly=true;status('正在恢复当前稿的段落与表格，其他信息仍可填写。');}
      const entry=document.getElementById('material-entry');if(entry&&initial.fields.pendingMaterial)entry.open=true;
      const original=document.getElementById('material-source');if(original)original.hidden=!initial.fields.sourceMaterial;
      document.getElementById('issuance-fields').open=Boolean(initial.fields.issuer||initial.fields.issueDate);
      const notes=document.getElementById('postscript');if(notes?.value)notes.closest('details').open=true;
      const step=Number.isInteger(initial.step)&&initial.step>=0&&initial.step<=2?initial.step:0;
      document.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=Number(panel.dataset.panel)!==step);
      document.querySelectorAll('[data-action-panel]').forEach(panel=>panel.hidden=Number(panel.dataset.actionPanel)!==step);
      document.querySelectorAll('[data-step]').forEach(button=>{if(Number(button.dataset.step)===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
      if(pending)snapshot();
    },
    saved(id,content){
      contentSnapshot=content||null;
      pending=null;source='';baseId=id || baseId;touched.clear();
      try{sessionStorage.removeItem(key);localStorage.removeItem(recoveryKey);
        for(const record of acknowledgements)if(localStorage.getItem(record.key)===record.raw)localStorage.removeItem(record.key);
        acknowledgements=[];
      }catch{}
    },
    complete(){document.documentElement.classList.remove('word-restoring');nativeActive=null;document.getElementById('startup-download').textContent='下载填写草稿';document.getElementById('startup-notice').hidden=true;},
  };
  document.addEventListener('DOMContentLoaded',()=>{
    if(failed)fail();
  });
  setTimeout(()=>{if(!window.writerReady)fail();},8000);
})();
