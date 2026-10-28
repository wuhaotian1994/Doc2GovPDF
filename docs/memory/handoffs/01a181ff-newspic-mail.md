# 小绿书邮件到草稿交接

日期：2026-10-28（Asia/Shanghai）；会话：01a181ff；状态：已部署启用、真实联调通过。

- 在原工作流mailToWechatDrafts01中增加[WX-NEWSPIC]，原[WX-DRAFT]继续可用；不新增第二个IMAP监听、不变更指定发件人及收件人。真实账号沿用服务器配置，不写入Git。
- 小绿书使用newspic/article.md模板（发邮件时附件仍叫article.md），YAML仅article_id/title/images；1—20张JPG/PNG、首图封面、有序列表决定顺序、正文纯文本。模板与规则见ops/n8n-wechat-mail/newspic。
- n8n已发布启用，当前和active版本均验证包含新增代码；原UID进度保留。HTTP900秒、总执行1200秒。服务与去重库路径不变。
- 11项单测通过；两封合成IMAP邮件被实际n8n处理，微信draft/get证实newspic/3图/顺序/配文一致且只建一次。重启后去重通过。测试草稿及3张永久图已删除。没有Gmail重新发信测试或微信客户端视觉验收。
- 备份在服务器/opt/n8n/backups/20261028-newspic。若回退只恢复旧代码与工作流并重启；不能用旧ledger覆盖当前库，否则会丢失新增草稿去重记录。
- 本轮工作树D:/Project/Doc2GovPDF/tmp/wechat-newspic-work，临时本地分支codex/wechat-newspic-mail；增量通过正常快进推送到codex/n8n-mail-wechat，更新原PR #6，不合并。
- 本机模板包D:/Project/Doc2GovPDF/tmp/wechat-newspic-template.zip已含发收地址和邮件示例。包不含图片，也不直接作为发送附件；Agent应附article.md及真正的图片文件。
- 无剩余配置阻碍；新模板可开始使用。成功/失败仍看n8n Executions，无自动回执。其他会话未提交修改完全未触碰。
- 已交付源码提交27c8cb3，已推送原PR #6并更新描述；未合并。最终健康、已启用状态及临时凭据清理通过。

证据与实现边界：[本轮日志](../logs/2026-10-28-01a181ff-newspic-mail.md)。交付PR：https://github.com/wuhaotian1994/Doc2GovPDF/pull/6 。
