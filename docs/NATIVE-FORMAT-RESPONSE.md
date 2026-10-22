# 原生Word空格格式继承与填写稿Word交付

2026-10-22，继续同一 `codex/ceo-004-materials` / PR #5。回应CEO-001/002/004既有可信出品方向、6dfdc6c的高校空格P1和最新1c1fe33的新稿Word重复止点；没有自行合并或公开部署。

## 使用者实际得到什么

学院办公室打开同一官方安全通知原件，直接在附件一“发现隐患、问题”首个空白数据行填写“模拟待核”。新打开的原件使用该空位置声明的宋体11磅，保存、关页重开、恢复包重新导入及Word/PDF仍保留11磅。正文原有1.5倍行距在模型和PDF中保留，空段不会因为没有固定行距而变成零高度；PDF自然行高仍受实际备用字体度量影响，不承诺Word同页同像素。没有把整张原表改成三号，也没有覆盖原件。

旧版恢复工作稿保留当时保存的格式值，不按新解析结果猜改用户选择。新增原生格式版本及旧比较基线，避免把旧读入时隐式参数误当全篇新编辑。本轮旧工作稿中的16磅填字继续为16磅，并明确写入Word新run；其余101段和样式/表格/分节保持原件。它不冒充新打开原件11磅路径。

大体积填写稿的下载解码改成一次定长字节缓冲，移除逐字符临时列表；不删嵌入字体、不缩小稿件、不自动重试下载。新增模块的启动失败恢复已验证。当前本机取得17,066,644字节可编辑Word，全文、原表和实际Word渲染完成。**这不是云端Error 9已定因或已独立修复的声明**：CEO实际云端恢复稿仍未拿到；本机使用的是同公开材料的实施方保存稿，输入与环境边界分开保留。

## 同一原件与前后实证

