import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'build/qa');
await mkdir(out,{recursive:true});const profile=await mkdtemp(resolve(out,'journeys-'));const results=[];
for(const phase of ['1','2','3','4','5']){
 const child=spawn(resolve(root,'build/bin/Doc2GovPDF-test.exe'),[],{cwd:root,windowsHide:true,env:{...process.env,DOC2GOVPDF_DATA_DIR:profile,DOC2GOVPDF_TEST_MODE:'1',DOC2GOVPDF_QA_JOURNEYS:'1',DOC2GOVPDF_QA_PHASE:phase}});
 let launchError,exited=false;child.on('error',e=>launchError=e);child.on('exit',()=>exited=true);
 try{
  const deadline=Date.now()+180000;let result;
  while(Date.now()<deadline){if(launchError)throw launchError;try{result=JSON.parse(await readFile(resolve(profile,'journey-'+phase+'.json'),'utf8'))[0]}catch{}if(result&&exited)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(result,'Journey returned no result: '+phase);results.push(result);await writeFile(resolve(out,'journeys-result.json'),JSON.stringify({profile,results},null,2));
  assert.equal(result.passed,true,JSON.stringify({phase,checks:result.checks,error:result.error,stack:result.stack}));assert.ok(exited,'Window close failed to flush draft and exit');
  for(const output of result.exports){const data=await readFile(output.path);assert.ok(data.length>20,'empty output');if(extname(output.path)==='.pdf')assert.equal(data.subarray(0,5).toString(),'%PDF-');else assert.equal(data.subarray(0,2).toString(),'PK');if(output.original)assert.deepEqual(data,await readFile(output.original),'Imported original rewritten');}
  console.log('PASS phase '+phase+': '+result.checks.join('、'));
 }finally{if(!exited)child.kill();}
}
for(const output of results.flatMap(r=>r.exports))assert.ok((await stat(output.path)).size>20,'Clear removed exported result');
console.log('PASS: '+results.reduce((n,r)=>n+r.checks.length,0)+' journeys; real restart, actual file output and original retention.');
