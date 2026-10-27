# n8n 邮件转微信公众号草稿

独立部署工具，不修改 Doc2GovPDF 产品。n8n IMAP 触发器接收新邮件，Code 节点过滤指定发件人及 `[WX-DRAFT]` 主题，私有 HTTP 适配器校验 Markdown 和附件、上传封面及正文图片、创建公众号草稿。没有发布公众号文章的接口或节点。

用户文档见 `Agent邮件规范.md`，文章模板见 `article.md`。通用文档不保存实际邮箱、公众号标识或密钥。

## 部署

Ubuntu 24.04 上安装 `python3-markdown python3-bleach python3-bs4 python3-pil python3-yaml`。运行 `python3 -m unittest -v test_bridge`。代码经实际 n8n 2.44.7、PostgreSQL 16.15 验证。

将 bridge.py 安装到 `/opt/n8n-wechat-mail/`。配置由 `WECHAT_MAIL_CONFIG` 指向（默认 `/etc/n8n-wechat-mail/config.json`），包含 appid、secret、allowed_sender、bridge_token、listen。配置应仅 root 和专用服务账号可读；bridge_token 使用至少32字节随机值。listen 必须限定服务器回环或 Docker 私有桥接地址，不开放公网。服务状态目录由 `STATE_DIRECTORY` 指定，包含文章去重和图片缓存 SQLite，须持久化并限制权限。

运行 `python3 bridge.py`，提供 `GET /healthz` 和需 Bearer 认证的 `POST /draft`。请求包括 sender、subject 和附件列表（name/base64）。建议用 systemd 管理，非 root 账号、ProtectSystem=strict、PrivateTmp、NoNewPrivileges、StateDirectory、Restart=always，并配置 Docker 启动依赖。当前监听端口 8789。

使用 `make_workflow.py` 的五个参数生成工作流 JSON：允许的发件地址、n8n IMAP凭据ID、IMAP凭据名称、私有服务URL、Header Auth凭据ID。Header Auth 应设置 Authorization 为 Bearer 加 bridge_token；必须通过 n8n 加密凭据管理，不写入工作流 JSON。通过官方 import:workflow 导入个人项目，publish:workflow 发布后重启 n8n 生效。

阿里邮箱实测不接受 FROM/SUBJECT 搜索，基础 UNSEEN/SINCE/UID 可以使用。当前方案依用户明确授权下载未读邮件，之后过滤；其他邮件不送微信。邮件保持未读，以 n8n 节点 UID 进度追踪。首次启动只覆盖当日匹配邮件，此后处理新 UID，不是历史邮箱回填工具。From 白名单是业务过滤，不构成密码学身份验证。

## 保留及错误语义

- 新增草稿调用前将文章状态写为 unknown。连接中断或微信结果不明确时不自动再次新增，须先在公众号核实结果。
- 相同 article_id 与指纹返回 already_created；内容修订须新编号。图片缓存按内容摘要复用。
- 原文、图片不写入适配器日志。n8n 执行记录可能含邮件及附件，按 n8n 既有保留策略清理。
- API 拒绝或附件不合规则在 n8n 执行中报错。无主动邮件回执，不修改已存在的真实文章。
- 微信密钥、n8n Header Auth 凭据和 ledger.sqlite 需随服务器备份；恢复旧 ledger 可能丢失新增草稿的去重状态，应先核对公众号草稿箱。
- 大图会变换为JPEG，最长边1600像素且不超过1MB。透明背景变白；不支持GIF、远程图片或ZIP。公众号可能调整最终样式。

## 已验证

7个独立测试覆盖图片/附件错误、错误发件人、HTML清洗、图片替换和排版、去重、相同编号不同内容、草稿创建结果不确定时不重复写入。合成邮件通过真实 IMAP 入箱，n8n 成功处理两份相同文章并仅创建一份微信草稿；draft/get 验证封面、配图和表格/粗体，服务重启后去重仍有效。测试草稿与永久测试封面已按实际ID清理。该测试不是从 Gmail 实际发送。
