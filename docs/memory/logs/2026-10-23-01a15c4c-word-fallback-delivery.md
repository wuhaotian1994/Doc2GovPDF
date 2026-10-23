# 固定OFL Word嵌入与原生PDF中文P0交付

- 接2026-10-22 native-word-embedding诊断；同PR5/codex/ceo-004-materials/ceo-001树，起点1b17f3a。所有dirty归本聊天与明确Agent任务，共享源码未动。
- 正确机制为固定OFL派生独立内部家族+PRC charset86，最终派生家族3429e有严格两fullSHA白名单，SFNT版权/许可及所有非name表不变（head校验除外）。未知来源明确失败；owned临时buffer原位混淆，无注册数据修改或常驻额外副本。精确别名可回导Regular/Black，完整资源需求保留，自选同名真实family优先。源码/测试/边界见WORD-FALLBACK-EMBEDDING-RESPONSE.md。
- 实现Agent完整office/webengine test27.143s/0.775s与vet通过；另一Agent独立逐链只读审查无确定缺陷。父审查SHA及所有权/error传播，实际构建word-fallback-embedded-web，Wasm6110d00ba2ce502b23bb442f3e23722eadac3bd83560f0c0841a36b4a7f8b7a3，64资产/压缩/离线cache绑定。
- 三浏览器60项、15对30实际文件；独立逐表固定OFL来源/name/版权/许可证/SFNT校验/原Wordbyte不变全过。正常备用Word再开实际PDF的Black仍正确；生产原生Word备用PDF33/33轮廓、中文Regular13/Black11、0images且文本精确。旧baseline、仅可提取但中文SimSun、实际无效Unicode负例均被拒。
- 用户原39块三表包源7dbde2fe未改；新Word4c18c0d6，旧0103c65e→新逐XML归一核对仅font声明/两OFL派生part/移除未知setting，正文/数字/表格/字号/边距/间距不变。新Word7页、全部88个非空段落/格文可提取；小表标题和整3行同4、长表5–6、回执标题和完整表同6，后注续7。directPDF7页内容流同已审版。源和私密图片未提交。
- 镇稿正常Chrome9项/9下载；19与23两模拟输入新Word各2页，独立签发/日期/版记上下线均保持，日期冲突不裁定。实际所有fontpayload同已独立验证fixture。查看字体代表3、原卫生Word7、镇稿Word4共14张新实页及旧对照1；无裁切，不删文缩字。
- 失败不是产品故障：原浏览器fallback断言仍写Noto原名，更新为严格发行alias后完整三浏览器复跑；Python最初在WebKit未完成时只验了两profile，追加严格请求profile集合并于全体完成后验证15对，未用早期10对冒称全体。原稿跨页注校验被单独页码插入打断，确认每页唯一且非原文字的页码后排除，不移除作者内容。
- 新glyph校验器对direct identity CMap未用surrogate误报，改为保留映射、实际无效Unicode明确fail；fontTools为GID命名逆读既有坏cmap时失败，以真实CID→GID命名验证所用glyf，原cmap与所有原表保留、结构异常另记，不把轮廓通过当容器全面有效。旧/新/重开两个cmap SHA完全同，确定是既有P0。
- 最终4173仍PID65964，原样切换冻结6110资产；64实际HTTP资产匹配，实际Chrome另20项/10下载与5对独立验证通过，DOCX同已审Word源；浏览器关闭后服务继续。提交后不重建。4188虚构开发服务/PG未新增真实收集，不改账号/字体安装或公网状态。
- 最新远端CEO993c77ad/maina21929e：单签发镇稿文件已实际独立支持，不能再写全未取得。新增三部门多人签发P0（按原行名单、不猜顿号拆分、两名一行及文号最后同行）下一优先；LibreOffice版记两线P1未复现，本机无可用LO，不能以Word16有线代签。Agent只读已列模型/TXT/判断锚点和engine长名/同名边界，以及LO空段边框/frame机制线索；未擅改新任务生产。
- 本轮只交付固定OFL备用的本机实际字体与Unicode改善；自选接收端替代、标准类别/全文、direct cmap、多签发、LO兼容继续开放。最终提交/PR/远端SHA看checkpoint；不合并PR、不部署、不传用户原稿或系统字体。

## 实际提交与原PR交付

- 实现dae7d685969c983e6e3eed49a60faec75d7bd6b7；正常合入a21929e2b3d37009d6095c1da91f8ba7e3af287e后a6f0a1b5cddbdd4ddd89c096910a329697fa3cd5已push原分支。PR5标题/正文按最终Word故障与行为更新且attach成功，open/unmerged/mergeable=true。
- a6推送后comments/reviews/threads/Issues/combined statuses/PR Actions均空；不冒称CI绿或新的独立签收。新CEO多签发已先只读评估：允许逐行并传signers不足，还须TXT名单、逐作者行判断锚点及实际末行文号/第二列对齐；本轮未动其生产源码。LO本机未发现，frame空段边框为线索而非已证根因。
- 常驻4173仍PID65964/冻结6110，提交后未重建；开发4188仅虚构收集，账号权限/系统字体和公网均未改。最终文档head、共享记忆guard同步和后续队列见checkpoint。
