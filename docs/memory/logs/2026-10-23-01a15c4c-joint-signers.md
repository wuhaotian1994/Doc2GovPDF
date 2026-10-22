# 正常稿的有序多人签发（进行中）

- 同PR5/codex/ceo-004-materials/ceo-001独立树，起点d43348e，shared其他会话源码不碰。开轮读AGENTS/INDEX/交接与status，owned clean。CEO仍993c77ad/maina21929e，PR开放未合并，评论/评审/行内/Issues空；不是无新消息便停工，继续上一轮已有的多人P0。
- 官方三页扫描原件已实际本机下载、父及独立Agent逐页查看，SHA5c1ecb59861529589e73d68a188432a75246f051b84458ea424c2a50fafe15b0，零可提取文本。完整核心正文381字据图转写，省略非必要联系人电话、不复制印章，标题/附注明确历史核阅、不外发，不复刻原纵排或联合红头。原图原文‘请示复’按字形保留，未按常用套语改‘批复’；第一稿‘上级政府’经独立对照、父放大确认改为原图‘上级民政’，发生于QA前，仅纠正转写，原PDF未改。原始数据和图片只在shared tmp/joint-signers-official，不入Git。
- 生产分工：paste agent独占write-model、新signer-model测试和旧issuance必要断言；receipt agent独占Go多人列表/固定两列/末行文号及pdf_fields显式font角色/新Go测试；父独占write.html主入口、write.js定位文字、write-checks和新source-anchor测试。feedback agent准备新真实writer QA，仅从本机sourceJSON读取，不内嵌人名原文。三Agent原有完整历史仍可追溯。
- model沿用signer原字符串与v7，显式换行确定人，不拆顿号/空格，不去同名重复。240总字数/60每名/最多12名，非法控制保留原文提示；多人才signers数组与首名scalar，single/empty旧键保持；TXT保全按两名/行与文号最后行。
- Go只Signers保序重复，其他agencies清理不动；固定label/两姓名列3tab，空槽仍消费tab，文号仅末行，16pt真实字体宽度不适配明确generation错误，绝不截字/缩字。PDF signer文号按role仿宋而非按〔〕猜；姓名楷体，fallback仍降级。7专项、office/webengine全量28.700/0.927s及vet过，机制稿不代签真实原件。
- 父锚点严格核生成row的4槽与作者行顺序，按实际最小replacement区间定位某作者原行，CRLF/空白/重复均保留身份，跨字段/不明确整稿；无model/checks新循环。8新反例+相关Node49过，模型Agent另59有重叠不累加。
- 已构建joint-signers-web，engineVersion ab29a736e0e4ff5f0349；尚未真实原稿和Word验收，不刷新用户4173。当前服务仍已验6110/PID65964，开发4188/PG不碰。
- 本机只读字体登记发现STFangsong/KaiTi可用；technical fsType8可编辑嵌入（不等法律认证），通过正常UI按角色选择用于本地QA，原系统文件不改、不上传，Word仅声明真实family，标题仍内置OFL备用。map仅本机ignored。真实原稿优先用两已安装面量实际字体/基线，不把fallback称全文标准通过。
- 下一步：独立核准sourceJSON→三浏览器正常录入/保存/草稿重开/已有单签发稿保护→Word/PDF/TXT实际下载与逐字基线/两列坐标；隐藏Word渲染同份DOCX用同规则验，逐页看图。另Agent在新候选验三行v7主模块失败恢复与父锚点审查。全部完成才推同一PR，不合并/公网操作。

## 当前冻结版本验收完成

- 最终91 Node、13兼容组；Go7专项及office/webengine全量/vet过。三浏览器66项/12下载，真实常驻22项/4下载；不累加重叠Agent用例。测试端的本机Name6多语言/异步font/modal等待和TAB触发点修正后重跑全部三浏览器，原稳定Word源与最终下载同字节。
- 真实Word57462d65→原生PDF5625102f，2页；直接PDF2页，4实际页已看。25/25版头真实glyph分别匹配所选STFangsong/KaiTi，互换负例失败；Word16pt/PDF矩阵15.96，应用未缩字。全正文381字/说明/三机关与数字精确，系统字体未嵌DOCX。父内容检验首次bodyEnd严格大于关系误设，核对后改为相接允许等于，非产品丢字。
- 原卫生Word4c18c0d6和7页PDF流保持；单签发两副本字节/流保持。所有原稿、字体原件与个人姓名只在ignored，本轮只提交去正文证据。详细坐标/范围见JOINT-SIGNERS-RESPONSE.md。
- 最终joint-signers-web/ab29a736，Wasm3d05f13f，64资源压缩/MIME绑定过；原样同步4173/PID65964并实际复验通过，替代上文旧6110‘仍待刷新’状态。4188/PG不动，正式收集未开。
- 最新CEO b36ac8b6/main641dca8（2026-10-22T16:37:33Z）只新增文档；备用Word交接获独立实物支持，准确61458回导说明孤行P1新接续，不归因字体；本机无准确原稿不代签。direct cmapP0、LO版记P1及全文字体仍开。下一步提交本轮、正常合main文档、推同PR5/核评价，不重建冻结资产。

## 实际交付

- 实现d12c0bc7（未推送前仅清理测试脚本空行尾空白并node --check，逻辑及生产资产不变）；完整新文件暂存后发现该处尾空白，已修复，最终cached check通过。正常合main641dca8仅CEO文档，e232feb已推送原codex分支，PR5正文重写/附加成功，没有合并PR或重建已验服务。
- 推送后评论/评审/行内/Issues空，statuses和workflow_runs空；不称CI绿。远端插件暂显示mergeable=false，不把可能null重算误作冲突，known main ancestor。固定4173/PID65964健康，原frozen3d05资产保持。交付记录之后仅文档head以checkpoint为准。
- 下一轮优先directPDF备用cmap结构P0，继续真实全文字体/接收端P0；准确61458回导说明孤行P1及LO版记P1接续，不替不同源签收，不重复索要用户已答不存在的稿。收到CEO可执行评价继续同PR；无变化不推空确认。
