// Keep all page positions in the document, but only rasterize nearby pages.
export function createPDFViewer({pdf,container,scroll,isCurrent,onError}) {
  let cancelled=false,observer,task,draining=false;
  const pages=[],queue=[];
  const current=()=>!cancelled&&isCurrent();
  function placeholder(item){
    const label=document.createElement('span');label.className='pdf-page-loading';label.textContent=`第 ${item.number} 页`;item.wrapper.replaceChildren(label);item.canvas=null;
  }
  function release(item){if(item.canvas){item.canvas.width=0;item.canvas.height=0;placeholder(item);}}
  async function paint(item){
    if(!current()||item.canvas)return;
    // Supersample fine Chinese strokes even on 1x screens. Bound each bitmap
    // to eight megapixels while retaining the nearby-page eviction policy.
    const base=item.page.getViewport({scale:96/72});
    const density=Math.min(Math.max(2,(window.devicePixelRatio||1)*2),3,Math.sqrt(8000000/(base.width*base.height)));
    const viewport=item.page.getViewport({scale:96/72*density});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`文档第 ${item.number} 页，正文可在填写区阅读`);
    task=item.page.render({canvasContext:canvas.getContext('2d'),viewport});
    try{await task.promise;}catch(error){canvas.width=canvas.height=0;if(error.name==='RenderingCancelledException'||!current())return;throw error;}
    if(!current()){canvas.width=canvas.height=0;return;}
    item.canvas=canvas;item.wrapper.replaceChildren(canvas);
  }
  async function drain(){
    if(draining)return;draining=true;
    try{while(queue.length&&current()){
      const item=queue.shift();item.queued=false;if(!item.visible||item.canvas)continue;
      try{await paint(item);if(!item.visible)release(item);}catch(error){if(current()){item.wrapper.textContent=`第 ${item.number} 页显示失败，请重新生成预览。`;onError(error);}}
    }}finally{draining=false;}
  }
  const controller={cancel(){cancelled=true;observer?.disconnect();task?.cancel();queue.length=0;},ready:null};
  controller.ready=(async()=>{
    for(let number=1;number<=pdf.numPages;number++){
      const page=await pdf.getPage(number);if(!current())return;
      const viewport=page.getViewport({scale:96/72});
      const wrapper=document.createElement('div');wrapper.className='pdf-page';wrapper.dataset.page=number;
      wrapper.style.setProperty('--page-width',viewport.width+'px');wrapper.style.aspectRatio=`${viewport.width} / ${viewport.height}`;
      const item={number,page,wrapper,visible:number===1,queued:false,canvas:null};placeholder(item);pages.push(item);
    }
    await paint(pages[0]);if(!current())return;
    container.replaceChildren(...pages.map(item=>item.wrapper));
    observer=new IntersectionObserver(entries=>{
      for(const entry of entries){const item=pages[Number(entry.target.dataset.page)-1];item.visible=entry.isIntersecting;
        if(item.visible&&!item.canvas&&!item.queued){item.queued=true;queue.push(item);}else if(!item.visible)release(item);
      }drain();
    },{root:scroll,rootMargin:'600px 0px'});
    pages.forEach(item=>observer.observe(item.wrapper));
  })();
  return controller;
}
