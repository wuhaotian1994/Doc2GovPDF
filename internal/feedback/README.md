> 父任务整合更新：前端、证据制作和处理UI已在当前分支通过本地真实PG端到端验证；下文未接UI段落为后端子任务结束时的历史状态。当前完成项与真实收集边界见 [本地闭环交付](../../docs/FEEDBACK-CLOSED-LOOP-RESPONSE.md)。

# 独立反馈服务（本地开发）

本模块只接收用户在独立反馈动作中主动填写/选择的数据，不读取正文工作区。文稿的编辑、预览、导出不依赖此服务。默认未配置运营信息时 `/api/feedback/config` 返回 `enabled:false`，发送返回503，不能伪装成功。

## 本地运行与实际数据库验证

运行 `scripts/feedback-development.ps1 -DatabasePort 55440`，使用本机 PostgreSQL 的 `initdb/pg_ctl/psql`，在被Git忽略的工作树 `tmp/feedback-development/` 建立独立集群、数据库、私有附件和随机管理员凭据。仅监听回环地址，隐藏进程，不占用网页4173。已有其他集群占用端口时停止并提示，不操作那个集群。`-TestOnly` 仅做真实PG测试；`-Stop` 只停止记录中属于本目录的服务和集群，不删除数据。可通过 `-PostgresBin` 指定已安装PostgreSQL路径。

该脚本明确使用仅供虚构材料的本机开发配置及回环trust认证，不是生产配置。不要用真实稿件，不应将该集群映射到公网。管理员凭据只在忽略目录保存，不输出到日志或仓库。

单独运行测试需要 `FEEDBACK_TEST_DATABASE_URL`，数据库名称必须以 `_test` 结尾；测试会清空仅此库的反馈表。不设置时真实PG测试明确跳过，不把单元测试通过冒称PG验收。`go test ./internal/feedback ./cmd/feedbackd`，`go vet ./internal/feedback ./cmd/feedbackd`。

`cmd/feedbackd` 使用环境变量 `FEEDBACK_DATABASE_URL`、`FEEDBACK_ATTACHMENT_DIR`、`FEEDBACK_ADMIN_TOKEN`（至少32字符）、`FEEDBACK_ADDR`（仅回环）、可选 `FEEDBACK_STATIC_DIR`。开发需明确设置 `FEEDBACK_DEVELOPMENT=1`，只展示虚构材料提示。普通模式另以 `FEEDBACK_POLICY_FILE` 指定JSON运营告知（enabled/operator/purpose/accessScope/retentionDays/backupRetentionDays/deletionContact）。不能把本地功能完成理解为获准上线或真实收集。

## 私密API契约

全部响应 `Cache-Control:no-store`，不设置cookie，不接受跨站Origin。不把token放URL，不记录正文、IP、文件内容或凭据。必要收取/访问/回复/状态事件在私密PG审计表只记录动作、user/handler角色与时间，整条删除时级联清除。处理侧和反馈人都使用 `Authorization: Bearer …`。

