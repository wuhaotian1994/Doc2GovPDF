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


## 后续有界实施：用户原39块三表的表后短说明（595247c基线）

本段更新的是另一份本机有准确源的卫生稿，不代签上述61458镇稿。JSON原件SHA `7dbde2fe81d11c526d8fb73ab143f572e3481500575fb9c0b87b126b9e37972c`，39块、三表3×2/9×5/5×6；当前已验Word为 `4c18c0d6740f536099ac4ec745d9fba865d063018df98520911b3727a01f29a1`，直接PDF基线为 `c523232836ce40249b8f111e70f0292e9e066fa5c4346b1251b36826e89a949f`。

- 实际查看原直接PDF第6、7页：第37号零基块为105字、无手动换行的表后说明，前页2行/后页2行；最后90字来源说明在7。它不是首行孤立，不能声称只修默认widow即可解决。该段Word无keepLines/widowControl/keepNext声明。
- 另行打开同一4c18原Word：Open自动以原字节SHA建立SourceID，ImportedFormatVersion=1，说明投影为body/16pt/10.2129mm行高，无显式分页或keepNext；未编辑Export逐字节保持。本机固定OFL几何的回导PDF为6页，完整说明和来源均在6，已查看该页；没有复现61458的首行孤立，不把不同来源或链路混成同一实例。
- 正常新稿链已通过现有fieldsForEngine、applySignature、applyBodyContent重建原模型：相对c523，7页全部字符文字、坐标和字号逐项相同。编译模型沿用既有writer-content-ID投影，原JSON和内容未重录。局部实验不是另编业务样本。

父代理批准方案A后，仅修改pdf.go的tableFollowingHeight：现有表末行keepNext关系已明确存在时，若后段实测总高度不超过当前版心1/3、且无段内显式分页，则预留完整短段；长段继续仅保留原起首、显式分页/分节/锚定及导入路径守卫保持。没有新增文字关键词推断、全稿keepLines、强制全表同页或通用widow投影，未改model.go/package.go。

实际原稿结果仍7页：回执标题、单位、前置说明和表开头在6；末数据行随短说明移到7并重复表头，105字说明及90字来源均完整在7。3×2核对表仍4，长流程表仍5–6，全部原段及81格原值/29空白保持；第6页不再留下说明开头。末行随说明跨页是正常表跨页取舍，不再以整张5×6表必须同6页为目标。原105字、字号、边距及来源均未删改。

在当前模板下重新生成此新稿Word仍为4c18逐字节一致；同一原Word未编辑Export也逐字节一致。tableFollowingHeight被新稿compact测量复用，这个原稿的Word不变证据不能扩大成任意新稿Word一概不变；后续联合接收端改动也须独立归属。

验证：7项新Go专项，涵盖明确关系与实测高度、无关系不猜文字、长段实际跨页、显式段内分页、导入守卫、末行/重复表头/完整说明及准确原稿。office/webengine全量测试30.813/0.920秒及vet通过，真实原稿专项已通过环境变量启用而非skip。生产A第6、7页与已目视局部overlay逐像素相同。临时测试曾暴露夹具漏合法cell-ID与既有writer-content前缀假设，均只修测试断言，未据此扩大生产改动。

冻结源SHA：pdf.go `452446cd9bcf5a54c63f2dc85b2c1009e9fa9449d1121fb644e2c078a4dfe7ee`；table_following_whole_note_test.go `f18f3579a4dd505cdba71e2e7b5837554ac0a8f3952ca02e555cfa57a7f2d0ea`。本机证据在忽略目录build/qa/word-orphan-health-baseline/{reconstruction.local.json,layout-variants.local.json,diagnostic.local.json}及build/qa/word-orphan-health-actual/{verification.local.json,visual-binding.local.json}；原稿、编译模型与页面图不提交。

尚未做本轮联合候选的正常浏览器/真实接收端验收，由父代理进行。准确61458、通用widowControl/keepLines投影、LO版记/多人版位与全文标准仍按各自证据状态开放。本子任务没有构建网页、操作浏览器/服务、提交/推送或覆盖原件。


## 原生 Word 实测后的有界补齐（KeepLines）

- 父随后用最终集成健康 Word（仍 4c18）在隐藏 Word16 原生导出，实际尾注仍 StartPage6/EndPage7。故上一节直接 PDF A 的页组不能代表 Word 已完成；“新生成 Word 仍等于4c18”是该阶段观察，现由此增量替代。
- 新增可选 Paragraph.keepLines，原 Word 通过现有有效样式合并读取 on/off；没有引入 widow 默认、UI参数或全稿 keepLines。正常新稿的 prepareNewLayout 已有深克隆内，沿现有表末 keepNext 关系，仅无显式分页/节边界且按真实字号/列宽测量完整段高≤版心1/3的说明置 true；不把整个大表强制一页。
- paragraphXML 对 true 输出 keepLines；PDF 只对可以装下一页的显式 keepLines 预留整段，先处理硬分页，超一页长段仍可自然分；没有扩通用 widow 或猜测说明文字。
- 专项4主组（含7项关系门控、6种有效on/off、3种导入PDF短/长/硬分页和真实源比较）PASS2.743s；受影响 TableFollowingWhole / TableNoteKeepLines / BasicImprint / BothBorders / JointSigners 局部回归 PASS9.303s。实际源39块/3表内容保留，直接PDF仍标题6、完整尾注与来源7。未执行新的全量、浏览器/服务或原生Word进程。
- 实际新 Word ignored `build/qa/word-orphan-health-actual/original-A.docx` SHA256=f53393e97c5be20febaf04ae8336b82f0dbaea12a27be179c769d473777f7ee8。对4c18逐ZIP part比较，唯一变化是 document.xml 的2个 `<w:keepLines/>`：engine块28的41字表后短说明及engine块39的105字尾注（原始raw块37）。去除此两标签后XML逐字节一致，其余part全相同；字号、内容、表格无变化。原Word未修改Export仍byte exact，输入Model前后JSON完全相同。
- 新生产冻结：model.go 3e6920ac49d2fbabf0cf07fa1bc660718929445c9e612995214e1f1883265ee9；package.go 724c515e72be9cc126ad9c296604cd4f2b47acfbe0b6375e641ecc091a49e9b2；pdf.go 9b6a9d03fd6f98dad36fa2d3aa1dd47051588c7ee943c649e8d6ca3ea152e449；templates.go 28eb57f842ec863716f4a26d7afd3fd0077bac35a2261dc7f9b6b92ced6f3967；新table_note_keep_lines_test.go f7c9e37d5353c565f4447f5e9555dc070d4824efccdfb209e8b8d12e797cb422。templates仅在keepNext附近增keepLines输出，receipt冻结coalesce代码未变。
- 待父用新f533 Word实际接收端确认完整尾注页位，并重建正常browser联合验收；在此之前不称原生Word尾注已完成，更不以7dbd代签不在本机的准确61458。

## 父最终补验（替代上节待验状态）

最终f533与正常浏览器下载逐字节绑定；真实Word16与LO26.8.1.1各7页，完整尾注与来源均第7页，标题与表开头6。最终源码full test/vet、正常save/reload及所有53页/50独立页已目视；Word回导PDF6页单列、不外推准确61458。详见RECEIVER-LAYOUT-RESPONSE与去正文evidence，交付状态由自有交接/checkpoint维护。
