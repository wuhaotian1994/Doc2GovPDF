# 接收端多人版头、版记及原稿尾注（进行中）

- 同PR5/ceo-001/codex分支，起点595247c；本轮开读入口/INDEX/自有交接，owned clean。shared他人源码不碰。CEObloba1b2/mainb0ae未变，PR开放未合并，评论/评审/行内/Issues空。4173/PID65964冻结10921健康，不刷新待验源码。
- 用户已有并行授权继续：receipt只读templates/template_elements的LO版位/版记；paste只读原7dbd卫生尾注及导入widow，独占后续model/package/pdf.go候选；feedback独立接收端实际PDF测量脚本；父获取目标运行环境/基线与真实成品验证。尚未改生产。
- 本机无已装LO，Docker当前无daemon；本机WSL Ubuntu20.04可启动但无soffice，不修改该发行版。已从TDF官方稳定26.8.1取WindowsMSI，SHA c6298b10cfa1748bcbedad94c62ce771e240e5021bfd6d7a967cd571b04b5312，与官方sha256及有效TDF Authenticode相符。只静默administrative image提取至shared ignored lo-receiver-26.8.1/admin、独立运行profile，不机器安装/关联。首次MSI forward-slash参数失败1619/2343，改为原生绝对反斜杠和明确引号重试；不是产品或权限审批拒绝。CEO用Dev26.8alpha0，不能称相同环境。
- 已用正常Chrome无本机字体配置（不设fontMap）从同官方scan转写重走三行签发：16项/4实际文件过，build/qa/lo-receiver-baseline/chrome/joint-signers.docx SHA1cd0f19f0adb25935c540c86a47777c18c13c9725922cbebeac726d174de0cee；它才是本轮fallback对照，不能借此前STFangsong/KaiTi/Word16签收LO。准确CEO645eec变体仍非本机文件。
- 原7dbd卫生39块、Word4c18及PDFc523/7页已按页复核；尾注块37单段105字无硬换行，实际6页2行+7页2行，块38来源全7页。不是首行孤行，所以默认widow保护不能直接解决这份原稿；准确61458的单行问题另列，不能混称同因。所有原件/字数/字号不改，未制作等价替代稿。

## 实际接收端基线与单变量诊断

- 官方MSI改原生路径后administrative extraction成功；独立headless运行报告LibreOffice26.8.1.1/bf6ef266，不机器安装；baseline fallback1cd0经正常UI实际导出。LO PDF7ccee4aa为2页，三名字top116.627/145.577/174.527、x457.10/312.55/376.55，确定三行；最后人/文号同基线，版记band无水平线。全真实人名字形各3个匹配DOCX内嵌OFL、16pt，非字体替代导致。sourcePDF/字体/原稿不上传。
- 同一1cd0本轮隐藏Word16实际导出9f7a4844/2页，2+1列正确、版记双线实际可见。新verifier父独立运行：LO10项fail3/unsupported0；同source Word11项pass。并未用旧所选ST/Kai的Word签收LO。
- 三隔离变体全字/字体/size/tab等守恒：signer run snapToGrid off、pPr标准排序、非空版记p承接两边框，LO测量均与原基线三行/缺线相同。已否定这三者作为本稿单独根因，不直接写生产。Word版记有4条rectangle边缘分为上/下两组，verifier按像素与分组核真可见。
- tabs量化确认label到首名恰64pt，LO label4字advance各16共64，光标正等stop，后续tab跳到第二名列。新的单变量仅首行label stop左移17twips(.85pt)，首/次姓名位置、原字、16pt/字体不变，正在同LO/Word实际转换；无frame版记只作定位诊断、不作页底方案。
- 真实尾注方案A已ignored验证：沿原有表末keepNext，短说明实测≤版心1/3时留整段，原105字与90字来源完整同7，回执标题/表头6、最后行及重复表头7，仍7页。不是widow一行问题，也不强制整表同页。已允许paste做这一最小生产候选，通用widow仍另案。

## 最终实际Word拦截与有界补齐

- 第一集成5ac/647d浏览器已过fallback三浏览器48、所选字体Chrome22、镇Chrome9、字体契约20和原卫生实际保存/下载；默认联合Word35731、所选7291、镇8d7b/8189在本轮Word16与LO实际渲染。fallback两端receiver v3各14项过，版头2+1及真字形/14pt页底双线支持。该阶段Word仍4c18。
- 关键交付拦截：原卫生当前Word4c18的本轮真实Word16报告native/word/health-original.json仍note37 Start6 End7，虽然PDF A全7，不能把PDF改善扩大成Word完成。源81格/29空白与原文全保。
- 已补同一既有短tableNote关系的KeepLines；不是通用widow，不强制全表/全稿，也不根据文字猜业务。可选bool、有效Word on/off导入、Word输出和PDF只在整段能入一页时尊重，显式硬分页优先，超长自然跨页。新Word f53393e9相对4c18只有document.xml两处keepLines（41字表注/105字尾注），其余part及原字字号完全相同，原Package.Export仍保护原字节。
- f533本轮已再用隐藏Word16实际导出a5ff88c0/7页，note37 Start7 End7、source38 Start7 End7，回执标题33仍6，81格/29空白全核。最终正常浏览器仍需绑定同f533下载，LO健康新文件待验；第一5ac bundle标为中间验证，不冒充最后源码。
- 最后源码已冻：model3e6920ac、package724c515e、pdf9b6a9d03、templates28eb57f8，receipt coalesce/field top/label保持；final-web正在重建，最后Go office30.929s/webengine.942s与vet通过。当前4173仍旧已验10921，未更新待验资产。

## 最终验收完成，准备同PR交付

- final-web冻结867bd6d0/Wasm238e7717/SW78e133fa；final实际fallback三浏览器48/12、selected22/4、镇9/9、字体机制20/10、两实际Word正常回开/保存刷新各6/4通过。
- Word/LO五真实输入已按最终下载SHA绑定，四份同字节复用本轮原生输出如实记录，卫生f533新原生Word/LO7页；原稿81格29空白/所有段落保持，只有两处keepLines，尾注/来源完整7，标题/表开头6。Word回导PDF6页单列，不等同原生7页。
- v4四多人原生14项、四单签版记专检7项、两回开product14项通过。16产品PDF37程序严格有效；备用33/33轮廓、0images。17PDF53页/50独立像素页已逐页目视（13sheet），未见裁切遮挡。
- 4173原PID65964同步冻结final，不构建；真实Chrome16/4及64HTTP资源过、真实收集未开。fetch main仍b0ae480且已是ancestor，评论/评审/行内/Issues无新反馈，不称CEO已接受。详见RECEIVER-LAYOUT-RESPONSE及去正文evidence。

## 已实际交付

实现bc4cfea6a23489cc7ab45e17a42d77cb1ad3e585已推送原分支，PR5最终正文/标题及附加完成，open/unmerged/mergeable=true。最终head评论/评审/行内/statuses/Actions空，不称CI或CEO已通过。main b0ae已在祖先。常驻服务实际DOCX与已验35731逐字节相同；PDF容器哈希因生成时间不同未逐字节相等，因此拦截“相同字节”声明，进一步核每页内容流/内嵌字体程序/ToUnicode/页框/全部字符及矩阵精确相等。无新原生Word声明。后续只补本条文档，不重建资产。
