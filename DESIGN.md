---
name: 公文整理 Web
description: 以文件和成品画布为中心的浏览器公文工具
colors:
  primary: "#8d243a"
  text: "#30242a"
  muted: "#706269"
  background: "#faf7f2"
  input-surface: "#f4c6d2"
  canvas: "#eee9e4"
  surface: "#ffffff"
  border: "#ded6d3"
  highlight: "#f3d569"
rounded:
  control: "8px"
  surface: "16px"
---

## Current authority

2026-10-18 用户明确要求纯网页版，且不要旧桌面设计。本文件替换原设计规范；旧 frontend/ 是保留的桌面版本，当前界面源代码为 web/。直接采用已确认的 Squoosh / ImageOptim 文件工具方向，不重新要求用户选风格。

## Visual world

温暖白底、莓红操作、粉色文件接收区、少量黄色示例提示。沿用文件工具熟悉的导入→检查/编辑→下载关系；不采用 Windows 仪表盘或灰蓝桌面壳。首页的纸张示例明确标为示例，可直接打开真实文稿。纸张是内容，不做背景装饰。品牌来自大块接收区和清晰的纸张画布。

## Type and spacing

自托管 Noto Sans SC 界面子集 400/700，不向外部字体服务请求。15px 默认文字，13px 操作正文，11–12px 辅助标签；首页标题桌面 52px、手机 34px。正文编辑和界面文字使用同一可读的无衬线；成品画布使用实际 PDF 字体。小标题上方留足空间。控件通常至少 44px；密集桌面次要工具允许 36px。

## Composition

首页最大 1120px，顶部简洁品牌与核对/偏好入口。第一屏明确导入、粘贴、示例、新建；有草稿时提供继续入口。工作区以纸张画布为中心，检查项使用右侧窄栏。进入编辑时左侧正文/检查，右侧始终显示 PDF。默认整页预览，可切换适合宽度。手机上下布局并独立限制长编辑区高度。表单沿用真实文种字段与渐进展开。

## Behavior

Word/TXT 从浏览器选择或拖入；输入不上传。保存为 IndexedDB 草稿，原件不覆盖。PDF 下载一份文件，Word+PDF 一次下载 ZIP，避免多文件权限干扰。返回首页与浏览器返回都保留当前工作。复杂要素、授权字体、PDF 核对均有可见入口。受保护文字及数字不猜改，批量整理先确认。

## Verification contract

Impeccable Operate / craft-floor 与 UI/UX Pro Max 用于状态、响应式、键盘和可读性核对。用户既有“不询问常规设计选择”的指令优先于技能访谈。参考已明确，concept-seed 不覆盖此选择。代码实现后用真实引擎的无头浏览器分别核对桌面/手机，最多两轮视觉检查；功能测试单独覆盖导出、恢复和离线。
