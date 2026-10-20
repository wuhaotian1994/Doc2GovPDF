# 公文整理 Web

像填表一样写文档，把排版交给程序。

2026-10-20 起，主流程改为**基本信息 → 正文内容 → 预览导出**，面向中国大陆中文办公场景，不要求注册、选择国家或文种。填写标题、输入或粘贴正文，就能生成 Word、PDF 和纯文本；红头、文号、落款、日期按需填写。桌面左侧填写、右侧实际 PDF 实时预览，手机上下排列。Go 引擎通过 WebAssembly 在浏览器本地运行，无需安装 EXE、Office 或上传文稿。

新版参考 [GOV.UK Question pages](https://design-system.service.gov.uk/patterns/question-pages/)、[Check answers](https://design-system.service.gov.uk/patterns/check-answers/) 和 [Tally 分步表单](https://tally.so/help/how-to-create-a-multi-step-form)，应用 Impeccable 与 UI/UX Pro Max。设计决定见 [填写式产品方案](docs/GUIDED-WRITING.md)。原 Squoosh/ImageOptim 导入工具方向保留在历史记录中。

## 本地打开

开发环境执行：

```powershell
./scripts/build-web.ps1
go run ./cmd/webserve
```

然后打开 http://127.0.0.1:37841 。这个服务只提供静态文件，不接收文稿。`dist/web/` 可部署到支持 HTTPS 的任意静态托管，不能通过双击 file:// 页面运行。当前遵守“暂不公开”的决定，没有上传或部署。

## 使用与保存

- 填写首页源文件为 `web/write.html`，构建后是 `index.html`。标题和正文必填，其余按需展开；不自动填写事实或生成文号。
- 填写草稿保存在 localStorage，字体保存在独立 IndexedDB；“我的草稿”可下载 `.gongwen.json`、重新打开和恢复替换前的文档。正文上限 10 万字符，草稿文件上限 1 MB。清理站点数据会删除本地副本，下载的文件不受影响。
- “整理已有 Word”进入 `advanced.html`，保留旧网页的复杂文档编辑、联合发文、表格、修订/批注和 PDF 核对。该界面源文件仍为 `web/index.html`；其既有草稿与新填写草稿隔离。
- 浏览器不能直接读取电脑公文字体。默认使用内置开源备用字体；单位有指定要求时，在“字体设置”选择有权使用和嵌入的 TTF/TTC。备用字体不等于指定字体合规，Word 在另一电脑上可能重排。
- 首次加载后静态资源在本地缓存，缓存就绪后可离线打开。网页更新在旧页面关闭、重新打开后生效，不中断编辑。
- DOCX/TXT 上限 50 MB；PDF 核对上限 32 MB、100 页。复杂对象无法可靠转成 PDF 时明确提示，原 Word 优先保留。

## 验收与资料

```powershell
go test ./...
go vet ./...
node --test scripts/test-guided-model.mjs
./scripts/build-web.ps1 -Output build/qa/guided-web
node scripts/test-guided-web.mjs
```

浏览器测试使用独立无头 Edge、真实 Wasm 引擎和实际下载。文档测试另用隐藏 Word/Poppler 对照成品，不操作鼠标键盘。最新证据与边界见 [填写式重写交接](docs/memory/handoffs/01a158b0-guided-writing.md)。[旧网页版验收](docs/WEB-2.0.md)、[上游功能映射](docs/UPSTREAM-PARITY.md)、[原始测试样例](testdata/upstream/gongwen-kit/README.md) 和 [新增负例](testdata/upstream/parity/README.md) 保留。

`frontend/`、Wails 入口及历史 `dist/Doc2GovPDF-1.1.0-setup.exe` 保留供追溯；它们不参与当前网页构建。旧桌面版验收在 [STATUS](docs/STATUS.md)。第三方代码与字体许可见 THIRD_PARTY_NOTICES.txt 和 web/fonts/OFL.txt。
