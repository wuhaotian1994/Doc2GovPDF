import {spawn} from 'node:child_process';
import {mkdir, readFile, writeFile, mkdtemp} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'), output=resolve(root,'build/qa');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(resolve(output,'profile-'));
const child=spawn(resolve(root,'build/bin/Doc2GovPDF-test.exe'),[],{cwd:root,windowsHide:true,env:{...process.env,DOC2GOVPDF_DATA_DIR:profile,DOC2GOVPDF_TEST_MODE:'1'}});
let launchError; child.on('error',e=>launchError=e);
try {
  const deadline=Date.now()+75000; let result;
  while(Date.now()<deadline) {
    if(launchError) throw launchError;
    try { result=JSON.parse(await readFile(resolve(profile,'result.json'),'utf8'))[0]; } catch {}
    if(result)break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(result,'Desktop smoke test did not return a result');
  await writeFile(resolve(output,'smoke-result.json'),JSON.stringify({...result,profile},null,2));
  assert.equal(result.passed,true,JSON.stringify(result));
  console.log('PASS: '+result.checks.join(', '));
} finally { child.kill(); }
