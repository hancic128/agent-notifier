# agent-notifier

> 你的 AI 编程助手一干完活，手机立刻响。

`agent-notifier` 把 Claude Code、Codex CLI、Kimi Code 接到 8 个聊天 / 推送渠道。
每轮对话结束时推送一张卡片：**标题是本轮输入**，**正文是 agent 的最后一次回复**。

[English](README.md)

## 为什么做这个

AI 编程任务动辄跑几分钟，然后无声无息地停下。你一旦离开电脑，就不知道它是
完成了、失败了，还是在等你确认。`agent-notifier` 挂到各 agent 的生命周期事件上，
把这一轮的摘要推到手机或群聊。

## 特性

- **三款 agent，一条命令** —— 自动检测并接入 Claude Code / Codex CLI / Kimi Code
- **八种渠道** —— 飞书、Lark、Slack、Bark、钉钉、企业微信、PushDeer、青鸟 Bluebird
- **多通道并发** —— 一次安装多个渠道，任一失败不影响其他
- **标题取本轮输入** —— 不是会话标题，也不是第一轮消息
- **可重复安装** —— 幂等合并，原始配置自动备份
- **卸载干净** —— 恢复 agent 配置，保留 `.bak.<ts>` 供 diff
- **全程静默** —— hook 进程绝不向 agent 的 stdout 写任何内容

## 安装

需要 **Node.js ≥ 20**，除此之外只依赖 npm。

### 一行命令

```bash
curl -fsSL https://raw.githubusercontent.com/hancic128/agent-notifier/main/install.sh | sh
```

参数写在 `sh -s --` 之后：

```bash
# 指定版本、自定义安装目录、跳过交互式配置
curl -fsSL https://raw.githubusercontent.com/hancic128/agent-notifier/main/install.sh \
  | sh -s -- --version 0.0.1 --prefix "$HOME/.local" --minimal
```

脚本会检查 Node ≥ 20，优先全局安装；若全局目录需要 sudo，会自动回退到
`~/.local`。也可以用环境变量 `AGENT_NOTIFIER_PREFIX`、`AGENT_NOTIFIER_VERSION`、
`AGENT_NOTIFIER_NPM` 代替参数。

### npm

```bash
# 免安装试用
npx @hancic128/agent-notifier install

# 或全局安装
npm install -g @hancic128/agent-notifier
agent-notifier install
```

也支持 `pnpm add -g @hancic128/agent-notifier`、`yarn global add @hancic128/agent-notifier`、`bunx @hancic128/agent-notifier`。

### 从源码构建

```bash
git clone https://github.com/hancic128/agent-notifier.git
cd agent-notifier
npm install
npm run build      # tsc → dist/node
./bin/agent-notifier install
```

## 快速开始

```bash
agent-notifier install   # 交互式：选 agent → 选渠道 → 填凭据
agent-notifier test      # 向所有渠道发一张测试卡片
agent-notifier status    # 查看配置和 hook 状态
agent-notifier uninstall # 移除 hook，保留备份
```

非交互式：

```bash
agent-notifier install \
  --agents claude,codex \
  --channels feishu,slack \
  --app-id cli_xxxxxxxx \
  --app-secret SECRET \
  --chat-id oc_xxxxxxxx \
  --url-slack https://hooks.slack.com/services/T/B/XXX
```

## 支持的 agent

| Agent | 触发事件 | 数据来源 |
| --- | --- | --- |
| Claude Code | `Stop` hook | 注入 `~/.claude/settings.json`，从 `transcript_path` 指向的 JSONL 读取本轮内容 |
| Codex CLI | `notify` | `~/.codex/config.toml` 顶层 `notify = [...]`，JSON 经 argv 传入 |
| Kimi Code | `Stop` hook | `~/.kimi/config.toml` 的 `[[hooks]]`，回复从 `~/.kimi/sessions/<hash>/<id>/context.jsonl` 读取 |

## 支持的渠道

| 渠道 | 鉴权 | 卡片样式 |
| --- | --- | --- |
| 飞书 / Lark | 应用机器人：App ID + App Secret + chat ID | `interactive` 卡片（lark_md） |
| Slack | Incoming Webhook URL | Block Kit，长文自动分段，左侧彩色竖线 |
| Bark | Device Key URL | 纯文本，末尾带 `————来自<agent>` |
| 钉钉 | 机器人 URL + 可选加签 Secret | markdown |
| 企业微信 | 群机器人 URL | markdown |
| PushDeer | 带 `pushkey` 的推送 URL | markdown |
| 青鸟 Bluebird | 通用网关 URL + 可选 Bearer token | JSON（`title` / `body` / `level` / `fields`） |

