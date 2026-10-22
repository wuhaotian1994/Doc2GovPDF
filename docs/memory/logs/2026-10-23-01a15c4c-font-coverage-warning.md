# 当前稿字体缺字原因与有界提示（独立实施记录）

- 起点owned7c04bfc且status clean；父授权仅pdf.go（含footer）+新warning专项，receipt独占footer专项。服务e9cd不动，不构建浏览器、不提交或操作Word；原件、字体字节、Word导出与RequiredFallbackFonts资源检查不改。
- 前置只读审计证明：公开Go Regular作为缺中文覆盖的机制面登记到仿宋用途，在不改原7dbd生成Model文字的情况下，FontStatus可用、真实family可识别，但setFont同时报缺字及“未取得可用字体”。该机制不是对用户本机ST字体覆盖或准确61458的替代签收。纯本机ignored证据为build/qa/font-coverage-audit/registered-missing-warning.json，未写入文稿正文或字体。
- 当前实现将已读取但缺覆盖与未知/同名歧义原因分开：保留实际family、首缺U+码、至多19rune精确原文窗口（缺字前后各8rune，截断用省略号；不折叠空格或改写原字），说明当前段落或页码整体使用Noto Serif SC备用字体，可改选覆盖原文的字体。没有新增分段字体粒度或全稿认证。
- 提示每次writer实例按原requested字体+resolved面去重，页码范围单独处理，只给首个“例如”上下文；不将重复测量次数当段数、不声称全部定位或总影响数量。未知和同名歧义的原有提示保留。
- 所选与备用均不能覆盖原文时，失败信息改为选择可覆盖原文的字体，不再要求调整原字；错误内有短上下文，原文不变。新增专项同时验证直接setFont和完整RenderPDF错误路径。初次完整路径机制段缺ID触发模型校验，已补合法ID；不是生产回退。
- footer先生成当次实际页码串传给setFont，CellFormat复用同一串；字形校准依据实际w.faceName对应面，避免再次resolve原宋体忽略已发生的回退。RequiredFallbackFonts既有页码资源检查保持。
- 我的font_coverage_warning_test.go 5主组：有界Unicode/空白精确上下文；正文与单元格缺字原因和原Model不变；已覆盖所选面与未知声明；双方缺字保原文字体行动；重复60次测量只首例、不同用途各有例、多次页码仅首例。与receipt页码3专项联合PASS1.104s（本次可选真实DOCX项skip）；注册/别名/未知/歧义/来源与Wordfallback相关局部最终PASS4.289s，office vet PASS。未把机制文字或本次skip冒称真实用户成品验收。
- 最终生产pdf.go SHA256 40e91d15f1c67e945235295cf8df9487a2235dca8feadf4b6caad11376f36f7b；新warning专项 f01e136491a93c8e9bfc4e599d9e51442f813c0a643669a3d9ebf3d14602ff84。父将完成全量、新候选与实际原稿/页面验证；receipt的独立页码轮廓/旧版负例/真实DOCX结果由其单独记录，不在此代签。
