import {decodeBase64} from '../web/write-bytes.js';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
for(const length of [0,1,2,3,255,65537,17066644]){
 const original=Buffer.allocUnsafe(length);for(let i=0;i<length;i++)original[i]=i%256;
 const output=decodeBase64(original.toString('base64'));
 assert.equal(output.byteLength,original.byteLength);assert.equal(createHash('sha256').update(output).digest('hex'),createHash('sha256').update(original).digest('hex'));
 console.log('Exact base64 bytes:',length);
}
assert.throws(()=>decodeBase64('not base64!'));console.log('Malformed base64 rejected');
