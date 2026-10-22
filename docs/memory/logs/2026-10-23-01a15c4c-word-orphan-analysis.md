# 原Word回导说明首行孤立：只读机制定位

- 日期：2026-10-23；会话：01a15c4c；独立审查子任务 paste_release_check。
- 源码基线：`c16661c`。本轮不改生产分页、字体、cmap、界面或服务；本记录是下一次 CEO-003/P1 增量的线索，不与当前 cmap/P0 修复合并。

## 准确问题与证据边界

GitHub插件读取 CEO 文件 blob `b36ac8b67e7c5e7a54269539666fb3906f6314cb`：a6f0a1b5镇稿实际Word回导后导出DOCX与输入逐字节一致，SHA `61458cc3aa661c81701139b7b4aa24c6fa3339f053481f4b137f5b83c866a0ef`；回导PDF说明首行在前页、余文在次页，直接PDF原先整段在次页。准确61458原稿本机没有，也没有旧版同一回导链对照。因此不能声称已复现或修好这份稿件，不能归因字体调整；不再索取已确认缺失的其他稿件，不拿另一篇新稿代签。

## 当前代码证据

| 位置 | 可观察事实 |
| --- | --- |
| `internal/office/package.go:163`、`:181`、`:678` | 导入设非空SourceID；经默认样式/继承/直接属性合并后，只投影pageBreakBefore与keepNext等已支持属性，没有读取widowControl或keepLines。 |
| `internal/office/imported_format.go:142` | 合并层会保留上述段落属性；主要缺口在投影到Paragraph，而非原XML整体遗失。 |
| `internal/office/model.go:48` | 模型有PageBreak、BreakOffsets、KeepNext，无WidowControl/KeepLines。原件XML仍可保留，不代表PDF遵循相同分页语义。 |
| `internal/office/pdf.go:232`、`:678`、`:692` | SourceID非空令newDocument=false；至少两行的段首/段尾保护仅对newDocument开启，导入普通段逐行调用room(line)，可以留下首行。 |
| `internal/office/pdf.go:294`、`:309` | keepNext并未全部丢失，但导入链对后段通常只预留1行；不能拿它代替段内孤行控制。 |
| `internal/office/title_layout.go:11` | 源稿直接跳过新稿布局预处理；不宜为了修孤行而把导入稿整体伪装成newDocument。 |

当前PDF源SHA：`dc993b9495a7e52b0a19a303c5b6d1b76680b538f8941807bc0bde1ad9f6174f`；package.go：`b2784e7736059fd24f2c0a9d233d1ca93b0b262f57d474d14439249f01d94faf`。

## 已执行的有界机制诊断

复用 `pdf_test.go:16` 已有四行单元夹具，仅通过Go临时overlay增加对照，不改生产文件、不生成Word/PDF稿件：同内容、字体、字号、行高及页尾仅容1行的状态，只切换newDocument。`TestImportedParagraphFlowDiagnostic`通过，imported=true为前页1行/后页3行；imported=false为前页0行/后页4行。测试本体0.08秒，Go包0.940秒。临时overlay位于本机忽略目录 `D:/Project/Doc2GovPDF/tmp/feedback-ui/`，不是可移植交付物；此处摘要才是提交记录。它证明确定的门控差异，**不是准确61458原稿复验**。

## 默认语义与下一最小方案

Microsoft官方[WidowControl说明](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.widowcontrol?view=openxml-3.0.1)：沿样式链继承，整条链未声明时仍应防止首/尾单行，显式off需尊重。[KeepLines](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.keeplines?view=openxml-3.0.1)则默认不启用，用于尽可能整段同页；[KeepNext](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.keepnext?view=openxml-3.0.1)控制相邻段关系，三者不能混用。

下一增量建议从合并后的有效段属性保留孤行控制（可用三态或等效默认表达）及keepLines；PDF把这两项与SourceID解耦，keepNext预留同时考虑后段最低行数。显式分页/分节仍优先，超一页的长段不能强行整段保留或报超页；不改内容、字号、页边或原Word字节，不根据“核阅说明”等文字猜特殊分页。需覆盖继承与直接开/关、2/3/4行、长段、keepNext链、显式分页、保存旧模型兼容及未编辑Word字节保护。准确61458仍只能保留未核状态；可先验证机制及已有合法原Word回导，不能借此关闭该准确稿的独立验收。
