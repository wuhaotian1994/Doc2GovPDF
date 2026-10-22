// Relative content needs, not a font substitution or a change to authored text.
// This applies only to tables created in the normal writer; imported Word keeps
// its existing engine model and widths.
const units=text=>Array.from(text).reduce((sum,c)=>sum+(/\p{Mark}/u.test(c)?0:c.codePointAt(0)>127?1:/[A-ZMW]/.test(c)?.7:.55),0);
export function tableColumnWidths(block,available,fontSize=14){
 const columns=block.rows[0].cells.length;
 if(block.rows.slice(1).every(row=>row.cells.every(cell=>!cell.text.trim())))return Array(columns).fill(available/columns);
 const minimum=Math.min(14,available/columns),fontMM=fontSize*25.4/72;
 if(fontSize!==14){
  const measure=(rows,i)=>4.5+rows.reduce((maximum,row)=>row.cells[i].text.split('\n').reduce((v,line)=>Math.max(v,units(line)),maximum),0)*fontMM;
  const data=block.header?block.rows.slice(1):block.rows,needs=Array.from({length:columns},(_,i)=>Math.max(minimum,Math.min(available*.7,measure(data,i)))),sum=needs.reduce((a,b)=>a+b,0);
  if(sum<=available){const extra=available-sum,wants=needs.map((n,i)=>Math.max(0,measure(block.rows,i)-n)),total=wants.reduce((a,b)=>a+b,0);return needs.map((n,i)=>n+(total?extra*wants[i]/total:extra*n/sum));}
 }

 const needs=Array.from({length:columns},(_,i)=>Math.max(minimum,Math.min(available*.7,4+block.rows.reduce((maximum,row)=>row.cells[i].text.split('\n').reduce((value,line)=>Math.max(value,units(line)),maximum),0)*fontMM)));
 const weights=needs.map(value=>Math.max(0,value-minimum)),sum=weights.reduce((a,b)=>a+b,0),spare=available-minimum*columns;
 return weights.map(weight=>minimum+(sum?spare*weight/sum:spare/columns));
}
export function isSummaryRow(row){return /^(?:合计|总计|小计)$/.test(row.cells.slice(0,2).map(cell=>cell.text.replace(/\s/g,'')).join(''));}
