import {readFile,writeFile,copyFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync,gzipSync,constants} from 'node:zlib';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,process.argv[2]||'dist/web');
await mkdir(resolve(out,'fonts'),{recursive:true});
const describe=async(url,type)=>{const bytes=await readFile(resolve(out,url));const digest=createHash('sha256').update(bytes);return {url:'./'+url,type,sha256:digest.copy().digest('hex'),integrity:'sha256-'+digest.digest('base64')};};
const fonts=[];
for(const [name,file,key] of [['Noto Serif SC','NotoSerifSC.ttf','serif'],['Noto Serif SC Black','NotoSerifSC-Black.ttf','serif-black']]){
  const core='fonts/'+key+'-core.ttf',full='fonts/'+key+'-full.ttf';
  await copyFile(resolve(root,'assets/fonts/web',file),resolve(out,core));
  await copyFile(resolve(root,'assets/fonts',file),resolve(out,full));
  fonts.push({name,core:await describe(core,'font/ttf'),full:await describe(full,'font/ttf')});
}
await copyFile(resolve(root,'assets/fonts/OFL.txt'),resolve(out,'fonts/document-fonts-OFL.txt'));
const wasm=await describe('document-engine.wasm','application/wasm');
const coreCoverage=JSON.parse(await readFile(resolve(root,'assets/fonts/web/coverage.json'),'utf8'));
const version=createHash('sha256').update(JSON.stringify({wasm,fonts,coreCoverage})).digest('hex').slice(0,20);
await writeFile(resolve(out,'engine-assets.js'),'self.DOCUMENT_ENGINE_ASSETS='+JSON.stringify({version,wasm,fonts,coreCoverage})+';\n');
const files=[];
async function visit(folder){for(const item of await readdir(folder,{withFileTypes:true})){const path=resolve(folder,item.name);if(item.isDirectory())await visit(path);else if(!['.gz','.br'].includes(extname(path))&&item.name!=='sw.js')files.push(path);}}
await visit(out);files.sort();
for(const file of files.filter(file=>['.wasm','.ttf','.js','.mjs','.css','.html'].includes(extname(file)))){
  const bytes=await readFile(file);
  if(bytes.length<1024)continue;
  await writeFile(file+'.gz',gzipSync(bytes,{level:9}));
  await writeFile(file+'.br',brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:11}}));
}
// Precache the UI, not every font and a second concurrent engine download.
const resources=new Set(['document-engine.wasm',...fonts.flatMap(font=>[font.core.url.slice(2),font.full.url.slice(2)])]);
// The active viewer uses .js; do not fetch duplicate PDF.js aliases during setup.
resources.add('vendor/pdfjs/pdf.mjs');resources.add('vendor/pdfjs/pdf.worker.mjs');
const precache=['./',...files.map(file=>relative(out,file).replaceAll('\\','/')).filter(file=>file!=='index.html'&&!resources.has(file)).map(file=>'./'+file)];
const hashes=[];for(const file of files)hashes.push(createHash('sha256').update(await readFile(file)).digest('hex'));
const cache='gongwen-web-v2-'+createHash('sha256').update(hashes.join('')).digest('hex').slice(0,16);
await writeFile(resolve(out,'sw.js'),`const CACHE=${JSON.stringify(cache)},FILES=${JSON.stringify(precache)},RESOURCES=${JSON.stringify('gongwen-resources-v1-'+version)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(async()=>{if((await caches.keys()).some(k=>k.startsWith('gongwen-web-')&&!k.startsWith('gongwen-web-v2-')))await self.skipWaiting()})));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gongwen-web-')&&k!==CACHE||k.startsWith('gongwen-resources-v1-')&&k!==RESOURCES).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{const cached=(await c.match(e.request))||(e.request.mode==='navigate'?await c.match('./'):null);if(cached&&e.request.mode==='navigate'&&cached.redirected)return new Response(cached.body,{status:cached.status,statusText:cached.statusText,headers:cached.headers});return cached||fetch(e.request)}))});
`);
console.log(JSON.stringify({engineVersion:version,precacheFiles:precache.length,engineBrotliBytes:(await readFile(resolve(out,'document-engine.wasm.br'))).length,coreFontBrotliBytes:await Promise.all(fonts.map(async font=>(await readFile(resolve(out,font.core.url+'.br'))).length))}));
