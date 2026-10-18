# 浏览器界面字体

来源：[Google Fonts / Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)。上游文件 NotoSansSC[wght].ttf，SHA256 a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da，2026-10-18 下载。许可证为 OFL-1.1，完整许可在本目录 OFL.txt；Reserved Font Name 为 Source，本子集没有使用该名字。

scripts/build-web-fonts.py 从 tmp/NotoSansSC.ttf 生成 400/700 静态 WOFF 子集，覆盖当前界面及引擎提示用字。需要 fontTools。CSS 名称 GovUI；仅用于网页界面，公文 PDF 使用原有独立字体引擎。字体文件自托管，没有 Google Fonts 运行时请求。
