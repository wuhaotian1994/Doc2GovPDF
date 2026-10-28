# 小绿书邮件模板与 n8n 配置

日期：2026-10-28（Asia/Shanghai）；会话：01a181ff；状态：已部署启用，真实微信联调通过。

- 用户要求新增邮件模板，将微信小绿书写入草稿并配置n8n。复用已部署的指定发件人、收件箱、微信账号和私有适配器，只创建草稿。
- 读取原部署交接与原聊天最终交付；服务器实测适配服务active、n8n readiness=ok。主共享目录存在大量其他会话修改，未触碰。
- 官方新增草稿文档经服务器HTTPS读取并解gzip核实：article_type=newspic、image_info.image_list[].image_media_id使用永久素材、最多20图、首图封面、content为纯文本、title最多32字。来源：https://developers.weixin.qq.com/doc/subscription/api/draftbox/draftmanage/api_draft_add.html 。网页搜索工具直读失败，未把搜索摘要当作最终证据。
- 新模板主题[WX-NEWSPIC]，附件article.md的images明确顺序，保留[WX-DRAFT]旧协议。新增路径复用原去重库，按编号避免重复新增。标题32字符、配文1000字符且2048字节以内为本流程验证边界。
- 应用管理工作树创建长时间停在creating，attach无法确认归属；改用项目tmp/wechat-newspic-work隔离工作树，基于原PR分支。计划将增量正常推送到原PR #6，不强推、不合并。用户本会话提供的公开仓库授权替代旧工作树AGENTS禁止公开条款。

## 实现与部署

- ops/n8n-wechat-mail/bridge.py 新增图片消息分支：images有序列表、1—20张本地图片、禁止遗漏/额外/重复附件、先验证所有图片再上传永久素材，纯文本配文和首图封面。原长文章指纹算法与状态库不变，新类型指纹加newspic域标识，改顺序也会检测为内容修订。
- make_workflow.py 接受两种主题；保持原工作流 mailToWechatDrafts01，名称改为“邮件 Markdown / 小绿书 → 微信公众号草稿”。Code/说明节点及HTTP超时900秒、总超时1200秒更新；原IMAP节点名称、凭据及UID进度保留。
- 原适配器SHA256 f70cdb33b191c5b71740ef1034cc87487a66c791bccf78633b29d7a75e298681 在替换前断言一致。代码、配置、工作流和SQLite在线备份保存于服务器 /opt/n8n/backups/20261028-newspic，目录700、文件600。没有输出配置秘密。
- 官方CLI import:workflow 与 publish:workflow 后重启n8n；数据库核验active=true，当前和已发布版本都包含NEWSPIC代码。最后IMAP游标从5前进到7。
- 实际部署bridge.py按LF计算SHA256：a6a3efe2298364fe9545ba4c7577a1c6e8438d1c27c92b2d07af7b29008c295a。服务仍在私有Docker地址，不新增公网端口。

## 验证与边界

- Ubuntu服务器暂存目录运行 python3 -m unittest -v test_bridge test_newspic：11项通过，含旧协议7项回归、小绿书1/20/21图边界、纯文本与顺序、错误输入零API调用、持久去重与未知结果停止重试。
- 第一次合成测试因Docker cp不能从容器/dev/shm取文件而中止，未插入邮件；finally已清理临时凭据。改为容器临时内存文件通过子进程直接读入服务器进程内存，读取后删除，不输出明文、不落本机。
- 通过IMAP APPEND在已授权收件箱插入两封相同合成测试邮件，故意倒序排列附件。n8n执行4三个节点均输出2项；服务记录created和already_created各一次。
- 真实draft/get验证article_type=newspic，标题相同、图片3张且media_id顺序严格匹配images列表、纯文本及空行/话题文字完全一致。
- 重启适配器后再次提交同一测试内容，返回already_created且media_id一致。随后只删除本轮测试草稿和3张新永久素材，并清除这3个素材缓存键；测试去重行保留，合成邮件保留。
- 这是合成入箱到微信的真实端到端验证，不是从Gmail重新发送的投递测试。微信客户端最终裁剪/视觉预览未人工检查；模板说明用户在发布前预览。
- 本轮未发布任何公众号内容、未向外部发送邮件。模板包不含成品图片，要求定时Agent先制作图片再发送；不由n8n生成图片。无主动邮件回执。

## 交付

- 新模板和Agent规范：ops/n8n-wechat-mail/newspic/；本机私有模板包：D:/Project/Doc2GovPDF/tmp/wechat-newspic-template.zip，包含本次确认的收发地址和工作流链接，不进入公开仓库。
- 应用管理工作树随后创建完成，但归档被工具拒绝，因为它成为本聊天primary checkout；保留其干净原始状态。本轮修改全部在上述项目tmp隔离工作树，无共享主目录改动。
- 后续维护以本轮交接为准；原部署日志及旧文章模板继续保留。
- 源码与模板提交27c8cb3已正常推送到原codex/n8n-mail-wechat分支，PR #6标题与描述已更新，未合并。最终复核执行4=success、工作流active=true、UID=7，适配器/PostgreSQL/原网站/Caddy均active，n8n readiness=ok，容器与主机的临时凭据文件均不存在。模板ZIP使用UTF-8文件名重打包并验证无损。
