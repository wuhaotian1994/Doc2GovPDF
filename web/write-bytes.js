// The Wasm boundary returns base64. TypedArray.from(string, map) first
// expands the iterable into a JS character list, which is costly for DOCX
// files carrying full embedded fallback fonts. Allocate the final buffer once.
export function decodeBase64(data) {
  const binary=atob(data),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
