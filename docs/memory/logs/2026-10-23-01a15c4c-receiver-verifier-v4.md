# 接收端验证器 v4：产品回导与显式本机字体 QA

- 只修改独立脚本 `scripts/verify-receiver-layout.py`，冻结 SHA256 `123f89f977dde89432b7f65cded05bedb198bbc8b71ce5774bbf79f99d5e1a14`。不修改生产、Office/本地服务、输入文件或旧 v1–v3 报告。
- 新增显式 `--renderer product`：仅 Producer 精确等于 `FPDF 1.7` 且 Creator 精确等于 `Doc2GovPDF` 时归为 product。报告 `renderer=product`、`nativeOfficeReceiver=false`。元数据是来源归类，不是防伪证明，产品回导绝不冒签 Word/LibreOffice 原生接收端。原有两个 native 选项仍需实际元数据匹配。
- 可选 `--font-map <本机忽略目录JSON>` 仅读取 JSON 明确列出的字体路径，先验证完整 SHA256，再验证实际 NameID1/NameID6。按真实完整字族加入字形源候选，不按别名/角色推测；同字族多份不同程序不擅选。报告角色、hash、来源类型及该程序是否已嵌入 DOCX，不输出路径或字体字节。无此 flag 仍仅使用 DOCX 内嵌程序；`--imprint-only` 不读取此 map、也不计签发字形通过。
- schemaVersion=4；完整模式仍检验原源三人顺序、2+1列、续行首列、末名/文号同基线、九个非空真实字形轮廓/16pt、版记字段/14pt/最后页、上下线真实像素可见、物理页底位置。版记窄模式范围不变。无文本/不支持字形或缺源不转成通过。

## 本机实际文件读测

- 输入为本轮 parent 提供的正常界面实际文件；官方源 JSON SHA256 `b8ef01d0cb760ff134d94ea6000f1f649d8f18d2e84d64b065a18fcfba262b25`。真实正文/姓名/原图/系统字体不进入 Git。
- `build/qa/receiver-final-native/inputs/joint-fallback.docx` 绑定实际产品回导 `build/qa/receiver-final-word-joint/{opened,reloaded}.pdf`，各 14 项 PASS、0 fail、0 unsupported；它们归类 product，不能替代 native Word/LO。
- 同轮 `inputs/joint-selected.docx` 绑定 `word/joint-selected.pdf` 与 `lo/joint-selected.pdf`，在显式本机 map 的实际 STFangsong/KaiTi 源程序核验后，各 14 项 PASS、0 fail、0 unsupported。不是借 fallback 名称证明所选字体。
- 新报告独立保存在 ignored `build/qa/receiver-v4-independent/{product-opened,product-reloaded,selected-word,selected-lo}.json`。这是对应指定实物的有界测量，不是准确 CEO 变体或全稿国标合规证明；父仍统一执行最终主要矩阵与实页 QA。
- 真实负对照：同 opened.pdf 请求 `--renderer word`，明确 fail 1/14；同 selected Word 不传 map，明确 unsupported 3/14（缺三人已核源），没有暗读系统字体。报告 `product-not-native-negative.json`、`selected-without-font-map-negative.json`。
- 源脚本还做了内存机制核对：product 双元数据精确匹配及近似/缺失拒绝、原 native 识别、实际 map 有效、hash/name 不一致拒绝；这些机制不替代上述实物验收。

## 可复现入口

使用已有离线 fontTools（`FONTTOOLS_PATH`）和已有 Poppler（`PDFTOPPM`），运行 Python：

```text
python scripts/verify-receiver-layout.py --source <本机源JSON> --docx <实际DOCX> --pdf <实际PDF> --renderer product|word|libreoffice --output <新的ignored报告JSON> [--font-map <显式本机QA map>] [--imprint-only]
```

缺少显式 map 不自动找系统字体，脚本不启动 Word/LO、不安装字体、不上传数据。旧 v3 报告原样保留。
