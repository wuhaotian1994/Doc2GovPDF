import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {inspectFont,fontFaceBytes} from '../web/write-font-source.js';

// Deployment inputs, deliberately outside the public repository.
export async function prepareSystemFonts(out){
  const folder=resolve(process.env.GONGWEN_SYSTEM_FONT_DIR||'.release-private/system-fonts');
  const required=[['方正小标宋简体','title','FZXBSK.TTF','方正小标宋_GBK'],['仿宋','body','FZFSK.TTF','方正仿宋_GBK'],['黑体','heading','FZHTK.TTF','方正黑体_GBK'],['楷体','subheading','FZKTK.TTF','方正楷体_GBK'],['宋体','footer','FZSSK.TTF','方正书宋_GBK']];
  await mkdir(resolve(out,'fonts/system'),{recursive:true});const assets=[];
  for(const [role,key,file,family] of required){
    let data;try{data=new Uint8Array(await readFile(resolve(folder,file)));}catch{throw Error(`缺少网站部署字库 ${file}。请由维护方配置 GONGWEN_SYSTEM_FONT_DIR；不能让终端用户补文件。`);}
    const parsed=inspectFont(data),face=parsed.faces.find(face=>face.family===family&&face.pdfAllowed);
    if(!face)throw Error(`${file} 实际字体身份或嵌入标志不匹配，构建已停止。`);
    data=fontFaceBytes(parsed,face.index);const path=`fonts/system/${key}.ttf`;
    await writeFile(resolve(out,path),data);
    const hash=createHash('sha256').update(data);
    assets.push({role,family,postscriptName:face.postscriptName,url:'./'+path,type:'font/ttf',sha256:hash.copy().digest('hex'),integrity:'sha256-'+hash.digest('base64')});
  }
  return assets;
}
