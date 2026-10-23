// Conservative field-time advice for the existing reference.format finding.
// This checks a complete spelling pattern, never office/year/sequence facts.
export function referenceAdvice(value){
  const text=value.trim();if(!text)return null;
  const m=text.match(/^([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z\s]{0,40}?)\s*([\[【〔])([0-9]{4})([\]】〕])\s*(第\s*)?([0-9]{1,6})\s*号$/u);
  if(!m)return null;
  const sequence=m[6].replace(/^0+(?=[0-9])/,'');
  const reasons=[];
  if(m[2]!=='〔'||m[4]!=='〕')reasons.push({id:'brackets',text:'年份两侧使用六角括号〔 〕，请替换当前括号。'});
  if(sequence!==m[6])reasons.push({id:'leading-zero',text:'顺序号“'+m[6]+'”有前导零，可整理为“'+sequence+'”。'});
  if(m[5])reasons.push({id:'ordinal',text:'发文顺序号前不加“第”。'});
  if(!reasons.length)return null;
  const proposal=m[1].trim()+'〔'+m[3]+'〕'+sequence+'号';
  const engineReplacement=text.replace(/[\[【〔]([0-9]{4})[\]】〕]\s*(?:第\s*)?0*([0-9]+)\s*号/u,(_,year,number)=>'〔'+year+'〕'+number.replace(/^0+(?=[0-9])/,'')+'号');
  return {value,proposal,engineReplacement,reasons,year:m[3],compactSpacing:proposal!==engineReplacement};
}
export function sameReferenceFinding(entry,value,advice){
  return entry.source?.field==='reference'&&entry.issue.rule==='reference.format'&&entry.issue.severity==='review'&&entry.issue.original===value.trim()&&entry.issue.replacement===advice.engineReplacement;
}
