# 页码真实缺字检查与准确回退原因（进行中）

- heartbeat20:30，入口/INDEX/自有交接已读，owned7c04bfc clean、codex分支；shared他人源码不碰。CEO a1b2/mainb0ae未变，PR5开放未合并、评论/评审/行内/Issues空。继续全文标准字体既有P0，可证缺口而非重复已完成widow等停止点。
- 独立只读审计证两点：页码setFont收到空Text但稍后CellFormat绘制真实破折号/数字，资源预检虽准备备用，实际选择不检查这些字；已注册字体缺当前字时又报‘未取得可用字体’，缺字/未读取原因混淆，整段回退没短原文上下文。
- 本机只读STFangsong/KaiTi真实两面，按实际fields/content保守全字符，联合210/卫生420去重字符均0缺字，不能把机制缺口冒称这两稿已发生故障。SimHei/SimSun本机存在，四类完整使用与标题仍需分别实际文件核；未找到真实小标宋文件不以黑体当完成。只读审计font-audit-7c04bfc.json仅hash/计数；Go Regular机制注册仿宋、原7dbd模型不改，已证错误原因叠加（7页保持），不是标准字体业务验收。
- paste独占pdf.go＋warning专项：页码真实字符串/实际面校准、错误原因分离＋首缺U码/限长原文窗口/整段回退事实，不能建议改删事实字符。receipt独占页码机制字体/专项与审查；父当前真实稿基线、最终browser/Word/PDF/页面及交付。不做分字字体系统重写，不增参数页/报告，不上传系统字体或原稿，不提前同步服务。

后续必须把OFL/Go机制字体的缺字反例、真实已覆盖字体的正例和当前实稿回归分开，不能将少数字形或默认备用等同全文国标认证。

## PDF阶段通过后发现原生Word页码真实P0

- pdf40e91＋warning/footer新专项/独立审通过；full31.502/.979及vet过，初始font-coverage-final-web/e620/Wasm06a2冻。旧e9cd normalUI用同原7dbd+宋体A-only合法公开机制配置（6项/2文件）实际7页21个页码encoded glyph均GID0；新e620同源7项/2文件，21个非空实际轮廓均NotoRegular14pt，正文text/geometry hash不变。不是另编稿或真实客户字库已缺字。warning实际展开后原因/U码/首例/页码整体均可见，没错报未取得宋体。
- 初始阶段四原Word各6/4、默认新joint16/4、原卫生2下载、实际本机STFangsong/KaiTi/SimHei/SimSun四角色配置joint24/4均过；四面原字节只读，标题小标宋仍无真实面/明确备用，不能称四角色在joint都有实际文字使用或全文标准完成。
- 对新4map Word7d251df9本轮隐藏Word16实际转换，dash14.04SimSun，但动态PAGE更新digits15.96STFangsong，两页都实证。缓存XML各rPr原已写14SimSun，不当作Word通过。此为真实同官方联合任务新P0，不能只完成PDF交付。
- 派生local原件副本三变量保持document.xml及其它作者part：仅pPr/rPr依旧失败；独立页码样式与只加PAGE MERGEFORMAT均实际2页、6个dash/digit非空轮廓匹配SimSun14.04。选择最小MERGEFORMAT，仅footer1/2字段码改变，默认Normal不动。Word场景的新WinAnsi非符号decimal字体没有ToUnicode属合法路径；verifier初报unsupported是范围边界，已按PDF32000已知WinAnsi数字→Microsoft3,1 cmap严格补解码，不冒称字体损坏或将unsupported算通过。
- Microsoft字段官方说明已核Format field results（更新可能失去结果直接格式，MERGEFORMAT保留）；pPr/rPr单变量被实物否定。receipt独占page_footer.go＋新对应测试待冻结，pdf40e91不再变。之后须新font-coverage-word-final-web重建及当前真实Word/PDF/LO复验；e620是中间阶段不冒当最后。服务4173仍此前已验e9cd，未同步候选。

## 最后LO拦截与共同有效样式

- 43d6/MERGE-only最终浏览器全部过、Word新selected实际14SimSun过，但本轮LO26.8.1.1真实同件digits仍16STF（dash14SimSun）；对照旧无switch同样16，非本次引入，仍须修共同交付。先前‘最小MERGE’决定由此实物替代，43d6不发布/不同步服务。
- style-only原单变量Word与LO均6个真实SimSun14轮廓匹配，因此改局部Doc2GovPDFPageNumber段样式，恢复原PAGE字段，无MERGE/mark，不改Normal。仅新CreateDOCX使用generated helper；source_footer显式规范化仍用原base helper，避免新pStyle悬空引用或擅改旧Word。原件字节保护与旧footer内容编辑保持。receipt新4组专项8.460s并源冻结：pagefooter c8195994/templates f7b05c93/test4386b498；pdf40e91不动。需要新release-web全量/浏览器/两端实物，不把前三阶段旧验证冒充最后。
- 中间35页比较的两个resource hash伪差已证是PDF字典枚举顺序，所有字体program/Unicode/CID/width/图片/form属性值无差。保留初9/2报告、仅补2组8页像素后35全同；utility现仅规范化资源列表顺序，全部绑定仍严格，1pt实际副本偏移负控仍识别changed。此为比较器修正，不放宽产品字形判断。
- 本轮原生Word纯PowerShellhelper已成功产PDF/report但外层误用未设LASTEXITCODE当失败，已用ErrorAction Stop/实物report与SHA确认实际成功；不记产品失败。实际health7页/81格29空白报告已产，但属MERGE中间，不用于最后。

## 真正最终实物验收完成

release eaf4d9ab/Wasmcc18/cache18b034de，Go full39.516/.962和vet通过。当前浏览器/四font/原source配置控制均通过；新Word9adce7bb卫生+当前selected分别新原生Word/LO，18页54footer非空轮廓真源约14（Word14.04/LO14），身体所有char/size/geometry/family对各旧件相同，源81/29、6/7阅读保持。11对35页像素全同/8原件byteexact/3新docx只style3part，12PDF26程序严格过。34当前页27独立像素页全看及旧7footer带看，私图不提交。新service原PID65964同步冻结，当前新styleWord6/4+18glyph+64HTTP过。

header专项最初传4font-map遇TTC未支持（ValueError），改只给其实际要测的ST/Kai两已钉源面，不删错误或冒称集合全支持；25glyph真源过，页码SimSun单独明确TTCface0测过。receiver v4两端各14过。完整response/evidence已写，下一显式stage/commit/push同PR并核评价。
