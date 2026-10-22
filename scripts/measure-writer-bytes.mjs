import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),file=resolve(root,'build/qa/native-format/chrome/saved-new-admissions.docx');
if(process.argv[2]){
 const mode=process.argv[2],source=await readFile(file),base64=source.toString('base64');global.gc();const before=process.memoryUsage(),start=performance.now();let output;
 if(mode==='before')output=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));else{const binary=atob(base64);output=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)output[i]=binary.charCodeAt(i);}
 console.log(JSON.stringify({mode,node:process.version,bytes:output.length,sha256:createHash('sha256').update(output).digest('hex'),elapsedMs:performance.now()-start,before,after:process.memoryUsage(),maxRSSKiB:process.resourceUsage().maxRSS}));
}else{
 const rows=[];for(const mode of ['before','after']){const result=spawnSync(process.execPath,['--expose-gc',import.meta.filename,mode],{windowsHide:true,encoding:'utf8'});assert.equal(result.status,0,result.stderr);rows.push(JSON.parse(result.stdout));}assert.equal(rows[0].sha256,rows[1].sha256);await writeFile(resolve(root,'build/qa/native-format/byte-allocation.json'),JSON.stringify({method:'Two independent Node V8 processes on the same actual DOCX, not a cloud browser crash reproduction or a browser peak-memory measurement.',rows},null,2));console.log(rows.map(x=>({mode:x.mode,bytes:x.bytes,maxRSSMiB:x.maxRSSKiB/1024,elapsedMs:x.elapsedMs})));
}
