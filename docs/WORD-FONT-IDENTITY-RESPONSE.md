# 生成Word声明真实字族

这是既有全文国标P0中Word字体链路的一项局部修复，不是全文合规或跨客户端字体一致性完成声明。继续原PR5。

## 问题与行为

作者选择的真实字体字节已经用于PDF，旧生成Word却可能只写“仿宋”等用途名。现在生成稿的已有`ascii`、`hAnsi`、`eastAsia`、`cs`字体槽，会在可识别时写入当前已验证字体文件的legacy family（name ID 1）；不存在的槽不额外添加。正文用途、内容、字号和用户选择保持。原Word保真另存不进入此改写路径。

采用legacy ID1而非直接套用typographic ID16，是为了保住不同legacy家族的身份。本轮仓库OFL第二面ID1为`Noto Serif SC Black`，但ID16为`Noto Serif SC`；误用ID16会把Black的声明折成Regular所属家族。[Microsoft名称表规范](https://learn.microsoft.com/en-us/typography/opentype/spec/name)区分这两类名称；[RunFonts官方接口](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.runfonts)区分字体槽。该选择只修字族声明，不自动解决任意字重、斜体或字体类别判断。

再导入真实字族声明时，优先匹配当前已登记且唯一的面；显式用途仍优先。共享同一不可变面的别名可复用，同族不同面出现歧义时保守回退并提示，不落入旧关键词匹配任挑一个面。未知或不安全的身份不被伪称为已识别，没有新增持久字体名称缓存或字体字节副本。

自选字体仍不会因名称像Noto而自动嵌入。声明改写和嵌入许可来源分开：只有原本固定的内置OFL资源可按原路径嵌入，决定不依据改写后的名称。混合配置可能有合法同名内置OFL关系，因此不能单凭fontTable中出现同名关系，推断用户字体被嵌入或接收端使用了选定面。

页面沿现有字体设置说明：生成Word写已识别真实字族，接收端仍需对应字体；实际字体面、缺字、替代及分页仍须核对。原件保护、自选字体注册/别名的字节所有权没有改动。

## 当前代码与实际成品

- 新增6项Go专项覆盖已有四槽映射、第二面、同名但不同payload不泄露、未知/安全转义、歧义与原Word保护；office/webengine全量及vet通过。独立审查另重跑9项相关保护及office vet通过，测试范围有重叠，不相加为完成率。
- 三浏览器各18项，共54项正常UI任务通过；实际输出12对Word/PDF，共24份，绑定本轮Wasm `e403042ad6ba6ff318d11aab1e1d495b37522036eef45a2485f8bb209c1211ab`。身份来自真实仓库OFL字节，权限/列表/blob为确定性契约，不冒认客户实际系统字体授权。
- 自选、保存刷新、导出DOCX再打开三个阶段，正文16pt、原文字和数字保持，已有三个生成槽均为真实ID1 Black；cs若存在由相同逻辑改写，四槽能力另有Go夹具。PDF读取正文实际FontFile2确认所选Black；恢复备用后为Regular。未修改的原Word另存与输入逐字节相同。
- 每个DOCX字体部件按fontKey独立解混淆，完整SHA仅命中固定仓库OFL Regular/Black，无额外或悬空部件。用户来源禁嵌由custom-only及同名不同字节Go夹具另证；没有用同源OFL样本替代来源证明。
- 隐藏Word16实际打开四阶段DOCX，声明、正文和16pt均核，4份原生PDF及4份直接PDF共8页已渲染查看，无缺字裁切。**原生Word PDF资源仍与选定面不完全相同**，不能因Word返回请求名就说实际字形一致；字体资源观察和边界见[原生检查](evidence/word-font-identity/native-font-inspection.json)。
- 用户原始39块三表复现包在新引擎恢复、保存重开、实际导出精确保留；DOCX仍`0103c65e54813ac9aa8b15f9a65bfffaf56a7868dba0bb4b930ae7cb4915174c`，7页PDF解码内容流不变。此前组表实际Word/PDF内容也保持。未删除正文、缩字号或上传原稿/系统字体。

源码、构建、实际文件和已看页面指纹见[验收摘要](evidence/word-font-identity/summary.json)，[自选页面对照](evidence/word-font-identity/selected-direct-and-word.png)、[备用页面对照](evidence/word-font-identity/fallback-direct-and-word.png)。两张图均为明确虚构OFL机制稿，不是用户原稿或529段材料。

## 未关闭的实测问题

本轮另外发现：备用成品经本机Word再转PDF时，页面可读，但中文Unicode提取出现横线映射；pypdf和pdfplumber均复现，新Word实例单独打开也相同。产品直接PDF的文字精确保留。用上轮已验证引擎生成同一备用稿，DOCX与本轮逐字节相同，SHA `bffb215e00957881435b4654ca9a18af0cc088da4d42bf5f2c8478deb40d2fa7`，证明该边界不是本次字族声明引入。**这项Word接收/转换P0仍未修复，不计为文字提取通过。**

真实字体类别、当前稿逐字覆盖/回退、接收端实际字体面/字重与完整标准检查继续开放。用户已明确本机没有529段全量稿；本轮OFL机制稿和39块原稿回归均不代签该全量任务。没有合并PR、公开部署、启用真实反馈收集或上传文稿/字体。

最终交付使用同一冻结构建原样同步常驻4173，63个实际HTTP资源匹配；实际服务Chrome字体18项及空段组表23项通过，四份服务下载DOCX同已实际Word打开的源字节。提交后不重建，后台PID65964继续运行。
