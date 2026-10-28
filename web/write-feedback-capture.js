// Render only this application's visible page, locally; no screen capture API.
let rendererPromise;
export async function captureFeedbackFrame({beforeCapture=()=>{},afterCapture=()=>{},signal}={}){
  if(signal?.aborted)return null;
  let frame=null;
  try{
    beforeCapture();
    rendererPromise ||= import('./vendor/html2canvas/html2canvas.js').catch(error=>{rendererPromise=null;throw error;});
    const {default:render}=await rendererPromise;
    if(signal?.aborted)return null;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const width=window.innerWidth,height=window.innerHeight;
    const scale=Math.min(window.devicePixelRatio||1,2,4096/width,4096/height,Math.sqrt(8000000/(width*height)));
    frame=await render(document.body,{
      width,height,x:window.scrollX,y:window.scrollY,windowWidth:width,windowHeight:height,scale,
      backgroundColor:'#ffffff',logging:false,allowTaint:false,useCORS:false,imageTimeout:5000,
      ignoreElements:element=>element.matches('.feedback-dialog,script,iframe'),
      onclone:doc=>{doc.querySelectorAll('.feedback-dialog').forEach(node=>node.remove());}
    });
    if(signal?.aborted){frame.width=0;frame.height=0;return null;}
    if(scale<1)frame.dataset.feedbackCaptureScaled='true';
    return frame;
  }catch{
    if(frame){frame.width=0;frame.height=0;}
    if(signal?.aborted)return null;
    throw new Error('当前页面截图未能生成，请重试，或粘贴、拖入截图。');
  }finally{await afterCapture();}
}
