# 连续文稿编辑：岗位任务与真实交付

2026-10-22，继续 `codex/ceo-004-materials` / [PR #5](https://github.com/wuhaotian1994/Doc2GovPDF/pull/5)，关联CEO-001/002/003及用户“太复杂了”的直接纠正。已正常合入main 7bbd9ba及49fff73；这是实施方验收，尚非新界面的独立用户评价或主线集成。

## 现状、缺口与这次变化

此前同稿表格、段落语义、格式调整及原Word保护已存在，也已有真实输出证据；但逐段输入卡片及常驻参数让写作变成管理对象，不能拿数据正确为这种交互辩护。本次让正文与落款后内容默认进入一块连续文稿：直接输入、纯文字粘贴、跨段选择修改、Enter换段、段首退格合并、Alt＋上下移动、撤销/重做。在实际光标处插入表格保留前后文字，表内Tab、下方加行、表后续写保持当前稿。基本信息、右侧真实成品预览及白蓝视觉不变。

“段落与排版”只随当前选择出现，离开文稿后收起；语义纠正、顺序、附件身份、对齐缩进间距仍在原文位置按需可达。表格默认只显直接补行动作，更多行列与表头设置展开使用。不是把旧卡片参数简单折叠：正文已由同一contenteditable编辑面承担原生文字选择与键盘流，DOM只负责编辑显示，模型继续保全内容/身份/恢复。只阅读或定位旧纯文字稿不改变其保存结构。

打开原Word也使用连续段落与真实表格，灰色原对象只读，精确设置在当前可编辑段落展开。原格式模式保留源段落、表格、分节与原件；支持段内改字/换行，**不支持新增、删除、合并原Word段落或跨源段落替换**，相应操作具体说明并保护原稿。不是完整Word编辑器，也没有将复杂原稿压平为新稿模型。

## 真实任务与验收

| 岗位及任务 | 实际完成及独立文件核验 |
| --- | --- |
| 社区卫生服务中心办公室（明确虚构盘点通知） | 连续写三段、移动与撤销、换段合并、跨段改字、粘贴与撤销；在段中插表撤销，再在末段后填4×2库存表、补行、回正文续写，保存关页重开、交付Word/PDF。A-17、12箱/8箱/5支、2026-10-23期限与10-22署名日期精确保持。 |
| 招生计划经办人（恢复既有公开历史v6稿） | 不重新录入已获支持的招生表；连续编辑实际附件标题后撤销，改模拟主标题、保存重开并交付。56格、12校、合计9000、公费30/150包含关系及附件锚点保持。实际Word与PDF均3页，附件另面，不能据同页数推称所有换行相同。 |
| 高校办公室（既有河北师大官方原Word） | 未改稿Word逐字节等于38431字节原件；模拟稿仅主标题后缀与p43“模拟待核”两处改字，其他101段XML、表/分节/其他包成员保持。原空格显式宋体11磅；两次整格替换逐次撤销到前次文字，保存关页重开及恢复包均取得。Word/PDF各5页，前3纵向、后2横向。 |

最终桌面Chrome 155.0.8059.86、Firefox、WebKit各31项，共93；实际4173服务另31项。既有提醒定位/上下文/确认保留66项、启动异常33项、v4/v5结构恢复各18项、Node内容/附件/提醒模型42项通过；Go全量test/vet通过（引擎未改变，部分缓存），不能将这些数量当用户完成率。

三浏览器12组真实Word/PDF逐段文字、完整表格、日期数字、原包结构独立核对。隐藏Microsoft Word16.0原生打开4个代表DOCX，逻辑正文SHA及11磅实值匹配本次下载文件；原生14页与直接PDF14页合计28页全部渲染查看，无缺字、表线裁切或覆盖。最终再渲染得到的28张页面PNG与已审代表逐字节相同，避免以旧版页面冒充当前验证。Word与产品PDF的字体、换行和留白仍可能不同，不宣称像素保真/全面标准通过。

证据：[三浏览器文件核验](evidence/continuous-writing/verified.json)、[实际Word](evidence/continuous-writing/word-native.json)、[31项服务与源/资产/文件绑定](evidence/continuous-writing/service-verified.json)、[提醒66](evidence/continuous-writing/reminders.json)、[启动33](evidence/continuous-writing/startup.json)、[v4恢复](evidence/continuous-writing/recovery-v4.json)、[v5恢复](evidence/continuous-writing/recovery-v5.json)。预览完成后的实际服务截图：[连续通知正文](evidence/continuous-writing/03-continuous-notice.png)、[原Word填写](evidence/continuous-writing/04-native-ready.png)。操作中UI截图：[短窗口连续表文](evidence/continuous-writing/01-short-workspace.png)、[原Word连续编辑](evidence/continuous-writing/02-native-writing.png)。

全页组按顺序覆盖所有28页：[1](evidence/continuous-writing/group-01.png)、[2](evidence/continuous-writing/group-02.png)、[3](evidence/continuous-writing/group-03.png)、[4](evidence/continuous-writing/group-04.png)、[5](evidence/continuous-writing/group-05.png)、[6](evidence/continuous-writing/group-06.png)、[7](evidence/continuous-writing/group-07.png)，[逐页文件/图像指纹](evidence/continuous-writing/pages.json)。页面来自明确模拟稿或已登记公开材料，未上传用户文稿或系统字体。

## 本轮定位到的问题与处理

- Firefox组合输入协议可能在compositionend之后再发最终input；保存原选区、一次提交与结束事件去重，取消则还原，不以超时窗口吞下普通输入。这里仅验证事件模拟，**未进行真实Windows中文候选选词**。
- 编辑区失焦时立即收起工具会触发滚动锚定，令插表按钮在按下/点击间移位。收起延后到当前点击完成，键盘失焦仍及时处理；插表后设置真实DOM光标，避免看似选中单元格却写入后文。
- 浏览器任意加粗等曾只改变DOM而不进入模型；现在阻止并说明支持边界，不让界面显示导出不会保留的假格式。空/非文字粘贴保留选区，跨表部分选择不破坏网格；整篇替换可完整撤销。
- 旧纯文字提醒需要从全局偏移映射到当前可见文段，已改为实际选中文字；66项旧提醒流程在新编辑面重新通过。测试的Windows旧稿固定为合法v3，不能保留v4结构却只改fields并误报导入失败。
- Firefox合成ClipboardEvent会丢弃测试注入的载荷，测试改用显式Event＋clipboardData契约；不将该工具行为说成应用丢稿，也不冒认系统剪贴板已实机验证。
- 多套测试并行时，一次Chrome快速关页重开出现“另一标签页编辑”的锁冲突，导致等待预览超时；没有丢稿证据。串行全任务及实际4173重开均通过。根因尚未证实，未改锁策略、不称已修；后续若真实使用再现，应单独定位关闭后的锁释放，而非自动绕过保护。

## 复现与边界

`scripts/build-web.ps1 -Output build/qa/continuous-web` 后，用 `scripts/test-writer-continuous.mjs`（CONTINUOUS_PROFILE选chrome/firefox/webkit）完成三个任务；原招生恢复稿与公开Word须先按既有annex/unified任务取得。`verify-continuous-outputs.py`独立核验实际文件；`verify-continuous-word.ps1`隐藏Word打开4份并输出原生PDF；`render-continuous-pages.py`渲染供人实际逐页检查。最终服务测试使用CONTINUOUS_URL/CONTINUOUS_OUTPUT，`verify-continuous-service.py`比较HTTP、输出及已审页面指纹。仅比较相同图像不能代替首次人工查看。build/qa、tmp、dist为本机证据，不要求读者持有；关键结果及全页组已提交。

本地 [4173](http://127.0.0.1:4173) 保持原隐藏PID65964，原样复制已验资产，未从共享他人源码构建。实际Wasm SHA256 `41cdb7e3650b0ced56ac415bd13aacd8d7a311c7faa185acfc4bfe69b0c9bd2c`，与上一轮引擎相同；本次改变编辑器而非生成引擎。提交后不重建另一份引擎冒充已验资产。

本机主动字体授权、真实字体面/TTC、覆盖/嵌入用途及全文标准状态仍为P0，不隐去备用字体与未检状态；本轮不以简洁换合规。任意行内富格式/表格富剪贴板、原Word结构编辑、手机、读屏、实际Windows IME仍未完整验收。原样保留不是规范化认证。文号建议负担、相同事实确认和完整反馈服务沿原队列推进。49fff73已独立支持上一轮两份旧保存稿Word交付和新旧原生字号路径，不再无目的重复这些实例，也不宣称Chrome Error9根因已知。本PR未合并、无公网部署。
