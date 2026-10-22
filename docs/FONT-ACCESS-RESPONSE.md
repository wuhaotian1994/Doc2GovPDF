# 本机字体读取、真实身份与集合字体面

2026-10-22，继续同一分支 `codex/ceo-004-materials` / [PR #5](https://github.com/wuhaotian1994/Doc2GovPDF/pull/5)。回应[全文标准P0](STANDARDS-PRODUCT.md)的主动读取、身份与字体面缺口；**未关闭整个字体/全文标准P0**。

## 以前缺什么，这次做了什么

此前只能选文件，角色选择与真实字族没有区分展示，TTC一律交给引擎首面。现在“字体设置”可主动点击“读取本机字体”，浏览器授权后列出实际全名/风格/PostScript名；只读取选中字体面的字节，校对字节内PostScript名与所选项一致，未确认前不改当前配置。不支持、未授权、安全策略限制、读取失败及空列表分别说明，不将无权限误报未安装。文件选择继续可用，与本机读取共享真实字体面预览、采用和取消路径。

[Chrome官方文档](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts)说明queryLocalFonts的主动权限与FontData.blob字节访问。本产品不在启动时自动枚举，不保存全本机字体列表；只把用户明确采用的单面字节存入本浏览器既有字体存储/当前Word工作稿配置，不上传字体。不支持直接读取的浏览器仍能选择有权使用的文件，未要求安装浏览器扩展或寻找高级页面。

新增有界SFNT解析：TrueType TTF/TTC真实字族、全名、风格、PostScript、fsType，集合可选第二面；提取后重建表偏移与整体校验和。集合最多128面、表最多256、输入/提取字节均32MB，名称/表范围严格检查；CFF/OpenType轮廓、损坏或不能识别身份明确拒绝。实际登记仍由已有Go引擎验证。恢复旧字体配置不擅自替换；可识别时显示原首面真实身份，不能核对时说明并提供重新选择。

技术嵌入标志区分安装、可编辑、预览打印；受限、仅位图、禁止子集和未知/复合标志不进入当前PDF子集链路。依据[Microsoft OpenType OS/2 fsType](https://learn.microsoft.com/en-us/typography/opentype/spec/os2#fstype)，这些是技术用途限制，**不代替字体许可或授权证明**。角色仍由作者明确选择，真实名称与角色分开显示，不能把Noto登记为仿宋就称其为符合标准的仿宋。

注册、保存失败时，旧配置和稿件保持；修复了失败文案被候选说明覆盖的问题。保存成功显示实际身份，提醒核对缺字/回退。**自选字体当前不嵌入Word，也尚未把任意真实字族名称映射为可移植的Word字体配置**：Word仍声明稿件用途字体，接收端依赖相应环境。页面具体说明这一差异，不以PDF能显示替代Word字体一致性验证。

## 完整任务和实物证据

办公室经办人在当前稿填写“办公室字体核对（模拟）”及“请各科室核对库存12箱，编号A-17。”，打开字体设置，经历拒绝/不支持/空列表、字节身份不一致、文件集合第二面预览、取消、采用、实际导出、损坏输入、存储配额失败、刷新恢复及恢复备用。三浏览器各14项共42，实际4173服务另14项；Node5组覆盖真实TTF、双面集合/校验和、边界、嵌入标志、权限错误语义。启动保护33项通过；最终4173连续通知/招生/原Word任务另31项通过。没有新增Go逻辑，不以旧Go测试冒充新字体解析测试。

验证使用仓库已有OFL Noto Serif SC Regular/Black组合的双面集合，没有把客户系统字体加入仓库。权限/列表/blob使用确定性契约模拟，真实字节经过实际Go/Wasm注册/存储/恢复和输出；这证明应用协议与文件链路，**不是客户电脑真实授权弹窗、全部安装字体或各浏览器均支持Local Font Access的证明**。真实API权限仍由使用者主动触发，禁止绕过。

三浏览器实际PDF逐段文字完整，独立读取正文首字对应的Type0后代FontDescriptor/FontFile2名称表，确认正文确实嵌入所选第二面Noto Serif SC Black；不只看选择框、角色标签或标题字体命中。Word XML保持声明“仿宋”，未冒认该自选Black已经嵌入。这个明确不匹配的OFL测试只证明选择/字节使用与边界，不作为标准字体样张。

隐藏Microsoft Word16.0实际打开当前DOCX，确认正文16磅/声明仿宋、全文和数字完整；Word原生PDF1页与产品PDF1页均渲染查看，无裁切缺字。两者正文粗细不同，正是当前Word环境依赖的具体证据，**没有被包装为一致出品**。Word源SHA与最终下载绑定。[实际字体与文件核验](evidence/font-access/verified.json)、[原生Word](evidence/font-access/word-native.json)、[两张实页](evidence/font-access/direct-and-word.png)、[页指纹](evidence/font-access/pages.json)、[三浏览器任务](evidence/font-access/report.json)、[实际服务](evidence/font-access/service-report.json)、[33项启动](evidence/font-access/startup.json)、[Node](evidence/font-access/font-source-tests.txt)。[字体设置截图](evidence/font-access/chrome-font-settings.png)为契约模拟/OFL任务，非客户安装列表。

本地4173继续原隐藏PID65964，原样同步验收资产；33个HTTP资产与源指纹绑定。[服务与连续任务文件核验](evidence/font-access/service-verified.json)证明最终字体入口保留当前连续编辑：4份Word字节、PDF内容/页面/嵌入字体与前轮已看代表相同，未借重建改变引擎。实际Wasm仍 `41cdb7e3650b0ced56ac415bd13aacd8d7a311c7faa185acfc4bfe69b0c9bd2c`。当前两张字体任务页面属于本轮新证据，前轮28页仅按实际相同输出引用，不重复计为本轮新人工审页。

## 复现与下一步

`node --test scripts/test-writer-font-source.mjs`生成本机OFL双面集合；构建 `scripts/build-web.ps1 -Output build/qa/font-access-web`，运行 `scripts/test-writer-font-access.mjs`（FONT_ACCESS_URL/PROFILE/OUTPUT可选择实际服务、浏览器和独立证据目录）。`verify-font-access.py`核正文真实嵌入身份和Word非嵌入；`verify-font-word.ps1`隐藏Word，`render-font-access.py`渲染供人工查看；`verify-font-service.py`绑定实际资产/文件。build/qa、tmp、dist不是可随机器读取的附件；关键结果及实页图已经提交。

剩余P0：更完整的真实字体类别/字体面核定与角色映射、当前稿逐字覆盖/回退结果、符合许可的Word实际字族/嵌入或接收端策略、每次预览/导出与全文未检状态的准确绑定；不能因新增读取按钮或真实身份就宣称标准完成。CFF/可变字体等未支持路径不静默落到第一面。真实客户权限、系统字体与跨机器Word仍待相应环境验收。

最新CEO 03b4ac2 / blob54aebd38已独立支持5f9429e卫生办连续成稿、插表续写、保存恢复与实际Word/PDF，不再挂“本轮连续UI无人评价”。其新增CEO-001有意留白表单范围判断、CEO-003回执标题与表/表后说明阅读关系保留为下一可执行修订；原Word两次整格撤销独立复验仍待其工具审批，不冒认结果。本轮先交付已经完成的字体增量，随后同PR继续，不另开分支或合并/公开部署。
