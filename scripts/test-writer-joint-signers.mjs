// Normal UI QA against caller-supplied official local material. No manuscript or
// personal names are built into this script, and no source is uploaded.
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {startWebServer} from './browser-tests/server.mjs';

const root=resolve(import.meta.dirname,'..'),sourcePath=process.env.JOINT_SIGNERS_SOURCE;
if(!sourcePath)throw Error('Set JOINT_SIGNERS_SOURCE to the independently checked, ignored official source JSON. No substitute fixture is created.');
const sourceBytes=await readFile(sourcePath),source=JSON.parse(sourceBytes.toString('utf8').replace(/^\ufeff/,''));
assert.equal(source.type,'local-official-joint-signers-source','Expected explicit official local source contract');
for(const key of ['title','recipient','reference','body','signature','date','signer','issuer','issueDate'])assert.ok(typeof source.fields?.[key]==='string'&&source.fields[key],'Missing independently supplied source field: '+key);
const people=source.fields.signer.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
assert.ok(people.length===3,'This real task requires exactly three explicit source lines; punctuation is never a name separator');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),same=(a,b)=>isDeepStrictEqual(a,b);
assert.ok(hash(await readFile(source.pdfPath))===source.pdfSHA256,'The exact independently checked official PDF is required');
const out=resolve(root,process.env.JOINT_SIGNERS_OUT||'build/qa/joint-signers-writer'),python=process.env.JOINT_SIGNERS_PYTHON||'python';
await mkdir(out,{recursive:true});
const fontMap=process.env.JOINT_SIGNERS_FONT_MAP?JSON.parse((await readFile(process.env.JOINT_SIGNERS_FONT_MAP,'utf8')).replace(/^\ufeff/,'')):null;
if(fontMap){assert.ok(Array.isArray(fontMap.roles)&&fontMap.roles.length>0,'Font map needs explicitly authorized local roles');const roles=new Set();for(const entry of fontMap.roles){assert.ok(['仿宋','楷体','黑体','宋体','方正小标宋简体'].includes(entry.role)&&!roles.has(entry.role)&&typeof entry.path==='string'&&typeof entry.name1==='string'&&typeof entry.name6==='string'&&typeof entry.sha256==='string','Each font role needs a unique explicit path, real identity and pinned hash');roles.add(entry.role);}}
// Independent read-only SFNT identity/technical check; no source bytes are written.
function localFontMetadata(bytes,index=0){
 const u16=at=>bytes.readUInt16BE(at),u32=at=>bytes.readUInt32BE(at),collection=bytes.toString('ascii',0,4)==='ttcf',count=collection?u32(8):1;assert.ok(index>=0&&index<count,'Explicit real font face must exist');const start=collection?u32(12+index*4):0,tables=new Map();assert.ok(u32(start)===0x00010000,'Only this supported TrueType source is accepted');for(let i=0;i<u16(start+4);i++){const at=start+12+i*16,tag=bytes.toString('ascii',at,at+4),offset=u32(at+8),length=u32(at+12);assert.ok(offset+length<=bytes.length&&!tables.has(tag),'Valid SFNT table boundaries required');tables.set(tag,{offset,length});}const table=tables.get('name');assert.ok(table&&tables.has('OS/2'),'Real identity and technical embedding flags required');const at=table.offset,strings=at+u16(at+4),names={};for(let i=0;i<u16(at+2);i++){const rec=at+6+i*12,platform=u16(rec),encoding=u16(rec+2),kind=u16(rec+6),length=u16(rec+8),offset=u16(rec+10);if(![1,4,6,16,17].includes(kind)||!(platform===0||platform===3&&[0,1,10].includes(encoding)))continue;assert.ok(strings+offset+length<=at+table.length&&length%2===0,'Name record boundary required');const swapped=Buffer.from(bytes.subarray(strings+offset,strings+offset+length));swapped.swap16();const value=swapped.toString('utf16le').replace(/\0/g,'').trim();if(value)(names[kind]??=[]).push(value);}return {faces:count,index,nameIDs:Object.fromEntries(Object.entries(names).map(([key,values])=>[key,[...new Set(values)]])),fsType:u16(tables.get('OS/2').offset+8)};
}