- `GET /api/feedback/config`：告知、启用状态、development及通知配置；无凭据。
- `POST /api/feedback/threads`：JSON，或multipart字段 `payload`（JSON）与最多4个 `files`。字段 `clientRequestId`、`description`必填；岗位 `role`、目标 `goal`、影响 `impact`、`contact`、独立 `notify`、显式 `technicalInfo` 可选。技术信息只接受appVersion/browser/platform/errorCode/screenSize/engineVersion，字段均限长。当前尚未实现通知sender，config始终公开notificationsEnabled:false（政策JSON不能打开），`notify:true` 明确拒绝，不假装会通知。
- 前端在发请求**之前**用 `crypto.getRandomValues` 分别生成32字节base64url `clientRequestId` 和 `accessToken`，保留本次发送草稿和这两项。成功才展示 `{id,accessToken,status}` 回执。未提供accessToken可由服务生成，但若响应丢失，仅凭requestId不能取回凭据；前端应始终预先生成，以便结果不明时安全重试。
- 同一随机请求ID、同凭据、同内容重试返回200同一回执；内容变更或不同凭据返回409，不泄露原反馈；初次201。删除后相同原请求返回410，不重新创建。短期墓碑仅保存随机请求hash/凭据hash/到期日，不保存正文或联系信息。
- `GET /api/feedback/threads/{id}`：每次凭据验证，反馈/状态/负责人/修复版本/回复/附件清单。不正确和不存在均404；公共ID不可当读取凭据。
- `POST /api/feedback/threads/{id}/messages`：同样JSON或multipart，只接受新的clientRequestId、description和主动选择附件；补充请求同样幂等，最多100条消息/12附件。
- `GET/DELETE /api/feedback/threads/{id}/attachments/{attachmentId}`：每次私密凭据或管理员验证；不提供公开文件URL。
- `DELETE /api/feedback/threads/{id}`：停止访问、删除私有文件，再以事务删除正文/联系信息/回复/附件关系；失败返回503并保留待清理标记，由定时维护重试，绝不声称已经彻底清除。
- `GET /api/feedback/admin/threads`：管理员Bearer分页列表（每页最多100条，offset参数，nextOffset返回下一页位置）。相同admin路径加 `/{id}` 可读/删除，`/{id}/messages`回复；`PATCH /api/feedback/admin/threads/{id}` 接受 `{status,owner,fixVersion,relatedId}`。状态为received/needs_information/in_progress/resolved/unsupported。处理员应先回复明确结果/原因，再转最终状态。不自动发布GitHub或发送第三方AI。

## 附件与删除边界

只收可完整解码的PNG（每份最多4MB、边长4096、800万像素）与严格结构示例JSON（最多1MB/100块/3万字）。PNG在全局并发上限2的闸门后限资源解码、真实合成不透明白底并重新编码，去掉透明像素原RGB、附带元数据及尾随原数据，JSON拒绝未知字段并重编码；都以服务端生成的随机文件名存私有目录，不能直接从静态服务器读取。静态目录与私有目录核对真实解析路径，静态打开采用Go的os.Root限制链接/junction不可逃逸构建目录。原DOCX、ZIP、PDF、SVG、任意恢复包和未知JSON拒绝，不能相信扩展名、客户端脱敏声明或仅覆盖图层。服务端不保证可见像素/文字已经匿名；前端仍须制作、逐份预览、主动确认发送，涉密材料禁止。

示例JSON：`{"version":1,"kind":"doc2govpdf-feedback-example","title":"虚构回执","blocks":[{"type":"paragraph","text":"虚构文字"},{"type":"table","rows":[["项目","数量"],["示例","2"]]}]}`。没有原件、作者、修订、批注、字体或隐藏属性字段；原稿不在此API中处理。可选的最小安全语义为段落role（auto/body/title/heading/heading2/heading3/heading4/article/signature/date）、align（auto/left/center/right/both）、indent（auto/none/two）、before/after（auto/none/half/one），以及表格header布尔；所有字段缺省兼容旧schema，显式null/空串/数字/非法枚举、表格带段落语义或段落带header均拒绝。结构示例不是原Word/PDF页码/字体/像素复刻，分页或字体问题可附必要截图。

接收只在完整检查后写私有文件并关联PG事务；失败的未提交文件回收，数据库commit结果不明时保留待核对，不冒删可能已提交的文件。每分钟清理到期/待删材料，每小时以上无DB关系的孤儿文件会回收。应用删除已核数据库记录和私有文件；**不声称物理存储/WAL即时抹除或外部备份已销毁**。本地测试不配置应用备份；生产备份/快照/访问日志保留及删除承诺须有实际运维实现再启用收集，不能仅填写政策JSON即冒称完成。

此为可集成的本地后端，前端完整证据准备、处理后台UI、真实运营配置及端到端岗位体验仍需同一交付接通，不能单凭本模块称完整反馈正式可用。
