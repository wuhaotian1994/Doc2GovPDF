'use strict';

const $ = id => document.getElementById(id);
const api = window.go?.main?.App;
const sample = '关于开展办公环境整理工作的通知\n办发【2026】第012号\n各部门：\n为营造整洁、有序的办公环境，现将有关事项通知如下。\n一、整理范围\n请各部门整理办公区域、公共储物柜和纸质档案，保留必要的工作资料。\n二、工作安排\n请各部门于本周五前完成整理。重要文件应按规定归档，未经确认不得销毁。\n三、注意事项\n整理过程中注意保护个人物品，公共区域保持通行顺畅。\n办公室\n2026年10月08日';
let draft = {text: '', name: ''};
let report = null, revision = 0, checkTimer, saveTimer, toastTimer;
let saveChain = Promise.resolve(), history = [], savedText = null, savedName = null, busy = false;
let queuedText = null, queuedName = null, saveFailed = false;

function error(message) { $('error-text').textContent = String(message); $('error').hidden = false; }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 6000); }
function setBusy(value) { busy = value; document.body.classList.toggle('busy', value); for (const id of ['import-home','import-work','new-document','export-save','sample-home','paste-home']) $(id).disabled = value; }
function view(edit) {
  $('edit-panel').hidden = !edit; $('preview-panel').hidden = edit;
  $('edit-tab').setAttribute('aria-selected', String(edit)); $('preview-tab').setAttribute('aria-selected', String(!edit));
  $('edit-tab').tabIndex = edit ? 0 : -1; $('preview-tab').tabIndex = edit ? -1 : 0;
  if (edit) $('body-text').focus();
}
function showWorkspace() { $('welcome').hidden = true; $('workspace').hidden = false; }
function renderPaper() {
  const frag = document.createDocumentFragment(); let title = true;
  draft.text.split('\n').forEach((line, i) => {
    const p = document.createElement('p'); p.textContent = line || '\u200b'; p.id = `paragraph-${i}`;
    if (title && line.trim()) { p.className = 'title'; title = false; }
    if (report?.issues.some(issue => issue.paragraph === i)) p.classList.add('flagged');
    frag.append(p);
  });
  $('paper').replaceChildren(frag);
  $('file-name').textContent = draft.name || '未命名正文';
  $('character-count').textContent = `${Array.from(draft.text).length.toLocaleString()} 字符`;
}
function locate(index) {
  view(false); const p = $(`paragraph-${index}`);
  document.querySelectorAll('.focused').forEach(node => node.classList.remove('focused'));
  if (p) { p.classList.add('focused'); p.scrollIntoView({block: 'center', behavior: 'smooth'}); }
}
function renderReport() {
  const list = $('issue-list'); list.replaceChildren();
  if (!report) return;
  const count = report.issues.length;
  $('check-heading').textContent = count ? `${count} 处写法待确认` : '本次未发现问题';
  $('check-description').textContent = count ? '逐项确认后应用，原文随时可撤销。' : '仅限下方列出的检查范围。';
  for (const issue of report.issues) {
    const card = document.createElement('section'); card.className = 'issue-card';
    const title = document.createElement('h3'); title.append(issue.rule.startsWith('date') ? '日期写法' : '发文字号');
    const jump = document.createElement('button'); jump.className = 'link'; jump.textContent = `定位第 ${issue.paragraph + 1} 段`; jump.onclick = () => locate(issue.paragraph); title.append(jump);
    const desc = document.createElement('p'); desc.textContent = issue.message;
    const change = document.createElement('div'); change.className = 'change';
    if (issue.replacement) { const before = document.createElement('del'); before.textContent = issue.original; const after = document.createElement('ins'); after.textContent = issue.replacement; change.append(before, after); }
    else change.textContent = issue.original;
    const apply = document.createElement('button'); apply.className = 'issue-action'; apply.textContent = issue.replacement ? '确认并应用' : '编辑正文';
    apply.onclick = async () => {
      if (!issue.replacement) { view(true); return; }
      const current = revision; apply.disabled = true;
      try { const text = await api.Apply(draft.text, issue.id); if (current === revision) { history.push(draft.text); $('undo').disabled = false; changeText(text); toast('已应用，可撤销这次修改'); } }
      catch (e) { error(e); } finally { apply.disabled = false; }
    };
    card.append(title, desc, change, apply); list.append(card);
  }
  if (!count) { const empty = document.createElement('div'); empty.className = 'empty-check'; empty.textContent = '可以导出排版草稿，继续核对内容和版式。'; list.append(empty); }
  $('export-open').disabled = !api || !draft.text.trim();
  $('status').textContent = count ? `检查完成 · ${count} 处需确认` : '基础检查完成 · 完整机检尚未覆盖';
}
async function check() {
  clearTimeout(checkTimer);
  const current = revision, text = draft.text;
  if (!text.trim()) { report = null; $('check-heading').textContent = '等待正文'; $('check-description').textContent = '填写内容后自动开始。'; $('issue-list').replaceChildren(); $('export-open').disabled = true; return; }
  if (!api) { $('check-heading').textContent = '界面预览'; $('check-description').textContent = '请运行桌面程序以使用真实检查和导出。'; return; }
  $('check-heading').textContent = '正在检查…'; $('check-description').textContent = '在本机核对日期和发文字号。';
  try { const result = await api.Check(text); if (current !== revision) return; report = result; renderPaper(); renderReport(); }
  catch (e) { if (current === revision) { error(e); $('check-heading').textContent = '检查未完成'; $('check-description').textContent = '正文仍保留，请修正提示的问题后重试。'; $('status').textContent = '检查失败'; } }
}
function persist() {
  clearTimeout(saveTimer);
  if (!api || (!saveFailed && queuedText === draft.text && queuedName === draft.name)) return saveChain;
  const snapshot = {...draft};
  queuedText = snapshot.text; queuedName = snapshot.name; saveFailed = false;
  $('save-state').textContent = '正在保存…';
  saveChain = saveChain.catch(() => {}).then(() => api.SaveDraft(snapshot)).then(() => {
    savedText = snapshot.text; savedName = snapshot.name;
    if (draft.text === snapshot.text && draft.name === snapshot.name) $('save-state').textContent = '草稿已保存到本机';
  }).catch(e => { saveFailed = true; $('save-state').textContent = '草稿保存失败'; error(e); throw e; });
  return saveChain;
}
function changeText(text) {
  draft.text = text.replace(/\r\n?/g, '\n'); $('body-text').value = draft.text; revision++; report = null;
  $('issue-list').replaceChildren(); $('check-heading').textContent = '等待检查…'; $('check-description').textContent = '内容已变化，将自动重新检查。'; $('export-open').disabled = true;
  renderPaper(); clearTimeout(checkTimer); checkTimer = setTimeout(check, 400);
  $('save-state').textContent = api ? '尚有更改待保存' : '界面预览，不保存';
  clearTimeout(saveTimer); saveTimer = setTimeout(() => persist().catch(() => {}), 350);
}
async function permitReplace() {
  if (!draft.text.trim()) return true;
  const dialog = $('replace-dialog'); dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'replace'), {once:true}));
}
async function load(next, edit = false) {
  if (!await permitReplace()) return;
  draft = {text:next.text || '',name:next.name || ''}; history = []; $('undo').disabled = true;
  $('error').hidden = true; showWorkspace(); changeText(draft.text); view(edit); await check();
}
async function importFile(path) {
  if (!api || busy) return;
  setBusy(true); $('status').textContent = '正在读取正文…';
  try { const result = path ? await api.ImportPath(path) : await api.Import(); if (result?.text) { await load(result); toast('已提取正文，新导出会重新排版；原件保留'); } }
  catch (e) { error(e); $('status').textContent = '导入未完成 · 当前草稿保留'; } finally { setBusy(false); }
}
$('import-home').onclick = () => importFile(); $('import-work').onclick = () => importFile();
$('paste-home').onclick = () => load({text:'',name:'粘贴的正文'}, true);
$('new-document').onclick = () => load({text:'',name:'未命名正文'}, true);
$('sample-home').onclick = () => load({text:sample,name:'办公环境整理通知 · 示例'});
$('preview-tab').onclick = () => view(false); $('edit-tab').onclick = () => view(true);
for (const id of ['preview-tab','edit-tab']) $(id).addEventListener('keydown', e => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
  e.preventDefault(); const edit = e.key === 'End' || (e.key !== 'Home' && id === 'preview-tab');
  view(edit); $(edit ? 'edit-tab' : 'preview-tab').focus();
});
$('body-text').addEventListener('input', e => { history = []; $('undo').disabled = true; changeText(e.target.value); });
$('undo').onclick = () => { const previous = history.pop(); if (previous !== undefined) changeText(previous); $('undo').disabled = !history.length; };
$('about').onclick = () => $('about-dialog').showModal(); $('dismiss-error').onclick = () => $('error').hidden = true;
$('export-open').onclick = () => { $('export-notice').textContent = `${report?.issues.length ? `还有 ${report.issues.length} 处写法待核对。` : ''}字体、分页、数字与完整版式尚未核验，导出结果不是合格证明。`; $('export-dialog').showModal(); };
$('export-save').onclick = async () => {
  if (!api || busy) return; setBusy(true);
  const text = draft.text, format = document.querySelector('input[name="format"]:checked').value;
  try { await persist(); const path = await api.Export(text, format); if (path) { $('export-dialog').close(); toast(`已保存：${path}`); $('status').textContent = `已导出 · ${path}`; } }
  catch (e) { $('export-dialog').close(); error(e); } finally { setBusy(false); }
};
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); if (!document.querySelector('dialog[open]')) importFile(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); persist().then(() => toast('草稿已保存')).catch(() => {}); }
});
document.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drag-over'); });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drag-over'); });
document.addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('drag-over'); if (!api) error('文件导入请使用桌面程序。'); });
if (window.runtime) {
  window.runtime.OnFileDrop((x, y, paths) => { document.body.classList.remove('drag-over'); if (paths.length !== 1) error('当前版本每次处理一个文件，请只拖入一份。'); else importFile(paths[0]); }, false);
  window.runtime.EventsOn('app:closing', async () => { try { await persist(); await api.Close(); } catch { error('草稿尚未保存，窗口暂未关闭。请重试保存或先导出内容。'); } });
}
async function init() {
  if (!api) { $('import-home').disabled = true; $('import-work').disabled = true; $('status').textContent = '界面预览 · 真实处理请使用桌面程序'; return; }
  try { const previous = await api.LoadDraft(); if (previous?.text) { draft = previous; savedText = previous.text; savedName = previous.name; showWorkspace(); changeText(previous.text); $('save-state').textContent = '已恢复上次草稿'; await check(); } }
  catch (e) { error(e); }
}
init();
