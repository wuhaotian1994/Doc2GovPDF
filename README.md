# Doc2GovPDF

让小白用户能最简单的步骤完成公文生成与机检。

面向 Windows 的本地公文处理软件，计划使用 Go 重写 gongwen-kit 的核心能力，提供图形界面、DOCX 与 PDF 输出、可直接安装的 EXE 安装包和后台静默更新。

产品定位是围绕文件完成任务的公文整理与检查工具。用户导入文件或粘贴正文，软件排版、检查，再让用户确认必要问题并导出成品。流程参考 Squoosh，桌面形态参考 ImageOptim 的专注程度，UI 设计采用 Impeccable 工作流。

当前阶段：第一阶段桌面开发预览，采用 Go + Wails。已经实现纯正文导入、基础非红头排版、日期与发文字号两类写法检查、确认修改与撤销、本地草稿、DOCX 与 HTML 报告导出。复杂 Word 导入会明确拒绝；当前不是完整公文机检工具。

PDF、完整数字与文风检查、复杂 DOCX 保真、安装包和自动更新仍在开发范围内，尚未实现。

## 构建与测试

开发环境：Go 1.26.2 或兼容版本、Windows x64、WebView2 Runtime；Node 24 用于测试脚本。界面无 npm 构建依赖。

```powershell
./scripts/build.ps1
```

输出：`build/bin/Doc2GovPDF.exe`。这是可运行程序，尚不是安装包。当前构建在缺少 WebView2 时明确报错，不自动下载运行时。

```powershell
$env:GOMODCACHE = "$PWD/tmp/gomod"
$env:GOCACHE = "$PWD/tmp/gocache"
go test ./...
go vet ./...
```

运行 `./scripts/test-desktop.ps1` 可构建隔离的桌面测试实例并验证真实 Go 绑定与界面交互，报告保存在 `build/qa/`；测试不会访问用户草稿。

默认草稿位于当前用户配置目录下的 `Doc2GovPDF/draft.json`。`DOC2GOVPDF_DATA_DIR` 可覆盖开发测试的数据目录。所有导出只创建新文件，不覆盖已有文件。

- [产品需求与验收标准](docs/PRD.md)
- [交互参考与设计约束](docs/UX-REFERENCE.md)
- [上游调研与重写边界](docs/UPSTREAM.md)
- [开发记录与已知限制](docs/STATUS.md)
- [上游测试样张：7 份 Word、7 份 PDF 和 7 份纯文本](testdata/upstream/gongwen-kit/README.md)

上游参考：[imhuhe/gongwen-kit](https://github.com/imhuhe/gongwen-kit)。本仓库独立开发，引用或移植上游内容时保留对应许可证及版权声明。
