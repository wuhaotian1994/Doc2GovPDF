# 经常使用与跨浏览器验收

日期：2026-10-20，Asia/Shanghai。基线：dd7cdcf。本轮只在本地交付，未公开发布。

后续实际服务验收更正：旧矩阵的 Node 静态服务掩盖了 Go 服务 `.mjs` MIME 和重定向首页缓存问题。当前验收改为真实 Go 服务，最新用户要求先验证桌面、暂停手机尺寸；见 [首次填写与真实服务验收](FIRST-USE-DELIVERY-QA.md)。

2026-10-21 更正范围：用户实际反馈“下一步清空”，暴露本记录正常流程先等待 writerReady 的测试盲区。不能将以下通过解释为启动异常已验证。具体复现、修复与新增故障回归见 [启动保护](STARTUP-PROTECTION.md)；历史结果保留，不删改失败原因。

## 从普通办公人员的路径出发

这是一轮实施者的任务走查与自动化验证，不是真实用户研究。所有示例内容为合成测试稿。

| 使用场景 | 原来的阻碍 | 本轮实现 |
| --- | --- | --- |
| 第一次写稿 | 日期要手填，不知道按钮为什么不能下载 | 显式“填入今天”，导出旁显示更新/核对原因 |
| 经常给同一单位写材料 | 每次重新填写收文对象、单位和落款 | 一次保存常用信息，新建自动带入；随时管理或清空 |
| 开始下一份 | 新建藏在弹窗里，上一份只能单次恢复 | 顶部新建；切换前归档，在“我的文档”继续编辑 |
| 沿用上周材料 | 要下载再导入或重新粘贴 | 文档库复制新稿，保留正文，清空日期/文号并提示核对事实 |
| 打开以前下载的草稿 | 相同 ID 可能在下一次切换时覆盖较新正文 | 文件导入始终创建独立本地 ID，库内继续编辑才沿用 ID |
| 手机核对 | 长距离来回滚动，纸面文字太小 | 查看预览/返回填写、放大纸张，保留上下同页布局 |
| 异常或空间不足 | 顶部错误可能被弹窗遮挡 | 在当前弹窗或下载操作附近显示错误；归档失败即取消切换 |

常用设置仅记住收文对象、发文单位、落款、抄送、红头与下载格式。新建不带标题、正文、日期、文号或附件。修改常用设置不改变正在编辑的文档。

本地文档库最多归档 20 份，满时提示用户备份并删除旧稿，不自动淘汰。删除需确认；清理站点数据会清除本地副本，已下载文件不受影响。草稿不是云同步。

## 实际测试矩阵

Windows 上的独立无头进程，Node 24.14.1，Playwright 1.64.1。使用真实定位器点击、键盘、合成触控、文件选择与实际下载，运行实际 Go/Wasm 和 PDF.js。测试地址只绑定 127.0.0.1。

| 配置 | 实际浏览器/引擎 | 结果 | 检查数 |
| --- | --- | --- | ---: |
| Windows 桌面 Chrome | 本机 Chrome 155.0.8059.85 | 通过 | 28 |
| Windows 桌面 Edge | 本机 Edge 155.0.4283.62 | 通过 | 23 |
| 桌面 Firefox | Playwright Firefox 测试构建 157.0 | 通过 | 23 |
| 桌面 WebKit | Playwright WebKit 27.2 | 通过 | 23 |
| Android 手机模拟 | Chrome + Pixel 7 视口/触控预设 | 通过 | 27 |
| iPhone 模拟 | WebKit + iPhone 13 视口/触控预设 | 通过 | 27 |
| iPad 模拟 | WebKit + iPad 第 7 代视口/触控预设 | 通过 | 25 |
| 合计 | 7 种配置 | 通过 | 176 |

共通覆盖：空白起步、行内校验、常用信息保存、Word/PDF/TXT 下载、新建不带过期事实、文档切换与复制、刷新恢复、独立旧快照导入、跨标签页锁、无效日期保护、HTML 文本不被执行、无外部请求、离线刷新后实际 PDF 预览、无未捕获页面异常。

