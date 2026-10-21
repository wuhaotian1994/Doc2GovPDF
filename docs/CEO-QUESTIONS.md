# CEO 产品议题

唯一准则：**浅者不觉其深，深者不觉其浅。**

普通用户不必学习公文排版就能完成工作；熟练用户遇到真实复杂任务时，也不应被迫推倒重来。这里只提出产品判断、问题和完成结果，不指定技术实现，不授权公开上线。

## 本轮判断

2026-10-21 首轮审阅，基线为 [`9a8bb66`](https://github.com/wuhaotian1994/Doc2GovPDF/commit/9a8bb666e71a3865eef1dfff49454d3ec47154de)。依据已提交文档和源码，未重新运行浏览器或真实用户测试。

三步填写、浏览器本地处理和真实成品预览是正确主线。最新提交已针对“下一步清空”补上启动保护，本轮不把已修复问题重新开成需求。下一轮产品增量优先减少用户寻找问题、重复核对和重新开始的成本，而不是增加首页选项。

## CEO-001 · P1 · 内容提醒能否让用户真正完成一次判断？

状态：已回应，PR #2 已提供实现与验证记录；产品方向和本轮范围成立，待集成后核对，不代表主线已完成或批准合并。

**观察。** 当前主流程逐条展示提醒文案，“返回修改”通常只把焦点放回整个正文框。引擎已有问题原文、建议文本与依据，但这些信息没有随提醒展示；部分提醒只说“这处写法可按公文体例整理”。任何字段变化还会清空全部已确认项。以上是源码事实，尚无真实用户耗时证据。

**问题。** 一篇长稿中有几处相似提醒时，用户能否知道是哪一句、为什么要看、改后是否解决？如果只能回正文寻找，或修改标题后重新勾选无关提醒，“检查”就可能把复杂性转嫁给用户。

**用户价值。** 新手无需理解规则体系就能处理具体问题；熟练用户可以核实依据、保留有意写法，不被迫反复做相同判断。

**期望结果。**
- 用一篇多页、含重复表达的合成稿验收：每条提醒都有足够的原文上下文，能直接回到对应位置，不要求用户全文搜索。
- 区分必须修正、需要判断和非阻断建议。用户能理解“为什么提醒、可以怎么做”；仍不自动改写数字事实，不另设报告中心。
- 修改与某条判断无关的内容，不要求重复确认未受影响的事项；涉及该问题的内容或判断依据变化时，必须重新核对。
- 实施者先回答目前哪些情况已满足、哪些未满足，再选择最小改进；不要求堆叠完整规则面板。

证据：[主流程提醒与确认逻辑](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9a8bb666e71a3865eef1dfff49454d3ec47154de/web/write.js#L75-L168)、[引擎提供的问题信息](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9a8bb666e71a3865eef1dfff49454d3ec47154de/internal/office/check.go#L20-L28)、[笼统提醒的生成位置](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9a8bb666e71a3865eef1dfff49454d3ec47154de/internal/office/check.go#L180-L191)。

## CEO-002 · P2 · 写到一半需要更深能力，能否继续同一份工作？

状态：已回应，PR #3 已提供最小路径实现与验证记录；接受本轮单向副本方案，待集成后核对，不代表主线已完成或批准合并。

**观察。** 新主流程只有正文文本框，页脚入口叫“整理已有 Word”；表格等能力存在于独立高级界面。产品文档明确两边是不同模型，不能声称无损互换。这保住了首页简单，却留下一个产品断点：从空白写起的人，未必知道自己写到一半也可以使用这些能力。

**问题。** 用户已经写好标题、正文、落款，随后需要插入一张工作安排表。我们希望他如何完成？能否发现下一步而不用重录已写内容，又不会误以为切换后所有内容都会自动来回同步？

**用户价值。** 新手继续只看到必要输入；熟练用户在任务变复杂时有清楚、可信的去路，不必因为入口选错而重做一遍。

**期望结果。**
- 只以“给当前稿增加一张表格”为首个验证任务，先交代现有可行路径与实际损失，再决定最小产品改进；不一次要求高级功能全部搬进首页。
- 从三步填写开始的人能够发现并走完这条路径，无需重新输入已有标题、正文和落款；原稿始终可恢复。
- 如涉及下载后导入、模式切换或保真限制，在操作前说清楚；取消不丢内容，不暗示尚未验证的双向无损同步。
- 不重新引入必选文种，不更换现有视觉风格；若现有路径已经满足，用完整任务证据关闭本题即可。

证据：[正文与高级入口](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9a8bb666e71a3865eef1dfff49454d3ec47154de/web/write.html#L49-L71)、[高级界面已有表格能力](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9a8bb666e71a3865eef1dfff49454d3ec47154de/web/index.html#L33)、[当前产品边界](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9a8bb666e71a3865eef1dfff49454d3ec47154de/PRODUCT.md)。

## 暂不增加

本轮不提出账号、云端文稿存储、更多首页参数、独立检查报告或公开部署。真实用户研究和真机验证仍是已有边界，不能用新增按钮数量或自动化测试数量代替“用户顺利完成任务”。


## 2026-10-21 · PR #1 产品审视

检查基线：[PR #1](https://github.com/wuhaotian1994/Doc2GovPDF/pull/1)，head [ade54c2](https://github.com/wuhaotian1994/Doc2GovPDF/commit/ade54c2da803c92a6c168847b7d17b1da657dfae)。已合并处理本轮 opened/synchronize 通知，按相同 head 去重。审阅时 PR 开放、未合并。本轮为源码、差异与验证记录的静态审阅，未自行重跑浏览器或 Word/PDF 验证；不构成合并批准或上线许可。

**产品判断：这次先修可靠性的取舍正确。** 用户不应理解“组件是否启动完成”才能安全填写，也不应在点过保存后担心关页丢稿。本 PR 将启动前保存扩展为持久恢复，并补齐实际服务下的预览及更新路径。这比继续增加功能更接近“浅者不觉其深”：复杂恢复机制由产品承担，用户只需继续自己的工作。

- [启动前保存与恢复](https://github.com/wuhaotian1994/Doc2GovPDF/blob/ade54c2da803c92a6c168847b7d17b1da657dfae/web/write-boot.js)采用独立持久恢复版本；[界面](https://github.com/wuhaotian1994/Doc2GovPDF/blob/ade54c2da803c92a6c168847b7d17b1da657dfae/web/write.html)增加可见保存入口。
- [实际服务修复](https://github.com/wuhaotian1994/Doc2GovPDF/blob/ade54c2da803c92a6c168847b7d17b1da657dfae/cmd/webserve/main.go)与[首次全流程验收脚本](https://github.com/wuhaotian1994/Doc2GovPDF/blob/ade54c2da803c92a6c168847b7d17b1da657dfae/scripts/test-writer-first-use.mjs)将“能显示预览、能下载包含最新输入的文件”纳入实际服务验收路径。
- 实施方[验证记录](https://github.com/wuhaotian1994/Doc2GovPDF/blob/ade54c2da803c92a6c168847b7d17b1da657dfae/docs/FIRST-USE-DELIVERY-QA.md)报告桌面首次流程 64/64、经常使用 97/97、三引擎启动异常 33/33 等通过；这是实施方提交的证据摘要，不代表本轮独立复验，也不扩大为真机 Safari 或手机验收。

**既有议题状态。** CEO-001、CEO-002 均保持待回应，不新增重复问题，也不要求塞入本次可靠性修复。当前[提醒逻辑](https://github.com/wuhaotian1994/Doc2GovPDF/blob/ade54c2da803c92a6c168847b7d17b1da657dfae/web/write.js)仍存在全量清空确认和仅返回字段的行为；[高级入口](https://github.com/wuhaotian1994/Doc2GovPDF/blob/ade54c2da803c92a6c168847b7d17b1da657dfae/web/write.html)仍为“整理已有 Word”。因此本 PR 是基础可靠性进展，并非两题已经解决。下一轮仍先回应 CEO-001，再验证 CEO-002 的最小任务路径；本轮没有新增功能要求。


## 2026-10-21 · PR #2 产品审视

检查基线：[PR #2](https://github.com/wuhaotian1994/Doc2GovPDF/pull/2)，head [e53d97a](https://github.com/wuhaotian1994/Doc2GovPDF/commit/e53d97a5032f1a7325b093e12b6d3f18f57b3bbf)。本轮 opened/synchronize 通知合并审视，按 PR/head 去重。静态核对源码、差异、测试用例及实施记录，未独立重跑浏览器或 Word/PDF 验收；不构成合并批准或上线许可。

**CEO-001 已获得实质回应。** 改进仍留在原有提醒区：先让用户看见问题原文、严重程度和定位入口，再按需展开依据及建议，没有增加独立报告或复杂设置。这符合“简单的操作，足够深的解释”。

- [定位与提醒界面](https://github.com/wuhaotian1994/Doc2GovPDF/blob/e53d97a5032f1a7325b093e12b6d3f18f57b3bbf/web/write.js)支持返回并选中对应字段/段落，重复表达不只寻找全文第一次命中；修改后可以回到提醒继续处理。
- [判断保留逻辑](https://github.com/wuhaotian1994/Doc2GovPDF/blob/e53d97a5032f1a7325b093e12b6d3f18f57b3bbf/web/write-checks.js)及[针对性用例](https://github.com/wuhaotian1994/Doc2GovPDF/blob/e53d97a5032f1a7325b093e12b6d3f18f57b3bbf/scripts/test-writer-checks.mjs)覆盖改标题/增加无关段落后保留局部确认、重复段落独立判断、原文或依据改变后重新核对，并将有效判断映射到最新导出问题 ID。这不是仅增加几个说明控件。
- 接受本轮明确边界：最小判断上下文是段落；同段修改、跨段规则、重复身份不明时保守重新核对；确认不跨刷新保存。当前不要求为追求“永不重复确认”引入更复杂机制，也不增加自动替换数字事实。
- [实施回应](https://github.com/wuhaotian1994/Doc2GovPDF/blob/e53d97a5032f1a7325b093e12b6d3f18f57b3bbf/docs/CEO-001-RESPONSE.md)报告三浏览器任务 66/66、实际 Word/PDF/TXT 一致及页面检查。这些是实施方记录，不是本轮独立复验；不扩大为真机 Safari、手机或跨机器 Word 分页保证。

**后续取舍。** CEO-001 不再标记为“无人回应”，但 PR #2 仍依赖未合并的 PR #1，不能写成主线已具备该能力。集成基线变化后应保留这条真实任务路径的核对。CEO-002 仍待回应；下一步围绕“给当前稿增加一张表格”的现有路径做最小验证，不扩建功能清单。本轮没有新增产品议题。


## 2026-10-21 · PR #3 产品审视

检查基线：[PR #3](https://github.com/wuhaotian1994/Doc2GovPDF/pull/3)，head [9defb35](https://github.com/wuhaotian1994/Doc2GovPDF/commit/9defb35c7ac1b2e5d18da9fad9746d66c926bfd3)。实现与实施方验收对应 [46d6889](https://github.com/wuhaotian1994/Doc2GovPDF/commit/46d688941dabfd8d66105dd86a3e765409573171)，后续提交仅补交接及日志。本轮 opened/synchronize 通知合并审视，按 PR/head 去重。静态核对源码、差异、测试用例与实施记录，未独立运行浏览器或 Word/PDF 验收；不构成合并批准或上线许可。

**CEO-002 已获得实质回应，接受本轮最小方案。** 实施者先验证了“下载 Word 再导入”的断点：原件保护模式不允许新增表格。因此本次不是只改入口文案，而是让填写草稿成为高级编辑中的独立可编辑副本，同时保留 Word 原件保护。

- [正文旁入口](https://github.com/wuhaotian1994/Doc2GovPDF/blob/46d688941dabfd8d66105dd86a3e765409573171/web/write.html)按需展开，操作前明确下载草稿、原稿保留和不会自动同步；无需让所有用户先学习高级模式。
- [草稿导入](https://github.com/wuhaotian1994/Doc2GovPDF/blob/46d688941dabfd8d66105dd86a3e765409573171/web/browser-api.js)复用填写字段与独立落款处理，形成可编辑副本；[目标页面](https://github.com/wuhaotian1994/Doc2GovPDF/blob/46d688941dabfd8d66105dd86a3e765409573171/web/index.html)说明选择草稿、进入编辑、添加表格及在此导出。它提供了“不重录已有内容”的任务路径，并未承诺双向无损转换。
- [路径用例](https://github.com/wuhaotian1994/Doc2GovPDF/blob/46d688941dabfd8d66105dd86a3e765409573171/scripts/test-writer-table-path.mjs)覆盖原稿保留、取消与撤销、无效/取消导入、刷新恢复、缓存控制下的正确入口和实际下载；[文件核验](https://github.com/wuhaotian1994/Doc2GovPDF/blob/46d688941dabfd8d66105dd86a3e765409573171/scripts/verify-writer-table-outputs.py)检查原文字段、表格每个单元格，以及正文—表格—落款顺序，不以“页面出现表格按钮”代替任务完成。
- [实施回应](https://github.com/wuhaotian1994/Doc2GovPDF/blob/46d688941dabfd8d66105dd86a3e765409573171/docs/CEO-002-RESPONSE.md)报告三浏览器任务 45/45、实际 Word/PDF 内容及页面检查。这是实施方证据，不是本轮独立复验，不扩大为手机、真机 Safari 或跨机器分页保证。

**边界与后续。** 用户仍需下载后手动选择草稿文件，高级副本修改不回传三步填写。这是明确告知的本轮成本，可以接受，不为消除这一步立即建设双向同步或搬入全部高级功能。CEO-001、CEO-002 均已有 PR 回应，接下来重点是集成后保持两条完整任务路径，而非继续堆功能。PR #3 叠加在 PR #2 上，当前不能宣称主线已具备这些能力；本轮不新增产品议题。


## 2026-10-21 · 下一阶段取舍：从“能导出”走向“确实替用户省掉排版工作”

三步填写是交互形式，不是产品价值本身。核心价值应是：用户把已有内容交给产品，得到忠于原意、能够继续编辑或交付的文档，而不用先掌握排版规则。CEO 的职责不能止于验收前两项意见。下面按优先级提出新的产品问题；依据 PR #3 的 9defb35 源码静态审视，未独立执行界面或输出测试。

### CEO-003 · P1 · 不选文种之后，自动排版能否仍然尊重作者的结构？

状态：待回应；源码已发现值得复现的具体情形，尚未完成输出验证。

**事实与判断。** 填写流程统一传入 kind:'plain'；引擎把段首“第…章”和“第…条”识别为 heading，只有 rules 分支才把条款调整为 article、仿宋。三步填写页提示自动识别层次，但没有独立表达“这一段是正文而不是标题”的途径。不应据此声称所有条款均排错，但“不选文种”隐藏的复杂性必须由产品承担，不能要求作者改编号、改措辞迎合识别。

**问题。** “第一条 为规范……”后面是一整段条款正文，是否应整段作为标题？真正的小标题前带复制来的空格时又如何？自动排版与作者意图不同时，用户能否保留原文完成纠正？

**期望结果。**
- 先复现三类合成材料：短独立小标题、带长正文的“第一条……”、带前导空格的编号标题。展示源文、识别结果和实际 Word/PDF 页面，不只验证文字存在。
- 区分标题与条款正文；不确定时不擅自改写文字、数字或编号。
- 提供最小、可理解的纠正路径，不让用户学习字体行距或改正文迎合识别。
- 不恢复必选文种，不建设完整富文本编辑器；实现方式由工作 Agent 决定。已有路径若满足，以完整任务证据回应即可。

证据：[主流程固定 plain](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9defb35c7ac1b2e5d18da9fad9746d66c926bfd3/web/write-model.js#L29-L40)、[层次识别及 rules 特例](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9defb35c7ac1b2e5d18da9fad9746d66c926bfd3/internal/office/templates.go#L217-L255)、[正文提示](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9defb35c7ac1b2e5d18da9fad9746d66c926bfd3/web/write.html#L49-L55)。

### CEO-004 · P2 · 用户拿着一篇现成稿来时，是否还要先替产品整理材料？

状态：待验证的完整任务，不预设必须增加“智能导入”。

**事实。** 主流程分别收集标题、主送、正文、落款、日期，首次流程测试也先把内容拆成变量再填写；已有 Word 另有高级入口。因此，“字段能够保存导出”不能直接证明“拿到未拆分文本稿的用户能自然完成首份成品”。

**假设与问题。** 部分用户可能需要整理已有通知、工作安排或聊天文本，而非空白写作。如果必须先判断每段文字放哪个字段，整理成本是否仍留给用户？这是尚无真实用户研究支持的假设，先用完整材料验证，不把猜想直接变成大功能。

**期望结果。**
- 从未经拆分的材料开始：含标题、主送、正文、落款、日期的通知，以及复制后带空行和硬换行的多段文本。
- 先走现有界面，记录手工拆分、重复、遗漏的断点；路径足够则不加功能，有断点只补最小引导或整理能力。
- 实际成品中标题、主送、落款、日期不重复不遗漏，段落符合原意；整理保留可恢复的原始材料，含糊之处不静默猜测。
- 验收覆盖“取得材料→打开实际导出文件”，不以下载按钮可用为终点。可先用合成材料走查，不等待用户招募，也不声称真实用户完成率。
- 不生成事实、不接入云端 AI、不恢复必选文种，不要求先完成教程。

证据：[字段式流程](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9defb35c7ac1b2e5d18da9fad9746d66c926bfd3/web/write.html#L34-L57)、[预拆字段的首次测试](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9defb35c7ac1b2e5d18da9fad9746d66c926bfd3/scripts/test-writer-first-use.mjs)、[当前方案及研究边界](https://github.com/wuhaotian1994/Doc2GovPDF/blob/9defb35c7ac1b2e5d18da9fad9746d66c926bfd3/docs/GUIDED-WRITING.md)。

### 此轮不做

不增加账号、云存储、AI 代写、模板商城或首页功能墙。常用信息、最近文档与复制旧稿已有实现和测试，不重新开成缺失需求；字体替代与 Word 重排已有提示，不假装没有告知。CEO-001/002 的集成核对继续保留，但不再作为整个产品工作的全部。
