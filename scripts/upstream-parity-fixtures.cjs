// Run the pinned, unmodified upstream suites and retain their generated fixtures.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),up=path.join(root,'tmp/upstream-samples/gongwen-kit-d8dfe6a24e20ecaa64c14f3a79159813ad92db70');
const output=path.join(root,'build/qa/upstream-parity');fs.mkdirSync(output,{recursive:true});
if(process.argv[2]==='--suite'){
 os.tmpdir=()=>output;
 const make=fs.mkdtempSync;fs.mkdtempSync=(prefix,...args)=>{const dir=make(prefix,...args);console.log('FIXTURE_DIRECTORY='+dir);return dir};
 const remove=fs.rmSync;fs.rmSync=(target,options)=>{const rel=path.relative(output,path.resolve(target));if(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel))return;return remove(target,options)};
 require(path.join(up,'tests',process.argv[3]));
}else{
 for(const suite of ['negative.js','fix.js']){
  const result=cp.spawnSync(process.execPath,[__filename,'--suite',suite],{cwd:up,encoding:'utf8',maxBuffer:20*1024*1024});
  fs.writeFileSync(path.join(output,suite+'.log'),result.stdout+'\n'+result.stderr);
  if(result.status!==0)throw Error(suite+' failed: '+result.stdout+'\n'+result.stderr);
  console.log(suite+': PASS');
 }
 const fix=fs.readFileSync(path.join(up,'tests/fix.js'),'utf8');
 const literal=fix.match(/const CASES = (\[[\s\S]*?\n  \]);/)[1];
 const cases=vm.runInNewContext(literal);
 const files=fs.readdirSync(output,{withFileTypes:true}).filter(d=>d.isDirectory()).flatMap(d=>fs.readdirSync(path.join(output,d.name)).filter(n=>n.endsWith('.docx')).map(n=>({name:n,path:path.join(d.name,n)})));
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({upstream:'d8dfe6a24e20ecaa64c14f3a79159813ad92db70',textCases:cases,files},null,2));
 console.log(files.length+' DOCX fixtures and '+cases.length+' text cases retained.');
}
