# PDF 内嵌子集容器独立验证

记录日期：2026-10-23（Asia/Shanghai）。本轮基线为 `c16661c`，由 feedback_backend 子任务独占新增验证脚本、机制测试和本日志，未修改生产代码、常驻服务或系统字体，未提交。父任务处理生成端修复及新成品验收。

## 方法与可复现入口

新增 `scripts/verify-pdf-subset-fonts.py`，CLI 接受一到多份 PDF 和 `--output`。通过 pypdf 遍历可达 PDF 字典中的实际 `FontFile2` 流；仅在内存解码字体，按字体程序 SHA 去重。独立核对 SFNT 目录/表边界与校验和、`head.checksumAdjustment` 完整 32 位及全文件校验和；独立解析 cmap format 4 的声明长度、分段数组、终止段、`idRangeOffset` 及字形索引边界，核对 format 12/13 分组和 Unicode 范围，并与实际 fontTools `TTFont`、`getBestCmap` 解码结果比较。没有调用正文提取来代替字体有效性检查。

使用本机现有 Python、pypdf 6.10.0、离线 fontTools 4.60.1；不安装依赖。以下 `python` 指本机已备这些依赖的 Python，可替换为其完整路径：

```powershell
$env:FONTTOOLS_PATH='D:/Project/Doc2GovPDF/tmp/fonttools'
python scripts/verify-pdf-subset-fonts.py build/qa/joint-signers-writer-verified/chrome/joint-signers.pdf build/qa/word-fallback-issuance/chrome/day-19.pdf build/qa/word-fallback-issuance/chrome/day-19.word.pdf --output build/qa/pdf-subset-fonts/old-and-word-control.json
python scripts/test-pdf-subset-validator.py --output build/qa/pdf-subset-fonts/mechanisms.json
```

第一条对旧联合稿预期退出码 1，并非验证器自身失败；旧 day-19 和原生 Word 对照可分别单独运行，预期退出码 0。

脚本 SHA-256：

- verifier：`40f74a3227619c9e080c2ba571aae13bb4e209683dec3cc8e820d73eda56937e`
- 机制测试：`6489680e74fa2cb7cfb7062020b1b749c9cbb7ef33ee2b4b22b1326993e4e2a7`

## 实际旧成品结果

三份实际 PDF 共检查 8 个字体程序（每份输入内部去重）：

| 输入 | 字体程序 | 结果 |
| --- | ---: | --- |
| 既有联合稿产品 PDF | 4 | 仅 Black 程序失败，另外 3 个通过 |
| 既有 day-19 产品 PDF | 2 | 两个均通过 |
| 同一 day-19 的原生 Word 导出 PDF | 2 | 必查结构/校验和/cmap/实际解析通过，保留下述搜索提示 advisory |

旧联合稿 Black 的 format 4 声明长度为 369（奇数），实际 fontTools `getBestCmap` 失败；全字体校验和为 `0xb1b2afba`，应为 `0xb1b0afba`。其 `head` 实存 adjustment 为 `0x1e0ceb5b`，完整 32 位独立计算应为 `0x1e0aeb5b`；各表目录校验和本身正确。因此不能用可显示、可提取或几何验收通过代签该容器有效性，也不能把这个结果扩大为旧产品全部字体都坏。既有 day-19 的偶数声明、lookup 和实际解析通过，不因 cmap 外仍有未使用数组字节而机械拒绝。

原生 Word 对照实际有 13 个表，冗余搜索提示仍为原 19 表对应的 `256/4/48`。验证器自行从真实 `numTables` 推导寻址，并把该差异列为兼容性 advisory；不因此放宽实际边界、表校验和、全文件 adjustment 或 cmap 错误，也不称该对照每一个 OpenType 冗余字段均规范。

## 17 项机制测试的边界

`test-pdf-subset-validator.py` 保存了同一批已跑的 17 项纯内存测试，独立 CLI 可复现；没有字体或 PDF 假文件写入仓库。覆盖有效 format 4 直接/间接映射、合法外部字节与共享子表/间隙、奇数/短声明、终止段、range offset、glyph count 越界，format 12 非 BMP 有效分组、越界/重叠/字形范围及长度错误，以及可选 OS/2/name/post 缺省、无 cmap 的明确不适用状态、完整 32 位 head 损坏仍拒绝。

机制测试不是实际产品字体通过数；实际 8 个程序与合成 17 项分别记录。缺少可选表不作为错误，无 cmap 不冒称已调用 `getBestCmap` 成功。合法子表共用 offset、子表间隙、外层 padding 或未被声明使用的额外 glyph 数组字节不被等同为坏数据。

## 来源、隐私与下一步

格式依据为微软的 [OpenType 文件结构与校验和](https://learn.microsoft.com/en-us/typography/opentype/spec/otff)、[head](https://learn.microsoft.com/en-us/typography/opentype/spec/head)、[cmap](https://learn.microsoft.com/en-us/typography/opentype/spec/cmap)。其目录说明建议解析器自行从表数推导搜索参数；验证器保留真实差异供评审，而不依赖这些历史优化提示。

报告仅含输入/字体 hash、计数、字体元数据和固定错误代码；不含正文、姓名、字符/字形序列或原始字体程序。未复制系统字体，不上传真实稿件或页面。QA 输出在被忽略的 `build/qa/pdf-subset-fonts/`；本日志摘要不依赖其他机器拥有这些本机文件。

验证脚本现冻结。生成端尚由父任务及另一子任务修复；新版本必须重新取得实际下载 PDF，并复核结构、映射/轮廓不变及实际页面。旧失败已复现、对照通过不代表新版本已修复，也不构成完整国标或跨接收端视觉一致性结论。
