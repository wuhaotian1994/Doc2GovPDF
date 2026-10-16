# 上游公开正负例与修复标本

来源：gongwen-kit `d8dfe6a24e20ecaa64c14f3a79159813ad92db70`，MIT，Copyright (c) 2026 HUANGHE。许可见 LICENSE。

通过 `scripts/upstream-parity-fixtures.cjs` 运行未修改的 `tests/negative.js` 与 `tests/fix.js`，两套均成功。保留 44 个公开生成的 DOCX 和 23 组文字修正输入/期望值，manifest.json 记录固定提交与各文件 SHA-256。

negative/ 是全部必错、必过及“只提示”标本；repair/ 包括乱稿、上游修复/接受结果，以及六份合规件与其上游输出。没有私人业务文档。

Go 常规测试直接读取这些已提交的标本，缺失即失败，不因未运行 Node 而跳过。另用 `scripts/verify-upstream-repair.cjs` 通过上游读写器独立验证 Go 输出，结果放在被忽略的 build/qa/upstream-parity。
