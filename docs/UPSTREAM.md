# gongwen kit 调研与重写边界

调研日期：2026-10-14。上游仓库：[imhuhe/gongwen-kit](https://github.com/imhuhe/gongwen-kit)。本次通过 GitHub API 核对 main 的提交为 `d8dfe6a24e20ecaa64c14f3a79159813ad92db70`，后续移植以该提交为初始对照基线。

## 已核对事实

上游以 Node.js 工具形式提供公文生成、检查和修复；主要依赖 docx、jszip 与 sax。它支持行文体和条文体，并提供通知、请示、信函、纪要等样张。检查覆盖体例、数字自洽和文风；运行方式以脚本和命令行为主。[README](https://github.com/imhuhe/gongwen-kit/blob/d8dfe6a24e20ecaa64c14f3a79159813ad92db70/README.md)、[依赖声明](https://github.com/imhuhe/gongwen-kit/blob/d8dfe6a24e20ecaa64c14f3a79159813ad92db70/package.json)

修复功能区分格式直接处理、文字修订、疑点批注；数字不自动修改。已记录的限制包括依靠位置识别标题、特殊体式可能被套用通用格式、主题色红头识别不足和批注定位粒度较粗。[修复文档](https://github.com/imhuhe/gongwen-kit/blob/d8dfe6a24e20ecaa64c14f3a79159813ad92db70/docs/%E4%BF%AE%E5%A4%8D.md)

上游字体声明不能保证最终渲染字体，标题字体由用户环境提供；PDF 字体与分页需要在实际渲染后核查。本项目必须将字体检测、预览与 PDF 检查形成完整流程。[字体文档](https://github.com/imhuhe/gongwen-kit/blob/d8dfe6a24e20ecaa64c14f3a79159813ad92db70/docs/%E5%AD%97%E4%BD%93.md)

截至调研日，国家标准官方页面将 GB/T 9704—2012 标为现行。其他文字、数字与表格规则需要逐项核验版本和适用范围，不能把上游全部规则视作对所有公文均适用的强制要求。[国家标准信息](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=F3CC9BEF482524C895FDA7A08BB4A70E)、[上游依据映射](https://github.com/imhuhe/gongwen-kit/blob/d8dfe6a24e20ecaa64c14f3a79159813ad92db70/docs/%E4%BE%9D%E6%8D%AE.md)

## Go 重写策略

继承的是经核验的行为和测试用例。文档模型、规则引擎、修复逻辑、任务调度与更新控制以 Go 实现；UI 的具体技术选型在原型阶段确定。最终用户无需安装 Go、Node.js 或 Python。

按规则建立迁移表，记录上游位置、本项目规则编号、适用条件、风险级别、正反样例与迁移状态。上游的缺陷不作为必须兼容的行为。第一轮重点覆盖正文、标题、表格、发文字号和日期，再扩展特殊格式。

除结构和内容断言外，必须测试 Windows 上实际生成的 DOCX 和 PDF；不能用上游的测试结论替代重写版本的验收。

2026-10-17 完成 1.1.0 对齐：再次通过 `git ls-remote` 确认 HEAD 仍为上述提交；逐项读取生成构件、check-doc、check-num、style-scan、文字修正规则及公开测试。运行未修改的上游 negative.js 和 fix.js，保留其 44 份 DOCX 与 23 对文字标本，再由 Go 实现逐项验证。Go 修复产物额外使用上游脚本接受/拒绝修订并重新检查，且由真实 Word 隐藏打开验证兼容性。详细映射、证据和明确适配见 [对齐记录](UPSTREAM-PARITY.md)。七份原始样例仍保留在 [测试样张](../testdata/upstream/gongwen-kit/README.md)，未修改原件。

## 许可处理

上游许可证为 MIT，版权署名为 `Copyright (c) 2026 HUANGHE`。若移植其代码、规则数据或样张中的受保护内容，在相应分发中保留版权与许可声明。[上游许可证](https://github.com/imhuhe/gongwen-kit/blob/d8dfe6a24e20ecaa64c14f3a79159813ad92db70/LICENSE)

本项目已收录上游测试文档及其 MIT 许可，未将上游源码并入应用实现，自身开源许可证尚未确定。第三方字体、渲染组件和 UI 素材单独记录来源及分发条件；不因上游采用 MIT 就假定它们可随安装包分发。
