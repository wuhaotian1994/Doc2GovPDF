# gongwen kit 测试样张

共 7 组，每组包含 Word、PDF 和提取的纯文本。准备日期：2026-10-14。

- `docx/`：由上游未经修改的模板生成，使用上游 package-lock.json 安装依赖。七份生成任务及其内置体例、数字、文风检查均正常退出。
- `pdf/`：从上游 `docs/样张/` 原样复制，用于参考原项目的渲染效果。它们不是本次生成 DOCX 后重新渲染的 PDF，字体、分页应分别验证。
- `text/`：从 DOCX 正文及表格段落提取的 UTF-8 文本，便于测试当前预览版的导入、编辑和导出流程。表格结构、自动编号、页眉页脚和版式不保留，不能作为完整内容或版式比对基准。

1.0.4 已验证七份完整 DOCX 的导入、原样导出及 Go PDF 生成，并将它们与上游 PDF 和隐藏 Word 渲染结果逐页对照。可直接使用 `docx/` 内的样张测试。具体字体差异、页数及验收范围见 [逐页验收记录](../../../docs/LAYOUT-AUDIT-1.0.4.md)。

| 样张 | Word | PDF 参考 | 纯文本 | 上游模板 |
| --- | --- | --- | --- | --- |
| 公文要素全览 | [DOCX](docx/公文要素全览.docx) | [PDF](pdf/公文要素全览.pdf) | [TXT](text/公文要素全览.txt) | complete.js |
| 公文通知 | [DOCX](docx/公文通知.docx) | [PDF](pdf/公文通知.pdf) | [TXT](text/公文通知.txt) | notice.js |
| 公文请示 | [DOCX](docx/公文请示.docx) | [PDF](pdf/公文请示.pdf) | [TXT](text/公文请示.txt) | gongwen-qingshi.js |
| 公文信函 | [DOCX](docx/公文信函.docx) | [PDF](pdf/公文信函.pdf) | [TXT](text/公文信函.txt) | xinhan.js |
| 公文纪要 | [DOCX](docx/公文纪要.docx) | [PDF](pdf/公文纪要.pdf) | [TXT](text/公文纪要.txt) | jiyao.js |
| 公文管理办法 | [DOCX](docx/公文管理办法.docx) | [PDF](pdf/公文管理办法.pdf) | [TXT](text/公文管理办法.txt) | gongwen-guanli.js |
| 企业内部报告 | [DOCX](docx/企业内部报告.docx) | [PDF](pdf/企业内部报告.pdf) | [TXT](text/企业内部报告.txt) | qiye.js |

## 来源与验证

上游仓库：[imhuhe/gongwen-kit](https://github.com/imhuhe/gongwen-kit)，固定提交为 [`d8dfe6a24e20ecaa64c14f3a79159813ad92db70`](https://github.com/imhuhe/gongwen-kit/tree/d8dfe6a24e20ecaa64c14f3a79159813ad92db70)。许可证为 MIT，原始版权许可保存在 [LICENSE](LICENSE)。

[manifest.json](manifest.json) 记录来源、生成方式、21 个文件的大小及 SHA-256；[generation-output.txt](generation-output.txt) 保留七次模板生成和内置机检的原始输出。已验证 DOCX 内 XML/关系文件可解析、PDF 复制前后摘要一致、PDF 文件头有效。未重新渲染 DOCX，也未运行上游负例与修复测试套件。

模板内容是上游格式示例。请保留原样，用副本测试修改和导出；不要将示例中的单位、密级或数字当作真实业务资料。
