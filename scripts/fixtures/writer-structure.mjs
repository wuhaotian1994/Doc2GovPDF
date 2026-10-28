export const samples={
  short:'一、工作安排',
  article:'第一条 为规范资料归档管理，明确工作分工，保留原始记录，现就材料接收、登记、核对和移交作出安排。各部门应按现有职责做好材料收集，核对来源、日期与附件名称，不得凭印象补写缺失数据。遇到内容不清楚或者记录相互矛盾时，应联系材料提供方核实，并保留核实过程。所有工作记录应与对应材料一并保存，便于后续查询。此条为连续的条款正文，不是独立的小标题。',
  leading:'   二、核对要求',
  ambiguous:'三、这段带编号的内容是一段正文说明，作者希望保留编号，并按普通正文排版。'
};
const filler='请按实际工作情况整理资料，核对材料名称和来源。原始记录与有关说明一并保留，便于查询和复核。';
export const structureFields={title:'关于资料归档管理的安排',body:[samples.short,samples.article,samples.leading,...Array.from({length:9},()=>filler),samples.ambiguous,...Array.from({length:9},()=>filler)].join('\n'),signature:'综合办公室',date:'2026-10-21'};
