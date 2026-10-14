# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

此值描述 WebView 内的 HTML/CSS 界面技术。交付平台是 Windows 桌面 EXE，使用 Wails 承载本地界面；不是浏览器网站，也不采用移动应用视觉语言。

## Stack

delegated: 用户明确授权产品经理自主完成产品、设计、编码及提交。当前选用 Go 1.26.2、Wails 2.15.0、原生 HTML/CSS/JavaScript，无前端构建框架。最终安装包与更新服务仍待实现。

## Users

用户明确要求服务不熟悉公文生成和检查的小白用户。产品经理将首批场景聚焦在办公室人员整理已有正文、复核人员确认问题；这属于实施定位，并非已完成用户调研的结论。

## Product Purpose

让小白用户能最简单的步骤完成公文生成与机检。核心任务是把已有内容整理成可编辑 Word 与固定版式 PDF，并明确指出需要人工确认的问题。

## Operating Context

Windows 办公电脑、本地文件、中文正文、常见 Word 文档。常规任务从导入或粘贴开始，以预览、必要确认和另存结束。设计保留 Windows 文件对话框和键盘操作。

## Capabilities and Constraints

用户明确要求 Go 重写 gongwen-kit、图形界面、可直接安装的 EXE、后台静默更新。当前开发预览能力见 docs/STATUS.md，正式版目标见 docs/PRD.md；两者不可混淆。

本地处理、原件不覆盖、内容变更可撤销、数字不猜改是产品经理已落实的产品约束。公开托管、代码签名证书、字体及渲染组件授权尚未定案。

## Brand Commitments

项目名 Doc2GovPDF；界面暂用“公文整理”。用户明确要求使用 Impeccable，反对依赖模型自行发挥的设计。参考软件是方法依据，不是授权复制其品牌或界面资产。

## Evidence on Hand

docs/UPSTREAM.md 记录上游来源与固定提交。Go 测试覆盖正文检查与保真边界，隔离桌面测试验证实际 Wails 绑定与用户操作。尚无真实用户可用性测评，也无完整版式合规证明。

## Product Principles

1. 专业复杂性由软件承担，用户只处理必要判断。
2. 优先保全内容和原件，再优化效率。
3. 不把未检查说成通过，不把开发预览说成正式成品。
4. 无网络时仍可完成核心工作，更新不得打断编辑。

## Accessibility & Inclusion

产品经理设定：支持键盘操作、Windows 缩放、较小窗口，状态不只依靠颜色。中文正文优先保证可读性；具体实现的验证范围随开发记录维护。
