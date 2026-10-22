# Workbench CLI 安装与连接记录

日期：2026-10-22（Asia/Shanghai）。会话：01a16258。

## 用户授权与范围

- 用户要求安装阿里云 Workbench CLI 并连接其指定 ECS；随后明确允许补装阿里云 CLI，亲自完成 OAuth 授权后要求继续连接。
- 本轮完成本机工具安装、认证接入与远程只读身份验证；没有部署项目或修改远程业务文件。
- 不在仓库保存云账号凭证、OAuth 令牌、主机公网地址或实例标识。

## 安装与验证

- Workbench v1.0.4 安装到当前用户 `%LOCALAPPDATA%/Programs/workbench`，加入用户 PATH。官方 OSS 安装包 SHA256 验证通过。
- 阿里云 CLI v3.5.1 安装到当前用户 `%LOCALAPPDATA%/Programs/AliyunCLI`，加入用户 PATH；安装包 SHA256 与 `aliyun/aliyun-cli` 官方 GitHub Release 的 digest 一致。
- 额外安装阿里云 CLI 首次被自动审批拒绝（授权范围、缺少包校验）；未执行被拒操作，用户明确授权后使用官方 digest 校验方案完成。
- 官方 OAuth 命令会主动打开默认浏览器，故交由用户手动启动，遵守不抢占前台约定。用户确认授权后，STS GetCallerIdentity 调用成功。
- 本机阿里云 CLI profile 名为 `codex-workbench`。地域曾误填为 `0`，通过 ECS DescribeInstances 查询确认实际地域后改为 `cn-beijing`。

## 故障与修复

- 首次仅创建 Workbench `codex-workbench` profile，连接报后台进程启动超时。
- 单独运行 `workbench daemon start --profile codex-workbench` 得到明确错误：`load config: profile "default" not found in config`。该版本后台组件仍读取默认 profile。
- 使用官方交互配置命令增加 Workbench `default` profile，认证模式 `AliyunCLI`，明确引用阿里云 CLI 的 `codex-workbench` profile；没有复制长期 AccessKey。
- 修复后通过 `workbench exec` 成功执行 `hostnamectl` 与 `id -un`，确认用户指定主机为 Alibaba Cloud ECS、Ubuntu 24.04.5 LTS、Linux 6.8.0-139-generic、x86-64，登录用户 `root`。

## 状态与边界

- 连接目标已完成。后续连接需使用实例实际地域和 Workbench `default` profile。
- OAuth 与 Workbench 配置保留在本机用户目录下；不读取或输出令牌内容。
- 本轮没有修改现有产品源码；开始时已有的共享目录修改均未撤销、暂存或提交。