### 飞书 / Lark 应用配置

1. 在 [open.feishu.cn](https://open.feishu.cn)（国际版 [open.larksuite.com](https://open.larksuite.com)）创建企业自建应用
2. 启用机器人，勾选 `im:message`、`im:message:send_as_bot`
3. 把目标群 / 用户加入应用可用范围
4. 在「凭证与基础信息」复制 **App ID**（`cli_…`）和 **App Secret**
5. chat ID：`oc_…` 群聊、`ou_…` 用户、`on_…` 部门，或直接填邮箱

### 钉钉加签

机器人安全设置选「加签」时，把 `SEC…` 开头的密钥填进安装向导。
签名为 `HmacSHA256(timestamp + "\n" + secret)` 后 base64url 编码，附加到 webhook URL。

## 命令

### `agent-notifier test`

向每个已配置渠道发送苏轼《定风波·莫听穿林打叶声》，验证凭据与连通性。

```bash
$ agent-notifier test
✓ feishu  → 200
✓ slack   → 200
✓ bark    → 200
```

任一渠道失败时返回非零退出码，并打印响应前 300 字节，便于定位平台错误码。

### `agent-notifier send`

hook 入口，正常由 agent 调用。手动测试：

```bash
agent-notifier send --agent kimi --text "手动测试消息"
agent-notifier send --agent claude --text "构建完成" --title "CI 结果"
```

模拟真实 hook payload：

```bash
# Codex notify —— JSON 作为位置参数
agent-notifier send --agent codex '{"type":"agent-turn-complete","last-assistant-message":"已修复刷新流程。","input-messages":["修复 token 刷新"],"thread-id":"abc"}'

# Kimi Stop —— JSON 走 stdin
echo '{"session_id":"sess-1","cwd":"/tmp","hook_event_name":"Stop"}' | agent-notifier send --agent kimi --hook Stop

# Claude Stop —— stdin 给 transcript 路径
echo '{"transcript_path":"/path/to/session.jsonl","session_id":"sess-2"}' | agent-notifier send --agent claude
```

在终端直接运行且不给 `--text` / 管道输入时会立即报错并提示用法，不会挂起。

### `agent-notifier status`

```bash
$ agent-notifier status
config: /Users/you/.agent-hook/config.json
installed at: 2026/10/17 12:24:39
binary path: agent-notifier
channels (3):
  feishu  app cli_aa…dbef · 群聊 oc_425…7f6f
  slack   https://hooks.slack.com/services / T0C3… / B0C4… / aGzJ…VeZt
  bark    device WXsMvC…X6Li
agents:
  Claude Code: ✓ installed
  Codex CLI: ✓ installed
  Kimi Code: ✓ installed
```

敏感值已打码，可安全粘贴到 issue。

## 配置

- 配置文件：`~/.agent-hook/config.json`（权限 `0600`）
- agent 配置备份：`<agent-config>.bak.<unix-ts>`
- Kimi 会话正文：直接读 `~/.kimi/sessions/…`

### 配置示例

```json
{
  "version": 1,
  "channels": [
    { "type": "feishu", "appId": "cli_xxx", "appSecret": "…", "chatId": "oc_xxx" },
    { "type": "slack", "webhookUrl": "https://hooks.slack.com/services/T/B/XXX" },
    { "type": "dingtalk", "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=…", "secret": "SEC…" }
  ],
  "agents": { "claude": true, "codex": true, "kimi": true },
  "installedAt": 1792210319,
  "binaryPath": "agent-notifier"
}
```

## 新增渠道

1. 在 `src/config.ts` 的 `ChannelTypeSchema` 里加类型
2. 在 `src/channels/registry.ts` 补一条 `ChannelMeta`（名称、字段、文档链接）
3. 实现 `src/channels/<name>.ts`，导出一个 `ChannelAdapter`
4. 在 `src/commands/send.ts` 的 `CHANNELS` 中注册
5. 在 `tests/` 下补测试

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

```bash
npm install
npm run build        # tsc
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

可选单二进制（需要 bun）：

```bash
npm run build:bun    # → dist/agent-notifier-bun
```

## 路线图

- [ ] 网络抖动重试（指数退避）
- [ ] 按渠道自定义消息模板
- [ ] Windows 支持
- [ ] 更多 agent（Gemini CLI、Cursor、Aider）

## 许可证

[MIT](LICENSE)

推送 `v*` tag 时会自动发布到 npm，详见 [RELEASING.md](RELEASING.md)。