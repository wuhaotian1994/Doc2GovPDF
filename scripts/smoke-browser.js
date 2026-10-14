(async () => {
  const get = id => document.getElementById(id);
  const failures = [];
  window.addEventListener('error', e => failures.push(e.message));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const until = async (fn, message) => { const start=Date.now(); while(Date.now()-start<10000) { if(await fn())return; await new Promise(r=>setTimeout(r,80)); } throw new Error('Timeout: '+message); };
  try {
    await until(()=>window.go?.main?.App && get('sample-home'),'native bindings');
    assert(get('status').textContent === '准备就绪','real desktop bridge not loaded');
    get('sample-home').click();
    await until(()=>get('check-heading').textContent === '2 处写法待确认','real Go checks');
    document.querySelector('.issue-action').click();
    await until(()=>document.querySelectorAll('.issue-card').length === 1,'apply');
    assert(get('body-text').value.includes('办发〔2026〕12号'),'Go fix not applied');
    get('undo').click();
    await until(()=>document.querySelectorAll('.issue-card').length === 2,'undo');
    const nativeExport = window.go.main.App.Export;
    let exportedText = null;
    window.go.main.App.Export = async text => { exportedText = text; return ''; };
    get('export-open').click();
    await until(()=>exportedText === get('body-text').value && !get('export-open').disabled,'direct export action');
    assert(!get('export-dialog'),'unnecessary export options still shown');
    window.go.main.App.Export = nativeExport;
    get('edit-tab').click();
    get('body-text').value = '测试标题\n2025年2月29日\n<script>window.injected=true</script>';
    get('body-text').dispatchEvent(new Event('input',{bubbles:true}));
    await until(()=>document.querySelectorAll('.issue-card').length === 1,'invalid date');
    assert(document.querySelector('.issue-action').textContent === '编辑正文','factual date was auto-fixable');
    assert(!window.injected,'document injected JavaScript');
    await until(()=>get('save-state').textContent === '草稿已保存到本机','autosave');
    const draft=await window.go.main.App.LoadDraft();
    assert(draft.text.includes('2025年2月29日'),'draft not persisted');
    // A queued edit followed by reverting to the last saved text must still
    // persist the reversion, even if the intermediate save is in flight.
    const save = window.go.main.App.SaveDraft;
    window.go.main.App.SaveDraft = async d => { await new Promise(r=>setTimeout(r,200)); return save(d); };
    get('body-text').value = draft.text + '\n临时编辑';
    get('body-text').dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,400));
    get('body-text').value = draft.text;
    get('body-text').dispatchEvent(new Event('input',{bubbles:true}));
    await until(()=>get('save-state').textContent === '草稿已保存到本机','queued reversion saved');
    assert((await window.go.main.App.LoadDraft()).text === draft.text,'queued save overwrote reverted text');
    window.go.main.App.SaveDraft = save;
    get('preview-tab').focus();
    get('preview-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    assert(get('edit-tab').getAttribute('aria-selected') === 'true','keyboard tab navigation');
    get('preview-tab').click();
    assert(document.documentElement.scrollWidth <= innerWidth,'horizontal overflow');
    assert(!failures.length,JSON.stringify(failures));
    window.runtime.EventsEmit('qa:result',{passed:true,checks:['real Go binding','two rules','apply','undo','direct export action','invalid date','HTML escaping','draft recovery','queued save reversion','keyboard tabs','window layout']});
  } catch(e) { window.runtime.EventsEmit('qa:result',{passed:false,error:String(e),stack:e.stack}); }
})();
