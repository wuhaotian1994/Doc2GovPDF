# 填写式文档重写

会话：01a158b0，日期：2026-10-20，Asia/Shanghai。

## E01 · 需求与设计决定

- 用户明确推翻旧界面方向，要求按正式上线产品标准重写，以“像注册账号一样简单”为第一原则，借鉴优秀设计，支持在线预览、Word/PDF 导出。
- 用户进一步明确：没有文种选择，面向中国大陆；纯文档格式由实施者判断。决定提供 Word、PDF、TXT 和可重新填写的 JSON 草稿。
- 采用 GOV.UK Question pages / Check answers 的短表单、返回保留输入、最后复核，以及 Tally 多步骤表单的渐进展开。不是用户可用性测评结论。
- 已读取项目 Impeccable 和本地 UI/UX Pro Max。后者设计系统返回的 Enterprise Gateway 营销结构不适合本任务，未采用；补充检索 Forms 的标签、反馈、行内验证规则。Impeccable seed 5395dd81 的自由方向由用户明确的熟悉表单要求覆盖；使用 code-led Operate，不要求用户验收概念半成品。
- 新入口为独立 `web/write.html`；构建时将其作为首页，旧首页保留为 `advanced.html`，保护其他会话尚未提交的移植工作。
- 初始基线 d6482c6。其他会话修改：browser_fonts.go、engine.go、browser-api.js、index.html、workspace-ui.js 以及 workspace/storage/worker 和网页迁移测试新文件，详见 01a13839 交接；本会话不暂存或提交这些文件。
- 核心引擎保留，以现有 BuildDocument / PreviewDocument / InspectDocument / ExportDocument 处理真实输出，不以 HTML 假预览替代 PDF。

## E02 · 实现与首轮验证

- 新增 write.html/css/js、write-model.js、write-engine.js。使用独立 Worker、独立 localStorage 草稿与 IndexedDB 字体，避免侵入旧工作区的未提交恢复代码。
- 三步填写不选择文种；必填标题、正文，红头/文号/收文对象/落款/日期/附件名称/抄送渐进展开。PDF.js 显示实际 Go/Wasm PDF；Word/PDF/TXT 与 JSON 草稿真实下载。
- 实现返回保留输入、修订后作废旧预览、内容提醒定位、逐项原文确认、双标签编辑锁、保存失败提示、损坏数据保留、替换前恢复副本、授权字体存储与离线缓存。
- 初轮 17 项真实 Edge 流程通过；首轮普通文档用隐藏 Word 16.0 打开并转 PDF，再用 Poppler 看页。
- UI 设计机械检测已运行一次；修复移动页脚 10px，旧 DESIGN 颜色偏离由用户重写授权覆盖。dialog 的细边框/阴影 advisory 保留用于浮层，无卡片墙。

## E03 · 独立审查与真实版式发现

- Impeccable finish reviewer 首轮 `fix`：日期输入与恢复规则不一致、字体事务窗口可导出旧预览、新建遗留旧 PDF、文件选择不可键盘访问、窄屏方位文案、设计规范未更新。
- 完成修复后，verdict 又发现无效日期会污染替换恢复副本；在替换之前阻止该状态、定位日期。最终六项均 `resolved`，disposition `ship`，范围仅该修复清单，不冒充新模型的文档版式审查。
- 新增 PRODUCT、DESIGN 更新与 `.impeccable/design.json`；文档子代理只修改约定三文件，本会话审核。参考来源和具体采用方式保存在 docs/GUIDED-WRITING.md。
- 真实红头 Word/PDF 各出现两页，其中第二页为引擎自动推断的“单位＋落款日印发”版记。新流程并未采集印发事实，因此在新流程模型适配中移除自动印发版记，保留用户明确填写的抄送。
- PDF 会忽略第一页首段段前距，Word 会保留；新流程将红头首段 before 设为 0，消除额外的 35mm 顶部偏移。没有修改其他会话负责的 Go 引擎。

## E04 · 最终验证与交付

- `node --test scripts/test-guided-model.mjs`：5 项通过，含草稿损坏/日期边界、占位文字不进入导出、独立红头落款、禁止推断印发信息。
- `node scripts/test-guided-web.mjs`：最终 28 项通过；最后一轮 `GUIDED_FUNCTIONS_ONLY=1`，因只改恢复保护与文档适配，未重复做第三轮 UI 打磨。覆盖实际下载、草稿文件恢复、失效预览、XSS 文本、多页翻页、日期保护、字体事务、红头导出、存储配额异常、损坏恢复与离线刷新。
- UI 两轮桌面 1440×960 与手机 390×844 截图均已检查，最终截图位于 `build/qa/guided/`。截图不是模拟设计图。
- 最终实际下载目录 `build/qa/guided/downloads-YUpeWR/`；普通与红头各一份 DOCX/PDF。`verify-guided-word.ps1` 使用隐藏 Word 16.0 只读打开两份 DOCX 并输出各自 PDF。最终四份 PDF 均一页，Poppler 实际页面已检查，无自动推断印发内容；两份 DOCX XML 解析通过。摘要在 `build/qa/guided/output-verification.json`。
- 全量 `go test ./...` 与 `go vet ./...` 通过。首次沙箱运行的历史桌面测试因沙箱临时目录 rename Access denied 失败；在正常权限下复核通过，非本轮 Go 回归。
- 无头 Edge 初次沙箱连接本机 CDP 返回 EACCES；授权的隐藏本机测试执行通过。Word COM 同样在沙箱内拒绝、正常权限通过。未操作用户鼠标键盘。
- 发布产物 `dist/guided-web/`，与最终 QA 构建的 write.js/write-model.js SHA256 一致。隐藏静态服务 `127.0.0.1:37842` 已验证首页与 advanced.html 返回 200；首次 PowerShell 请求走环境代理返回 502，`-NoProxy` 直接核查正常。
- 本地交付，不推送、不公网部署；既有 37841 服务和其他会话文件未替换。当前验证浏览器为 Windows Edge，未声称 Safari/Firefox 或真实移动设备验证；没有真实用户可用性研究。
