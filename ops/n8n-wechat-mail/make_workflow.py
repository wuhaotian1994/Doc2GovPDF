"""Generate a credential-free workflow definition. Arguments are non-secret."""
import json
import sys


def workflow(sender, imap_id, imap_name, endpoint, bridge_credential_id):
    code = r'''
const result = [];
for (let i = 0; i < $input.all().length; i++) {
  const item = $input.all()[i];
  const addresses = item.json.from?.value || [];
  if (addresses.length !== 1 || addresses[0].address.toLowerCase() !== ALLOWED_SENDER || !(item.json.subject || '').startsWith('[WX-DRAFT]')) continue;
  const keys = Object.keys(item.binary || {});
  if (keys.length < 2 || keys.length > 22) throw new Error('需要 article.md 和封面附件，最多22个附件');
  const attachments = [];
  let size = 0;
  for (const key of keys) {
    const buffer = await this.helpers.getBinaryDataBuffer(i, key);
    size += buffer.length;
    if (size > 20 * 1024 * 1024) throw new Error('附件总大小超过20MB');
    attachments.push({name:item.binary[key].fileName,base64:buffer.toString('base64')});
  }
  result.push({json:{sender:addresses[0].address,subject:item.json.subject || '',message_id:item.json.messageId || '',attachments},pairedItem:{item:i}});
}
return result;
'''
    code = 'const ALLOWED_SENDER = ' + json.dumps(sender.lower()) + ';\n' + code
    return {
        'id': 'mailToWechatDrafts01',
        'name': '邮件 Markdown → 微信公众号草稿', 'active': False,
        'nodes': [
            {'id': 'receive-mail', 'name': '接收指定发件人的草稿邮件', 'type': 'n8n-nodes-base.emailReadImap', 'typeVersion': 2.2, 'position': [0, 0],
             'parameters': {'mailbox': 'INBOX', 'postProcessAction': 'nothing', 'format': 'resolved', 'dataPropertyAttachmentsPrefixName': 'attachment_', 'options': {'customEmailConfig': '["UNSEEN"]', 'trackLastMessageId': True}},
             'credentials': {'imap': {'id': imap_id, 'name': imap_name}}},
            {'id': 'prepare-mail', 'name': '提取 Markdown 和图片附件', 'type': 'n8n-nodes-base.code', 'typeVersion': 2, 'position': [320, 0], 'parameters': {'jsCode': code}},
            {'id': 'create-draft', 'name': '校验排版上传图片并创建草稿', 'type': 'n8n-nodes-base.httpRequest', 'typeVersion': 4.2, 'position': [640, 0],
             'parameters': {'method': 'POST', 'url': endpoint + '/draft', 'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth', 'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ $json }}', 'options': {'timeout': 180000}},
             'credentials': {'httpHeaderAuth': {'id': bridge_credential_id, 'name': 'Private WeChat draft adapter'}}},
            {'id': 'notes', 'name': '模板与使用说明', 'type': 'n8n-nodes-base.stickyNote', 'typeVersion': 1, 'position': [0, -340],
             'parameters': {'width': 900, 'height': 270, 'content': '## 邮件 → 公众号草稿（不自动发布）\n主题以 `[WX-DRAFT]` 开头；附件必须有 `article.md` 和 YAML 的 `cover` 指定图片。正文配图 `![说明](images/figure.jpg)` 对应附件 `figure.jpg`。仅指定发件人的匹配邮件送往微信。\n\n同一 `article_id` 和内容重复发送不会重复建草稿；修订请改 `-v2`。验证错误见 Executions，邮件保留未读状态，修正后请重发或重试执行。\n\n用户已授权下载未读邮件，工作流在下载后过滤。图片/Markdown由本机私有服务处理，密钥不在工作流中。微信新增结果不确定时暂停重试，请先核对草稿箱。'}}
        ],
        'connections': {
            '接收指定发件人的草稿邮件': {'main': [[{'node': '提取 Markdown 和图片附件', 'type': 'main', 'index': 0}]]},
            '提取 Markdown 和图片附件': {'main': [[{'node': '校验排版上传图片并创建草稿', 'type': 'main', 'index': 0}]]}
        },
        'settings': {'executionOrder': 'v1', 'executionTimeout': 300, 'saveDataErrorExecution': 'all', 'saveDataSuccessExecution': 'all', 'saveManualExecutions': True},
        'pinData': {}, 'tags': []
    }


if __name__ == '__main__':
    json.dump(workflow(*sys.argv[1:]), sys.stdout, ensure_ascii=False)
