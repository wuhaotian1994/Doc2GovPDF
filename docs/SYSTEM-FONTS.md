# 网站默认公文字库

2026-10-23，用户明确确认已取得网站/应用字体嵌入授权。本页记录部署机制与技术验证，不把字体的fsType技术标志单独当作法律授权。授权合同由网站维护方保存；本仓库不存商业字库文件。

## 发布输入

私有目录默认 `.release-private/system-fonts/`，已被根.gitignore忽略；也可用环境变量 `GONGWEN_SYSTEM_FONT_DIR` 指向维护方的授权字库包。构建缺少任一所需字体或内部family/嵌入标志不匹配时停止，不把缺项交给终端用户。

| 文件 | 内部字族 | 用途 |
| --- | --- | --- |
| FZXBSK.TTF | 方正小标宋_GBK | 标题、版头 |
| FZFSK.TTF | 方正仿宋_GBK | 正文 |
| FZHTK.TTF | 方正黑体_GBK | 一级标题 |
| FZKTK.TTF | 方正楷体_GBK | 二级标题 |
| FZSSK.TTF | 方正书宋_GBK | 页码等 |

本轮在用户授权确认后，从公开机构的[公文字体资源页](https://idc.cqljxdfz.com/archives/gong-wen-zi-ti)取得原文件，核对实际内部身份与可编辑嵌入标志8；仅取上述五份。该下载页面不是授权证明，授权依据仍是用户对网站嵌入授权的确认。后续维护应使用维护方管理的正式授权包，不自动重新下载第三方资源。

## 构建与使用

`pwsh -File scripts/build-web.ps1 -Output dist/local-preview`

`scripts/prepare-system-fonts.mjs`生成 `fonts/system/*.ttf` 及资源清单中的family/PostScript名、SHA256和SRI。字体文件只进入发布产物，不进入公开Git。部署时须一并交付；浏览器Worker从本站加载，校验并缓存后才宣布引擎就绪。后续离线从已校验缓存加载，不读取本机字体、不要求用户找文件或授权。

缺字仍由已有系统补字资源自动处理，检查状态不能把缺字回退称为完整国标通过。系统包读取失败走排版资源重试提示，保留正文；构建缺包由维护方解决。

## Word

系统包通过独立的RegisterSystemFont入口登记。导出Word嵌入明确拥有系统来源标记的实际字体，并保留真实字族；普通用户字体不会因同名或替换继承系统嵌入标记。嵌入使用独立副本，不改写注册字节。完整字库嵌入便于接收方继续编辑，代价是Word较大；本轮包含五种字体的样稿约30.8MB，仍在现有50MB DOCX导入限制内。

## 本轮验证

Go office/webengine测试、系统来源不泄漏测试通过。test-system-fonts.mjs验证干净浏览器自动加载五种实际字体、没有字体权限请求或配置控件、实际PDF/DOCX、离线重开、灰色默认/蓝红hover。其他四组首页/文章/标记/九页预览回归通过。

隐藏Word16只读打开嵌入字体的虚构测试稿，1页、正文FZFangSong-Z02 16pt，源文件SHA不变。产品PDF与Word导出PDF实页均已查看。证据在ignored `build/qa/system-fonts/`；这不是所有文稿、所有接收端或全文国标合规的证明。
