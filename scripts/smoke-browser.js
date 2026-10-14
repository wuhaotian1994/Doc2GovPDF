(async()=>{
 const get=id=>document.getElementById(id), assert=(v,m)=>{if(!v)throw Error(m)}, sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(fn,m)=>{const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await sleep(80)}throw Error('Timeout: '+m)};
 try{
  await until(()=>window.appReady,'ready');
  get('sample-home').click();
  await until(()=>document.querySelectorAll('.issue-card').length===2,'sample checks');
  document.querySelector('.issue-action').click();
  await until(()=>document.querySelectorAll('.issue-card').length===1,'apply');
  get('undo').click();
  await until(()=>document.querySelectorAll('.issue-card').length===2,'undo');
  document.querySelector('.issue-action').click();await until(()=>document.querySelectorAll('.issue-card').length===1,'first fix');
  document.querySelector('.issue-action').click();await until(()=>document.querySelectorAll('.issue-card').length===0,'second fix');
  await until(()=>document.querySelector('#pdf-pages canvas'),'actual PDF rendered');
  get('output-format').value='docx';get('output-format').dispatchEvent(new Event('change'));
  const exportFn=window.go.main.App.ExportDocument;let exported;
  window.go.main.App.ExportDocument=async(model,format,tracked)=>{exported={model,format,tracked};return {paths:[],warnings:[]}};
  get('export-open').click();await until(()=>exported&&!get('export-open').disabled,'direct export');
  assert(exported.format==='docx','wrong export format');window.go.main.App.ExportDocument=exportFn;
  get('edit-tab').click();
  const date=[...document.querySelectorAll('textarea[data-paragraph]')].find(e=>e.value==='2026年10月8日');
  assert(date,'date field');date.value='2025年2月29日';date.dispatchEvent(new Event('input',{bubbles:true}));
  await until(()=>document.querySelectorAll('.issue-card').length===1,'invalid date');
  assert(document.querySelector('.issue-action').textContent==='修改原文','invalid date can auto-fix');
  await until(()=>get('save-state').textContent==='已保存到本机','save');
  const before=await window.go.main.App.GetWorkspace();assert(JSON.stringify(before).includes('2025年2月29日'),'workspace recovery');
  const save=window.go.main.App.SaveWorkspace;window.go.main.App.SaveWorkspace=async d=>{await sleep(200);return save(d)};
  date.value='2025年2月28日';date.dispatchEvent(new Event('input',{bubbles:true}));await sleep(400);date.value='2025年2月29日';date.dispatchEvent(new Event('input',{bubbles:true}));
  await until(()=>get('save-state').textContent==='已保存到本机','save reversion');
  assert(JSON.stringify(await window.go.main.App.GetWorkspace()).includes('2025年2月29日'),'stale save overwrote current text');window.go.main.App.SaveWorkspace=save;
  const editable=[...document.querySelectorAll('textarea[data-paragraph]')].find(e=>!e.disabled&&e!==date);editable.value='<script>window.injected=true</script>';editable.dispatchEvent(new Event('input',{bubbles:true}));await sleep(500);assert(!window.injected,'HTML injection');
  get('preview-tab').focus();get('preview-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert(get('edit-tab').getAttribute('aria-selected')==='true','keyboard tabs');
  assert(document.documentElement.scrollWidth<=innerWidth,'horizontal overflow');
  window.runtime.EventsEmit('qa:result',{passed:true,checks:['structured Go bindings','automatic checks','apply','undo','actual PDF canvas','direct export dispatch','invalid date','workspace recovery','queued save reversion','HTML escaping','keyboard tabs','window layout']});
 }catch(e){window.runtime.EventsEmit('qa:result',{passed:false,error:String(e),stack:e.stack})}
})();
