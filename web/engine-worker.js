importScripts('./wasm_exec.js');
self.engineReady=()=>postMessage({ready:true});
const go=new Go();
fetch('./document-engine.wasm').then(r=>{if(!r.ok)throw Error('文档引擎下载失败');return r.arrayBuffer()}).then(b=>WebAssembly.instantiate(b,go.importObject)).then(r=>go.run(r.instance)).catch(e=>postMessage({fatal:String(e)}));
onmessage=({data})=>{try{postMessage({id:data.id,...JSON.parse(self.documentEngine(JSON.stringify(data.request)))});}catch(e){postMessage({id:data.id,error:String(e)})}};
