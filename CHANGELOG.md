# Changelog

## 1.0.1

- 修复：`@deepseek-ai/schemastery` 从 peerDependencies 改为 dependencies。profile 安装不会解析 peer 依赖，导致插件模块从安装位置无法解析 schemastery、激活失败（ERR_MODULE_NOT_FOUND）。改为常规依赖后插件自包含。

## 1.0.0

- 首次公开 npm 发布（此前自用名为 `@local/bark-notify`）。
- Bark 推送四类场景：审批请求、用户提问、目标完成、回合完成（最短时长阈值）。
- 审批/提问监听注册在 GUI 认领之前（waterfall `prepend` + `global`），浏览器不在线也推送。
- 防骚扰：子代理会话过滤、目标完成抑制同回合的完成推送、阈值控制。
- 插件页配置表单（中英文），全部配置 volatile，保存即生效。
