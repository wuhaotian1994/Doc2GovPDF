import {contentFromText,table,validateContent} from './write-content.js';

// Only explicit, rectangular tab-separated rows are candidates. A caption,
// following prose, blank source cells and numbers keep their original places.
export function materialTables(fields){
 const result=[],occurrences=new Map();
 for(const region of ['body','postscript']){
  const content={blocks:(fields[region]||'').replace(/\r\n?/g,'\n').split('\n').map(text=>({type:'paragraph',text}))};
  for(let i=0;i<content.blocks.length;i++){
   const first=content.blocks[i].text;if(!first.includes('\t'))continue;const columns=first.split('\t').length;if(columns<2||columns>10)continue;
   let end=i+1;while(end<content.blocks.length&&content.blocks[end].text.includes('\t')&&content.blocks[end].text.split('\t').length===columns)end++;
   const start=i,count=end-i;i=end-1;if(count<2||count>100)continue;
   const rows=content.blocks.slice(start,end).map(block=>block.text.split('\t'));
   const identity=region+'\0'+JSON.stringify(rows),occurrence=(occurrences.get(identity)||0)+1;occurrences.set(identity,occurrence);
   result.push({start,count,rows,region,key:identity+'\0'+occurrence});
  }
 }
 return result;
}
export function confirmedMaterialContent(fields,keys){
 const selected=materialTables(fields).filter(item=>keys.has(item.key));if(!selected.length)return null;
 const content=contentFromText(fields.body);
 for(const region of ['body','postscript']){
  const matches=selected.filter(item=>item.region===region);if(!matches.length)continue;
  const section=region==='body'?content:contentFromText(fields.postscript);
  for(const item of matches.reverse()){
   const grid=table(item.rows.length,item.rows[0].length);item.rows.forEach((row,i)=>row.forEach((text,j)=>{grid.rows[i].cells[j].text=text;}));section.blocks.splice(item.start,item.count,grid);
  }
  if(region==='postscript')content.postscript=section;
 }
 return validateContent(content);
}
