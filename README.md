# 公文整理 · Doc2GovPDF

让小白用户能最简单的步骤完成公文生成与机检。

Windows 本地公文工具，以 Go 重写 gongwen-kit 核心流程，使用 Wails 桌面界面。导入 Word/TXT、粘贴正文或选择模板，在原文中处理必要问题，预览后导出 Word、PDF 或两者。无需账号，正文不上传，无需安装 Office 即可生成 PDF。

## 本地安装版 1.0.1

安装包：`dist/Doc2GovPDF-1.0.1-setup.exe`。双击安装，从开始菜单打开“公文整理”。安装包包含离线 WebView2 组件和可分发的备用中文字体；已有符合要求的 WebView2 时复用。

按用户 2026-10-14 的决定，仅保留本地版本，不创建公开仓库、不上传安装包、不启用联网更新。签名清单、后台下载、退出安装、启动失败及数据回退机制已实现；公开服务和 Windows 代码签名证书尚未配置。当前升级方式为运行新的本地安装包。

已验证环境为 Windows 11 x64。Windows 10、干净虚拟机和真实用户可用性测试尚未完成，不能据此宣称已覆盖。

## 功能

- 通知、报告、请示、函、纪要、管理办法、非红头文书七类模板；红头、发文字号、签发人、附件、纪要人员及单位预设。
- 结构化 DOCX 导入、正文与简单表格编辑、段落角色、统一格式、文字和格式修订；未修改的源 DOCX 原样导出。
- 日期、发文字号、编号层级、体例、异形词和文风建议；表格合计/比例、重复指标及跨表数字核对。数字与事实不猜改。
- 原文定位、确认修改、保留原文、撤销、草稿自动保存和异常恢复。无独立检查报告。
- Go 本地 PDF 渲染，实际 PDF 预览，字体探测及缺字保护。字体不可用时须明确确认备用字体，不能将替代字体当作标准字体通过。
- 当前用户安装、卸载、版本与数据回退；卸载保留用户文件和草稿。

图片、公式、复杂域等无法可靠生成 PDF 的结构会明确提示；DOCX 中受保护的对象保留。嵌套表格、宏等不支持的输入会拒绝。普通 Word 编辑器可能重新分页，实际 PDF 预览是 PDF 成品依据。检查只覆盖软件已实现的规则，不判断事实真实性。

## 开发与验收

Go 1.26.2、Windows x64、WebView2；Node 24 用于隔离桌面测试，无 npm 前端构建步骤。

```powershell
./scripts/build.ps1
./scripts/test-desktop.ps1
./scripts/package.ps1 -Version 1.0.1 -LocalRelease
./scripts/test-install.ps1 -Installer dist/Doc2GovPDF-1.0.1-setup.exe
```

打包前将官方 x64 离线 WebView2 安装器置于 `tmp/tooling/MicrosoftEdgeWebView2RuntimeInstallerX64.exe`；脚本核验 Microsoft Authenticode 签名。完整验收步骤与边界见 [验收记录](docs/STATUS.md)。

草稿位于 `%APPDATA%/Doc2GovPDF/workspace.json`，测试可用 `DOC2GOVPDF_DATA_DIR` 隔离。导出不覆盖原件或已有同名文件。

- [产品需求](docs/PRD.md)
- [实现与交付清单](docs/IMPLEMENTATION.md)
- [使用说明](docs/USAGE.md)
- [上游测试样张：7 份 Word、7 份 PDF 和 7 份纯文本](testdata/upstream/gongwen-kit/README.md)
- [设计依据](docs/UX-REFERENCE.md) 与 [Impeccable 使用记录](docs/IMPECCABLE.md)

参考项目：[imhuhe/gongwen-kit](https://github.com/imhuhe/gongwen-kit)。上游词表、样张、第三方代码和字体保留各自版权与许可证，详见 `THIRD_PARTY_NOTICES.txt`。
