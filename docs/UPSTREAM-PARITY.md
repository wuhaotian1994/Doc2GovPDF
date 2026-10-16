# 1.1.0 上游功能对照与验收

对照基线：gongwen-kit 0.3.1，提交 `d8dfe6a24e20ecaa64c14f3a79159813ad92db70`。2026-10-17 以 `git ls-remote` 再次确认远程 HEAD 未变。按公开源码、文档及公开测试完成下列迁移；没有把上游不可取得的两百多份私有业务文件算作本项目验收。

## 生成与修改

| 上游行为 | 1.1.0 实现及入口 | 验证证据 |
| --- | --- | --- |
| 通知、报告、请示、函、纪要、条文体、非红头 | 七种新建模板，正文/表格/附件编辑 | 七种短文及长文 Word/PDF；7 份上游原稿 |
| 单位标志、联合机关、多签发人 | 单/联合红头，共用“文件”垂直居中；签发人分行，最后一行与文号对齐 | TestExtendedTemplateElements；joint-notice、joint-request |
| 数字红头、预印红头套打 | 常规红头；套打不绘制红字和红线而保留位置 | preprinted 的实际 Word/Go PDF |
| 份号、密级期限、紧急程度、纪要期号 | “更多公文要素”，按文种适配位置 | letter-elements、minutes-issue、joint-request |
| 联合署名、不加印章、附注、独立版记 | 联合落款、相应对齐、独立印发单位和日期 | unsealed-joint、joint-notice |
| 单/多附件、不装订附件 | 附件说明、独立页、附件标题及文号引用 | detached-attachments；所有七类长文双附件 |
| 行文/条文四级编号、跨章连续条号 | 真实 numbering.xml，编辑时重算，PDF 同步 | 四级、101 条、跨章、关闭编号测试；automatic-articles |
| 表题、列对齐、跨页表头、纪要名单 | 表格弹窗与正文编辑，名单标签和人名分别用字 | 全部长文表格、纪要及新要素流程 |
| 生成后调整要素 | “公文要素”保留已编辑正文、表格和附件，支持撤销 | TestAutomaticNumberingAndMetadataUpdateKeepEdits；真实桌面第 5 阶段 |

## 三道检查与修复

| 上游来源/规则族 | Go 实现 | 验证及处理方式 |
| --- | --- | --- |
| check-doc：纸张、四边页边距、网格、角色字体字号、行距、缩进 | check.go、format.go、structural_roles.go | 格式测试、上游版心负例；六份合规文件整理后仍逐字节相同 |
| check-doc：日期有效性、年月日虚位、中文年份、日期分隔；文号括号/第/虚位 | conventions.go、text_corrections.go | 上游原始负例与文字样例；无效日期不猜改 |
| check-doc：单位间空格、范围单位、裸小数、简写年份、全角数字、混合数位 | 同上 | 正反例、引文/网址/代码保护；有歧义时要求核对 |
| check-doc：层次序号、重复编号、表头文字/型号例外、数字列错位 | numbering.go、table_conventions.go、numeric_checks.go | 原始负例及四级/条文编号回归 |
| check-num：合计、小计、总计、合计在首行/列 | numeric_checks.go | 多段小计、手写表、单项合计、合并格；不将比率或余额相加 |
| check-num：百分比 | numeric_checks.go | 完整构成与部分构成区分，避免部分项目误报 |
| check-num：标题/行内列举 | numeric_checks.go | 标题层级、“一是…”、二/两及章节作用域 |
| check-num：正文重复指标 | metrics.go | 主体、年份、单位、千分位、变化表述排除 |
| check-num：跨表指标 | metrics.go | 同主体/时期/单位才比较，模糊情形保守提示 |
| check-num：正文对表格 | metrics.go | 显式指标名及单位、两列表、单位换算；不推断任意语义对应 |
| style-scan：异形词及完整规范词表 | 内嵌上游词表、conventions.go | 词表测试、原始异形词正负例 |
| style-scan：半角标点、称呼、情态叠用、名词化、重复否定、拉丁缩写、工具痕迹/网址、表格句末标点 | conventions.go、table_conventions.go | 保留建议级别，引用和网址受保护，不一律当确定错误 |
| fix/text-rules：日期虚位、文号括号/第/虚位、〇年份、全角数字、中文语境半角标点/括号、单位空格、裸小数、异形词、重复编号 | text_corrections.go、protected_runs.go | 所有上游 23 对文字样例通过；保护相邻链接/旧修订/跨段引文 |
| fix：格式、文字修订、数字批注 | NormalizeLayout、局部 XML 修订、comments.go | Go messy 产物由上游 accept/reject 与检查器独立验收；真实 Word 识别 68 处修订和 2 条批注 |
| 批量修复与严格出稿 | repair_plan.go、workspace.go | 预览→确认→撤销；已保留项不再改；未确认疑点阻止正式输出，可另存待核对批注 Word |

数字核对只提示自洽关系，不判断真实金额；从不自动改数。总计使用绝对误差 0.005，而非上游 0.5% 相对容差，避免大金额下明显差错被放过。模糊的文风和语义规则仍为建议。

## 成品 PDF 与产品适配

独立解析 PDF 实际字体、标题字体回退、A4、纸张越界、空页、孤立标题和异常留白，界面支持逐页查看、定位和自定义允许字体。实际渲染的红头、红线、表格与附件另由逐页验收核对。PDF 检查不是模型参数检查，也不是 OCR 或完整国标认证。CJK 字体负例发现的解析库 CMap 问题已在本地依赖中修复，补丁说明和 BSD 许可随源码保留。

公开能力已迁移到桌面流程；以下是明确适配：

- 上游命令行、Node.js 库接口及面向代理的操作包装由桌面按钮和 Go 后端替代，用户无需安装 Node/Python/Office。
- 按用户要求取消独立检查报告，改为原文定位、修改和可选 Word 批注。
- 脚本严格模式的非零退出，改为正式输出前的前后端双重检查；有歧义的疑点允许用户核实后确认。
- 按用户要求仅本地发布；自动更新机制已实现，生产更新服务没有启用。
- 不追求任意复杂 Word 对象的重新排版。复杂对象优先原样保留；无法可靠转换时阻止 PDF。未修改的 DOCX 原字节返回。
- PDF 核对上限为 32 MB/100 页，20 秒独立隐藏解析进程；联合机关最多 6 个、签发人最多 12 人。超限提示，不静默截断。
- 本机缺少授权小标宋时使用明确提示的 Noto Serif SC 备用字体，不能称为指定字体合规。不同字体/Word/WPS 环境不承诺像素一致。

## 可复现证据

`testdata/upstream/parity/` 收录未修改的上游 negative.js/fix.js 产生的 44 份 DOCX、23 对文字样例、来源提交、SHA256 与许可证；七份原始样张位于相邻 gongwen-kit 目录。Go 测试直接读取这些文件，缺失会失败，不跳过。

```powershell
go test ./...
go vet ./...
./scripts/test-desktop.ps1
node scripts/test-journeys.mjs
python scripts/verify-journey-exports.py
node scripts/verify-upstream-repair.cjs
./scripts/verify-word-annotations.ps1
```

重新生成上游标本需检出固定提交并安装其开发依赖，再运行 `node scripts/upstream-parity-fixtures.cjs`。这只是开发验收依赖，不进入软件运行流程。最终验收环境、逐页记录与安装结果见 [STATUS](STATUS.md) 和 [1.1.0 版式验收](LAYOUT-AUDIT-1.1.0.md)。
