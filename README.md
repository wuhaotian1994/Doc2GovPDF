# 公文整理 Web

让小白用户能最简单的步骤完成公文生成与机检。

2026-10-18 起，项目改为**纯网页版**。打开网页即可导入 Word/TXT、粘贴或新建七类公文；左侧编辑、右侧实时预览，核对后下载 Word、PDF 或配套 ZIP。Go 引擎通过 WebAssembly 在浏览器本地运行，不需要安装 EXE、Office 或向服务器上传文稿。

新版界面以 [Squoosh](https://squoosh.app/) 的文件处理画布和 [ImageOptim](https://imageoptim.com/mac) 的简洁操作为参考，替换旧桌面风格；继续应用 Impeccable。

## 本地打开

开发环境执行：

```powershell
./scripts/build-web.ps1
go run ./cmd/webserve
```

然后打开 http://127.0.0.1:37841 。这个服务只提供静态文件，不接收文稿。`dist/web/` 可部署到支持 HTTPS 的任意静态托管，不能通过双击 file:// 页面运行。当前遵守“暂不公开”的决定，没有上传或部署。

## 使用与保存

- 七种模板、联合发文与特殊要素、自动编号、表格和附件、逐项核对、批量整理、Word 修订/批注、成品 PDF 核对均可使用。
- 草稿、原件副本与自己选择的授权字体保存在当前浏览器 IndexedDB。清理浏览器站点数据会删除这些副本；下载的文件不受影响。
- 浏览器不能直接读取电脑上的公文字体。默认内置开源备用字体，导出前明确确认；严格要求指定字体时，在“偏好设置”载入单位授权的 TTF/TTC。备用字体不等于指定字体合规。
- 首次加载后静态资源在本地缓存，缓存就绪后可离线打开。网页更新在旧页面关闭、重新打开后生效，不中断编辑。
- DOCX/TXT 上限 50 MB；PDF 核对上限 32 MB、100 页。复杂对象无法可靠转成 PDF 时明确提示，原 Word 优先保留。

## 验收与资料

```powershell
go test ./...
go vet ./...
node scripts/test-web.mjs
python scripts/verify-web-exports.py
```

浏览器测试使用隐藏 Edge、真实 Wasm 引擎和实际下载。文档测试另用隐藏 Word/Poppler 对照成品，不操作鼠标键盘。具体结果见 [网页版验收](docs/WEB-2.0.md)。[上游功能映射](docs/UPSTREAM-PARITY.md)、[原始测试样例](testdata/upstream/gongwen-kit/README.md) 和 [新增负例](testdata/upstream/parity/README.md) 保留。

`frontend/`、Wails 入口及历史 `dist/Doc2GovPDF-1.1.0-setup.exe` 保留供追溯；它们不参与当前网页构建。旧桌面版验收在 [STATUS](docs/STATUS.md)。第三方代码与字体许可见 THIRD_PARTY_NOTICES.txt 和 web/fonts/OFL.txt。
