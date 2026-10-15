---
name: Doc2GovPDF
description: 专注正文、问题和交付的 Windows 公文工具
colors:
  primary: "#0067c0"
  primary-hover: "#005aab"
  text: "#222b38"
  muted: "#566477"
  canvas: "#f5f6f8"
  canvas-inset: "#edf0f4"
  surface: "#ffffff"
  border: "#d8dfe6"
  drop-boundary: "#b3c0cf"
  success: "#2c6b53"
  warning: "#805b15"
  warning-surface: "#fff7df"
  error: "#9a3926"
  error-surface: "#fff0ec"
  error-border: "#efc2b6"
  selection: "#cce4fa"
  selection-text: "#153b60"
  shadow-subtle: "rgba(0,0,0,.04)"
  shadow-paper: "rgba(0,0,0,.08)"
  shadow-overlay: "rgba(0,0,0,.18)"
  shadow-toast: "rgba(0,0,0,.13)"
  backdrop: "rgba(0,0,0,.25)"
rounded:
  control: "5px"
  dialog: "10px"
spacing:
  compact: "8px"
  group: "16px"
  section: "24px"
typography:
  caption:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  heading:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  brand:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  welcome:
    fontFamily: "Segoe UI Variable, Segoe UI, Microsoft YaHei UI, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.4
  document-body:
    fontFamily: "FangSong, 仿宋, SimSun, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.95
  document-title:
    fontFamily: "方正小标宋简体, SimSun, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.55
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 15px"
---

## Overview

从当前桌面实现提炼并约束后续界面。采用克制、熟悉的 Windows 工具语言；Squoosh 只影响输入、处理、输出顺序，ImageOptim 只影响专注程度。无需用户参与常规设计取舍。

## Colors

白色用于正文和可操作内容，浅冷灰区分窗口与工作区域。蓝色只强调主操作、选择与焦点。问题使用暖色且同时给出文字；成功色不用于宣称完整机检通过。

## Typography

界面使用系统中文字体，不下载外部字体。操作性正文以 14 px 为基础，辅助说明至少 12 px。文档预览独立使用公文字体意图，但必须说明实际 Word 字体与分页未核验。界面字体不冒充正式输出字体。

## Layout

标准窗口为 1120×780，保留系统标题栏。首页接收内容；浏览成品时为文档主区和 300 px 问题栏。点击“编辑正文”进入约 44% 左侧编辑、56% 右侧实时成品预览，两栏独立滚动；检查项收进左侧可展开区域，避免三栏挤压。720 px 最小窗口以及 640 CSS px 缩放场景均保留左右布局，只有低于 520 CSS px 时上下排列。它是桌面缩放适配，不是移动端产品承诺。

## Elevation & Depth

工具栏和侧栏使用分隔线；纸张使用轻阴影表达内容层。对话框只用于产品信息和可能替换草稿的确认。导出直接进入系统另存窗口，不增加报告选择步骤。禁止多层卡片和装饰性发光。

## Shapes

标准按钮使用 5 px 圆角，对话框为 10 px。图标使用一致的线条 SVG；避免将 emoji 或任意 Unicode 符号当图标。保留原生滚动条和 Windows 操作预期。

## Components

主按钮按当前任务突出；“编辑正文”是进入分栏工作台的普通按钮，“完成编辑”收起编辑区。编辑时预览始终可见，停笔约 450 ms 后自动排版，中文输入法完成组合后再触发；更新期间保留上一版并明确标注，成功后整体替换，避免闪白、光标丢失和旧结果覆盖新输入。问题列表采用分隔行，包含解释、原文、建议和确认操作。失败消息保留内容，并给出恢复方法。状态变化不增加装饰性入场动画。

## Do's and Don'ts

保留文件选择、可见焦点、Esc 关闭对话框、明确的另存动作和本地草稿状态。专业条款放在详情。不要营销式大标题、数字大屏、密集徽章、无用 eyebrow 标签或假合规评分。开发中能力必须在相关操作处说明。
