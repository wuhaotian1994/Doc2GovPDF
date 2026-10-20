# 填写式文档产品方案

2026-10-20，用户明确授权重写，并纠正为“不选文种，面向中国大陆”。

## 产品与参考

首要任务：在办公室使用桌面浏览器，从标题与正文开始写成一份可下载的中文文档。没有账号、国家或文种选择。Word 用于继续编辑，PDF 用于固定版式分享，TXT 用于复制复用；草稿文件保留填写字段以便继续工作。

具体参考（2026-10-20 访问）：

- [GOV.UK Question pages](https://design-system.service.gov.uk/patterns/question-pages/)：每一步只问相关必要信息，选填明示，返回保留答案。
- [GOV.UK Check answers](https://design-system.service.gov.uk/patterns/check-answers/)：下载前核对，可直接回到对应位置修改。
- [Tally multi-step forms](https://tally.so/help/how-to-create-a-multi-step-form)：短表单、渐进展开、可理解的进度。
- [Impeccable](https://github.com/pbakaus/impeccable) 与 [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)：状态、可读性、响应式与键盘检查。Star 数不作为可用性验证，不复制品牌资产。

## 方向合同

- SCOPE：纯网页文档填写，Operate；保留本地处理、原件保护、暂不公开发布。
- WORLD：办公环境的明亮白底表单；冷灰预览画布与克制蓝色操作。界面使用系统中文无衬线，成品使用实际排版字体。
- FIRST VIEWPORT：简洁产品栏、三步进度；左边直接填写标题与收文对象，右边 A4 预览，没有营销横幅或功能卡片墙。
- SIGNATURE：填写后实际 PDF 随之更新；前后步骤保留输入，核对项直接返回相应字段。
- PATH：基本信息 → 正文内容 → 预览导出；Word/PDF 主入口，TXT/草稿次要入口。
- QUALITY：44px 操作区、可见标签与焦点、行内错误、保存失败可恢复、过期预览明确标示、窄屏上下布局、无头浏览器真实下载验证。
- seed：5395dd81；用户要求熟悉的注册式表单且要求自主判断，覆盖随机方向与额外概念选择流程。code-led，不使用图片模拟可操作界面。

## 范围与边界

重写用户流程和前端，复用本地 Go/Wasm 文档排版引擎。旧复杂 Word 编辑与迁移能力保留在独立高级入口。内置字体不等于单位指定字体；不承诺完整国标认证、事实核实或审批通过。没有真实用户研究时，不声称用户完成率或使用时间。
