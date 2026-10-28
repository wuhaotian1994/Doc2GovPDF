// Content starters only: all typography and pagination use the shared engine.
export const articleTemplates=Object.freeze([
  {id:'blank',name:'空白文章',description:'从空白开始填写',outline:'',body:''},
  {id:'request',name:'请示',description:'向上级请求指示或批准',outline:'基本情况、请示事项',body:'现将有关事项请示如下。\n一、基本情况\n【请填写：基本情况和请示理由】\n二、请示事项\n【请填写：需要批准的具体事项】\n妥否，请批示。'},
  {id:'notice',name:'通知',description:'安排工作、传达有关事项',outline:'通知缘由、通知事项、工作要求',body:'【请填写：通知缘由】\n一、通知事项\n【请填写：具体事项、时间和对象】\n二、工作要求\n【请填写：落实要求和责任分工】\n特此通知。'},
  {id:'report',name:'报告',description:'向上级汇报工作或反映情况',outline:'工作情况、存在问题、下一步安排',body:'现将有关情况报告如下。\n一、工作情况\n【请填写：工作开展情况和实际成效】\n二、存在问题\n【请填写：存在的问题】\n三、下一步安排\n【请填写：下一步工作安排】\n特此报告。'}
]);
export function templateFields(defaults,id,subject){
  const template=articleTemplates.find(item=>item.id===id);
  if(!template)throw Error('请选择一种模板。');
  if(id==='blank')return {...defaults,title:'',body:'',reference:'',date:'',signer:'',issuer:'',issueDate:'',attachments:'',postscript:'',sourceMaterial:'',pendingMaterial:''};
  const topic=String(subject||'').trim();
  if(!topic)throw Error('请填写本次事项。');
  if(/[\r\n]/.test(topic)||topic.length>160)throw Error('事项请填写在一行内，最多160字。');
  return {...defaults,title:`关于${topic}的${template.name}`,body:template.body,reference:'',date:'',signer:'',issuer:'',issueDate:'',attachments:'',postscript:'',sourceMaterial:'',pendingMaterial:''};
}
export function hasTemplatePrompts(text){return /【请填写[：:][^】]*】/.test(text||'');}
export function installTemplatePicker({create,canEdit}){
  const dialog=document.getElementById('template-dialog'),form=document.getElementById('template-form'),choices=document.getElementById('template-choices'),subject=document.getElementById('template-subject'),message=document.getElementById('template-message');
  let selected=articleTemplates[0].id,busy=false;
  for(const item of articleTemplates){
    const button=document.createElement('button');button.type='button';button.className='template-choice';button.dataset.template=item.id;
    const title=document.createElement('strong'),description=document.createElement('span');title.textContent=item.name;description.textContent=item.description;button.append(title,description);
    button.onclick=()=>{selected=item.id;message.textContent='';render();};choices.append(button);
  }
  function render(){for(const button of choices.children){button.setAttribute('aria-pressed',String(button.dataset.template===selected));button.disabled=busy;}document.getElementById('template-outline').textContent=articleTemplates.find(item=>item.id===selected).outline;form.querySelector('[type=submit]').disabled=busy;subject.disabled=busy;subject.closest('.field').hidden=selected==='blank';}
  function open(){if(!canEdit()||busy)return;selected='blank';subject.value='';message.textContent='';render();dialog.showModal();}
  document.getElementById('template-cancel').onclick=()=>{if(!busy)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!canEdit())return;message.textContent='';
    try{templateFields({},selected,subject.value);}catch(error){message.textContent=error.message;subject.focus();return;}
    busy=true;render();
    try{await create(selected,subject.value);dialog.close();subject.value='';document.getElementById('title').focus();}
    catch(error){message.textContent=error.message;}
    finally{busy=false;render();}
  };
  render();return {open};
}
