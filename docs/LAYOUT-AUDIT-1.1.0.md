# 1.1.0 Word / PDF 逐页验收

2026-10-17 完成。全程采用隐藏 Word、独立离线 Poppler、文件解析及后台测试，未操控用户鼠标键盘或打开前台 Office。Codex 实际查看每张逐页对照图，自动测试只作补充。

## 页面范围

对照上游 0.3.1 / d8dfe6a，七份原样文档未修改。每份原样 DOCX 在本机 Word 和 Go 中导出，与上游原始 PDF 三栏对照：企业内部报告 2 页、信函 2 页、管理办法 3 页、纪要 2 页、要素全览 5 页、请示 4 页、通知 2 页，三种输出各 20 页。

| 新建模板 | 短文 Word / Go | 长文 Word / Go |
| --- | --- | --- |
| 通知 | 2 / 2 | 6 / 6 |
| 报告 | 2 / 2 | 6 / 6 |
| 请示 | 2 / 2 | 6 / 6 |
| 函 | 1 / 1 | 6 / 6 |
| 纪要 | 2 / 2 | 6 / 6 |
| 管理办法 | 2 / 2 | 6 / 6 |
| 非红头文书 | 1 / 1 | 6 / 6 |

长文均包含 24 行跨页表格和两份独立附件。以上共 168 个独立页面、74 张对照板。另核对新增要素：

| 样稿 | Word / Go 页数 | 重点 |
| --- | --- | --- |
| joint-notice | 2 / 2 | 联合机关、“文件”居中、份号/密级/期限/紧急程度、版记 |
| joint-request | 2 / 2 | 五个签发人分行、首名对齐、文号与末行对齐 |
| preprinted | 2 / 2 | 红头与红线不着墨，正文位置保留 |
| letter-elements | 1 / 1 | 信函双线及线下份号/密级/文号 |
| minutes-issue | 2 / 2 | 纪要期号和人员名单 |
| unsealed-joint | 1 / 1 | 不加印章、联合落款和日期 |
| detached-attachments | 4 / 4 | 附件说明不拆页、两份附件分别含文号引用 |
| automatic-articles | 3 / 3 | 两章条号连续、章标题居中、附件内容保留 |
| word-comments | 1 / — | Word 批注保留，疑点待核对稿无正式 PDF |

扩展样稿共 35 页、18 张对照板。合计 **203 个独立页面、92 张对照板** 已实际查看，摘要及输入文件摘要见 [审阅清单](layout-reviewed-1.1.0.json)。重复附带的参考页不重复计数。

## 发现及修复

- Word 修订中删除文字标记和重复修订 ID 使真实 Word 报损坏，已修复；最终正常只读打开，没有“修复打开”。独立验收识别 68 处修订和 2 条数字批注，拒绝修订恢复原文。
- 自动编号的章标题在 Go PDF 错误左对齐，已修复混合字体前缀的居中/右对齐计算；相邻段前段后间距按 Word 规则合并。
- 多签发人的第二行首名对齐不准，改用明确制表位；正确分别使用签发人标签与姓名字体。
- 信函元信息与文号字体分开，附件标题恢复上游三号规格；保留纪要名单标签与姓名的不同字体。
- 附件说明曾跨页拆开，增加与后续说明的相邻保护，并为后接表格预留表题/表头及首行高度。
- 套打红头改为真正不绘制墨迹，保留几何位置，独立像素检测确认 Word/Go 均无红色残留。

最终图像检查未见文字遮挡、纸张外文字、缺页、表格数据丢失或附件错序。独立脚本确认七类长文 24 行均保留、双附件独立起页；上游管理办法第一至第十四条各一次。新建与扩展样稿的 Word/Go 页数一致。

## 字体与分页边界

本机未安装授权方正小标宋，新建红头/标题使用明确提示且可分发的 Noto Serif SC Black，Word 嵌入备用字体，Go PDF 使用同一字形；不称为指定字体合规。上游 Word 原件保留字体声明，本机 Word 会回退字体，不能为追求截图一致而改写原件。上游参考 PDF 与公开生成的 DOCX 并非同次导出，实际标题字重、行宽及段落所在页可能不同。

导入上游样例的样式明确关闭 widowControl，本项目保留其允许段落跨页的设置；例如要素全览的表格说明可能在下一页接续末行。新建文稿启用孤行控制。原样 Word 不改动，PDF 在已说明的字体与排版差异下核对完整内容，不宣称任意原稿像素复刻。

通知等短文第二页只有底部版记，与 Word 一致；不是遗漏正文。未执行 WPS、其他 Word 版本、真实打印机和 Windows 10 验收。Windows 11、本机 Word 16.0.20430.20146 的结果不能代表全部环境。

## 复现

```powershell
./scripts/test-layout.ps1 -Python <python.exe> -Folder build/qa/layout-audit/1.1.0
$env:DOC2GOVPDF_EXTENDED_AUDIT="$PWD/build/qa/extended-audit"
go test ./internal/office -run 'TestExtendedTemplateElements|TestAutomaticNumberingAndMetadataUpdateKeepEdits|TestReviewCommentsPreserveTextAndExistingAnnotations' -count=1
./scripts/render-audit-word.ps1 -Folder build/qa/extended-audit -SkipCurrent
python scripts/audit-layout.py build/qa/extended-audit
python scripts/verify-extended-audit.py
./scripts/verify-word-annotations.ps1
```

开发验收需要 Word、Pillow、pypdf、pdfplumber、Poppler；正式软件不依赖这些开发工具。产物在 `build/qa/layout-audit/1.1.0` 和 `build/qa/extended-audit`；`.word-source.sha256` 防止以旧图验新文档。重跑生成后必须重新核对受影响页面，脚本通过不能代替视觉检查。