来源：[河北师范大学公开通知](https://jsc.hebtu.edu.cn/a/2026/07/10/D21574AE585A482097C6BEA4A36D3BFF.html)及其[官方DOCX](https://jsc.hebtu.edu.cn/dynamic/download.jsp?id=8bb130db6e3c4b1da20dc8f4354f25c4)。38431字节，SHA256 `bae60c771f57218b93d2b383d08a26ac025a119b872ca634e01630382a2230b1`，103段、两表、两分节。仅主标题加“（模拟核阅稿）”，表1行4列5 / p43填“模拟待核”，不造人名、日期或签章。

旧版QA资产的两处编辑导出SHA256为 `149891baaefc3b4fa981d97c28314c67dbe3bb85ae62a1389cf6920d4675bd54`，与CEO报告的模拟DOCX哈希相同。本轮并未读取CEO云端文件；字节哈希相同的复现边界明确。新原件不修改时当前稿Word仍逐字节等于原件；修改后仅document.xml变化，其余包成员逐字节保留。除p0/p43外101段XML、表属性/格属性/行属性和分节XML逐项相同。

| 同位置新增字 | 本轮旧版 | 本轮新版 | 证据边界 |
| --- | --- | --- | --- |
| 网页模型 | 仿宋请求16磅、首行11.29mm、固定10.21mm | 宋体请求11磅、首行0、自然单倍 | 新导入按原位置；旧恢复稿保留保存值 |
| 产品实际PDF字形 | 16.00磅 | 11.00磅 | 真正嵌入Noto Serif SC备用，仍非原字体保真 |
| 隐藏Microsoft Word 16.0 | 10.5磅，+Body Asian | 宋体11.0磅、两端对齐、首行0、单倍 | 原空格本机Word也为宋体11磅；当前稿保持源格式 |
| Word渲染PDF | 与接收端实际页一起查看 | 字形约11.04磅、SimSun子集名 | PDF坐标舍入与名义11磅区分，不拿此证明全稿字体 |

新版DOCX SHA256 `f4b67c748cec39361b2a83a24cce38b924177e6169a99f10c30771f8029e2781`。两处修改后的1454非空白字符与Word COM正文SHA绑定；未改原件1443字符。新旧直接PDF及Word各为5页，前三页纵向、末两页横向；换行、留白和签名页位置仍有差别，不能把相同页数写成版式保真。正文1.5倍初稿被忽略造成密排，已通过逐页观察发现并修正，中间4页稿不是本轮交付证据。

## 具体实现与验证

读取docDefaults、真实default段落样式ID、basedOn的相关属性、字符样式/直接属性、可解析的东亚主题面；空段落不把标记格式套到已有文字，而在无run时取作插入格式。导出为新run显式写字体、字号和支持的字形属性，保留段落原属性及扩展命名空间。原件未声明可解析中文字体或字号时明确标未核，应用草拟基值不冒称国标；旧上游样张“未声明也默认三号仿宋”的测试假设已纠正，同时保留原样字节、文字不丢及完整声明合规输入不修订的保证。

格式语义参考：[段落标记属性](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.paragraphmarkrunproperties?view=openxml-3.0.1)、[文档默认属性](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.docdefaults?view=openxml-3.0.1)。标记不是新run自动继承的魔法；本产品明确选择并写入受支持的插入属性。

- Go 1.26.2 Windows/amd64全量 `go test ./...`、`go vet ./...`通过；新增7组，覆盖非w前缀、默认/继承/直接覆盖、空段/已有文字分开、修订、新字号、扩展属性、主题、未知默认、1.5倍往返和旧保存稿不全篇改写。
- Chrome155、Firefox157、WebKit27.2，各7项，共21；原模块失败/早输入等启动恢复33项通过。Node24.14.1解码7个大小及非法输入共8项，包含实际大Word大小。全部是实施者知情任务，不是盲测、真实IME或跨设备认证。
- 三浏览器12组Word/PDF及3份恢复Word、旧版2组Word/PDF及恢复Word，共32份格式文件；直接PDF64页文字/纸幅检查。5个隐藏Word代表绑定实际源SHA及COM正文SHA，共23页Word渲染；与当前/旧直接PDF一起查看46个真实页面。[机器核验](evidence/native-format/verified.json)、[Word接收端](evidence/native-format/word-native.json)、[实际字形及字体资源](evidence/native-format/native-rendered-fonts.json)、[全页图索引](evidence/native-format/pages.json)。
- 同一实际17MB Word的两独立Node V8进程解码，输出SHA一致，观测最大RSS约643→120MiB、此一次解码约1506→79ms；是本机V8分配对照，不是浏览器峰值、产品性能承诺或云端崩溃归因。[原始对照](evidence/native-format/byte-allocation.json)。
- 实际4173服务保持原隐藏PID65964，将验收资产原样复制，没有提交后重建另一份Wasm。服务另7项完成、五份Word字节与已看代表相同，四份PDF的纸幅/解压内容流/嵌入字体字节一致；HTTP模块和浏览器实际加载Wasm哈希绑定。[服务结果](evidence/native-format/service-verified.json)、[源码/资产指纹](evidence/native-format/fingerprints.json)。

## 仍需继续的事

本机主动字体读取授权、真实面/TTC/字形覆盖、嵌入许可与用途及全文标准状态仍是P0。未完整支持条件表样式、复杂样式开关、混合文字run、自动行距/网格的Word精确度量与全部主题语言链；保留原件不等于规范化通过。相同纸张/边距/网格及PDF核对重复、同格两次替换的撤销会话、低负担建议交互仍沿CEO-001队列，不因本次两处文字成功而关单。新稿Error9需CEO同稿同环境重新实际取得Word，或提供可验证的崩溃条件/恢复稿后继续，不能用本机成功代签收。完整反馈闭环仍未部署接收或上传。

代表全页图：[01](evidence/native-format/group-01.png) · [02](evidence/native-format/group-02.png) · [03](evidence/native-format/group-03.png) · [04](evidence/native-format/group-04.png) · [05](evidence/native-format/group-05.png) · [06](evidence/native-format/group-06.png) · [07](evidence/native-format/group-07.png) · [08](evidence/native-format/group-08.png) · [09](evidence/native-format/group-09.png) · [10](evidence/native-format/group-10.png) · [11](evidence/native-format/group-11.png) · [12](evidence/native-format/group-12.png)。
