# 中文备用字体

NotoSerifSC.ttf 和 NotoSerifSC-Black.ttf 来自 Google Fonts 的 Noto Serif SC，许可证见 OFL.txt。原始可变字体默认字重为 200，不能直接作为普通正文或标题使用；本项目用 FontTools 4.60.1 固化为 400 和 900 字重，保留全字库。

下载来源：https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf

原始可变字体 SHA-256：`050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9`

静态常规字体 SHA-256：`9502147ceba7b5bc7fd3415083f6a5d133f22d8f9efb4974d4b85f3a97ea2d3a`

静态 Black 字体 SHA-256：`0f048849cd9c0514f9915e25673801d37196c57af8e3b804f0185a3b23b53ac1`

重新生成时，将上述原始可变字体放入 `tmp/tooling/NotoSerifSC-variable.ttf`，在安装了 FontTools 4.60.1 的 Python 环境执行 `scripts/build-fallback-fonts.py`。正常编译直接使用已提交的静态文件，无需下载或安装字体。

系统缺失指定字体时供本地 PDF 使用，标题及红头选择 Black，其余选择常规字重，不将其标记为方正小标宋或仿宋。新建 DOCX 将所用的 OFL 备用字体嵌入文档，使 Word 无需在系统中另行安装即可使用；导入的原始 DOCX 仍按原件保留。系统字体仅在用户设备读取，不随安装包分发。
