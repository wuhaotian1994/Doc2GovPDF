---
name: 公文 Web
description: 明亮、直接、像填表一样完成文档
colors:
  blue: "#2458b8"
  blue-hover: "#194594"
  tint: "#edf3fe"
  ink: "#202b3c"
  muted: "#5e6b7b"
  paper: "#fff"
  canvas: "#eef1f5"
  line: "#dce2ea"
  input-line: "#aeb9c8"
  error: "#aa2633"
  success: "#286545"
  focus: "#e5ab33"
typography:
  headline:
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
    fontSize: "26px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-.025em"
  title:
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.65
  body:
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.65
  hint:
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  control: "7px"
  dialog: "12px"
spacing:
  unit: "8px"
  pair: "16px"
  field: "24px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "10px 17px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 13px"
    width: "100%"
  format-option:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "14px 16px"
  format-option-selected:
    backgroundColor: "{colors.tint}"
  step-navigation:
    textColor: "{colors.muted}"
    padding: "0 0 28px"
  document-preview:
    backgroundColor: "{colors.paper}"
  dialog:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    padding: "26px"
    width: "min(540px, calc(100% - 32px))"
---

# Design System: 公文 Web

## Overview

**Creative North Star: “明亮的办公填写台”**

界面让人直接开始填写，纸张让人看清成品。白底、中文系统无衬线与克制蓝色组成日常办公表单的视觉语言；冷灰画布衬托真实文档，装饰服从阅读与操作。

本规范根据 `web/write.css` 与实际填写页面提取，适用于当前主流程。2026-10-20 用户明确授权重写，取代此前暖白、莓红、粉色接收区的导入式主页规范。旧网页保留在高级 Word 入口，旧桌面实现保留历史；它们的存在不改变本次主流程的视觉权威。具体页面方向见 [填写式文档方案](docs/GUIDED-WRITING.md)。

**Key Characteristics:**

- 直接的表单语言，可见标签与清楚的主操作。
- 留白与细分隔线组织信息，选填内容逐步展开。
- 界面字体与成品字体各司其职，真实 PDF 承担结果展示。
- 文字说明保存、更新、错误与下载状态。

## Colors

配色以稳定的蓝色行动提示搭配冷中性背景，颜色值以前述 token 和源 CSS 为准。

### Primary

`blue` 用于主按钮、当前步骤、链接、选中项与输入焦点；`blue-hover` 表示主按钮悬停；`tint` 只提供轻量选中底色。

### Neutral

`paper` 是表单和纸张底色，`canvas` 是预览画布及次要悬停底色。`ink` 承载正文与标题，`muted` 用于说明。`line` 划分区域，`input-line` 提供比区域线更明确的控件边界。

错误使用 `error`，完成状态使用 `success`，按钮和链接的键盘焦点使用 `focus`。每种状态都伴随文字或控件语义。

**The Action Color Rule.** 蓝色指向可操作或当前选中的内容，不用大面积装饰抢占纸张与正文的注意力。

## Typography

界面采用系统中文无衬线回退栈。CSS 首选 Noto Sans SC，但当前填写页没有单独声明自托管字体文件；不得将字体栈声明说成已加载该字体。预览使用实际 PDF 内字体，不能用界面字体假扮成品排版。

主标题使用 `headline`，窄屏降至 23px。小节标题使用 `title`；表单标签使用 `label`；正文默认使用 `body`；选填、提示和保存状态使用小字号辅助层级。正文输入行高为 1.9，保持长段落易读。窄屏输入和文本域使用 16px。品牌字为 22px，窄屏为 20px；没有营销式超大标题。

**The Two Text Contexts Rule.** 界面负责解释操作，PDF 负责展示文档；字体、换行和纸面比例不能在这两种上下文间混用。

## Layout

当前填写页最大宽度为 1600px，桌面表单与预览两栏比例为 0.95:1.05，各栏最小 430px。顶部产品栏高 80px，表单内边距为上 32px、左右 48px；1450px 及以上左右增至 64px。字段以 24px 间隔组织，相邻双字段间距为 16px。

1050px 及以下收紧留白，两栏最小宽度分别为 380px 与 340px。760px 及以下切为填写在上、预览在下，表单左右留白 22px，双字段改为单列，正文输入区限制最大高度 45vh。桌面预览在视口内保持可见并内部滚动，窄屏取消吸附与内部滚动。

三步导航、选填展开、摘要回改属于当前页面组合，其他新页面可复用其信息层级，不必机械复制三步结构。主要操作最小高度 44px；输入最小高度 46px。

## Elevation & Depth

表单与按钮默认平面，通过白底、冷灰画布和细边界区分层次。阴影仅强调纸张与模态浮层，不将普通字段包装成浮卡。

纸张阴影为 `0 6px 22px #1f30451a`，空预览纸张使用更轻的 `0 6px 22px #1f304510`，对话框为 `0 18px 60px #172a4230`，遮罩为 `#18243850`。这些扩展值记录在 sidecar，不属于 frontmatter 组件属性。

