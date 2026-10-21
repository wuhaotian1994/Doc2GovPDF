# 填写式重写交接

记录日期：2026-10-21，Asia/Shanghai。会话：01a158b0。

状态：10月21日实际服务故障已修复并完成最终本机交付。旧“本地交付可用”结论已被用户反馈推翻，本轮改为真实 Go 服务和实际地址验收。未公开上线。

最新优先范围：先桌面浏览器，手机尺寸暂停。用户要求完成后提交、push 并创建/更新 PR，以触发其流程；不是直接合并或公开部署。新增真实 Go 服务 MIME、规范根首页缓存、同秒更新、启动前持久保存与不可变恢复版本修复，见 [真实服务验收](../../FIRST-USE-DELIVERY-QA.md)。旧 Node 测试服务器掩盖实际故障，已替换。

最终应用提交 `cb70d4a`，已与远端仅新增产品议题的 main 合并（`6db2494`）。从 `git archive cb70d4a` 隔离构建到 `dist/writer-desktop-20261021/`，不包含其他会话未提交代码。37842 服务已改为 `build/qa/writer-desktop-webserve.exe`；原地址不变，未操作用户标签。实际地址四桌面首次流程 64/64、经常使用 97/97、三引擎启动异常 33/33、多标签恢复与旧缓存升级通过，文件逐项核对通过。后续只改验证脚本/记录，不再修改该应用代码。

