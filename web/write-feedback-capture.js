const MAX_EDGE=4096,MAX_PIXELS=8000000;
const captureError=(code,message)=>Object.assign(new Error(message),{name:'FeedbackCaptureError',code});
const aborted=()=>captureError('aborted','截图已取消。');

/**
 * Call directly from the user's click, without awaiting before it. Callbacks
 * control only the feedback panel: beforeCapture must hide it synchronously.
 * The browser still asks for a source every time; this helper cannot select a
 * source or dismiss its chooser. A late grant after abort is immediately stopped.
 * timeoutMs bounds frame acquisition after permission, not the source chooser.
 */
export async function captureFeedbackFrame({beforeCapture=()=>{},afterCapture=()=>{},signal,timeoutMs=15000}={}){
  if(signal?.aborted)return null;
  let stream=null,video=null,discardStream=false,restore=false,timer=null,frameCallback=null;
  const cleanups=[],stopped=new Set();
  const stopTrack=track=>{if(!track||stopped.has(track))return;stopped.add(track);try{track.stop();}catch{}};
  const stopStream=value=>{try{for(const track of value?.getTracks?.()||[])stopTrack(track);}catch{}};
  try{
    restore=true;beforeCapture();
    if(signal?.aborted)return null;
    if(typeof navigator.mediaDevices?.getDisplayMedia!=='function')throw captureError('unsupported','此浏览器不能直接发起截图。请粘贴或拖入截图，也可以选择本地图片。');
    if(navigator.userActivation&&navigator.userActivation.isActive===false)throw captureError('activation','请直接点击截图按钮开始，再按浏览器提示选择来源；也可以粘贴或拖入截图。');
    // Do not place an await before this call: transient user activation belongs
    // to this original click. Never request audio or choose a tab on the user's behalf.
    const permission=navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false,preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'exclude'});
    const cancellation=new Promise((_,reject)=>{
      if(!signal)return;const onAbort=()=>{discardStream=true;reject(aborted());};signal.addEventListener('abort',onAbort,{once:true});cleanups.push(()=>signal.removeEventListener('abort',onAbort));if(signal.aborted)onAbort();
    });
    const granted=Promise.resolve(permission).then(value=>{if(discardStream||signal?.aborted)stopStream(value);return value;});
    stream=await Promise.race([granted,cancellation]);
    if(discardStream||signal?.aborted)throw aborted();
    const tracks=stream?.getVideoTracks?.()||[];
    // audio:false is also enforced if an implementation unexpectedly supplies an audio track.
    for(const track of stream?.getAudioTracks?.()||[])stopTrack(track);
    if(!tracks.length||tracks.every(track=>track.readyState==='ended'))throw captureError('frame','没有取得可用截图画面。请粘贴或拖入截图，也可以重新点击截图按钮。');
    video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;
    const ready=new Promise((resolve,reject)=>{
      const listen=(target,type,fn)=>{target.addEventListener(type,fn);cleanups.push(()=>target.removeEventListener(type,fn));};
      const usable=()=>video.readyState>=2&&Number.isFinite(video.videoWidth)&&Number.isFinite(video.videoHeight)&&video.videoWidth>0&&video.videoHeight>0;
      const check=()=>{if(usable())resolve();};
      const failed=()=>reject(captureError('frame','截图来源未能提供画面。请粘贴或拖入截图，或重新点击截图按钮。'));
      for(const type of['loadedmetadata','loadeddata','canplay','playing'])listen(video,type,check);
      listen(video,'error',failed);for(const track of tracks)listen(track,'ended',failed);
      if(typeof video.requestVideoFrameCallback==='function')frameCallback=video.requestVideoFrameCallback(check);
      video.srcObject=stream;
      try{const playback=video.play();if(playback?.catch)playback.catch(failed);}catch{failed();}
      check();
    });
    const deadline=new Promise((_,reject)=>{const duration=Number.isFinite(timeoutMs)&&timeoutMs>0?Math.min(timeoutMs,60000):15000;timer=setTimeout(()=>reject(captureError('timeout','截图来源已授权，但未能及时取得画面。请重试，或粘贴、拖入截图。')),duration);});
    await Promise.race([ready,cancellation,deadline]);
    if(discardStream||signal?.aborted)throw aborted();
    const width=video.videoWidth,height=video.videoHeight;
    if(!Number.isSafeInteger(width*height))throw captureError('frame','截图尺寸无法安全处理，请改用较小的截图图片。');
    const scale=Math.min(1,MAX_EDGE/width,MAX_EDGE/height,Math.sqrt(MAX_PIXELS/(width*height))),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.floor(width*scale));canvas.height=Math.max(1,Math.floor(height*scale));
    if(scale<1)canvas.dataset.feedbackCaptureScaled='true';
    const context=canvas.getContext('2d');if(!context)throw captureError('frame','此浏览器无法准备截图副本。请粘贴或拖入截图图片。');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(video,0,0,canvas.width,canvas.height);
    return canvas;
  }catch(error){
    if(error?.code==='aborted'||error?.name==='AbortError'||error?.name==='NotAllowedError')return null;
    if(error?.name==='FeedbackCaptureError')throw error;
    // Do not expose the browser exception, source title, device labels or paths.
    throw captureError('capture','无法取得截图画面。请粘贴或拖入截图，也可以选择本地图片。');
  }finally{
    discardStream=true;if(timer!==null)clearTimeout(timer);
    for(const cleanup of cleanups.splice(0)){try{cleanup();}catch{}}
    if(video){if(frameCallback!==null){try{video.cancelVideoFrameCallback?.(frameCallback);}catch{}}try{video.pause();}catch{}try{video.srcObject=null;}catch{}try{video.removeAttribute('src');}catch{}}
    stopStream(stream);
    if(restore){try{await afterCapture();}catch{ /* Host restoration must not leak its errors or keep capture active. */ }}
  }
}
