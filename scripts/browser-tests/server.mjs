import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function startWebServer(directory) {
  const root=resolve(import.meta.dirname,'../..');
  await mkdir(resolve(root,'build/qa'),{recursive:true});
  const binDir=await mkdtemp(resolve(root,'build/qa/http-server-'));
  const binary=resolve(binDir,process.platform==='win32'?'webserve.exe':'webserve');
  execFileSync('go',['build','-o',binary,'./cmd/webserve'],{cwd:root,windowsHide:true,env:{...process.env,GOMODCACHE:resolve(root,'tmp/gomod'),GOCACHE:resolve(root,'tmp/gocache')},stdio:'pipe'});
  const child=spawn(binary,['-listen','127.0.0.1:0','-dir',resolve(directory)],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const closed=new Promise(resolve=>child.once('exit',resolve));
  const url=await new Promise((resolve,reject)=>{
    let logs='';const timer=setTimeout(()=>{child.kill();reject(Error('Actual web server did not start: '+logs));},15000);
    const consume=chunk=>{logs+=chunk.toString();const match=logs.match(/Browser app: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}};
    child.stdout.on('data',consume);child.stderr.on('data',consume);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('Actual web server exited: '+code+' '+logs));});
  });
  return {url,binary,async close(){if(child.exitCode===null)child.kill();await closed;}};
}