// Read actual PDF text matrices/character boxes. Neither XML declarations nor
// estimated string widths can satisfy these geometry checks. No names/text are
// included in the returned measurement report. Caller supplies any Word-rendered
// PDF separately; this helper does not itself open Word or assert its provenance.
const measureCode=String.raw`
import hashlib,json,sys,statistics
from pathlib import Path
import pdfplumber
source=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
names=[value.strip() for value in source['fields']['signer'].splitlines() if value.strip()]
reference=''.join(source['fields']['reference'].split())
path=Path(sys.argv[2])
def require(value,message):
 if not value:raise AssertionError(message)
with pdfplumber.open(path) as document:
 require(len(names)==3,'Exactly three independently supplied signers are required')
 page=document.pages[0];groups=[]
 for char in page.chars:
  if not char['text'].strip():continue
  matrix=char.get('matrix');require(matrix is not None and len(matrix)==6,'Character text matrix is unavailable; do not estimate positions')
  require(abs(matrix[1])<.001 and abs(matrix[2])<.001,'Rotated header text is unsupported by this bounded verifier')
  baseline=float(matrix[5]);line=next((line for line in groups if abs(line['baseline']-baseline)<.15),None)
  if line is None:line={'baseline':baseline,'chars':[]};groups.append(line)
  line['chars'].append(char)
 for line in groups:line['chars'].sort(key=lambda char:char['x0'])
 def find(text):
  matches=[]
  for line in groups:
   chars=line['chars'];flat=''.join(char['text'] for char in chars)
   require(all(len(char['text'])==1 for char in chars),'Multi-character glyph mapping needs independent review')
   at=flat.find(text)
   while at>=0:
    selected=chars[at:at+len(text)];matches.append({'page':1,'left':float(selected[0]['matrix'][4]),'right':max(float(char['x1']) for char in selected),'baselineFromTop':float(page.height)-statistics.mean(float(char['matrix'][5]) for char in selected),'fontSizes':sorted(set(round(float(char['size']),3) for char in selected)),'fontNames':sorted(set(str(char['fontname']) for char in selected))});at=flat.find(text,at+1)
  require(matches,'Expected header text could not be measured')
  return min(matches,key=lambda match:(match['baselineFromTop'],match['left']))
 positions=[find(name) for name in names];ref=find(reference);a,b,c=positions
 require(abs(a['baselineFromTop']-b['baselineFromTop'])<=1.25,'First two signers are not on the same actual baseline')
 require(a['left']<b['left'] and a['right']+1<=b['left'],'First-row signers overlap or reverse source order')
 require(c['baselineFromTop']-a['baselineFromTop']>=16,'Third signer is not a separate continuation row')
 require(abs(c['left']-a['left'])<=1.25,'Continuation does not align with the first signer column')
 require(abs(ref['baselineFromTop']-c['baselineFromTop'])<=1.25,'Reference is not on the last signer baseline')
 require(ref['right']+1<=c['left'],'Reference overlaps the last signer')
 require(all(all(abs(size-16)<=.1 for size in item['fontSizes']) for item in positions),'Actual signer text does not remain 16pt')
 print(json.dumps({'passed':True,'pdfSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'pages':len(document.pages),'extractor':'pdfplumber '+pdfplumber.__version__,'coordinateBasis':'actual character text matrices; points from top','sourceSignersSHA256':hashlib.sha256(source['fields']['signer'].encode()).hexdigest(),'signerCount':3,'signers':[{'sourceIndex':index+1,**item} for index,item in enumerate(positions)],'reference':ref,'checks':['first-row-two','continuation-one','source-order','last-signer-reference-same-baseline','first-column-continuation-alignment','no-overlap','16pt'],'boundary':'Geometry in this actual PDF only; complete GB compliance, source-source layout equality and renderer provenance are not inferred.'},ensure_ascii=False))
`;
function measurePDF(path){
 try{return JSON.parse(execFileSync(python,['-c',measureCode,resolve(sourcePath),resolve(path)],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,env:{...process.env,PYTHONIOENCODING:'utf-8'}}));}
 catch{throw Error('Actual PDF character geometry could not satisfy the bounded signer checks; no XML/name-only fallback is allowed.');}
}
if(process.env.JOINT_SIGNERS_LAYOUT_ONLY==='1'){
 if(!process.env.JOINT_SIGNERS_PDF)throw Error('Set JOINT_SIGNERS_PDF to the exact already-rendered artifact; this mode never invokes Word.');
 const result=measurePDF(process.env.JOINT_SIGNERS_PDF);await writeFile(resolve(out,process.env.JOINT_SIGNERS_LAYOUT_REPORT||'layout.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({actualPDFLayoutPassed:result.passed,pages:result.pages,signerCount:result.signerCount}));
}else{
 if(!process.env.JOINT_SIGNERS_WEB_ROOT)throw Error('Set JOINT_SIGNERS_WEB_ROOT to the frozen current candidate. An old build is never selected implicitly.');
 const webRoot=resolve(root,process.env.JOINT_SIGNERS_WEB_ROOT),singlePath=resolve(root,process.env.JOINT_SIGNERS_SINGLE_DRAFT||'build/qa/word-fallback-issuance/chrome/day-19.gongwen.json');
 const singleBytes=await readFile(singlePath),single=JSON.parse(singleBytes.toString('utf8'));
 assert.ok(single.type==='gongwen-form'&&single.version===7&&typeof single.fields?.signer==='string'&&single.fields.signer.trim()&&!/[\r\n]/.test(single.fields.signer),'An existing independently verified single-signer v7 draft is required; no person is deleted to invent a control');
 execFileSync(python,['-c','import pdfplumber'],{windowsHide:true,stdio:'pipe'});
 const require=createRequire(new URL('./browser-tests/package.json',import.meta.url)),{chromium,firefox,webkit}=require('playwright');
 const profiles=(process.env.JOINT_SIGNERS_PROFILES||'chrome,firefox,webkit').split(','),report={method:'Normal writer UI, independently transcribed official local source, real Wasm and downloads; product PDF positions measured from character text matrices.',sourcePDFSHA256:source.pdfSHA256,sourceJSONSHA256:hash(sourceBytes),singleDraftSHA256:hash(singleBytes),sourceFieldSHA256:Object.fromEntries(Object.entries(source.fields).map(([key,value])=>[key,hash(Buffer.from(JSON.stringify(value)))])),sourceSignerCount:3,assets:{},profiles:[],nativeWordLayout:'Pending parent-controlled native Word render and the same character-coordinate measurement; no Word layout success is inferred from XML or the product PDF.'};
 for(const file of ['write-model.js','write.js','write-boot.js','write-checks.js','write.html','document-engine.wasm'])report.assets[file]=hash(await readFile(resolve(webRoot,file)));
 const server=process.env.JOINT_SIGNERS_URL?{url:process.env.JOINT_SIGNERS_URL,async close(){}}:await startWebServer(webRoot),origin=new URL(server.url);assert.ok(['127.0.0.1','localhost','[::1]'].includes(origin.hostname),'Only a loopback QA server is supported');
 try{for(const profile of[{id:'chrome',engine:chromium,channel:'chrome'},{id:'firefox',engine:firefox},{id:'webkit',engine:webkit}].filter(profile=>profiles.includes(profile.id))){
  const browser=await profile.engine.launch({headless:true,...(profile.channel?{channel:profile.channel}:{}),env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',http_proxy:'',https_proxy:'',all_proxy:'',NO_PROXY:'127.0.0.1,localhost'},...(profile.id==='firefox'?{firefoxUserPrefs:{'network.proxy.type':0}}:{})}),context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN',acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),folder=resolve(out,profile.id);
  await mkdir(folder,{recursive:true});const result={profile:profile.id,browserVersion:browser.version(),checks:[],files:[],errors:[],wasm:[],feedbackRequests:0,uploadRequests:0,externalRequests:0,localFonts:[],phase:'startup'};report.profiles.push(result);page.setDefaultTimeout(30000);page.on('pageerror',error=>result.errors.push(error.name));
  const check=(label,value)=>{assert.ok(value,label);result.checks.push(label);console.log(profile.id+': '+label);},saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gongwen-writer-v1')));
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.pathname.startsWith('/api/feedback/')){result.feedbackRequests++;return route.abort();}if(!['GET','HEAD'].includes(request.method())){result.uploadRequests++;return route.abort();}if(url.origin!==origin.origin){result.externalRequests++;return route.abort();}if(url.pathname.endsWith('/document-engine.wasm')){const response=await route.fetch(),bytes=await response.body(),headers={...response.headers()};delete headers['content-encoding'];headers['content-length']=String(bytes.length);result.wasm.push(hash(bytes));return route.fulfill({response,headers,body:bytes});}return route.continue();});
  async function ready(){await page.waitForFunction(()=>window.writerReady===true);if(!fontMap&&await page.locator('#font-start-fallback').isVisible())await page.locator('#font-start-fallback').click();}
  async function registerLocalFonts(){
   if(!fontMap)return;const before=await saved();await page.locator('#settings-open').click();
   for(const entry of fontMap.roles){
    const bytes=await readFile(entry.path);assert.ok(hash(bytes)===entry.sha256,'Local font bytes must match the parent-checked read-only file');const metadata=localFontMetadata(bytes,entry.faceIndex||0);assert.ok(metadata.nameIDs['1'].includes(entry.name1)&&metadata.nameIDs['6'].includes(entry.name6)&&metadata.fsType===entry.fsType&&[0,4,8].includes(metadata.fsType),'Real local SFNT identity and supported technical flags must match');if(metadata.faces>1)assert.ok(Number.isInteger(entry.faceIndex),'Font collections need explicit face selection; no face is guessed');
    await page.locator('#font-role').selectOption({label:entry.role});await page.locator('#font-file').setInputFiles(entry.path);await page.locator('#font-candidate').waitFor();await page.locator('#font-face').selectOption(String(metadata.index));const faceSummary=await page.locator('#font-face-summary').innerText();check('Local '+entry.role+' confirms its actual supplied font face through the normal picker',metadata.nameIDs['6'].some(value=>faceSummary.includes(value))&&await page.locator('#font-use').isEnabled());await page.locator('#font-use').click();await page.waitForFunction(()=>document.getElementById('font-candidate').hidden&&document.getElementById('font-message').textContent.includes('已保存'),{},{timeout:180000});result.localFonts.push({role:entry.role,sourceSHA256:entry.sha256,sourceBytes:bytes.length,...metadata,confirmedFaceSummary:faceSummary,confirmedPostscriptName:metadata.nameIDs['6'].find(value=>faceSummary.includes(value)),technicalFlagsAreNotLegalCertification:true});
   }
   await page.locator('[data-close="settings-dialog"]').click();const after=await saved();check('Normal local font registration changes neither existing manuscript fields nor canonical content',same(after.fields,before.fields)&&same(after.content,before.content));check('Missing title-role font remains explicitly a builtin draft fallback',!fontMap.roles.some(entry=>entry.role==='方正小标宋简体')&&(await page.locator('#font-status p').filter({hasText:/^方正小标宋简体：/}).innerText()).includes('备用草拟'));
  }
  async function rendered(){await page.waitForFunction(()=>/^(已更新|更新失败|预览暂未生成)/.test(document.querySelector('#preview-status').textContent),{},{timeout:180000});check('Current preview completes without treating XML names as rendered evidence',(await page.locator('#preview-status').innerText()).startsWith('已更新'));}
  async function detailsContaining(id){const details=page.locator('details').filter({has:page.locator('#'+id)}).last();if(await details.getAttribute('open')===null)await details.locator(':scope>summary').click();}
  async function closeDraftMenu(){if(await page.locator('#draft-dialog').isVisible())await page.locator('[data-close="draft-dialog"]').click();}
  async function openDraft(path){const prior=(await saved())?.id;await page.locator('#load-draft').setInputFiles(path);await page.waitForFunction(id=>document.getElementById('replace-dialog').open||JSON.parse(localStorage.getItem('gongwen-writer-v1'))?.id!==id,prior);if(await page.locator('#replace-dialog').isVisible())await page.locator('#confirm-replace').click();await page.waitForFunction(id=>JSON.parse(localStorage.getItem('gongwen-writer-v1'))?.id!==id,prior);await closeDraftMenu();}
  async function download(selector,name){const event=page.waitForEvent('download',{timeout:180000});await page.locator(selector).click();const item=await event;assert.ok(await item.failure()===null,'A real browser download must finish');const path=resolve(folder,name);await item.saveAs(path);const bytes=await readFile(path);result.files.push({name,bytes:bytes.length,sha256:hash(bytes)});return path;}
  async function portable(name){await page.locator('#draft-menu').click();const path=await download('#save-draft',name);await closeDraftMenu();return path;}
  try{
   await page.goto(server.url);await ready();result.phase='single-control';await openDraft(singlePath);await page.waitForFunction(value=>document.getElementById('signer').value===value,single.fields.signer);const control=await saved();check('Existing single-signer control opens through the normal file entry with exact fields and content',same(control.fields,single.fields)&&same(control.content,single.content));result.phase='local-fonts';await registerLocalFonts();
   await page.locator('#new-document').click();if(await page.locator('#replace-dialog').isVisible())await page.locator('#confirm-replace').click();await page.waitForFunction(id=>JSON.parse(localStorage.getItem('gongwen-writer-v1')).id!==id,control.id);
   result.phase='authored-lines';const expected={...source.fields,title:source.fields.title+(source.reviewSuffix||'')};await page.locator('#title').fill(expected.title);await page.locator('#recipient').fill(expected.recipient);await detailsContaining('signer');await page.locator('#reference').fill(expected.reference);check('Signer entry is the normal multiline textarea',await page.locator('#signer').evaluate(node=>node.tagName==='TEXTAREA'));

   await page.locator('#signer').fill(expected.signer);await page.locator('[data-step="1"]').click();await page.locator('#content-blocks').click();await page.keyboard.press('Control+A');await page.keyboard.insertText(expected.body);await page.locator('#signature').fill(expected.signature);await page.locator('#date').fill(expected.date);
   if(expected.postscript){await detailsContaining('postscript');const post=page.locator('#postscript-content-blocks');if(await post.isVisible()){await post.click();await page.keyboard.press('Control+A');await page.keyboard.insertText(expected.postscript);}else await page.locator('#postscript').fill(expected.postscript);}
   await detailsContaining('issuer');await page.locator('#issuer').fill(expected.issuer);await page.locator('#issueDate').fill(expected.issueDate);await page.locator('#save-document').click();const original=await saved();check('All three source lines and authored facts remain exact rather than punctuation-split',Object.entries(expected).every(([key,value])=>same(original.fields[key],value))&&original.version===7);result.savedFieldsSHA256=hash(Buffer.from(JSON.stringify(original.fields)));result.savedContentSHA256=hash(Buffer.from(JSON.stringify(original.content)));
   result.phase='unsupported-input';await page.locator('[data-step="0"]').click();await detailsContaining('signer');const unsupported=expected.signer+'\t';await page.locator('#signer').fill(unsupported);await page.locator('[data-step="2"]').click();check('Unsupported TAB remains exact and is explained beside the signer when generation is requested',await page.locator('#signer').inputValue()===unsupported&&(await saved()).fields.signer===unsupported&&await page.locator('#signer-error').isVisible()&&/制表符/.test(await page.locator('#signer-error').innerText())&&await page.locator('#signer').evaluate(node=>node.closest('.field').contains(document.getElementById('signer-error'))));await page.locator('#signer').fill(expected.signer);await page.locator('#save-document').click();check('Correcting the unsupported control restores all original authored facts without deleting a person',same((await saved()).fields,original.fields)&&same((await saved()).content,original.content));
   result.phase='refresh';await page.reload();await ready();const refreshed=await saved();check('Save and normal refresh retain all fields, canonical content and signer order exactly',same(refreshed.fields,original.fields)&&same(refreshed.content,original.content)&&refreshed.fields.signer===expected.signer);if(fontMap){await page.locator('#settings-open').click();await page.waitForFunction(entries=>{const text=document.getElementById('font-status').textContent;return entries.every(entry=>text.includes(entry.role+'：')&&entry.nameIDs['6'].some(value=>text.includes(value)));},result.localFonts,{timeout:180000});const actual=await page.locator('#font-status').innerText();check('Save and refresh retain each explicitly confirmed real local font face',result.localFonts.every(entry=>actual.includes(entry.role+'：')&&entry.nameIDs['6'].some(value=>actual.includes(value))));await page.locator('[data-close="settings-dialog"]').click();}
   const draftPath=await portable('joint-signers.gongwen.json'),portableJSON=JSON.parse(await readFile(draftPath,'utf8'));check('Actual v7 download retains exact fields and canonical content',portableJSON.version===7&&same(portableJSON.fields,original.fields)&&same(portableJSON.content,original.content));
   result.phase='exports';await page.locator('[data-step="2"]').click();await rendered();for(const checkbox of await page.locator('.review-issue input[type=checkbox]').all())await checkbox.check();for(const format of ['txt','docx','pdf']){await page.locator(`[name=format][value=${format}]`).check();await page.locator('#export:not([disabled])').waitFor({timeout:180000});await download('#export','joint-signers.'+format);}
   const text=(await readFile(resolve(folder,'joint-signers.txt'),'utf8')).replace(/^\ufeff/,''),header=text.slice(0,text.indexOf(expected.title));const lines=header.split(/\r?\n/).filter(value=>value.trim());const rowOne=lines.findIndex(line=>line.includes(people[0])&&line.includes(people[1])),rowTwo=lines.findIndex(line=>line.includes(people[2])&&line.includes(expected.reference));check('Actual TXT retains three people in source order on two rows with reference on the last row',rowOne>=0&&rowTwo>rowOne&&lines[rowOne].indexOf(people[0])<lines[rowOne].indexOf(people[1])&&text.includes(expected.body));
   result.productPDFLayout=measurePDF(resolve(folder,'joint-signers.pdf'));check('Actual product PDF measures two first-row signers, one continuation, aligned first column and reference on the last baseline',result.productPDFLayout.passed);
   result.phase='portable-restore';await page.locator('[data-step="0"]').click();await page.locator('#title').fill(expected.title+' ');await openDraft(draftPath);await page.waitForFunction(value=>document.getElementById('title').value===value,expected.title);const restored=await saved();check('Normal v7 reopen restores exact three-person raw field, all facts and canonical content',same(restored.fields,portableJSON.fields)&&same(restored.content,portableJSON.content));
   result.phase='single-protection';await page.locator('#save-document').click();await page.locator('#draft-menu').click();const row=page.locator('.recent-document').filter({has:page.getByRole('heading',{name:control.fields.title,exact:true})});check('Previous independently verified single-signer draft remains in the normal library',await row.count()===1);await row.getByRole('button',{name:'继续编辑',exact:true}).click();await page.waitForFunction(value=>document.getElementById('signer').value===value,control.fields.signer);const returned=await saved();check('Existing single-signer manuscript and content remain exact after the joint task and reopen',same(returned.fields,control.fields)&&same(returned.content,control.content));
   check('Actual Wasm bytes match the frozen candidate',result.wasm.length>0&&result.wasm.every(value=>value===report.assets['document-engine.wasm']));check('Normal authoring and all downloads issue no feedback, upload or external request',result.feedbackRequests===0&&result.uploadRequests===0&&result.externalRequests===0&&result.errors.length===0);check('Official source and old single draft files are unchanged',hash(await readFile(source.pdfPath))===source.pdfSHA256&&hash(await readFile(singlePath))===hash(singleBytes));if(fontMap)check('Read-only source system-font files retain their parent-pinned hashes',(await Promise.all(fontMap.roles.map(async entry=>hash(await readFile(entry.path))===entry.sha256))).every(Boolean));result.uiAndProductPDFPassed=true;
  }catch(error){result.failure={phase:result.phase,type:error.name,message:error.message};await page.screenshot({path:resolve(folder,'failure.png')}).catch(()=>{});throw Error('Joint-signers QA failed at '+result.phase+'; inspect only the ignored local artifacts.');}
  finally{await context.close();await browser.close();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));}
 }
 report.uiAndProductPDFPassed=report.profiles.length===profiles.length&&report.profiles.every(result=>result.uiAndProductPDFPassed);
 }finally{await server.close();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({uiAndProductPDFPassed:report.uiAndProductPDFPassed,profiles:report.profiles.map(result=>({profile:result.profile,checks:result.checks.length,files:result.files.length})),nativeWordLayoutPending:true}));
}
