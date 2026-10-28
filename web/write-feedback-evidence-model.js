// Deliberately copy visible strings only. Never serialize a draft or Word recovery object.
export const evidenceSemantics={role:['auto','body','title','heading','heading2','heading3','heading4','article','signature','date'],align:['auto','left','center','right','both'],indent:['auto','none','two'],before:['auto','none','half','one'],after:['auto','none','half','one']};
export function paragraphSemantics(value){const out={};for(const [key,allowed]of Object.entries(evidenceSemantics)){if(value[key]!==undefined){if(typeof value[key]!=='string'||!allowed.includes(value[key]))throw Error('示例段落'+key+'语义无效，未改变原稿。');out[key]=value[key];}}return out;}
function tableSemantics(value){if(value.header===undefined)return {};if(typeof value.header!=='boolean')throw Error('示例表头状态必须为布尔值。');return {header:value.header};}
export function visibleEvidenceCandidates(draft){
  if(!draft||draft.nativeWord||draft.native===true||draft.mode==='word'||draft.type==='gongwen-word'||draft.type==='gongwen-word-workspace')throw Error('原有 Word 不能可靠去除原件、批注、修订和隐藏属性。请改用本地准备的截图副本，不上传原 Word 或恢复包。');
  const fields=draft.fields||{},result=[];
  const paragraph=(text,label,title=false,semantics={})=>{if(typeof text!=='string'||!text.trim())return;if(text.length>10000)throw Error('单段超过示例范围，请只保留必要片段或使用截图。');result.push({kind:title?'title':'paragraph',label,text,...semantics});};
  paragraph(fields.title,'标题',true);
  const region=(content,plain,label)=>{
    if(content?.blocks){
      if(!Array.isArray(content.blocks)||content.blocks.length>1000)throw Error('此稿结构无法安全制作示例，请使用截图。');
      for(const [index,block] of content.blocks.entries()){
        if(block?.type==='paragraph')paragraph(block.text,`${label}第 ${index+1} 段`,false,paragraphSemantics(block));
        else if(block?.type==='table'){
          paragraph(block.caption,`${label}第 ${index+1} 块的表标题`);
          if(!Array.isArray(block.rows)||!block.rows.length||block.rows.length>100)throw Error('示例表格最多100行。');
          const width=block.rows[0]?.cells?.length;if(!width||width>20||!block.rows.every(row=>Array.isArray(row.cells)&&row.cells.length===width))throw Error('该表结构不适合安全示例，请使用截图。');
          const rows=block.rows.map(row=>row.cells.map(cell=>{if(typeof cell.text!=='string'||cell.text.length>1000)throw Error('示例单元格最多1000字符，请删减或使用截图。');return cell.text;}));
          result.push({kind:'table',label:`${label}第 ${index+1} 块表格（${rows.length} 行 × ${width} 列）`,rows,...tableSemantics(block)});
        }else throw Error('含有尚不能可靠抽取的结构，请使用截图，不上传原件。');
      }
    }else if(typeof plain==='string')for(const [index,line] of plain.replace(/\r\n?/g,'\n').split('\n').entries())paragraph(line,`${label}第 ${index+1} 段`);
  };
  region(draft.content,fields.body,'正文');region(draft.content?.postscript,fields.postscript,'落款后');
  if(!result.length)throw Error('当前稿没有可选的标题、段落或表格。可以只写反馈，不必提供附件。');
  return result;
}
export function exampleFromSelection(items){
  const selected=items.filter(item=>item.selected);if(!selected.length)throw Error('请主动选择必要内容；默认不选择任何内容。');
  const example={version:1,kind:'doc2govpdf-feedback-example',blocks:[]};let total=0;
  for(const item of selected){
    if(item.kind==='title'){if(typeof item.text!=='string'||[...item.text].length>300)throw Error('示例标题最多300字。');example.title=item.text;total+=[...item.text].length;}
    else if(item.kind==='paragraph'){if(typeof item.text!=='string'||[...item.text].length>10000)throw Error('示例段落最多10000字。');example.blocks.push({type:'paragraph',text:item.text,...paragraphSemantics(item)});total+=[...item.text].length;}
    else if(item.kind==='table'){
      if(!Array.isArray(item.rows)||item.rows.length<1||item.rows.length>100)throw Error('示例表格行数无效。');
      const width=item.rows[0].length;if(width<1||width>20)throw Error('示例表格最多20列。');
      const rows=item.rows.map(row=>{if(row.length!==width)throw Error('请保留规则表格结构。');return row.map(cell=>{if(typeof cell!=='string'||[...cell].length>1000)throw Error('示例单元格最多1000字。');total+=[...cell].length;return cell;});});example.blocks.push({type:'table',rows,...tableSemantics(item)});
    }else throw Error('未知示例类型。');
  }
  // The receiving schema requires at least one content block. A title-only example is an ordinary visible paragraph.
  if(!example.blocks.length&&example.title!==undefined){example.blocks.push({type:'paragraph',text:example.title});delete example.title;}
  if(example.blocks.length>100||total>30000)throw Error('示例最多100块、合计30000字，请只选必要内容。');
  return example;
}
export function evidenceRisks(example){
  const text=JSON.stringify(example),found=[];
  if(/\b1[3-9]\d{9}\b/.test(text))found.push('疑似手机号码');
  if(/\b\d{17}[\dXx]\b/.test(text))found.push('疑似身份证号码');
  if(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(text))found.push('疑似邮箱');
  if(/(?:密级[：:]?\s*|国家)(?:秘密|机密|绝密)|(?:秘密|机密|绝密)[★☆]/.test(text))found.push('可能的涉密标识（禁止上传涉密材料）');
  return found;
}
export function inspectScreenshotHeader(bytes){
  if(bytes.byteLength>8*1024*1024)throw Error('原始截图最多8MB，请先缩小截图范围。');
  let width=0,height=0,type='';const b=new Uint8Array(bytes),v=new DataView(bytes);
  if(b.length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)){width=v.getUint32(16);height=v.getUint32(20);type='image/png';}
  else if(b.length>=4&&b[0]===255&&b[1]===216){
    let p=2;while(p+4<=b.length){if(b[p++]!==255)throw Error('JPEG结构无法读取。');while(p<b.length&&b[p]===255)p++;const marker=b[p++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const len=v.getUint16(p);if(len<2||p+len>b.length)throw Error('JPEG截断或无效。');if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(len<7)break;height=v.getUint16(p+3);width=v.getUint16(p+5);type='image/jpeg';break;}p+=len;}
  }
  if(!type)throw Error('只接受实际PNG或JPEG截图；不接受Word、PDF、ZIP或恢复包。');
  if(width<1||height<1||width>4096||height>4096||width*height>8000000)throw Error('截图边长最多4096像素、合计800万像素，请先缩小范围。');
  return {width,height,type};
}
export function validRectangle(rect,width,height){
  if(!rect||!['x','y','width','height'].every(k=>Number.isInteger(rect[k]))||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.x+rect.width>width||rect.y+rect.height>height)throw Error('请在图内选择有效区域：左、上从0开始，宽高至少1像素。');
  return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
}
