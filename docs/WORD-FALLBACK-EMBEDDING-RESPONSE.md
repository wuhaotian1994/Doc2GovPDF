# 内置OFL备用Word的真实字体与中文提取

继续原PR5的全文标准P0。修复范围只限生成Word所用的两份固定OFL备用字体；它们仍是草拟降级，不等于仿宋、小标宋等标准类别，也不是所有接收端或全文合规完成。

## 问题与确定机制

旧、新引擎同一备用DOCX字节都是`bffb215e…`，本机Word16生成PDF时正文视觉可读，却提取成横线。实际PDF有11个字形位图/软掩膜，并叠透明CID0000文字，ToUnicode仅把0000映到U+2014；直接产品PDF文字正确。固定DOCX内嵌静态Regular400/Black900字体完整，许可fsType0、cmap和校验正常；接收端实际取用了不同的字体程序。本机只读字体登记证实同名Noto可变面存在，不修改或上传系统字体。

控制组逐个排除：去fontTable引用、单加PRC字符集、单加eastAsia hint、仅改GUID、仅去无效settings都未解除错误；关闭Word位图导出也未解决。仅使用独立嵌入字族虽恢复精确提取且无图像，但逐字形查明中文改用了SimSun，因而拒绝交付。独立字族再加正确PRC charset86才使标题11中文/括号匹配Black900、正文13中文/标点匹配Regular400，全部33非空字形匹配；再加hint无额外收益，未纳入。

缺少charset时默认ISO8859-1及其替代匹配作用见[Microsoft字体字符集说明](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.fontcharset?view=openxml-3.0.1)；[Word固定格式导出参数](https://learn.microsoft.com/en-us/office/vba/api/word.document.exportasfixedformat)解释位图导出的边界。测试按实际字形与字体程序，不把NameFarEast、资源标签或可见文字当正确字族证据。

## 最小产品行为

仅完整SHA已固定的两份内置OFL资源，在生成DOCX的临时owned副本中派生内部家族`Doc2GovPDF Serif SC 3429e`和`… Black`，字体表写PRC charset86，避免接收端同名变量字体碰撞。发行后缀由两源SHA确定，legacy名小于32字符；两面typographic family相同，原Regular/Black样式不变。

只改SFNT名字表和必须重算的head校验。每个其他表、字形、度量、hinting和全部原版权/商标/许可证记录逐字节保留，完整表与全字体校验重算并解析核验。[OFL允许的修改条件](https://openfontlicense.org/how-to-modify-ofl-fonts/)与[名称规则](https://learn.microsoft.com/en-us/typography/opentype/spec/name)分别核对；源资产、注册fontMaps和用户所选字节均不改。未知来源/源SHA不符/重建失败明确停止生成，不通过名称前缀信任字体。

每次导出只为所需面构建一次临时副本并原位混淆，无跨导出字体缓存或额外常驻副本。精确发行家族回导能恢复固定Regular/Black及完整字体需求；任意相似名字不被当作本品备用，自选同名字族仍优先。生成Word仍声明自选字体真实legacy字族而不自动嵌入其文件；原Word保真另存完全绕过新转换。移除非标准`doNotEmbedSystemFonts`；省略标准embedSystemFonts并不要求嵌入系统字体，见[Microsoft说明](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.embedsystemfonts?view=openxml-3.0.1)。

## 本轮实际验收

- 冻结office/webengine全量test与vet通过，独立只读审查未发现确定缺陷；新专项覆盖完整SHA边界、SFNT/许可证、内存所有权、精确alias回导与原Word保护。
- 三浏览器正常字体流程60项、15对30份实际Word/PDF，通过固定OFL逐表来源/许可证/字形、完整SFNT校验和、slot/charset及未选字体不嵌入核验。原Word与备用Word重开均逐字节另存；重新生成PDF的Black未落回Regular。
- 实际Word16打开4来源各1页，备用原生PDF33/33非空字形精确命中源400/900，0图像且文字精确。字形验证器同时拒绝旧baseline、文字正确但中文被替代的样本，以及实际使用的无效Unicode；报告不含全文或逐码点序列。
- 用户给定原卫生包SHA`7dbde2fe…`恢复/保存/刷新/导出精确保留39块3表，原稿未覆盖、无上传。新Word为`4c18c0d6…`；与旧`0103c65e…`逐包比较，只有字体声明、两OFL派生part及移除无效设置改变，文字、表格、字号、间距均未改。隐藏Word7页、所有88个非空段落/单元格字符串精确保留（仅排除每页唯一页码）；小表标题/3行同第4页、长表5–6、回执标题/完整5×6表同第6页。直接PDF7页内容流与旧版逐页一致。
- 官方镇稿正常路径9项/9下载和两个明确19/23日期分支通过；新Word各2页，签发先于标题、独立版记末页上下线可见。来源日期冲突不裁定。含联系人/真实稿件图片只保留本机。
- 最终常驻4173在原PID65964原样切换冻结构建，64个实际HTTP资源及压缩/MIME一致；实际服务Chrome再20项/5对10文件通过，所有DOCX逐字节等于实际Word已审源。真实收集未启用，提交后不重建服务。
- 已查看本轮14张新实际页面：3张字体代表（直接PDF/自选Word/备用Word）、卫生Word全部7页、镇稿Word4页；另看旧对照1页。未靠删文或缩字号凑页。

[去正文证据及SHA](evidence/word-fallback-embedding/verification.json) · [虚构OFL机制稿前后实页](evidence/word-fallback-embedding/word-before-after.png)。图片仅是视觉补证，字体与提取结果由实际资源/CID/轮廓核对。

## 必须保留的未完成项

本机**内置OFL备用Word的中文取用与原生PDF映射**已局部闭合，不再沿用“尚未修复”作为当前状态。用户所选字体的实际接收端替代、其他机器/客户端、字体标准类别及全文标准仍未完成；所选字体示例Word仍可位图化，不把这项修复扩成任意字体承诺。

独立检查发现direct PDF子集cmap format4有奇数declared length，fontTools拒绝；旧、新、重开产物两个cmap字节SHA完全相同，证明是既有兼容问题。Poppler显示、Unicode提取及精确CID→GID字形路径通过，不代表子集字体容器全面有效；该P0单独保留。验证器不删除该表或忽略实际无效Unicode。

最新CEO993c77ad已独立取回并支持单签发人镇稿成品，但新增三部门多人签发条件P0和LibreOffice版记横线P1。它们未由本轮字体修复代为完成；本机Word16可见两线不能证明LibreOffice通过。下一增量优先同一原生材料的多人顺序、两名一行及文号最后同行，再接有界接收端兼容。
