# 历史规范化Word工作稿的页码接收验证

### E01 · 2026-10-23 · 同一原卫生稿复现继承字号

- 类型：验证 / 修复中；起点c1a771f2，仍同PR5和ceo-001独立树。shared他人修改不触碰。
- 上轮只读审查确认当前首页不能新点“统一格式”，但历史工作稿可保留layoutNormalized=true并正常恢复导出，不能把旧源规范化分支称为完全不可达。本轮远端CEO a1b2/main b0ae、PR head均未变，无新评论/评审/行内/Issues/远端检查。
- 使用已绑定用户原7dbd卫生稿的f53393e97c5be20febaf04ae8336b82f0dbaea12a27be179c769d473777f7ee8真实Word，经Open→既有NormalizeLayout→Export生成独立副本，不新编正文、不覆盖原件。源模型与全部文字、3表81格29空白、单元格矩阵SHA保持，字号变化0。规范化模型另存仅doc/rels/types和2新页脚改变，没有新增样式。
- 当前cc18冻结构建经正常“打开文档”恢复该便携工作稿，下载原件、导出两对Word/PDF、保存刷新和恢复包共8项/6文件通过；Word导出字节等于9999d64384a4bc878092fb15f1e1e45891c59c3cca08d1488a0be93a0b7ba76b规范化副本。因此当前可达证据包含正常UI恢复，不仅Go调用。
- 同一副本实际隐藏Microsoft Word16与独立profile LibreOffice26.8.1.1均7页。Word数字约15.96pt、LO16pt，横线14pt。LO实际数字还使用正文派生Regular，证明run缓存14不能代替接收端结果。Word实核81格29空白。原件/字体/全部成品只在ignored本机目录，报告不提交正文。
- 本机证据：build/qa/source-normalization-footer-repro/{source-normalization.json,browser/report.json,word/render.json,word/footer-measurements.json,lo/footer-measurements.json}。这些是本轮实际文件，未拿前轮新稿验证冒充该路径。

### E02 · 2026-10-23 · 修复范围与修改归属

- /root/receipt_pagination负责源规范化replacement及必要Go专项；父负责正常恢复浏览器脚本、原生接收端复验、文档和交付；/root/feedback_backend只读独立方案审查。所有改动在本聊天owned树。
- 仅在显式规范化现有判定确实创建replacement页脚时追加冲突安全局部14pt段样式；保留PAGE动态域，既有styles/default/Normal不得覆盖。缺styles/关系/ID/类型声明按实际结构处理，不能给任意原正文偷偷启用孤立styles或补同名定义。
- 原件普通回存/正文编辑、新生成Word路径保持。good()粗判与一好一坏整节替换是既有边界，不借本轮广改任意自定义页脚；已经保存的raw页脚被good接受时也不自动升级，不称全部历史Word修复。没有增加旧统一格式UI。
- 状态：正在实现；尚未声称最终接收端通过、服务更新或PR新增交付。4173仍原PID65964、cc18，未重建服务资产。

### E03 · 2026-10-23 · 独立元数据反例拦下中间实现

- 初始replacement方案定向12主组/15子例8.468s及office/webengine全量38.936s/0.935s、vet通过。但独立paste_release_check追加overlay实际确认两个边界：样式关系目标别名settings.xml会被后续settings覆盖；仅前缀OPC关系/类型根下新建未限定元素失去namespace。测试先过不代表这些路径正确。
- 已交receipt最小修复：拒绝会覆盖的样式目标别名，新增OPC元数据跟随根namespace/prefix，增加对应测试；不扩改所有settings或任意源页脚。中间候选5719c494仅同稿常见路径，不冒充修复后最终构建；修复后须重新冻结/全量，原生输出仅在最终DOCX确实同字节时可绑定复用并说明。
- 父新增scripts/test-normalized-word-restore.mjs只接收调用者原件/实际规范化模型和期望输出，正常UI恢复、保存刷新、原件下载和恢复包逐字段比较，无内置行业样本，不上传。baseline8项/6文件已实际通过。

### E04 · 2026-10-23 · 最终冻结、真实回归和服务更新

- source_footer最终1f1d5ac3/page0be5，pdf40e91/templatef7b未改。设置元素及val属性默认/前缀测试补齐；最终15主组19子例8.497s，office/webengine全量38.794s/0.932s及vet，独立三overlay0.875s通过。此前两轮full不能替代这次最终结果。
- 最终准确f533重生成仍5719；同已实际Word/LO输入原字节，故明确绑定复用两次实际渲染，不假报每个守卫版都重渲染。两端7+7页/42页码轮廓SimSun14，正文14页字位/字号/字族/像素均等；source body/表格/字号0变化，DOCX仅3part局部样式。全页目视仅两端6/7页，所有页脚带均看，其余正文靠像素等值绑定。
- 最终engine5969898b/Wasm e630e147/cachec2f1e4ae，64资产绑定。正常历史规范化恢复8/6、原件保护6/4、新原卫生2文件过；独立5对31页全部内容/资源/字位/像素相同，原Word与新9adce7字节保持。报告SHA e1a958dcfa47ad195baf122f816388013beff9d94c276f60b4525b8bb0068193。
- 4173原PID65964保持并原样更新，64HTTP和实际规范化恢复再8/6过、零上传/反馈/外部请求、真实收集关闭；提交后不重建。原稿/字体/图片仅本机。边界及摘要见NORMALIZED-WORD-FOOTER-RESPONSE及docs/evidence/source-normalization-footer。
- 本轮源码/测试/独立记录全归本聊天，shared其他改动不碰。当前已验待实际提交推送，同PR5；交付SHA由后续条目和checkpoint记录，不合并/部署。

### E05 · 2026-10-23 · 已实际推送原PR

- 实现0d2ac7c1ac78d576410243239037e9c317f64563已推送codex/ceo-004-materials，main b0ae是祖先。PR5标题/正文按最终源replacement行为重写并重新附加，open/unmerged/mergeable=true。复核CEO仍a1b2，无评论/评审/行内/Issues/statuses/Actions，不称CI绿或CEO已接受本轮。
- 后续仅补本交付记录，最终文档head见checkpoint。源码与已验5969/e630资产不改、不重建；4173原PID65964持续。下一按新评价及真实全文P0边界推进，不重复已闭合路径或索取不存在529稿，不合并/部署/上传原稿字体。
