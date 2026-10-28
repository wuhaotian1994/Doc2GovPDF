> 父任务整合更新：前端、证据制作和处理UI已在当前分支通过本地真实PG端到端验证；下文未接UI段落为后端子任务结束时的历史状态。当前完成项与真实收集边界见 [本地闭环交付](../../docs/FEEDBACK-CLOSED-LOOP-RESPONSE.md)。

# 反馈后端开发记录与接手点

2026-10-22，01a15c4c 的 feedback_backend 子任务；用户明确授权子Agent并行研发后开工。本文件是**后端本地增量**记录，不是完整反馈产品或上线完成声明。只用自造文字、生成的PNG和小型示例JSON；未读取、上传或用于本反馈测试的用户原稿复现包。

## 实际完成

- PostgreSQL迁移，pgx/v5.7.6驱动；收取、随机私密回执、仅存token hash、同请求同凭据同内容去重、结果不明安全重试、补充、处理员列表/分页/接手/状态/回复/修复版本/同类关联。
- 附件明确可验证的PNG和限定结构JSON；限体积/像素/数量，先检查再私有保存，逐请求鉴权读取与移除。原DOCX/ZIP/PDF/任意恢复包拒绝，不相信客户端“已脱敏”的声明。PNG不透明白底实际合成、元数据/透明原RGB去除，JSON未知字段拒绝。可见文字/像素是否包含敏感内容不能由这些技术步骤保证。
- 单附件及整条删除，级联正文/联系信息/回复/附件关系/私密事件；失败保持待清理而不假称成功，到期/孤儿回收。删除后的随机请求/凭据hash短期墓碑防止重试重建原文，不保存正文。
- 全局接收并发上限2（503保留填写重试），每IP一分钟60次且仅内存hash、不记录IP；固定请求/字段/附件限额。日志不含正文或凭据。
- 独立回环cmd/feedbackd，不改既有4173/文稿服务。未配置运营告知默认收集关闭；开发模式只为虚构材料。通知sender尚未实现，接口始终声明notificationsEnabled:false，任何notify:true均拒绝，政策JSON无法自证接通。

## 验证与发现

发现本机已有 PostgreSQL 13.21，故未下载第三方数据库、不依赖不可用Docker，不用SQLite替代。最终可复用独立集群位于被Git忽略的 `tmp/feedback-development/pg-data`，回环端口55440；`feedback_backend_test`只供可清空的集成测试，`feedback_local`只供虚构HTTP走查。早期另一个开发集群55439已停止，未操作机器原有实例。

最终实测命令：

```powershell
$env:GOMODCACHE="$PWD/tmp/gomod"
$env:GOCACHE="$PWD/tmp/gocache"
$env:FEEDBACK_TEST_DATABASE_URL='postgres://feedback_dev@127.0.0.1:55440/feedback_backend_test?sslmode=disable'
go test -count=1 -v ./internal/feedback ./cmd/feedbackd
go vet ./internal/feedback ./cmd/feedbackd
python scripts/test-feedback-http.py
```

真实PG生命周期通过：创建/私密token hash/不同凭据拒绝/同内容重试/内容冲突/补充重试/处理回复状态版本/附件读取鉴权/文件物理移除/整条删除/删除后不重建/到期与孤儿回收/跨连接持久读取/并发背压后安全重试且无重复条目。未配置时测试明确SKIP，不将纯单元算PG结果。

实际独立HTTP服务对政务经办仅文字、学校办公室结构示例、医院行政生成PNG三种**虚构角色契约**，走过发送→同请求核对→私密读取→补充→处理回复/状态/版本→单附件删除→整条删除。不是浏览器UI或真实岗位盲测。最终数据库 threads/messages/attachments/events 计数均0，私有附件文件数0；只有短期hash墓碑保留。日志核对未含测试正文与访问凭据。证据位于本机被忽略的 `build/qa/feedback-backend/final-tests.txt` 与 `http-contract.json`，后者含实际日期/源码hash，不应拿旧报告替代后续源码验证。

研发中真实修复：不明commit不冒删可能已提交附件；multipart附件顺序不影响去重；删除墓碑防内容再生；并发像素解码资源限制；透明像素残留原RGB；无sender但可配通知开关；静态链接/junction逃逸；`..private`目录名被错误当树外。独立只读审查Agent复核上述安全回归与vet，通过真实Windows链接和两点目录名测试；它的PG测试明确SKIP，其结果不冒计PG支持。

反复运行HTTP测试曾正确触发429，未误认接收成功；仅移除已确认虚构测试残留后，在新窗口完成最终一次全链。服务测试受现有代理环境影响时直接HTTP请求需清除代理；Python契约脚本已显式禁用代理。Windows脚本创建随机凭据用兼容.NET Framework的RNG实例；所有启动进程隐藏。

## 尚未交付与下一步

前端表达/发送清单、裁剪圈注遮盖与最终预览、从当前稿构建最少结构副本、私密回执UI、内部处理UI尚未接通。正常4173仍是既有文稿服务，没有接收真实反馈的入口；不能把关口A后端API测试冒称A/B完整用户交付。通知、备份/快照清除、实际运营主体/处理范围/删除承诺及真实启用条件仍待实现落实。应用DELETE不等于磁盘/WAL即时抹除；外部备份没有清除实现，不能承诺已清除。

集成接手先读同目录README。`scripts/feedback-development.ps1 -DatabasePort 55440 -ServicePort 4187`可重建独立虚构开发服务；已有记录进程运行时先显式`-Stop`。4187现运行最终安全代码，仅供本机虚构材料接入；它服务已构建静态目录，未修改既有4173。所有凭据留在忽略目录，不写入本记录或PR。

本子任务未切分支、暂存、提交或推送，未改前端、cmd/webserve、全局INDEX或父交接。拥有的改动只有 `internal/feedback/**`、`cmd/feedbackd/**`、`scripts/feedback-development.ps1`、`scripts/test-feedback-http.py`、go.mod/go.sum。由父任务按同分支/同PR整合，不能独立宣告完整反馈正式可用。
