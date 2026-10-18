const $=id=>document.getElementById(id);
const lines=id=>$(id).value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const textFields={'copy-number':'copyNumber',classification:'classification','secrecy-period':'secrecyPeriod',urgency:'urgency','issue-number':'issueNumber',issuer:'issuer',note:'note'};
const checks={preprinted:'preprinted','without-file':'markWithoutFile',unsealed:'unsealed',detached:'detachedAttachments','auto-number':'autoNumbering'};
export function readExtraFields(kind){
 const head=$('field-letterhead').checked,up=['request','report'].includes(kind);
 const issue=$('field-issue-date').value.split('-').map(Number);
 return {agencies:[$('field-agency').value.trim(),...lines('field-agencies')].filter(Boolean),signers:up?[$('field-signer').value.trim(),...lines('field-signers')].filter(Boolean):[],signingAgencies:lines('field-signing-agencies'),copyNumber:head?$('field-copy-number').value:'',classification:head?$('field-classification').value:'',secrecyPeriod:head&&$('field-classification').value?$('field-secrecy-period').value:'',urgency:head?$('field-urgency').value:'',preprinted:head&&$('field-preprinted').checked,markWithoutFile:head&&!['letter','minutes'].includes(kind)&&$('field-without-file').checked,issueNumber:kind==='minutes'?$('field-issue-number').value:'',issuer:kind!=='letter'?$('field-issuer').value:'',issueDate:kind!=='letter'&&issue.length===3?`${issue[0]}年${issue[1]}月${issue[2]}日`:'',unsealed:$('field-unsealed').checked,note:$('field-note').value,detachedAttachments:$('field-annex-pages').checked&&$('field-detached').checked,autoNumbering:$('field-auto-number').checked};
}
export function fillExtraFields(fields){
 for(const [id,key] of Object.entries(textFields))$('field-'+id).value=fields[key]||'';
 for(const [id,key] of Object.entries(checks))$('field-'+id).checked=key==='autoNumbering'?(fields[key]??true):Boolean(fields[key]);
 $('field-agencies').value=(fields.agencies||[]).slice(1).join('\n');$('field-signers').value=(fields.signers||[]).slice(1).join('\n');$('field-signing-agencies').value=(fields.signingAgencies||[]).join('\n');
 const date=fields.issueDate?.replace(/\s+/g,'').match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);$('field-issue-date').value=date?`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`:'';
}
export function syncExtraFields(kind){
 $('extra-head-elements').hidden=!$('field-letterhead').checked;
 $('signers-label').hidden=!['request','report'].includes(kind);
 $('without-file-label').hidden=['letter','minutes'].includes(kind);
 $('issue-number-label').hidden=kind!=='minutes';$('extra-imprint').hidden=kind==='letter';
 $('field-secrecy-period').disabled=!$('field-classification').value;
 $('field-detached').disabled=!$('field-annex-pages').checked;
}
