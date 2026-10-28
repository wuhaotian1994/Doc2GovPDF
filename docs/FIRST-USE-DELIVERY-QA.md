# 首次填写与真实服务验收

2026-10-21。范围按最新要求收敛到桌面，不继续手机尺寸验收；不公开部署。所有浏览器为独立无头环境，示例为合成内容。

## 故障及修复

用户反馈预览始终失败，不能以提示“内容仍保留”作为交付结果。实际本机 Go 服务将 `.mjs` 返回为 `text/plain`，严格模块检查拒绝执行；此前测试用 Node 自建静态服务设置正确类型，掩盖了真实交付故障。

- 服务显式设置 JavaScript/Wasm MIME，保留 nosniff；PDF.js 使用新的 `.js` 别名避开旧错误类型缓存。
- 首页缓存改为规范根地址，避免 Go `/index.html` 重定向响应导致刷新失败。旧缓存一次性迁移，不强制刷新正在编辑的页面。
- HTTP 不再用秒级 Last-Modified 判断应用更新，防止同秒替换后仍返回旧页面/脚本；离线缓存由内容版本化的 service worker 管理。
- 顶部“保存”和 Ctrl+S 在启动前即写本地持久恢复记录。每个版本使用独立不可变键，避免其他标签清理时误删新输入。正常启动拿到编辑锁后归档其他版本，成功保存才清理已接收记录。
- 刷新立即显示原稿；未修改的旧页关闭时不创建“最新”恢复稿。主模块加载期间仍可填、下一步、返回和保存。
- 真实预览失败恢复后移除旧错误状态；故障测试必须进一步恢复并下载真实 PDF，不能只验证降级提示或 TXT。

## 操作验收

首次流程故意暂停主脚本，打开就输入，不等待 writerReady：标题、收文对象、文号 → 下一步正文与落款 → 返回 → 保存 → 刷新 → 浏览器返回/前进 → 保存关页 → 新标签打开 → 真实 PDF 预览 → 下载填写草稿、Word、PDF、TXT → 修改正文并立即保存刷新 → 下载包含新增文字的 PDF/TXT → 离线刷新并预览导出。

`scripts/browser-tests/server.mjs` 编译并启动实际 `cmd/webserve`。首次流程还支持 `WRITER_URL`，用于直接验收最终本机交付地址。文件验证解析实际 PDF 文字、Word XML 和 TXT，与输入及最后修改逐项比较。界面和隐藏 Word 转出的真实页面另行检查。

其他回归包括常用信息复用、文档库、导入旧副本不覆盖新稿、编辑锁、存储失败、三种引擎的启动/依赖故障、多标签保存与关闭顺序、Git 旧版缓存升级。

```powershell
./scripts/build-web.ps1 -Output build/qa/final-desktop-web
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/playwright-browsers"
$env:WRITER_WEB_ROOT='build/qa/final-desktop-web'
$env:FIRST_USE_PROFILE='chrome,edge,firefox,webkit'
$env:FIRST_USE_RESULT='desktop-final.json'
$env:WRITER_PROFILE='chrome-desktop,edge-desktop,firefox-desktop,webkit-desktop'
node scripts/test-writer-first-use.mjs
node scripts/test-writer-recovery.mjs
node scripts/test-writer-update.mjs
node scripts/test-writer-startup.mjs
node scripts/test-writer-browsers.mjs
python scripts/verify-first-use-outputs.py
go test ./cmd/webserve
```

证据在 `build/qa/first-use/`、`build/qa/startup/`、`build/qa/returning/`；这些目录不进 Git，因此最终结论与代码状态摘要必须同步写入 [本会话日志](memory/logs/2026-10-21-01a158b0-startup-loss.md) 和 [交接](memory/handoffs/01a158b0-guided-writing.md)。Chrome/Edge 为本机桌面版本，Firefox/WebKit 为自动化测试构建；WebKit 不能代替真实 macOS Safari。未接触用户浏览器历史、profile、缓存或原稿。
