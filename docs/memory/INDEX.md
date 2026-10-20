# 项目记忆索引

最近整理：2026-10-20。入口约定见 [AGENTS.md](../../AGENTS.md)；记录方法见 [README](README.md)。

## 按问题找资料

| 遇到的问题 | 先读 |
| --- | --- |
| 当前是网页还是 EXE？为什么不上传文稿？ | [产品与架构](topics/product-and-architecture.md) |
| 能否换 UI、恢复报告中心或公开发布？ | [长期约定](../../AGENTS.md#已确认的长期约定) |
| 哪些测试算通过，Word/PDF 如何验收？ | [验证与故障经验](topics/verification-and-pitfalls.md) |
| 为何 Word 提示修复、中文 PDF 解析异常？ | [文档兼容经验](topics/verification-and-pitfalls.md#文档引擎) |
| 草稿覆盖、Worker 取消、浏览器恢复问题？ | [网页恢复经验](topics/verification-and-pitfalls.md#浏览器与存储) |
| 完整网页移植还剩什么？ | [当前交接](handoffs/01a13839-web-port.md) |

## 当前进行中的任务

- **网页完整移植**：`01a13839` 会话负责。设计已获得用户认可；完整流程及恢复专项已有验证，最新追加改动与最终交付尚待收尾。以 [交接文件](handoffs/01a13839-web-port.md) 和 Git 工作区为准。
- **项目记忆机制**：本次建立入口、规范、回溯日志和议题索引；不是所有其他会话都已完成补录。

## 时间线入口

- [2026-10-20 回溯整理：从桌面版到网页完整移植](logs/2026-10-20-01a13839-project-history.md)：涵盖 10 月 14 日起可核实的主要事件，未伪造逐分钟历史。

## 已有证据文档

- [最初需求与后续形态变更](../PRD.md)
- [设计参考与演变](../UX-REFERENCE.md)
- [桌面 1.1.0 上游能力对照](../UPSTREAM-PARITY.md)
- [桌面 1.1.0 逐页验收](../LAYOUT-AUDIT-1.1.0.md)
- [网页 2.0.0 初次交付与边界](../WEB-2.0.md)
- [历次验收记录](../STATUS.md)

这些文档的历史版本号必须保留；不能把“桌面版已验证”直接解释成“最新版网页已验证”。
