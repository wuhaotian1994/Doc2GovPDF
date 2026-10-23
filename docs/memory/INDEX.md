# 项目记忆索引

最近整理：2026-10-22。入口约定见 [AGENTS.md](../../AGENTS.md)；记录方法见 [README](README.md)。

## 按问题找资料

| 遇到的问题 | 先读 |
| --- | --- |
| 默认字库为何无需用户配置、部署授权包放哪里？ | [系统字库与部署](../SYSTEM-FONTS.md) |
| 欢迎页与字体配置的历史改动如何追踪？ | [本轮交接](handoffs/01a1669f-line-paste.md)、[生成图提示词](../design/welcome-image-prompt.txt) |
| 文章首页、逐行默认识别和日期标记如何使用？ | [最新首页交接](handoffs/01a1669f-line-paste.md) |
| 整篇粘贴为何先给可编辑稿，署名日期疑点如何原位处理？ | [暂排主链与实际交付](../DRAFT-FIRST-PASTE-RESPONSE.md) |
| 完整反馈/PostgreSQL是否开工、下一关口和估时？ | [实施排期与实际状态](../FEEDBACK-IMPLEMENTATION-PLAN.md) |
| 有意留白回执怎样按表判断并保存，变化时为何重核？ | [空白范围决定与实物](../TABLE-BLANK-RANGE-RESPONSE.md) |
| 怎样主动读取本机字体，辨别真实身份与选择集合第二面？ | [本机字体入口/实物/未完成边界](../FONT-ACCESS-RESPONSE.md) |
| 正文为何改成连续文稿，插表续写及原Word边界怎样验收？ | [连续文稿任务与实际交付](../CONTINUOUS-WRITING-RESPONSE.md) |
| 原Word空格为何Word/PDF字号不一，旧工作稿怎样兼容，大Word下载如何核对？ | [原生格式与实际交付](../NATIVE-FORMAT-RESPONSE.md) |
| 实际附件怎样与附注区分、另面并核对说明，选择为何保留或失效？ | [附件身份与真实文件](../ANNEX-STRUCTURE-RESPONSE.md)、[标准覆盖合同](../STANDARDS-COVERAGE.md) |
| 新稿与原生Word怎样在同一工作区完成，旧任务如何承接？ | [统一Word工作区与原文件流转](../UNIFIED-WORD-RESPONSE.md) |
| 节标题孤立在页末、短尾行和明显留白如何改善？ | [CEO-003 跨页连续阅读与前后页组](../CEO-003-READABILITY-RESPONSE.md) |
| 整篇整理后回执在落款日期之后，如何直接变成表格并继续编辑？ | [落款后连续编辑与结构输入修复](../POSTSCRIPT-WORKSPACE-RESPONSE.md) |
| 正常页怎样直接加表格、调整段落，短窗口操作和预览异常如何恢复？ | [同稿工作区回应与验收](../INLINE-WORKSPACE-RESPONSE.md) |
| 国标为何贯穿全文，字体与实际导出怎样判断符合？ | [全文国标产品约束（最新原则）](../STANDARDS-PRODUCT.md) |
| CEO 当前关注哪些产品问题、优先级和完成结果？ | [CEO 产品议题](../CEO-QUESTIONS.md) |
| 内容提醒如何准确定位，修改后何时保留确认？ | [CEO-001 实施与验收](../CEO-001-RESPONSE.md)、[产品经理交接](handoffs/01a15c4c-ceo-pm.md) |
| 写到一半需要添加表格，怎样保留已有内容继续？ | [CEO-002 路径与验收](../CEO-002-RESPONSE.md)、[教育通知与空白回执](../CEO-002-EDUCATION-RESPONSE.md) |
| 长条款被当成标题、复制空格影响标题识别怎么办？ | [CEO-003 源文、识别及真实页面](../CEO-003-RESPONSE.md) |
| 印发通知后还有一份完整措施，如何保留两层关系？ | [复合文稿现有出口](../CEO-003-COMPOSITE-RESPONSE.md) |
| 已有整篇文字怎样整理，原文与未采用材料如何恢复？ | [CEO-004 完整材料路径与验收](../CEO-004-RESPONSE.md)、[落款后附注](../CEO-004-POSTSCRIPT-RESPONSE.md) |
| 说明性前言为何不是收文对象，复制空行怎样主动整理？ | [医院通知完整页组](../CEO-004-HOSPITAL-RESPONSE.md) |
| 预览为何等待、文号提示何时出现，实测和判断如何复用？ | [CEO-005/006 响应及即时帮助](../CEO-005-006-RESPONSE.md) |
| 保存刷新或重开后，已核对的判断是否仍适用？ | [同稿判断恢复](../CEO-001-006-REVIEW-RECOVERY.md) |
| 如何让用户表达使用需求，同时明确上传、脱敏、回执与删除？ | [反馈产品方案（待实现）](../FEEDBACK-PRODUCT.md) |
| 当前是网页还是 EXE？为什么不上传文稿？ | [产品与架构](topics/product-and-architecture.md) |
| 能否换 UI、恢复报告中心或公开发布？ | [长期约定](../../AGENTS.md#已确认的长期约定) |
| 哪些测试算通过，Word/PDF 如何验收？ | [验证与故障经验](topics/verification-and-pitfalls.md) |
| 为何 Word 提示修复、中文 PDF 解析异常？ | [文档兼容经验](topics/verification-and-pitfalls.md#文档引擎) |
| 草稿覆盖、Worker 取消、浏览器恢复问题？ | [网页恢复经验](topics/verification-and-pitfalls.md#浏览器与存储) |
| 完整网页移植还剩什么？ | [当前交接](handoffs/01a13839-web-port.md) |
| 为什么不选文种、改为填写式首页？ | [填写式重写](handoffs/01a158b0-guided-writing.md)、[产品方案](../GUIDED-WRITING.md) |
| 常用信息、旧稿保护、浏览器和手机验证到哪一步？ | [经常使用与跨浏览器验收](../RETURNING-USERS-QA.md) |
| 为什么点下一步会清空，启动异常如何保护输入？ | [启动保护](../STARTUP-PROTECTION.md)、[10月21日故障日志](logs/2026-10-21-01a158b0-startup-loss.md) |
| 测试通过却预览失败、保存刷新打不开？ | [首次填写与真实服务验收](../FIRST-USE-DELIVERY-QA.md) |
| 已拆分字库仍需约12秒，如何优先授权本机字体？ | [首次字体选择与二进制提速](logs/2026-10-22-01a16258-local-font-first.md) |
| 为什么首次要下载 19 MB，怎样复用本机字体和按需字库？ | [性能修复与实物验证](logs/2026-10-22-01a16258-startup-performance.md) |
| 用户授权的阿里云部署、HTTPS 和 Workbench 连接如何继续？ | [ECS 部署交接](handoffs/01a16258-ecs-deployment.md)、[连接交接](handoffs/01a16258-workbench-connection.md) |

## 当前进行中的任务

- **填写式重写**：`01a158b0` 会话负责，用户 2026-10-20 明确授权替代旧首页；面向中国大陆、不选文种，三步填写与真实预览。最新状态见 [交接](handoffs/01a158b0-guided-writing.md)。
- **网页完整移植**：`01a13839` 会话负责，旧设计认可已被本轮重写要求替代；复杂编辑能力保留在高级入口。其尚未提交工作仍归原会话，以 [交接文件](handoffs/01a13839-web-port.md) 和 Git 工作区为准。
- **项目记忆机制**：本次建立入口、规范、回溯日志和议题索引；不是所有其他会话都已完成补录。

## 时间线入口

- [2026-10-21 用户发现下一步清空](logs/2026-10-21-01a158b0-startup-loss.md)：旧测试盲区、真实故障复现、启动前防提交和应急恢复保护。

- [2026-10-20 回溯整理：从桌面版到网页完整移植](logs/2026-10-20-01a13839-project-history.md)：涵盖 10 月 14 日起可核实的主要事件，未伪造逐分钟历史。
- [2026-10-20 填写式文档重写](logs/2026-10-20-01a158b0-guided-writing.md)：用户新要求、参考依据、修改归属与验证。

## 已有证据文档

- [最初需求与后续形态变更](../PRD.md)
- [设计参考与演变](../UX-REFERENCE.md)
- [桌面 1.1.0 上游能力对照](../UPSTREAM-PARITY.md)
- [桌面 1.1.0 逐页验收](../LAYOUT-AUDIT-1.1.0.md)
- [网页 2.0.0 初次交付与边界](../WEB-2.0.md)
- [历次验收记录](../STATUS.md)

这些文档的历史版本号必须保留；不能把“桌面版已验证”直接解释成“最新版网页已验证”。

- [用户原始卫生通知分页复现](../HEALTH-OFFICE-ORIGINAL-RESPONSE.md)：同一39块三表保存稿、真实Word/PDF、仅keepNext变化及分页边界。

- [字体内存与失败恢复](../FONT-MEMORY-RECOVERY-RESPONSE.md)：降低确定副本占用、原稿故障注入恢复，415字云端Error9仍待精确复验。
- [主动反馈本地闭环](../FEEDBACK-CLOSED-LOOP-RESPONSE.md)：真实PG/私密回执/本地证据/处理与删除，真实收集未开启。
