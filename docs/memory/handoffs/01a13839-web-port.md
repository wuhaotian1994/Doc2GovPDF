# 网页完整移植交接

记录日期：2026-10-20，Asia/Shanghai。会话：`01a13839`。状态：**进行中，尚未最终交付**。

## 目标与完成条件

用户已认可当前网页设计，要求完整移植桌面版功能。保持纯浏览器本地处理、不公开发布、不操作鼠标键盘；补齐工作保护与平台适配，真实流程及受影响文档验收后提交交付。

## 已有基线

- `4060cb1`：2.0.0 Web 初次交付；本地地址当时为 `127.0.0.1:37841`。
- `c531222`：桌面 1.1.0，公开上游能力对齐。
- 不要无条件相信缓存 PID 或服务器仍在运行；必要时核对当前进程和 HTTP 状态。

## 本会话正在修改的文件

以下是 2026-10-20 盘点归属于本会话的未提交工作；后续会话仍需重查 Git，不能据此覆盖新改动：

- `internal/office/browser_fonts.go`：字体纯校验与注册分离。
- `internal/office/source_metadata.go`：恢复旧草稿来源元数据，保留编辑文字。
- `internal/webengine/engine.go`、`workspace.go`、`workspace_test.go`：草稿/设置校验、备份格式、桌面迁移、来源校验及测试。
- `web/browser-api.js`、`browser-storage.js`、`engine-client.js`：持久化、坏数据恢复、Worker 生命周期、字体与备份 API。
- `web/index.html`、`workspace-ui.js`：备份/恢复、启动恢复、字体重置与保存提示。既有设计未重做。
- `scripts/test-web-port.mjs`、`web-journey-browser.js`：桌面流程的网页适配验收。
- `scripts/test-web-recovery.mjs`、`test-web-worker.mjs`：真实存储故障与 Worker 单元测试。

## 已验证的内容及边界

- 40 项完整网页流程，跨 5 次页面重新加载；真实 Go/Wasm 生成与下载。文件选择路径在该套流程中注入，后续处理真实执行。
- 17 项真实浏览器备份/迁移/损坏数据/写入失败/字体恢复检查；备份文件选择通过后台 CDP 操作隔离浏览器的 file input。
- 6 项 Worker 故障测试，覆盖启动取消、活动预览取消、过期排队请求、超时、坏字体与重试。
- 备份设置窄屏与恢复后的编辑界面截图已查看，没有重设计。
- 上述验证对应 `build/qa/web-port` 的阶段构建。最新追加的 Go JSON/旧文字草稿变更之后，最终全量回归尚未跑完，不能写“最新全部通过”。

## 尚未完成

1. 对最新源码运行 Go 测试和 vet，修正任何失败；构建到独立 `build/qa/web-port`，不要先覆盖用户打开的 `dist/web`。
2. 完成迁移能力矩阵：每项桌面能力的网页入口、真实证据、明确平台替代。不要把浏览器没有资源管理器/EXE 更新误算成业务缺失。
3. 独立解析完整流程实际下载的 ZIP/DOCX/PDF，尤其数字批注、原样 DOCX、复杂对象和联合行文附件；必要时用隐藏 Word/Poppler 复核受影响页面。
4. 覆盖尚未充分在真实 Wasm 验证的特殊要素组合；共用引擎测试不能冒充网页实际测试。
5. 核对网页更新/离线缓存与恢复之间的关系，保留旧草稿，不强制刷新用户编辑中的页面。
6. 更新当前版本的交付/验收文档、UI 字体子集（新增界面文字可能未包含）、相关许可证和审阅摘要。
7. 只提交明确归属本会话的改动，构建最终静态包，验证后再更新本机预览与交付链接。不要公开部署。

## 复现环境

项目：`D:/Project/Doc2GovPDF`。PowerShell。Go 缓存：`tmp/gomod`、`tmp/gocache`。

```powershell
$env:GOMODCACHE="$PWD/tmp/gomod"
$env:GOCACHE="$PWD/tmp/gocache"
go test ./...
go vet ./...
node --test scripts/test-web-worker.mjs
./scripts/build-web.ps1 -Output build/qa/web-port
node scripts/test-web-port.mjs
node scripts/test-web-recovery.mjs
```

Python 使用应用运行环境，路径/依赖可能随应用升级改变，应核对可用性；此前使用 `C:/Users/wuhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`，字体生成另设 `PYTHONPATH=tmp/fonttools`。

## 关联

- [回溯日志 E06–E08](../logs/2026-10-20-01a13839-project-history.md)
- [验证与故障经验](../topics/verification-and-pitfalls.md)
- [既有网页交付证据](../../WEB-2.0.md)
