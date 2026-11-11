# dsh-bark-notify

DeepSeek Harness (DSH) 插件：当任何会话需要你决策（审批 / 选择）或任务 / 目标完成时，通过 [Bark](https://github.com/Finb/bark-server) 服务器向 iPhone 推送通知，点击通知可跳回 DSH 界面。

## 推送场景

| 场景 | 事件 | 标题 |
|---|---|---|
| 权限审批（如沙箱提权） | `approval/request` | DSH 需要审批 |
| 向你提问 / 需要选择 | `user-questions/request` | DSH 需要你选择 |
| 会话目标标记完成 | `goal/changed` | DSH 目标完成 |
| 回合跑完（仅超过阈值时长的） | `agent/status` → idle | DSH 任务完成 |

- 全局生效：监听 Host 进程上所有会话；子代理会话不推送「任务完成」（防刷屏）。
- 目标完成与任务完成不重复：同一回合内目标完成推送后的 120 秒窗口会抑制任务完成推送。
- 推送为 fire-and-forget：绝不阻塞审批 / 提问链路，GUI 卡片零延迟。

## 安装

```sh
# 在 DSH 里让 agent 执行，或手动：
# 把本目录作为 bundle 安装到 profile（plugin_manager install_bundle <本目录绝对路径>）
```

## 配置

插件 → Bark 通知 卡片 → 详情页表单（保存即时生效，无需重启）：

| 字段 | 说明 |
|---|---|
| Bark 设备 Token | Bark App 首页地址 `api.day.app/` 后的那串字符；留空 = 停用推送 |
| Bark 服务器 | 默认 `https://api.day.app`，自建填其地址 |
| 点击推送跳转地址 | 点击通知打开的页面（如 DSH 界面地址）；留空不跳转 |
| 任务完成推送阈值（秒） | 默认 60；回合运行超过该时长才推送，0 = 每次都推 |
| 推送场景开关 ×4 | 审批 / 选择 / 目标完成 / 任务完成 |

> **不要把真实 token 写进本仓库**：bundle 的 `cordis.patch.yml` 只放默认值，真实 token 写在 profile 用户补丁层（`~/.dsh/profiles/web/cordis.patch.yml`）：
>
> ```yaml
> - id: bark-notify
>   config:
>     deviceKey: <your-token>
> ```

## 开发

```sh
node --check index.js && node --check client.js   # 语法检查
node .test/client-module.mjs                      # 客户端模块注册模拟
node --import ./.test/register.mjs ./.test/run.mjs  # 宿主侧行为回归（本地 mock Bark 服务器）
```

`.test/hooks.mjs` 将裸导入 `@deepseek-ai/schemastery` 映射到本机 dsh 安装目录，路径不同请自行调整。