## Shapes

控件采用轻圆角 `control`，对话框采用 `dialog`。真实纸页保持直角，空纸页按 A4 比例 210:297 展示。步骤编号为圆形，其他信息不滥用胶囊形。图标是简洁描边 SVG，常规 20px、描边 1.6；不使用装饰插画替代内容或控件。

## Components

### Buttons

主按钮蓝底白字，次按钮白底深字并带输入级边框，安静按钮透明底灰字。悬停改变底色；禁用降低透明度至 0.5，并与业务状态一致。键盘焦点使用 3px 金色外框、外偏移 3px。背景与边框过渡为 0.16s ease，减少动态效果偏好下关闭过渡。

### Inputs / Fields

标签始终可见，选填标记紧邻标签，提示在控件下方；占位符只提供示例。焦点使用 2px 蓝色外框、外偏移 2px，同时改变边框。错误用红色边界与行内文字，并设置无效状态。正文允许垂直调整大小。

### Navigation

三步进度以数字圆圈和文字共同说明位置；当前步骤为蓝色实心圆与加粗文字，并使用 `aria-current="step"`。步骤按钮保持键盘可用。顶部提供保存、新建文档、我的文档、常用设置和字体设置。“保存”与 Ctrl+S 在主应用启动前也须持久保存，不能仅表示当前标签内暂存。窄屏隐藏品牌副标题，将操作排成独立一行；保存文字移至填写区上方，与“查看预览”并排，不能隐藏保存结果。键盘跳转链接平时裁剪隐藏，聚焦时展开。

### Cards / Containers

下载格式是一组带原生单选框的整行选择项，边框与轻蓝底共同表达选中；Word/PDF/TXT 的用途紧随名称，扩展名作为弱提示。摘要是带分隔线的定义列表，每行有对应“修改”，不用装饰卡片代替可扫描内容。

### Live Document Preview

预览加载不阻塞填写。启动或预览失败时，保留字段和当前步骤，明确说明可继续填写、下载草稿或重试；下一步不能退化成刷新整页的原生提交。异常提示沿用现有提示与按钮样式，不重设视觉系统。

冷灰画布容纳白色真实 PDF 页面；顶部显示生成状态，底部提供页码与翻页。手机支持跳到预览、返回填写、放大纸张后在画布内滚动，不撑宽整页。空态说明填写标题后的结果，不将虚构样张当作用户文档。更新失败或内容未同步时明确标明上一版，不能只保留看似已完成的纸张。

### Dialogs

整篇原文有非末尾日期时，将其后内容作为附注单独确认及预览，不默认提取；多处日期先选择原文行号，切换后重置落款用途确认。填写页通过“落款后还有联系人或说明？”折叠区域继续核对，摘要只在有附注时显示位置说明，不增加首页必填项。

整篇材料入口放在基本信息的折叠说明中，不增加步骤。联合署名用逐行输入与逐行候选展示，摘要空值表述为“未单独填写”，同时说明已在正文保留时无需重复添加。核对弹窗只列出候选原句及行号，所有用途选择默认关闭，整理后的正文预览随选择更新；没有标题来源、正文或存在冲突时不能采用。合并段内硬换行独立选择，采用后仍可查看或下载完整原文。取消只关闭预览；归档或保存失败应在当前弹窗说明，并保留现有稿和待整理材料。

写作中继续添加表格或纠正段落类型的入口放在正文旁的折叠说明中，沿用现有字段和按钮样式；操作前说明下载草稿副本、保留原稿与单向编辑边界。来自这个入口的高级页面聚焦“选择填写草稿”及后续步骤，解释“正文/一级标题”等语义选择，不引入字体行距参数，收起与本次任务无关的新建/示例导入宣传区，不改变普通高级入口的既有界面。

文档库、常用信息与字体设置使用同一轻圆角白色对话框，宽度受视口约束，最大高度 85vh，内容可滚动。文档库上限宽度 620px，其余为 540px。文档使用列表和分隔线，标题可换行，操作有文字标签。新建与库内切换自动归档，不重复询问；文件导入保留确认，删除明确确认。错误在当前弹窗或导出按钮旁出现，不只放在页面顶部。

## Do's and Don'ts

### Do:

- **Do** 从实际填写内容开始，使用可见标签与明确的选填说明。
- **Do** 保持主要操作的 44px 点击区和可见键盘焦点。
- **Do** 用真实 PDF 显示成品，并解释正在更新、失败与旧版本状态。
- **Do** 在窄屏保留内容与操作顺序，用上下布局延续预览能力。

### Don't:

- **Don't** 把已替代的莓红、粉色接收区或桌面壳当作当前主流程设计规范。
- **Don't** 用颜色单独表达错误、选中或完成。
- **Don't** 用占位符代替标签，或把可选字段默认展开成复杂参数面板。
- **Don't** 用静态图片模拟可操作表单或实时成品。
