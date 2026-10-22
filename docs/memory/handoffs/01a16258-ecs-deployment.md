# ECS 部署交接

记录日期：2026-10-22（Asia/Shanghai）。会话：01a16258。状态：服务器部署与公网 IP 验收完成；域名等待用户 ICP 备案。

## 当前版本与服务

- 本次用户已明确授权指定 ECS 部署，并明确允许 TCP 80/443 对全网持续开放。旧文档中“未获部署授权”的说法不再适用于本次目标。
- 已将初始 `ade54c2` 版本替换为 PR #5 的统一交付 `4ceef4cd02fbf54680df6457d915c706c5ecb704`。31 个源文件与提交匹配，关键资产与已提交证据匹配；复用已验 Wasm `41cdb7e3650b0ced56ac415bd13aacd8d7a311c7faa185acfc4bfe69b0c9bd2c`，未重新编译引擎，也没有包含共享工作区其他会话的未提交代码。
- 最终实际部署为基于上述版本的冷启动修复提交 `0f6edcbc0ff0eda79e9f42e4c9b73a5d8553c289`，静态缓存版本 `gongwen-web-v2-F53289297E3B3B69`；Wasm/字体保持不变。发布目录与清单必须按此提交核对。原两个版本保留可回退。
- Linux/amd64 静态 Go 服务 + Caddy v2.11.7。当前发布目录 `/opt/doc2govpdf/releases/<源码完整提交号>/`，软链接 `/opt/doc2govpdf/current`。
- systemd 服务：`doc2govpdf.service`、`doc2govpdf-caddy.service`，均已启用开机启动、以 DynamicUser 运行。后端绑定 `127.0.0.1:37842`；外网仅新增 TCP 80/443。
- HTTPS 使用 Let's Encrypt 短期 IP 证书，自动续期由 Caddy 管理；证书与 ACME 账号状态位于 `/var/lib/doc2govpdf-caddy/`，不要删除或加入 Git。
- 用户追加域名 `msmdm.cn` 后，已配置域名站点与受信任证书，证书至 2027-01-20；专用 Caddyfile 位于 `/etc/doc2govpdf/Caddyfile`，systemd drop-in 已指向它，域名配置不依赖某个应用发布目录。
- 服务器内部域名访问正常，但公网返回阿里云 Beaver 403，正文明确 `Non-compliance ICP Filing`，HTTPS 被重置。域名尚不能交付为可正常访问；已询问用户备案状态，等待其完成备案或接入备案后复核。
- 用户已回复“尚未办理 ICP 备案”。不能将短暂 200 或已签发证书当成域名已可用；下一步需用户本人完成阿里云备案实名信息与核验，再复核公网域名。
- 本机 Workbench 与 OAuth 连接方式见[连接交接](01a16258-workbench-connection.md)。

## 已验证与待办

- 隔离构建、静态服务器测试、10 项模型/文档库测试、上传包逐文件 SHA256 检查通过。
- 实际公网正常验证 TLS、首页 200、HTTP 308 跳转、JS/Wasm MIME、Wasm gzip、POST 405 通过。
- 旧 `ade54c2` 的 Chrome、Edge、WebKit 实际公网首次流程各 16 项通过；Firefox 缓存断言失败尚未确认根因，补等待后仍不能通过。这些结果不用于签收后续统一版本。
- 统一版本 41 项 Node 测试通过。公网发现新的真实故障：压缩引擎完整下载约 44.55 秒，而外层预览 30 秒期限提前终止 Worker。已在本会话独立工作树修复为引擎就绪后才计排版期限；保留引擎自身 120 秒启动期限。
- 新冷启动浏览器回归 6 项、Worker 恢复单测 2 项通过，已实证旧版会误终止下载、修复后可生成真实 PDF，暖机处理仍超时保护且重试后可实际下载。
- 原有三浏览器预览收敛 30 项通过；最终真实公网 Chrome 155 全流程 11 项通过，覆盖新稿与原生 Word 的真实预览/保存/下载。其他浏览器是本机实际 Go 服务回归，不冒充当前公网矩阵。
- 最终新稿 Word XML、单页 PDF、TXT 与输入匹配；原件 Word 精确字节相同；原 Word 五页 PDF 的内容流/文字/纸幅与已验代表一致。新稿实际页面已渲染并查看，无裁切、重叠和异常分页。
- 浏览器调试缓存会淘汰大型响应体，不能把被动 response.body 无法读取当成应用网络失败；独立公网完整下载解压已验证 Wasm SHA256。
- 已移除临时 `GODEBUG=tlsmlkem=0`，保留 Caddy 默认 TLS 安全参数；systemd drop-in 仅补 HOME。服务重启及正常 TLS 校验访问通过。证书续期由 Caddy 管理，未来跨日续期尚未实测。

## 修改归属与下一步

- 本轮代码修复与新测试在托管工作树 `C:/Users/wuhao/.codex/worktrees/ecs-deployment-records/Doc2GovPDF`，基于 PR5 的 `4ceef4c`；仅改变 `web/write.js` 的期限起点并新增 `scripts/test-writer-cold-start.mjs`。共享 D 盘已有的 AGENTS.md、引擎、高级页面及其他会话记录不属于本轮，未暂存或提交。
- 发布包、生成的配置和 QA 文件在忽略目录 `tmp/deploy-01a16258/`；关键结果须同步到本记录，不依赖其他机器拥有该目录。
- 本轮远端整合了其他会话后续 `a93902b` 连续书写提交，保留双方历史并让新增回归兼容新界面；实际生产仍固定为已验 `0f6edcb`，后续界面没有自动发布。更新时先确认目标提交并验收，不能只据 PR 当前 head 宣称生产已更新。
- 下一步：用户完成 ICP 备案后核验 msmdm.cn 的公网 HTTP/HTTPS 和完整文稿流程。代码修复、部署证据与同一 PR5 的交付记录按本轮提交核对；不擅自提交实名材料，不合并 PR。
- 后续更新保留版本目录，以切换软链接和重启服务实现更新/回退，不覆盖用户文稿；文稿仍在浏览器本地处理。

相关日志：[ECS 网页部署记录](../logs/2026-10-22-01a16258-ecs-deployment.md)。
