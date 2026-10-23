# CEO-001：有意留白按实际表格范围判断

2026-10-22，继续 `codex/ceo-004-materials` / [PR #5](https://github.com/wuhaotian1994/Doc2GovPDF/pull/5)，回应CEO 03b4ac2、blob54aebd38的卫生办任务及此前教育/招生空白观察。这是实施方机制验收，未冒认CEO原保存稿复验或主线集成。

## 现状与最终变化

原引擎为每个表格空格生成非阻断建议，正常填写页逐格展示，不保存空白用途。没有证据表明这些建议必须逐格确认才能下载；本次不把它们升级成阻断，也不把全部空白认作误报。

现在正常填写稿的同一实际表格汇总一组空白，显示空白数量、行列规模及现有表题；“查看空白范围与原表”按需列出坐标、表头及同行已有文字，并能定位具体单元格。“查看原表”直接回当前可见编辑面。作者可明确选择“这些位置有意留白”，不用为同一范围逐格重复判断；选择默认关闭，不要求确认才下载，也不自动填写0、横线或编造事实。

选择随同一稿保存/关页重开；标题、无关正文、另一张表修改及同一实际表位置变化保持。该表正文、表头、行列/单元格身份、检查版本或原规则说明/依据变化时，仅取消相关表选择并说明重核原因，重开后仍可见。相同表的部分空白被真实填写后按剩余范围重核，不把旧20格选择迁给新19格。取消选择可撤回决定；导入新副本不继承原稿判断。

只汇总现有`table.empty-cell`的suggestion且有可靠当前稿表格定位；错误级空白、其他数据/标准规则、原件结构及未检查状态不被隐藏。范围决定不会作为引擎“已核通过”ID导出，也不能把真正的必须修正项洗成通过。当前原生Word保护模式仍沿既有提醒方式，本轮没有把没有可靠填写稿表格锚点的原Word强行分组。若同一表的空白实际有不同用途，可保持不选并逐格查看/修改；本轮不提供任意子矩形的混合用途声明，不替作者推断。

## 当前完整任务与实物

采用明确虚构的卫生办机制稿：9×5安排表含9格空白、5×6回执含20格空白。所有模拟项目均显式标为模拟，无外部个人数据。[完整测试输入](evidence/table-blank-range/fixture.json)。它覆盖CEO所述9＋20数量和两种业务表范围，**不是CEO的2330字、39块、3表原稿**。

三浏览器各10项，共30：从首页可见打开、两组29格、默认不选、未选也真实下载、查看坐标/原表定位、明确按表保留、无关修改、保存关页重开、真实填写一格后仅该表19格重核、再次重开原因保留。最终实际应用同任务另10项，连续通知/招生保存稿/原Word主链另31项，既有提醒66与启动保护33项通过；Node既有提醒18＋新增范围7共25项通过。

三浏览器12份实际文件（选择前后各Word/PDF）独立核验两张原生表全部75格、9＋20空白及全部文字。每个浏览器选择前后Word**逐字节相同**：决定只改变核对元数据，没有改表、补空值或偷偷重排。真实填写一格后的恢复文件包含作者输入“待核事实”和19处回执空白，不推测其事实真假。[实际文件核验](evidence/table-blank-range/verified.json)、[三浏览器任务](evidence/table-blank-range/report.json)、[范围保留界面](evidence/table-blank-range/ranges-kept.png)、[精确重核界面](evidence/table-blank-range/range-recheck.png)。

隐藏Microsoft Word16.0实际打开本次DOCX，2页、两张真实表、逻辑正文SHA与当前下载绑定；产品PDF同为2页。4页全部渲染并查看，未见缺字、裁切或表线缺失；最后重渲染的四张PNG与已审代表字节相同。受控稿中“接收方回执”与表头/第一数据行同页，续页重复表头，表尾附注在末行之后同页；安排表说明也紧随原表。[Word实际记录](evidence/table-blank-range/word-native.json)、[全部4页](evidence/table-blank-range/actual-pages.png)、[页指纹](evidence/table-blank-range/pages.json)。同为2页不是保证Word/PDF逐像素或所有稿件分页一致。

本地供查看版本继续运行、原样同步已验资产，34个HTTP资产/源指纹与实际浏览器Wasm绑定；六组任务Word字节、PDF内容/纸幅/嵌入字体与已审代表匹配。[服务与真实输出绑定](evidence/table-blank-range/service-verified.json)、[当前服务范围任务](evidence/table-blank-range/service-report.json)、[连续任务](evidence/table-blank-range/continuity-service.json)、[旧提醒66](evidence/table-blank-range/reminders.json)、[启动33](evidence/table-blank-range/startup.json)、[Node25](evidence/table-blank-range/node-tests.txt)。生成引擎未变，Wasm仍41cdb；本次没有拿旧版页面冒充新UI验证，提交后不另建一份引擎。

## CEO-003阅读关系仍未关闭

本次也检查了受控稿标题、表与说明关系，没有在这个2页样本重现CEO原稿第5页回执标题/第6页表格、表后说明跨页及接收端尾页问题，**未据此宣称原问题已修**，没有为了压页改字号、边距、原文或删回执。当前只交付优先的空白范围增量，保留原稿阅读关系为下一可执行任务。

CEO原稿及实际文件在其云端证据路径，本机没有可读取恢复文件。[官方历史页面](https://dhq.nc.gov.cn/dhqrmzf/zcwjf16/201810/56fb7ccbe5274a7990e0541b54ddf3be.shtml)的浏览结果仍返回历史材料，但独立实时HTTP取得的是跳转后的政府首页，已核页面标题且没有原表节点，未把该HTML当原件。不能根据缓存的扁平文字猜单元格位置、合并关系或删去实际材料后冒充同稿验收。接下来需取得可读取的该保存稿，或取得可验证的原表结构后保留完整业务内容复现，再针对阅读关系验证真实Word/PDF；不在无复现证据时改动全局分页策略。

## 复现与边界

`node --test scripts/test-writer-table-blanks.mjs scripts/test-writer-checks.mjs`，构建 `scripts/build-web.ps1 -Output build/qa/blank-range-web`，运行`test-writer-blank-range.mjs`（BLANK_RANGE_URL/PROFILE/OUTPUT可选择实际应用与独立目录）；`verify-blank-range.py`逐格核当前文件，`verify-blank-word.ps1`隐藏Word，`render-blank-range.py`生成实际页面供人工检查，`verify-blank-service.py`绑定当前资产与文件。build/qa/tmp/dist是本机证据，关键结果及全页图已提交，不假定其他机器持有原云端路径。

本轮未做真实客户完成率研究、手机/读屏全面验收或任意表单语义自动分类；字体类别/字形覆盖/Word映射与全文标准P0仍未完成。空白用途确认不是事实或标准认证。继续同一PR，未合并或发布网站。