已推送分支 `codex/fix-writer-startup-preview`，创建 [PR #1](https://github.com/wuhaotian1994/Doc2GovPDF/pull/1)，验证记录提交 `d612476`。后续修订继续推送该分支、更新此 PR；未合并、未公开部署。

最新：2026-10-21 用户报告“下一步清空”，旧的正常流程验证存在启动盲区。已增加内联启动防护、独立填写导航、预览懒加载、应急快照恢复；33项故障用例及七配置176项正常流程最终通过。具体见 [启动保护](../../STARTUP-PROTECTION.md) 与 [10月21日日志](../logs/2026-10-21-01a158b0-startup-loss.md)。未确认找回实际已清空内容；用户拒绝历史读取后没有绕路访问。

2026-10-20 后续追加“经常使用与跨浏览器”已完成本地实现和模拟验证：常用信息、最近文档、复制与独立文件导入、手机预览操作。最新验收见 [经常使用与跨浏览器](../../RETURNING-USERS-QA.md)，过程见日志 E05–E07；下文初轮验证保留其历史范围。

## 目标与完成结果

用户明确推翻旧首页，第一原则为使用方便简单、像注册一样填写。后续纠正“不选文种，面向中国大陆”；格式由实施者判断。

主流程：基本信息 → 正文内容 → 预览导出。必填标题与正文，其余按需。提供实际 PDF 预览、Word/PDF/TXT 下载与可恢复的 JSON 草稿。无账号、国家或文种选择。

参考 GOV.UK Question pages/Check answers、Tally 多步骤表单；设计合同和来源见 [产品方案](../../GUIDED-WRITING.md)。本轮授权替代旧“保持已认可设计”要求，原因已写入 AGENTS、PRODUCT、DESIGN 与议题索引。

## 代码与构建

- `web/write.html`、`write.css`、`write.js`：新填写界面。
- `web/write-model.js`：字段/草稿约束、TXT、独立落款与红头、新流程模型适配。避免把落款日期推断为印发日期，红头首段 before=0 对齐 Word/PDF。
- `web/write-engine.js`：独立 Worker 队列、超时与重启，未依赖其他会话未提交的 engine-client.js。
- 后续 `web/write-library.js`：常用信息/文档库校验与归档，不静默淘汰旧稿。
- 10月21日 `web/write-boot.js`：构建内联到首页，任何模块之前保护输入与提交；`scripts/test-writer-startup.mjs`、`test-writer-update.mjs` 覆盖启动故障和旧缓存更新。
- `scripts/build-web.ps1`：write.html 构建为 index.html，旧 web/index.html 构建为 advanced.html。
- `scripts/test-guided-model.mjs`、`test-guided-web.mjs`、`verify-guided-word.ps1`：本轮测试。
- 后续 `scripts/test-writer-library.mjs`、`test-writer-browsers.mjs`、`verify-writer-outputs.py`：复用与七配置验证；`scripts/browser-tests/` 固定 Playwright 1.64.1，node_modules 忽略。
- `.impeccable/design.json`：设计 sidecar，本轮明确随 Git 保存；其父目录其他本地会话数据仍忽略。

当前交付产物：`dist/writer-desktop-20261021/`（取代旧 `dist/guided-web/`）。本机静态服务 `http://127.0.0.1:37842/`，仅监听回环地址。进程记录 `build/qa/guided/server.pid`，不可跨会话盲信 PID；先检查监听与进程路径。旧 37841 入口未替换。

可重新启动：

```powershell
./scripts/build-web.ps1 -Output dist/writer-desktop-20261021
go run ./cmd/webserve -listen 127.0.0.1:37842 -dir dist/writer-desktop-20261021
```

## 已验证

后续最新：10 项模型/库单测、28 项原 Edge 回归、7 配置 176 项跨浏览器检查通过；匹配 Playwright 1.64.1。Chrome/Edge 使用本机浏览器，Firefox/WebKit 使用测试构建；Android/iPhone/iPad 为触控模拟。七配置的实际 PDF 文字、Word 正文 XML、TXT 一致；Word 16.0 隐藏渲染与页面核查通过。证据 `build/qa/returning/verified-summary.json` 含最新源码 SHA256，最终源码与该构建一致。

- 5 项模型单测通过。
- 28 项真实无头 Edge 浏览器检查通过，含真实导出、草稿恢复/替换、非法日期、字体事务、多页翻页、存储失败与离线加载。
- `go test ./...`、`go vet ./...` 正常权限下全量通过；沙箱桌面临时目录 rename 失败已记录环境原因。
- 两轮桌面与手机宽度 UI 视觉检查；独立 finish reviewer 六项修复最终全部 resolved / ship（仅修复清单范围）。
- 最终普通文档与红头文档的两份 Word 在隐藏 Word 16.0 打开并转 PDF；连同两份直接 PDF，共四份均一页，Poppler 逐页查看，无多余印发版记；DOCX XML 有效。
- 最终输出证据 `build/qa/guided/downloads-YUpeWR/`、`result.json`、`output-verification.json`。这些本机文件忽略进 Git，关键结果已在 [日志](../logs/2026-10-20-01a158b0-guided-writing.md) 摘要。

## 修改归属

本轮仅提交自己的新 write 文件、测试、构建入口变更和记忆/产品/设计规范。开始时已有的 browser_fonts.go、engine.go、browser-api.js、web/index.html、workspace-ui.js 与 workspace/storage/worker/网页迁移测试新文件继续归 01a13839 会话，未暂存、提交、回滚或覆盖。

新首页使用现有稳定的 BuildDocument/PreviewDocument/InspectDocument/ExportDocument/RegisterFont 协议；高级入口的最新未提交移植代码仍由原会话负责收尾。

## 边界与下一步

- 未公开发布，没有新的账号、收费或外部服务；上线仍需用户明确授权。
- 初轮只验证 Edge；后续已扩至上述七配置，但仍不等于真实 iOS Safari、Android Chrome、macOS Safari 或所有辅助技术通过。
- 尚无真实用户可用性测评；正式上线前应开展任务完成率/中途退出观察及跨浏览器验证。
- 内置字体不是指定公文字体合规证明，Word 在其他电脑可能重排；应用已明确提示并提供授权字体入口。
- 下一步按最新要求先桌面与 PR 流程，手机尺寸暂缓。真实设备与辅助技术仍未全面验证，不把历史模拟列为真机。不要重新引入文种选择或另起风格。
