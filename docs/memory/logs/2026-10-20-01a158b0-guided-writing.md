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

## E05 · 继续：经常使用与跨浏览器

- 用户要求考虑经常使用，不重复填写；按普通首次办公用户完整走查，发现阻碍直接改，并验证其他主流浏览器和手机，仍不公开发布。
- 基线 dd7cdcf，其他会话未提交文件集合未变。沿用当前视觉，不重新设计。
- 实现方向：显式保存常用收文对象/发文单位/落款/抄送/红头偏好；新建不带标题、正文、日期、文号或附件。最近文档保留并支持切换、复制，复制明确清空日期/文号并提示核对正文事实。
- 手机增加预览跳转、返回填写、纸张放大；日期增加显式“填入今天”；导出不可用时显示原因；中文输入法组合期间不重复发起排版。
- 发现本机有 Chrome、Edge，已有旧 Playwright 引擎与当前工具 1.62.1 不匹配。将匹配的 Firefox/WebKit 下载至项目 tmp/playwright-browsers，不覆盖日常浏览器。
- 交互测试采用独立无头浏览器，主路径由真实定位器 click/tap/fill 和实际文件下载完成。WebKit/手机模拟不冒充 macOS Safari 或真机。
- 新增常用信息/文档库单测后共 9 项通过。跨浏览器执行与真实页面检查进行中。

## E06 · 复用保护与测试工具修正

- 保存常用信息与文档库实现于 write-library.js，旧草稿无 ID 可迁移；有部分信息但尚未写标题的草稿也保留。只包含默认常用信息的空白稿不挤占历史。
- 独立审查发现下载文件携带原 ID，旧快照再导入并切换后可能覆盖较新归档稿。文件导入改为新本地 ID，仅库内“继续编辑”保留 ID。七配置均增加导入旧快照后较新正文仍可恢复的回归。
- WebKit 1.62.1 工具构建在离线模拟下内部错误；核查官方 issue #42775 后升级项目测试依赖到 Playwright 1.64.1（package-lock 固定），安装匹配 Firefox 157/WebKit 27.2；全部离线测试通过。未改产品绕开或跳过失败。
- 首次 Firefox 本机请求受代理影响，测试进程设置直连后通过。Chrome 测试的 fieldset disabled 断言改读原生属性；文件选择键盘测试补等待弹窗可见，排除焦点竞态。均是测试环境/脚本修正。
- iPhone 全页截图曾显示负 top 隐藏跳转链接，改为键盘可聚焦的 clip 隐藏；最终截图确认不覆盖正文。弹窗与导出错误追加就地反馈。

## E07 · 本轮最终验证

- 10 项模型/库单测、28 项原 Edge 回归通过；最终 7 配置共 176 项跨浏览器检查通过。具体版本与逐项证据见 [RETURNING-USERS-QA](../../RETURNING-USERS-QA.md)。
- Chrome 155.0.8059.85：28；Edge 155.0.4283.62：23；Firefox 测试构建 157.0：23；WebKit 27.2 桌面：23；Android 触控模拟：27；iPhone 触控模拟：27；iPad 触控模拟：25。
- 最终 `build/qa/returning/verified-summary.json` 合并同一应用构建的完整矩阵与 Chrome 定向重跑；含源码 SHA256。保留 matrix.json 的原测试等待失败，不把失败记录删除。
- 七配置实际 PDF 解析文字、Word 正文 XML、TXT 完全一致。隐藏 Word 16.0 将本轮 DOCX 渲染为一页，Poppler 页面已查看；没有把纯脚本通过等同于版式通过。
- 两轮 UI 截图内完成检查，未无限打磨。独立审查最终 `ship`，仅其旧快照风险/skip 修复/记录三项范围；无新视觉重设计。
- 当前没有真实 Android/iPhone/iPad、macOS Safari、系统软键盘、实体低端机或屏幕阅读器证据。移动结果明确为模拟；未宣称这些发布门槛已完成。
- Go 引擎与其他会话未提交移植代码本轮未修改；未重复跑 Go 全量，不把上一轮 Go 结果冒充本轮重跑。
- 最终更新 `dist/guided-web/`，六个主流程文件逐一 SHA256 与 verified-summary.json 一致；原 127.0.0.1:37842 首页和 write-library.js 返回 200，继续同一浏览器来源以保留草稿。未强制刷新用户页面；网页更新仍在旧页面关闭后生效。
