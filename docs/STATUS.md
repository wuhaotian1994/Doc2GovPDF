# 本地版验收记录

日期：2026-10-14。版本：1.0.0 local。发布决定：用户要求暂不公开，仅交付本地安装包；未创建远程发布仓库，未上传源码、文档或安装包。

## 已实现

Go + Wails 桌面程序已完成导入、七类模板、正文/简单表格编辑、单位预设、格式统一、问题定位/修改/撤销、自动草稿、实际 PDF 预览、Word/PDF 导出、安装与卸载。独立检查报告已取消。

DOCX 解析保留源包；未修改文件按原字节输出。支持范围内的文字和格式变更写入修订，页眉编辑不重写正文；图片、公式、复杂域、既有批注和修订等按保护边界处理。不能可靠转换的内容明确阻止 PDF，不生成残缺成品。源文档始终不覆盖。

规则覆盖日期/发文字号、部分字体版式与体例、编号与枚举数量、异形词/文风、表格合计与比例、正文重复指标、跨表指标。机器不校验事实真实性，不猜改数值；模糊建议由用户确认。不是对任意 Word 排版的完全复刻，也不是完整标准认证。

## 已通过的验证

| 范围 | 证据与结果 |
| --- | --- |
| Go 与静态检查 | `go test ./...`、`go vet ./...` 通过；覆盖坏包、修改保真、修订、规则正反例、取消、字体、页数限制、数据恢复、安装及签名更新 |
| 原始上游样张 | 7 份 DOCX 全部导入；未编辑导出逐字节相同；修改只触及相关 XML；7 份正例检查零问题 |
| 桌面交互 | `scripts/test-desktop.ps1` 的 12 项实际 Wails/WebView2 检查通过，包括 Go 绑定、应用/撤销、PDF 画布、导出动作、草稿恢复、待保存撤回、HTML 转义及键盘操作 |
| 界面 | 独立 Edge 实例检查首页、成品页、窄窗口，无横向溢出；与实际桌面功能测试分开记录 |
| PDF | 7 份上游、7 类新建模板和备用字体样稿由 Go 输出；独立 Poppler 渲染并使用 pypdf 核对全部上游正文，无遗漏；逐页看图检查排版 |
| Word | 7 类新建 DOCX 经 Microsoft Word 16.0.20430.20146 隐藏只读打开及 PDF 导出；未使用修复打开，不将 Word 作为产品运行依赖 |
| 安装生命周期 | 最终 EXE 在隔离中文/空格路径安装、文件摘要核对、重新安装、健康启动、损坏启动回退、数据迁移故障恢复、卸载及保留用户文件通过 |
| 升级数据恢复 | `upgradeprobe` 专用测试构建在启动备份后写入不兼容 schema 并退出，旧程序和原草稿恢复；正式安装包不包含探针 |
| 系统登记 | 隔离的临时 HKCU 卸载项和开始菜单快捷方式创建/移除测试通过 |
| 更新机制 | TLS 测试服务器验证 Ed25519 签名、版本、大小/摘要、损坏拒绝、下载/关闭和检查间隔；未连接生产服务 |

验收环境：Windows 11 Pro 25H2 x64，i5-10400（6 核），64 GB 内存，已安装 WebView2 155.0.4283.45。Go 1.26.2、Node 24.14.1。17 页长文的暖机渲染曾测得约 88 ms，仅代表该环境的单次结果。

## 明确边界

- Windows 10、4 核 8 GB 基准机、100%/150%/200% 的完整系统缩放矩阵、无 Office/无 WebView2 的干净虚拟机和 5 人可用性测试未执行。
- 系统原生选择/另存对话框通过 Wails 调用；自动桌面测试替代了对话框选择，实际文件写入另由后端测试验证，未声称人工逐项点击过所有对话框。
- DOCX 在第三方编辑器重新分页，Word 与本机 PDF 页数可以不同；新建请示附件样稿在 Word 为 3 页、Go PDF 为 2 页，两者正文均保留。固定版式以实际 PDF 预览为准。
- 程序不支持任意复杂图文混排；嵌套表格、宏/嵌入文件等按输入边界拒绝，某些复杂对象仅保留 DOCX。正文到表格的任意语义对应未实现。
- 安装包约 243 MB（含约 214 MB 官方离线 WebView2）；自有 EXE 无商业代码签名。Microsoft 运行组件已验证有效签名。生产更新地址和密钥均为空，local 通道不启用联网更新。
- 未安装商业公文字体时使用有 OFL 分发许可的 Noto Serif SC 备用字体，需要用户确认；不把字体替代称为严格格式合规。

## 复现

```powershell
$env:DOC2GOVPDF_RENDER_TEST='1'
$env:DOC2GOVPDF_UI_FIXTURE='1'
./scripts/test-desktop.ps1
./scripts/test-word.ps1
# Python 环境需要 Pillow、pypdf，POPPLER_BIN 可指定 Poppler 所在目录。
python scripts/verify-pdf.py
# 仅为故障恢复测试生成探针，绝不打进发布 ZIP。
go run github.com/wailsapp/wails/v2/cmd/wails@v2.15.0 build -s -tags upgradeprobe -o Doc2GovPDF-upgradeprobe.exe -webview2 error
./scripts/package.ps1 -Version 1.0.0 -LocalRelease
./scripts/test-install.ps1 -Installer dist/Doc2GovPDF-1.0.0-setup.exe -CrashProbe build/bin/Doc2GovPDF-upgradeprobe.exe
```

原始测试结果保存在被 Git 忽略的 `build/qa/`，本记录进入版本控制。安装包及摘要保留在 `dist/`。没有把测试结果作为要求用户阅读的产品功能。
