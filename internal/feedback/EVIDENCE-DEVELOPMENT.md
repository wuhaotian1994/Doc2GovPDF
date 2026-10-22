# 本地证据副本组件实施记录

2026-10-22，feedback_backend 子任务继续承担关口B的独立证据组件。后台API/迁移保持冻结；没有修改主writer入口、HTML或其他Agent负责的反馈UI/CSS，没有提交或推送。本轮仅使用自造段表与生成的像素图，不使用用户真实复现包。

## 可接入的范围

`web/write-feedback-evidence.js` 导出：

```js
const evidence = installFeedbackEvidence({container, getDraft, onChange});
const files = await evidence.getFiles(); // [{id, name, blob, type}]
evidence.clear();
evidence.dispose();
```

组件不调用fetch/XHR、不写storage、不自动截图、不在安装时读取稿件。只有用户点击“从当前稿创建反馈副本”才调用getDraft。普通稿接受 `{fields:{title,body,postscript},content}`；原生Word `{nativeWord:true}` 明确拒绝自动抽取原件、批注、修订或恢复包，保留截图路径。主入口负责只传当前普通稿可见字段和结构，不传隐藏材料。

结构副本默认**全部不选**。用户选必要标题/段落/表格，可逐段和逐格改成虚构内容，或对已选内容统一替换。表格行列和空格位置保留，只有实际预览确认的内容加入清单。输出严格是后端既有白名单 version/kind/title/blocks（paragraph.text 或 table.rows），不含源ID、原件、sourceMaterial、pending、review、作者、修订、字体或其他恢复信息。常见手机号/身份证/邮箱及可能涉密标识仅作有限本地提示，不能承诺完全脱敏；涉密标识会阻止该示例加入清单。没有自动OCR或截图敏感内容识别。

用户可选择实际PNG或JPEG截图（原图最多8MB；解码前先查头部尺寸，边长4096/800万像素），本地通过拖动选区或像素坐标裁剪、圈注、实际不透明像素遮盖、撤销步骤。圈注不等于遮盖。先白底合成，再把处理结果生成最大4MB不透明PNG；只发最终像素，文件名使用通用名称，不保留原文件名、图片附带数据或编辑图层。原图及撤销步骤只保留在当前页面内存供回改，不加入发送对象。

最终清单展示实际PNG或结构示例及完整JSON，可移除/回改。回改中的旧附件暂时从发送清单移除；取消回改可恢复此前确认文件。clear/dispose清除副本与objectURL，原稿始终不变。最多4份最终证据。未确认的准备内容不会偷偷发送。

## 本轮实证

- `node --test scripts/test-feedback-evidence.mjs`：9项通过，覆盖白名单/默认不选/源信息排除/原稿不变/表格空格保持/原Word拒绝/资源边界/有限风险提示。
- `scripts/test-feedback-evidence-browser.mjs`：Chrome、Firefox、WebKit各16项，共48项通过。实际组件走过显式读稿、选择并替换段表、最终预览确认、回改/取消/移除、原Word拒绝与本地截图裁剪/圈注/遮盖/撤销。每个浏览器都保存真实PNG/JSON，核对没有POST等外发请求；本地blob预览不是网络上传。截图使用的虚构图很小，仅用于逐像素机制验证，不称实际业务版式或正式岗位盲测。
- `scripts/verify-feedback-evidence.py` 独立读取三浏览器6份实际文件：裁剪后52×36像素、192个指定像素全部为遮盖色，原位置颜色不再保留；保留区域的颜色/偏移准确，所有alpha为255，没有文字/EXIF元数据块或尾随原材料标记。三份JSON只含所选可见文字和真实3×2网格，原空白保持，没有未选标题、号码、源ID与隐藏字段。
- 这6份文件通过真实4187/PostgreSQL服务按3组创建、私密读取，确认服务端严格schema接受且PNG像素/JSON语义一致，随后逐条删除；结束时threads/messages/attachments/events均0。没有为了通过测试放宽后端schema。
- 视看三浏览器最终组件截图，发现坐标逐字段输入时中间非法矩形会重置其他已填坐标，导致局部遮盖偏移；本轮修为统一读取全部坐标，非法中间状态保留用户输入。复测核对**整个192像素区域**与裁剪后的保留点，而非仅抽查一个重叠像素。最终截图再次确认遮盖覆盖正确。

本机证据在被忽略的 `build/qa/feedback-evidence/`：browser-report.json、verified.json、三浏览器example.json/screenshot.png/prepared.png。不是已集成全站截图，不能当作完整反馈界面最终验收；父任务与发送UI Agent继续同PR集成并按真实浏览器→PG端到端核对。文稿生成引擎没有修改，因此本轮不冒称新增Word/PDF版式验收。

## 边界与接手

服务端仍不相信客户端已脱敏声明，对最终PNG再次白底合成/重编码、对JSON严格验证。原Word/ZIP/PDF和无法可靠处理的结构没有开放上传。有限号码/邮箱提示不覆盖所有身份信息、行业数据或截图内容；禁止涉密上传、用户逐项核对与明确发送确认仍必要。原Word不能抽取时不是把原包暗传给服务器的理由。

组件代码与后端已冻结；其他Agent独占主反馈表达、发送/回执/处理UI及CSS，父任务独占writer主入口。正常4173服务未被本子任务修改，真实收集/通知/运营及备份清理仍须按完整产品关口兑现，不能因本组件完成而称整体正式可用。


## 父审补充：保留所选块的最小排版语义

初版仅text/rows会丢作者手动指定的“正文/标题、对齐、表头”等线索，不能充分表达误识别问题。父审后本轮已补齐可选白名单：paragraph.role沿现有contentRoles的auto/body/title/heading/heading2/heading3/heading4/article/signature/date，align为auto/left/center/right/both，indent为auto/none/two，before/after为auto/none/half/one；table.header为布尔。只保留实际选中块已有的这些枚举，缺省不猜、不拷字体/ID/批注/任意属性。显式空值、null、数字、未知枚举及跨类型语义拒绝，前后端一致；旧schema不带字段继续可用。

选择与最终预览展示这些语义，表头true实际使用表头单元格。明确说明这是可检查的结构示例，不是原始Word/PDF页码、字体或像素复刻，分页/字体问题可再附必要截图。没有因该改进恢复完整原件或隐藏信息上传。

本轮限定回归：Node11项通过（新增合法语义/非法值一致拒绝），三浏览器各17项共51项通过（最终JSON与中文语义/表头预览保留），后端真实PG生命周期与go vet通过。仅一次测试断言把新选中的表标题段当成表格固定索引，已改为按type识别测试对象；产品语义输出原已正确，未为测试放宽schema。

先前不带语义的6份副本真实HTTP验证属于历史版本，`verified-before-semantics.json`不能代替本轮新增字段的HTTP验收。本轮3浏览器生成的新PNG/JSON位于原证据目录；父任务已安排独立4188及专用测试库从当前冻结源码验证完整浏览器→PG链路，本子任务不动4173、4187和共用静态目录。`verify-feedback-evidence.py`已支持FEEDBACK_TEST_HTTP_URL指定父的回环服务，仅读新副本、核语义、3条虚构创建/私密读取后删除；它未被旧4187 schema报告冒称通过。最新实际集成结果以父任务记录为准。
