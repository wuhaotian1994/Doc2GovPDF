# 私有 GitHub 仓库上传

日期：2026-10-21（Asia/Shanghai）。会话：01a15c4c。

- 用户要求将当前项目提交到自己的 GitHub 私有仓库，并明确选择新建 `Doc2GovPDF`。
- 已读取项目记忆索引及两个开发会话交接。当前分支 `main`，检查时 HEAD 为 `9a8bb66`，没有 Git remote。
- GitHub 插件确认账号为 `wuhaotian1994`；可见仓库中没有 Doc2GovPDF，已有私有仓库为 GISEngine，未向该无关仓库写入。
- 插件没有创建仓库工具；本机未找到 gh，Git Credential Manager 非交互读取未获得可用 GitHub 凭据。没有输出或保存凭据。
- 工作区有多个开发会话的未提交修改，未暂存、覆盖或提交。交接能识别旧网页移植文件归属，但新增填写流程和服务修改需要继续核对。
- 尚未创建远程仓库或上传代码。下一步需要可用的创建仓库/推送登录，或用户先创建私有空仓库并向连接器开放访问，再继续核对待提交文件与上传。

## 用户创建仓库后继续

- 用户提供 `https://github.com/wuhaotian1994/Doc2GovPDF` 并要求继续上传。GitHub 插件确认 `visibility=private`、具备 push 权限、仓库为空。
- 修正前轮登录判断：沙箱内非交互凭据失败不能证明本机没有登录。沙箱外执行 `git -c http.proxy= ls-remote` 成功，空输出确认远端无分支。Git 原代理指向不可用的 127.0.0.1:7994，本轮仅对命令禁用代理，不修改全局代理设置。
- 只读核对填写会话实际文件变更后确认新增服务、首次使用测试、favicon、缓存与填写改动归该会话；其仍在运行。旧网页迁移改动归属已有交接文件。
- 上传策略：已有 `9a8bb66` 及祖先历史到远端 main；用独立 Git index 创建当前明确归属源码快照到 `codex/workspace-backup-20261021`。不切换本地分支、不改变共享暂存区、不替其他会话宣布验收完成。后续正在发生的改动不属于这份时间点快照。
- 验证：三个 Go 包 cmd/webserve、internal/webengine、internal/office 测试通过；模型、文档库和 Worker 共 16 项 Node 测试通过。历史常见凭据特征扫描未命中。未重新进行 Word/PDF 页面验收，本次是私有源码备份。
- 构建产物、缓存、本地用户文稿按现有 .gitignore 排除；跟踪中的公开上游测试文档与开源字体保留。
- 上传完成并用 ls-remote 核实：main 为 `9a8bb666e71a3865eef1dfff49454d3ec47154de`；源码快照为 `954a77c060fcb5b46640a1270c6e145da14326da`，位于 `codex/workspace-backup-20261021`。GitHub 元数据再次确认 private。独立 index 操作前后共享 index 哈希一致，本地仍为 main。
- 本条交付记录作为备份分支的后续文档提交上传；不重新捕获正在发生的其他会话源码修改。未公开部署，未推送无关分支或标签。
