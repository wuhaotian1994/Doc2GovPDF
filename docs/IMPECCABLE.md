# Impeccable 安装与使用

已按用户要求安装到 `.agents/skills/impeccable`。来源为 [pbakaus/impeccable](https://github.com/pbakaus/impeccable)，固定提交 `2f98774f86bc05563876643db37e6c37c322850f`，技能版本 4.5.2，通过 Codex 官方技能安装器安装。

本项目使用其 context、Operate 模式、polish 与 craft-floor 流程；PRODUCT.md 记录产品事实，DESIGN.md 记录实际设计规范。用户已明确授权自主决定并要求不就常规选择进行询问，因此不重复执行技能中的访谈与偏好确认；未验证事实清楚标记。

技能可在下一轮自动识别；本轮通过直接读取安装文件立即应用。首次 context 已成功运行；未安装或信任自动钩子，当前采用手动机械扫描，不能声称自动钩子已启用。

```powershell
./.agents/skills/impeccable/scripts/impeccable.cmd context --target frontend/index.html
./.agents/skills/impeccable/scripts/impeccable.cmd detect --json frontend/index.html frontend/style.css frontend/app.js
```

上下文命令每个会话只运行一次，扫描在 UI 变更完成后运行一次。先保护功能与信息真实性，再修复文字对比度、焦点、输入目标、层级和布局；不以扫描无报错替代实际界面检查。

本轮已实际运行 context 和 detect。首次扫描报告了 4 条对比度提示、3 条边框与阴影叠加提示、1 条彩色阴影警告，以及颜色、字号、圆角、字体的设计规范偏差。已集中提高辅助文字对比度、移除多余标签与符号图标、收敛样式并补全 DESIGN.md；随后通过第二轮布局截图与真实桌面回归验证。未重复运行机械扫描，不宣称扫描结果为零。系统字体、公文专用字体与原生滚动条属于此桌面场景的明确选择。

布局截图在隔离浏览器中使用显式示例数据，存于 `build/qa/`，不等同于原生文件对话框验收。真实 Go 功能另由隔离 Windows/WebView2 实例验证。