手机/平板另覆盖触控、预览跳转与放大、横屏、320px 窄屏不溢出。Chrome 另覆盖约等于 200% 缩放的布局宽度、键盘打开文件选择、配额失败时取消归档/切换、删除取消与当前文档保护。

另外：10 项模型/文档库单测通过；前一轮 28 项真实 Edge 回归再次通过。此次未改 Go 引擎，不用上一轮 Go 全量结果冒充本轮重跑。

## 导出与视觉证据

- 7 个配置下载的 PDF 均为一页，解析出的文字逐字一致。
- 7 份 DOCX ZIP/正文 XML 有效，`word/document.xml` 逐字节一致。
- 7 份 TXT 内容一致，标题、正文、落款与显式日期完整。
- Chrome 实际下载的 DOCX 另用隐藏 Word 16.0 只读打开、转为 PDF 并经 Poppler 看页：一页，标题、正文层次、落款、日期与页码无重叠或截断。其余六份 Word 正文 XML 与该文件一致。
- 最终桌面、手机、平板截图已查看。iPhone 上旧的负 top 隐藏跳转链接在全页捕获中泄漏，已改为可聚焦裁剪隐藏，最终截图确认不再覆盖内容。
- 独立 finish reviewer 找到旧快照 ID 覆盖风险；修复后明确判为 resolved / ship，结论范围是其修复清单。

本机原始证据在 `build/qa/returning/`，不进 Git：

- `verified-summary.json`：最终 7 配置结果、176 项检查、导出解析与源码 SHA256。
- `matrix.json`：完整一轮；Chrome 键盘文件选择测试因未等待弹窗显示而失败，其余六项通过。
- `chrome-rerun.json`：修正测试焦点竞态后的 Chrome 定向重跑，28 项通过。只修测试等待，应用构建未变。
- 各配置目录：实际 DOCX/PDF/TXT/草稿下载及最终截图。
- 旧回归输出：`build/qa/guided/result.json`，28 项通过。

## 已定位的测试环境问题

- 首次 Firefox 本机请求受代理配置影响，返回 NS_ERROR_NET_ERROR_RESPONSE；隔离测试进程清空代理环境并将 Firefox 代理模式设为直连后通过。
- Playwright 1.62.1 的 WebKit 断网模拟报内部错误，与[上游 #42775](https://github.com/microsoft/playwright/issues/42775)一致。固定到包含修复的 1.64.1、安装匹配引擎后，同样的离线检查在桌面/iPhone/iPad 模拟均通过；没有跳过失败项或改产品绕过测试。
- `fieldset` 的 Playwright disabled 判断与预期不同，跨标签页测试改读 HTML 原生 `fieldset.disabled` 并同时检查用户提示；只修测试断言。

## 范围边界与上线门槛

**尚未做真实 Android/iPhone/iPad、macOS Safari、系统软键盘、实体设备低内存/低电量及屏幕阅读器验收。** 模拟设备的 UA 和屏幕预设不等于真实操作系统或实体设备。手机触控模拟验证通过不能消除这项发布边界。

本轮没有账号、收费、外部部署或真实用户研究。正式公网发布仍需用户明确授权；在此之前应补齐真实设备与辅助技术验证。字体合规、单位审批与文稿事实核对仍遵循已有产品边界。

## 复现

```powershell
node --test scripts/test-guided-model.mjs scripts/test-writer-library.mjs
npm ci --prefix scripts/browser-tests
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/playwright-browsers"
node scripts/browser-tests/node_modules/playwright/cli.js install firefox webkit
./scripts/build-web.ps1 -Output build/qa/returning-web
node scripts/test-writer-browsers.mjs
python scripts/verify-writer-outputs.py
```

完整运行失败时保留失败证据，定位后可用 `WRITER_PROFILE` 和 `WRITER_RESULT_FILE` 做定向复核；仅在同一应用构建下，使用 `verify-writer-outputs.py --rerun <结果文件>` 合并对应配置。不要跨代码版本拼接“全部通过”。

解析脚本依赖 Python `pypdf`；实际 Word 渲染脚本 `scripts/verify-guided-word.ps1` 需要本机安装 Word，始终隐藏、只读运行。
