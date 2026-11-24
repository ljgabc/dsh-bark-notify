# dsh-bark-notify

**DeepSeek Harness 的 Bark 推送插件** —— 当 DSH 需要你决策（审批或选择）或任务/目标完成时，推一条通知到 iPhone，及时回来操作，不用盯着屏幕等。

*A Bark push notification plugin for DeepSeek Harness: one push when DSH needs a decision (approval or question) or when a task/goal finishes, so you can return in time.*

简体中文 | [English](#english)

---

## 它解决什么问题

把长任务交给 DSH 之后，你要么盯着 GUI 等审批卡片，要么回来才发现十分钟前就卡在一个权限确认上。这个插件把「该回来了」压缩成一条推送：

```
DSH 需要决策 / 干完了 → Bark 服务器 → iPhone 通知
```

## 功能

- **四类推送场景**（均可单独开关）：
  - **需要审批**：工具请求权限确认时（`approval/request`）
  - **需要选择**：代理提出结构化问题 / 计划评审时（`user-questions/request`）
  - **目标完成**：会话目标标记完成时（`goal/changed`）
  - **任务完成**：一轮回合跑完时（`agent/status`），可设最短时长阈值
- **浏览器没开也不漏**：审批与提问的监听注册在 GUI 认领请求之前（waterfall `prepend` + `global`），推送先于界面卡片发出，桌面浏览器不在线照样推
- **防骚扰**：回合完成可设阈值（默认 60 秒，短回合不打扰）；子代理会话不推；目标完成的推送会在同一回合内抑制重复的任务完成推送
- **配置即改即生效**：所有配置项都是 volatile 字段，在插件页改完保存立即生效，无需重启 DSH
- **内容可读**：审批推送带工具名与原因，任务完成带工作目录、耗时和回复摘要；推送可配置点击跳转地址（比如你的 DSH 界面）
- **零依赖**：运行时只依赖 DSH 自带的 `@deepseek-ai/schemastery`，不引入其他包
- **中英文界面**：配置表单跟随 DSH 语言设置

## 安装

前置：DeepSeek Harness（≥ 0.2.2-rc.5），iPhone 上装好 [Bark](https://apps.apple.com/app/bark-customed-notifications/id1403753865) App。

**方式一：npm（推荐）**

在「插件 → 添加插件」对话框里只填包名本身：

```
dsh-bark-notify
```

或在终端：

```sh
dsh plugin --profile <你的profile> add dsh-bark-notify
```

**方式二：本地目录（开发者）**

```sh
git clone https://github.com/ljgabc/dsh-bark-notify.git && cd dsh-bark-notify && pnpm install && cd .. && dsh plugin --profile <你的profile> add ./dsh-bark-notify
```

> 本地目录方式先跑一次 `pnpm install`：以链接方式安装时 profile 不会安装插件的依赖，需在插件目录内备好。

> 安装或更新后需重启 DSH（profile 在启动期加载）。

## 配置

打开「插件」页 → **Bark 通知** → 展开配置：

| 配置项 | 说明 |
|---|---|
| Bark 设备 Token | Bark App 首页地址 `https://api.day.app/` 之后的那串字符；**留空则所有推送停用** |
| Bark 服务器 | 官方 `https://api.day.app`，或自建 bark-server 地址 |
| 点击跳转地址 | 点通知时打开的页面，例如你的 DSH Web 界面地址；留空不跳转 |
| 任务完成阈值（秒） | 回合运行超过该时长才推送「任务完成」；0 表示每次都推 |
| 推送场景 | 四类事件各自的开关 |

也可以直接写在 profile 的用户 patch 层（`~/.dsh/profiles/<profile>/cordis.patch.yml`）：

```yaml
- id: dsh-bark-notify
  config:
    deviceKey: <your-token>
```

## 数据与隐私

| 项 | 说明 |
|---|---|
| Token 存放 | DSH Host 侧的 profile 配置里；插件仓库与 npm 包内不含任何真实 Token |
| 推送路径 | 推送内容（标题/正文/跳转地址）发往**你自己配置的** Bark 服务器；官方服务器为第三方服务，介意可用自建 bark-server |
| 会话内容 | 任务完成推送最多带 120 字符的回复摘要；审批推送带工具名与原因，不含文件内容 |
| 是否读会话数据 | 仅在推送时读取最后一条助手消息做摘要，不落盘、不外发到 Bark 之外 |

## 已知边界

- 需要 iPhone 与可连通的 Bark 服务器；推送内容会经过该服务器
- 子代理（subagent）会话的回合完成不推送，避免噪音；审批/提问按全局事件观察，暂不区分子代理来源
- 「任务完成」只统计顶层会话的整轮回合，回合内的工具步骤不推

## 许可

[MIT](LICENSE)

---

<a id="english"></a>

# dsh-bark-notify (English)

A Bark push notification plugin for DeepSeek Harness: one push to your iPhone when DSH needs a decision (approval or question) or when a task/goal finishes, so you can return in time instead of watching the screen.

- **Four push scenarios**, each toggleable: approval requests, structured user questions, goal completion, and turn completion (with a minimum-duration threshold)
- **Works with the browser closed**: approval and question listeners run before the GUI claims the request (waterfall `prepend` + `global`), so the push fires even when no desktop client is connected
- **Noise control**: turn-completion threshold (default 60s), subagent sessions are filtered out, and a goal-completion push suppresses the same turn's completion push
- **Live configuration**: every field is volatile — save on the Plugins page and it applies immediately, no restart
- **Zero dependencies**: only the schemastery peer package that ships with DSH

**Install**: in the DSH plugin dialog, enter just `dsh-bark-notify` (published on npm; requires DSH ≥ 0.2.2-rc.5 and the [Bark](https://apps.apple.com/app/bark-customed-notifications/id1403753865) iOS app), or `dsh plugin --profile <profile> add dsh-bark-notify` in a terminal. Restart DSH after install.

**Configure**: Plugins page → **Bark notifications** → expand the form: device token (empty disables all pushes), Bark server (official `https://api.day.app` or self-hosted), tap URL, turn threshold, and per-scenario toggles. The token lives in your profile's Host-side configuration; push content goes only to the Bark server you configure.

License: [MIT](LICENSE)
