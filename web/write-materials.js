import {blank,validDate} from './write-model.js';
const heading=/^(?:[一二三四五六七八九十]+、|[（(][一二三四五六七八九十0-9]+[）)]|[0-9]+[.．]|第[一二三四五六七八九十0-9]+[章条])/;
function sourceDate(text){
  let value=text.trim();
  const match=value.match(/^([1-9]\d{3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日$/);
  if(match)value=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  return validDate(value)?value:null;
}
export function analyseMaterial(raw){
  if(typeof raw!=='string'||raw.length>100000)throw Error('原始材料最多支持 100000 字，请拆成两份整理。');
  const source=raw.replace(/\r\n?/g,'\n'),lines=source.split('\n');
  const meaningful=lines.map((text,index)=>({text,index})).filter(line=>line.text.trim());
  const candidates={};
  const first=meaningful[0];
  if(first&&first.text.trim().length<=180&&!sourceDate(first.text)&&!/[：:]$/.test(first.text.trim()))candidates.title={...first,value:first.text.trim()};
  const recipient=meaningful.slice(0,2).find(line=>/[：:]$/.test(line.text.trim())&&line.text.trim().length<=300);
  if(recipient)candidates.recipient={...recipient,value:recipient.text.trim().replace(/[：:]+$/,'')};
  const closings=[];
  for(let dateIndex=0;dateIndex<meaningful.length;dateIndex++){
    const last=meaningful[dateIndex];if(!sourceDate(last.text))continue;
    const closing={date:{...last,value:sourceDate(last.text)}};
    const tail=[];
    for(let i=dateIndex-1;i>=0;i--){
      const line=meaningful[i],text=line.text.trim();
      if(/[：:]/.test(text)||/[。！？；!?;]$/.test(text)||heading.test(text)||[text,...tail.map(row=>row.text.trim())].join('\n').length>120)break;
      tail.unshift(line);
    }
    if(tail.length)closing.signature={...tail[0],indices:tail.map(row=>row.index),text:tail.map(row=>row.text).join('\n'),value:tail.map(row=>row.text.trim()).join('\n')};
    if(meaningful.some(line=>line.index>last.index)){
      const indices=lines.map((_,index)=>index).filter(index=>index>last.index);
      while(indices.length&&!lines[indices[0]].trim())indices.shift();while(indices.length&&!lines[indices.at(-1)].trim())indices.pop();
      const text=indices.map(index=>lines[index]).join('\n');closing.postscript={index:indices[0],indices,text,value:text};
    }
    closings.push(closing);
  }
  return selectMaterialClosing({source,lines,candidates,closings},closings.length===1?0:-1);
}
export function selectMaterialClosing(analysis,index){
  const {date,signature,postscript,...base}=analysis.candidates;
  return {...analysis,candidates:{...base,...analysis.closings[index]},closingIndex:index};
}
function joinWraps(lines){
  return lines.reduce((result,line)=>{
    if(!result)return line;
    // Do not silently join two numeric/Latin tokens into a new value or word.
    const separator=/[A-Za-z0-9]$/.test(result)&&/^[A-Za-z0-9]/.test(line)?' ':'';
    return result+separator+line;
  },'');
}
export function materialProposal(analysis,selected={},mergeWrapped=false,currentTitle=''){
  const fields=blank(),used=new Map(),conflicts=[];
  fields.title=selected.keepTitle?currentTitle:'';
  if(selected.keepTitle&&selected.title)conflicts.push('请选择一个标题来源，不要同时选择两个标题。');
  if(selected.keepTitle&&!selected.title&&analysis.candidates.title?.value===currentTitle.trim())conflicts.push('原文首行与已填标题相同，请选择提取首行，避免在正文中重复标题。');
  if(analysis.candidates.postscript){
    if(selected.signature&&!selected.date||selected.date&&!selected.postscript||selected.postscript&&!selected.date)conflicts.push('这处日期后还有内容。请同时确认日期及其后的附注，或都留在正文，避免改变原始顺序。');
    if(selected.postscript&&analysis.candidates.postscript.value.length>4000)conflicts.push('日期后的内容超过附注的4000字符限制，请取消后在正文中保留，或分份整理。');
  }
  for(const name of ['title','recipient','signature','date','postscript']){
    const candidate=analysis.candidates[name];if(!candidate||!selected[name])continue;
    for(const index of candidate.indices||[candidate.index]){
      if(used.has(index))conflicts.push('同一行不能同时作为两个要素，请取消其中一个选择。');
      used.set(index,name);
    }
    fields[name]=candidate.value;
  }
  const remaining=analysis.lines.filter((line,index)=>!used.has(index));
  while(remaining.length&&!remaining[0].trim())remaining.shift();
  while(remaining.length&&!remaining.at(-1).trim())remaining.pop();
  if(mergeWrapped){
    const groups=[];let group=[];
    const flush=()=>{if(group.length){groups.push(heading.test(group[0].trim())&&group.length>1?group.join('\n'):joinWraps(group));group=[];}};
    for(const line of remaining){if(!line.trim())flush();else group.push(line);}
    flush();fields.body=groups.join('\n');
  }else fields.body=remaining.join('\n');
  fields.sourceMaterial=analysis.source;
  return {fields,conflicts};
}
