// The Wasm boundary returns base64. TypedArray.from(string, map) first
// expands the iterable into a JS character list, which is costly for DOCX
// files carrying full embedded fallback fonts. Allocate the final buffer once.
export function decodeBase64(data) {
  if(typeof Uint8Array.fromBase64==='function')return Uint8Array.fromBase64(data);
  const binary=atob(data),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
export function encodeBase64(data){
  if(typeof data.toBase64==='function')return data.toBase64();
  let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(binary);
}
