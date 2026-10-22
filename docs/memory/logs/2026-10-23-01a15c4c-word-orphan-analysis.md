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


## 有效 widowControl 与导入稿孤行窗口（21c4d55 后续候选）

- 父授权接续准确61458仍不在本机的有界实现，owned起点21c4d55且status clean；不改服务冻结238e、不构建浏览器、不提交。父负责当前准确镇稿/联合/卫生Word的正常回导和完整集成验证，本节不是准确61458通过声明。
- primary语义：https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.widowcontrol?view=openxml-3.0.1 ：属性沿样式继承，整个层级无声明仍默认防首/尾单行；显式off需保留。这与keepLines/keepNext缺省关闭不同。
- Paragraph新增可选三态 `*bool widowControl`：nil保留默认且不新增WordXML，非nil显式on/off。package从现有已合并docDefaults/defaultStyle/basedOn/direct的pp投影；legacy重设旧模板格式时继续保留同一个有效孤行状态。原WordExport路径未修改，5种样式状态均在native/legacy路径验证未改原件byte exact，旧JSON缺字段仍默认ON且序列化不伪造新字段。
- PDF仅将段首2行（3行可容则整3）和段尾2行窗口与SourceID解耦，仍保持导入稿身份。没有改newDocument控制的空间抑制、标题平衡、表格/版心/字号/内容逻辑。显式off可1+3或3+1；默认4行允许2+2，不泛化为整段keepLines。
- KeepLines仍为整段可装一页才保留；作者BreakOffsets先拆并强制分页，每段保留on/off，节边界断keep链。原导入KeepNext无条件room整条超页链会报错，现仅可装下一页时预留，超页文字正常流动；2/3行窗口也仅在可满足容量内施加，不因窗口本身超页拒绝原文。
- 普通换行仍属于同一段：既有分段递归会把4软行/余2行空间排为1+3。新增私有paragraphFlow传递剩余视觉行数和是否续段，使头/尾窗口跨软换行累计；非末part不再伪造与下一段的KeepNext。counts与实际绘制共用原有16pt+11.29/charSpacing首行网格缩进计算，center/right归零，无绘制尺寸改变。
- 新 `widow_control_test.go` 6主组，覆盖默认旧JSON/显式JSONXML、5种样式继承×native与legacy字节保护、8种2/3/4行实际PDF分法、超页KeepNext/KeepLines/合法40mm容量/中文UTF8硬分页/分节、4种普通换行及左/中/右网格窗口。专项最终PASS1.543s；受影响Native/表注/签发/版记局部回归最终PASS6.423s；office vet PASS。初次测试把实际28字行宽误写27、短页小于模型40mm下限，已校正测试输入与断言；非生产回退。没有用这些机制稿代签用户准确文件。
- 最终生产候选冻结：model.go 6e08215c88349065380440cee1892e04f1faf0300858abfb9e35b6d87e61356c；package.go 4d928e0f5d5768988429248362daaac5ab9286842600ff0f2376c3d8f7c81876；pdf.go fae3a4451ab268732998d057d1aa25293a8178ae704758c91daf5580b966738b；templates.go 93e87f9c5afa729858ac5b0d8ed56ed6c190820bb69a998b47c757c4b4b06e5c；新test 47b81dca30f8ea68066ed117fe15c7bc56e1d64e225333ca01e1b4589745ac14。独立审查及父全量/准确原Word实物仍待最终汇总。


### 独立审查拦截与最终共享尾预算

- 上述 fae3a445/47b81dca 候选不是最终交付。receipt用独立ignored overlay发现确定遗漏：25个单字普通换行组成同一段、默认widowON且KeepNext=true、前页余3行、后跟1行NEXT，实测分为[3,21,1]，最后1行随NEXT到第3页，仍违反本段尾2行。父已将对应完整测试/中间5dc363构建标为审查拦截中间，不刷新用户服务或冒称通过。
- 等父中间构建/测试完成后，新增私有共享flowTail预算：原段After+following预算跨全部软换行传递，在原段剩2行窗口一次消费；continued末part不再独立room“末part+1行”，末1不能二次预算。显式widowOFF只在本段末1行处理KeepNext，不把OFF重新开启；整尾预算超过一页则有界放弃关系，不产生超页错误或静默截字。硬分页入口重置，不能跨作者break。
- 新7主组专项PASS1.599s；同例default和After6实际[3,20,2]、NEXT同末页；OFF仍[3,21,1]；不可满足超大following链[3,22]且完整流动。最终受影响局部回归PASS6.669s、office vet PASS。
- receipt在相同独立overlay上复验得到[3,20,2]，并只读复核共享预算、末part不二次room、共用精确indent、硬分页优先、有界超页及三态继承，未发现剩余确定缺陷；未改实现源或重跑全量。
- 最终替代SHA：pdf.go 2745f8a5b6b2fb68c3ef2c5f5fda88fff107fb51ac174e95005f74f2baf9f7be；widow_control_test.go fa8a306f4a0918fe6313ff45b362c01a8a3785b884575ba6205459250bc15291；model/package/templates沿上节SHA不变。父将以此冻结源重跑完整测试并在新 `word-widow-final-web` 候选构建/准确原件验证，旧中间目录不作最终证据。
