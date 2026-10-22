importScripts('./wasm_exec.js', './engine-assets.js', './engine-resources.js');
const resources = new EngineResources(self.DOCUMENT_ENGINE_ASSETS);
self.engineReady = () => postMessage({ready:true});
const go = new Go();
resources.bytes(self.DOCUMENT_ENGINE_ASSETS.wasm)
  .then(data => WebAssembly.instantiate(data, go.importObject))
  .then(result => go.run(result.instance))
  .catch(error => postMessage({fatal:String(error)}));
let queue = Promise.resolve();
onmessage = ({data}) => {
  queue = queue.then(async () => {
    try {
      const request = data.request;
      if (request.method === 'PrepareFonts') {
        await resources.prepare(request.args[0], Boolean(request.args[1]));
        postMessage({id:data.id, value:null});
        return;
      }
      if (request.method === 'BuildDocument' || request.method === 'UpdateDocumentElements') {
        // Construction measures attachment labels and signer tab stops. Discover
        // the required faces first, then rebuild with their actual metrics.
        const draft = JSON.parse(self.documentEngine(JSON.stringify(request)));
        if (draft.error) throw Error(draft.error);
        await resources.prepare(draft.value, false);
      }
      if (request.args[0]?.blocks && ['PreviewDocument','InspectDocument','ExportDocument'].includes(request.method)) {
        const complete = request.method === 'ExportDocument' && request.args[1] !== 'pdf' && !request.args[0].sourceId;
        await resources.prepare(request.args[0], complete);
      }
      postMessage({id:data.id, ...JSON.parse(self.documentEngine(JSON.stringify(request)))});
    } catch (error) { postMessage({id:data.id, error:String(error.message || error)}); }
  });
};
