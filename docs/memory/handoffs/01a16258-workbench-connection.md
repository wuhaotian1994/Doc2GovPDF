# Workbench 连接交接

记录日期：2026-10-22（Asia/Shanghai）。会话：01a16258。状态：连接已完成；后续用户授权的部署见[部署交接](01a16258-ecs-deployment.md)。

## 完成项

- 用户指定的 ECS 已经通过 Workbench CLI 成功连接，并执行只读主机身份验证。
- 本机 Workbench v1.0.4 与阿里云 CLI v3.5.1 均安装完成，官方安装包 SHA256 已核对。
- 阿里云 CLI 使用用户亲自授权的 OAuth profile `codex-workbench`；已确认地域 `cn-beijing`。
- Workbench 使用 `default` profile，认证模式 `AliyunCLI`，引用上述 OAuth profile。不要删除该默认 profile：v1.0.4 后台组件在本次实测中没有遵循传入的命名 profile，缺少 default 会启动失败。
- 最近验证：`workbench exec` 执行 `hostnamectl` 与 `id -un` 成功，目标为 Ubuntu 24.04.5 LTS / x86-64，登录用户 root。

## 修改归属与边界

- 本轮仓库内新增文件仅为本交接与对应日志，当前未提交。其他共享工作区修改归原会话，未触碰。
- 本机安装目录与用户 PATH、`~/.aliyun` 和 `~/.workbench` 配置属于本轮获授权的环境修改，不进入 Git。
- 连接阶段没有部署、发布或修改远程业务文件；其后用户已明确授权本次指定 ECS 部署，原“没有后续部署授权”结论已被替代，范围和证据见[部署交接](01a16258-ecs-deployment.md)。
- 为避免公开仓库暴露基础设施标识，本记录省略主机 IP、实例 ID 与账号 ID；后续以用户当前指定目标和云端只读查询结果定位。

下一步：本轮连接任务无剩余项；等待用户安排具体远程工作。连接凭证过期时按官方 OAuth 流程重新授权。

相关日志：[安装与连接记录](../logs/2026-10-22-01a16258-workbench-connection.md)。
