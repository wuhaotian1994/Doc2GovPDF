# 填写式重写交接

记录日期：2026-10-20，Asia/Shanghai。会话：01a158b0。

状态：本轮重写完成、本地验证与交付完成；未公开上线。

## 目标与完成结果

用户明确推翻旧首页，第一原则为使用方便简单、像注册一样填写。后续纠正“不选文种，面向中国大陆”；格式由实施者判断。

主流程：基本信息 → 正文内容 → 预览导出。必填标题与正文，其余按需。提供实际 PDF 预览、Word/PDF/TXT 下载与可恢复的 JSON 草稿。无账号、国家或文种选择。

参考 GOV.UK Question pages/Check answers、Tally 多步骤表单；设计合同和来源见 [产品方案](../../GUIDED-WRITING.md)。本轮授权替代旧“保持已认可设计”要求，原因已写入 AGENTS、PRODUCT、DESIGN 与议题索引。

## 代码与构建

- `web/write.html`、`write.css`、`write.js`：新填写界面。
- `web/write-model.js`：字段/草稿约束、TXT、独立落款与红头、新流程模型适配。避免把落款日期推断为印发日期，红头首段 before=0 对齐 Word/PDF。
- `web/write-engine.js`：独立 Worker 队列、超时与重启，未依赖其他会话未提交的 engine-client.js。
- `scripts/build-web.ps1`：write.html 构建为 index.html，旧 web/index.html 构建为 advanced.html。
- `scripts/test-guided-model.mjs`、`test-guided-web.mjs`、`verify-guided-word.ps1`：本轮测试。
- `.impeccable/design.json`：设计 sidecar，本轮明确随 Git 保存；其父目录其他本地会话数据仍忽略。

当前交付产物：`dist/guided-web/`。本机静态服务 `http://127.0.0.1:37842/`，仅监听回环地址。进程记录 `build/qa/guided/server.pid`，不可跨会话盲信 PID；先检查监听与进程路径。旧 37841 入口未替换。

可重新启动：

```powershell
./scripts/build-web.ps1 -Output dist/guided-web
go run ./cmd/webserve -listen 127.0.0.1:37842 -dir dist/guided-web
```

## 已验证

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
- 已验证 Windows Edge 的桌面/手机视口，不等于真实 iOS Safari、Android Chrome 或所有辅助技术通过。
- 尚无真实用户可用性测评；正式上线前应开展任务完成率/中途退出观察及跨浏览器验证。
- 内置字体不是指定公文字体合规证明，Word 在其他电脑可能重排；应用已明确提示并提供授权字体入口。
- 下一步若继续：优先让目标用户完成真实写作任务并记录阻碍，再做跨浏览器发布验证。不要重新引入文种选择或另起风格。
