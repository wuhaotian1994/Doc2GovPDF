# 原生Word接收字体与PDF中文映射P0（进行中）

- 起点同PR5/head1b17f3a，本聊天owned树clean，shared他人修改未碰。最新CEO仍a6079795/mainf9f0c50，PR评论/评审/行内/Issues空；没有新返工，但已有字体P0可推进。4173原PID65964健康，沿用已验b8f8构建不重建。
- 旧新备用DOCX同bffb215e，原生WordPDF可见中文却提取横线。独立解析已证正文图像+SMask11组，透明文本/F1大多CID0000，ToUnicode仅0000→2014；产品directPDF无XObject且中文字码映射精确。不是仅一款提取器误判。
- DOCX解混淆两个字体逐字节为固定静态OFL Regular400/Black900，cmap与许可fsType0正常；实际WordPDF字体程序却含MingLiU-ExtB及NotoExtraLight变量面。只读本机HKLM Fonts确认同名NotoSerifSC-VF.ttf，Name1同NotoSerifSC，Name6ExtraLight，默认wght200，支持接收端同名冲突线索，不冒认为全部字形根因已证。
- 父在仅虚构OFL副本上做baseline/no-font-relationships/PRCcharset/eastAsiaHint/onlyEastAsiaSlot五组隐藏Word对照。子Agent各只读分查字体映射/代码许可；唯一family+自洽SFNT名字的派生OFL副本准备中。生产源码/原assets/原件/系统字体均未修改，不安装或上传字体。
- 已注意当前settings里doNotEmbedSystemFonts并非标准WordprocessingML元素，可独立验证删除，但不能先将它称Unicode根因。后续若需派生OFL内部名，必须与自选字体真实ID1声明区分，不擅改自选字体或原Word。
- 依据：Microsoft Word ExportAsFixedFormat的BitmapMissingFonts默认True会位图化不可嵌入字形；OFL嵌入格式/许可与实际Word取用分别核验。诊断结果、可证伪A/B及必要最小修复完成后续记，不把关闭位图化当完整产品修复。

## 真实对照已收敛

- baseline/no-fontTable/PRCcharset/eastAsiaHint均11个图像且错误横线映射；onlyEastAsiaSlot和BitmapMissingFonts=false均仍失败（后者6图像），仅改GUID4/key或仅移除未知settings同样11图像/失败。初期ElementTree重写诊断副本破坏mc前缀导致Word报损坏，已改原XML字节属性注入；不是产品文件损坏。
- 仅独立OFL字族消除位图且中文可提取，却经实际CID→GID→decomposed glyf发现24中文仍全SimSun400，仅Latin数字源OFL，拒绝将其交付为字体修复。
- 独立OFL字族加fontTable真实PRC charset86后：24中文/标点分别标题11Black900、正文13Regular400，全38含Latin/页码glyph逐个命中原固定OFL，0图像且文本精确。再加eastAsiaHint页面流完全同，故不纳无收益控制。已通过实际FontProgram/字形，不凭NameFarEast或family名字判断。
- 仅控制副本在build/qa/native-word-font-probes及shared tmp，未修改原assets/系统或自选字体。许可无RFN、保留版权/OFL；本机同名Noto可变字体冲突及缺省ANSI字符集是已证机制边界，不能泛推其他机器。
- 进入最小产品实现：paste_release_check独占office/word_fallback_embedding.go、新_test及必要embedded_fonts.go/pdf.go/templates.go/word_font_identity.go/受影响已有test；仅两固定OFL全量SHA可派生，别的字节错误返回而不嵌未知字体。派生内部字族Doc2GovPDF Serif SC 3429e / … Black（legacy31字符内，name16共同Base），name版权/许可及非name/head校验字节保留；生成时owned副本原位混淆，不改注册数据或多份常驻缓存。精确派生名字回导映射原Regular/Black，自选真实字族先于别名，unknown同前缀不能冒认。此时生产尚未冻/构建，不能算交付。
- 父独占scripts/test-writer-font-access.mjs，扩正常fallback Word重开/原件byte保护/实际PDF两项；feedback_backend独占verify-font-access.py、verify-font-word.ps1适配派生字体逐表来源和声明，不放宽自选身份。receipt独占新verify-word-fallback-glyphs.py实际CID字形正负验证。当前尚未刷新4173，仍1b17f3a/b8f8已验资产。

## 跨日续记：2026-10-23实际候选通过

- 后续实际生产与交付详见同会话2026-10-23-word-fallback-delivery日志。生产字形与原稿验收已完成，未把诊断副本当产品产物。
- 当前已读main a21929e / CEO993c77ad更新：单签发镇稿真实DOCX/PDF/JSON已独立取回，原未取回边界被此新证据替代；多人签发P0和LibreOffice版记横线P1新增，未闭合。direct子集cmap兼容问题也有独立CEO工具观察与本机旧新同字节实证，另列后续。
