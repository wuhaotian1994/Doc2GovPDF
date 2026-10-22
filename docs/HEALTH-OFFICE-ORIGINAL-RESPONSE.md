# 原始卫生通知：回执标题与表格阅读关系

2026-10-22，会话01a15c4c，继续原分支与PR #5，回应用户提供复现包后的明确要求及CEO-003。这里使用提供的实际保存稿，不用新编短稿代替验收。

## 同稿复现与结果

- 原JSON 34,688字节，SHA256 `7dbde2fe81d11c526d8fb73ab143f572e3481500575fb9c0b87b126b9e37972c`；39块，三表依次3×2、9×5、5×6，空白0、9、20。没有重录、删段、填空、缩字或改边距。
- 用正常“打开Word或草稿”入口恢复；恢复、保存刷新重开和导出后的fields/content均与原稿精确相同。修复前实际DOCX与包内历史件逐字节一致，SHA256 `c9f686ecbffee76a6f1f923fb4503cbda2f5dd678802cebb03f17c3fd5539ddd`，由此确认同稿基线。
- 修复前产品PDF6页：回执标题第5页底，单位/说明/表在第6；核对小表第3页、后说明第4。隐藏Word16实机也复现这些关系。
- 最终产品PDF7页、Word16实际渲染7页：小核对表标题、完整3行及说明同在第4页；回执标题、单位栏、前说明和完整回执表同在第6页。长安排表仍在5–6页自然续表并重复表头。
- 两份最终PDF全部14页已查看，无观察到缺字、裁切或表线丢失。回执后长注的后半与来源仍在第7页；不以总页数相同或更少为目标，不把相同页数宣称像素一致或跨机器保证。
- 最终DOCX除document.xml外所有包成员同字节；document.xml剔除keepNext后精确一致。文字、数字、顺序、三表每格/空白、字体字号、列宽与边距均未改；字号仍为28/32/44半点。

## 实现与退化处理

原规则只把表前最多两短行相连，遇到完整句说明便停止。现在仅从明确表/附件标题建立有界前导关系，穿过单位栏与说明；长叙述、署名、明确分页等仍是边界，不把整篇绑在一页。

明确随表注的开头与末行联动。第一候选虽修复回执标题，却把3行核对表拆开；实际逐页发现后未交付该版。最终按实际字体、列宽、行高测量紧凑表：表和注开头不超过正文页高1/3，且连前导可容纳整页时，Word/PDF共用完整单元；长表保持自然分页。原生Word保护模式跳过这项新稿决定。

## 验证与边界

- 原稿正常UI恢复→保存刷新→实际Word/PDF；当前候选另跑连续编辑/旧恢复/原Word主链31项通过。Node正文/附件/表流30项（含原稿完整性）及office全量test/vet通过。
- 原稿JSON、实际导出、逐页图只保留本地ignored目录，未进入公开仓库；提交仅几何/哈希和无正文的验证摘要。`scripts/test-health-office-original.mjs`必须提供这份原稿路径，先核hash，不静默替换样本；`scripts/verify-health-office-original.py`核原件目录/最终目录。
- WordPDF的文本提取顺序与段落run不完全同序，最初用文本前缀定位的断言不适用；最终改用绑定当前DOCX哈希的Word16 Find/Range页码，并实际渲染查看全部页，不把提取失败判成内容缺失，也不删断言假装通过。
- 默认备用字体及Word/PDF字距差异仍在；本次修复不是全文国标认证、手机/真机Safari或任意Word兼容保证。粘贴交互的上一冻结版本证据见DRAFT-FIRST-PASTE-RESPONSE.md，不用旧页代替本轮新引擎实页。

证据摘要：[原稿与最终文件核验](evidence/health-office-original/verified.json)、[正常UI恢复任务](evidence/health-office-original/ui-replay.json)、[当前构建连续回归](evidence/health-office-original/continuity-regression.json)。本地原件及最终文件位于 `D:/Project/Doc2GovPDF/tmp/health-office-original/`。

最终持续服务绑定：正常UI用同一原稿再次恢复/保存刷新/导出通过；DOCX与已审最终件逐字节相同，PDF全部7页内容流及重渲染像素哈希相同；36个实际HTTP资产与验收构建相同。证据见evidence/health-office-original/service-bound.json及service-replay.json。父代理再次运行Node30全部通过，0跳过。最终资产原样同步，交付提交后不重建。
