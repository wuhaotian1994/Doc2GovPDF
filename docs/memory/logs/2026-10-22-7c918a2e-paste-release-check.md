# 粘贴暂排功能交付前证据复核

记录日期：2026-10-22（Asia/Shanghai）。独立验证代理标识：7c918a2e；父会话：01a15c4c。工作树：ceo-001，分支 codex/ceo-004-materials；源码由父会话维护，本代理不暂存、提交或推送。

### E01 · 2026-10-22 · 当前冻结构建与实际服务重新绑定

- 类型：验证；状态：已验证、尚未提交。
- 先读取 AGENTS、INDEX、父交接和 DRAFT-FIRST-PASTE-RESPONSE，核对 Git 状态；父会话的 web/文档、后端代理的 go.mod/go.sum/internal/feedback/cmd/feedbackd 均不归本代理修改。
- 最终三浏览器报告各 25 共 75 项，实际服务 25 项，均 passed 且 errors 为空；Node 最新报告为 47 项通过，将回应文档中的旧数字 46 更正为 47。既有提醒 66、启动 33、v4/v5 恢复各 18 项由现有报告重新核查。
- 用隐藏 Chrome 对原本持续运行的实际服务重跑 test-writer-continuous.mjs，31 项通过；未重建资产、重启服务、抢占前台或读取用户复现包。
- 再运行 render-assembly.py，8 张当前真实 Word/PDF 页图 SHA256 与此前逐页查看的 8 张完全相同；因此当前 PDF 元数据更新不改变已验版面。重新运行 verify-assembly.py：三浏览器 9 组真实 Word/PDF、编号/年份/作者改动/表格空格/原文恢复核验通过。
- verify-assembly-service.py 当前结果：75 / 25 / 31 项，36 个 HTTP 资产，8 页指纹通过；原 Word 三份 sourceSHA 与逻辑全文 SHA 仍对应当前下载，七组成品的 Word 字节与 PDF 页面内容/嵌入字体/纸幅匹配。实际 Wasm 仍为 41cdb7e3650b0ced56ac415bd13aacd8d7a311c7faa185acfc4bfe69b0c9bd2c。
- 公开证据仅 docs/evidence/draft-first-paste 中原有虚构等价材料，新增 release-revalidation.json 记录 8 页哈希对照。本代理没有将用户卫生通知复现包、真实原稿、字体或其内容复制到公开证据。
- 第一次补证脚本因 Windows Python 默认 GBK 解码含中文 JSON 失败，尚未写入文件；显式 PYTHONUTF8 后完成。本次是验证辅助脚本环境问题，不是产品故障。
- 边界：只覆盖父会话冻结的暂排功能构建，不是随后并行分页修复的验证，不把旧短样本当卫生通知原稿复现或全文标准认证。实际服务继续保持运行；父会话负责源变更后的必要验证并收口原 PR。
