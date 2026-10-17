# agent-notifier

> Get a push notification the moment your coding agent finishes a turn.

`agent-notifier` wires Claude Code, Codex CLI and Kimi Code into 8 chat/push
channels. When a turn ends it sends a card containing **this turn's prompt** as
the title and **the agent's final reply** as the body.

[中文文档](README.zh-CN.md)

## Why

Coding agents run for minutes at a time and then stop silently. If you step
away, you have no idea whether the task finished, failed, or is waiting on you.
`agent-notifier` hooks into each agent's lifecycle event and pushes a summary to
your phone or team chat.

## Features

- **Three agents, one command** — auto-detects and hooks Claude Code, Codex CLI and Kimi Code
- **Eight channels** — Feishu, Lark, Slack, Bark, DingTalk, WeCom, PushDeer, Bluebird
- **Fan-out** — install several channels at once; a failure in one never blocks the others
- **This turn's prompt as the title** — not the thread title, not the first message
- **Idempotent install** — safe to re-run; original configs are backed up
- **Clean uninstall** — restores the agent config, keeps `.bak.<ts>` for diffing
- **Silent by design** — the hook process never writes to the agent's stdout

## Install

Requires **Node.js ≥ 20**. No global toolchain beyond npm.

### One-liner

```bash
curl -fsSL https://raw.githubusercontent.com/hancic128/agent-notifier/main/install.sh | sh
```

Pass flags after `sh -s --`:

```bash
# pin a version, install into a custom prefix, skip the interactive setup
curl -fsSL https://raw.githubusercontent.com/hancic128/agent-notifier/main/install.sh \
  | sh -s -- --version 0.0.1 --prefix "$HOME/.local" --minimal
```

The script checks for Node ≥ 20, installs globally, and falls back to
`~/.local` when the global prefix needs `sudo`. Set `AGENT_NOTIFIER_PREFIX`,
`AGENT_NOTIFIER_VERSION`, or `AGENT_NOTIFIER_NPM` instead of flags if you prefer.

### npm

```bash
# try it without installing
npx agent-notifier install

# or install globally
npm install -g agent-notifier
agent-notifier install
```

`pnpm add -g agent-notifier`, `yarn global add agent-notifier` and
`bunx agent-notifier` work too.

### From source

```bash
git clone https://github.com/hancic128/agent-notifier.git
cd agent-notifier
npm install
npm run build      # tsc → dist/node
./bin/agent-notifier install
```

## Quick start

```bash
agent-notifier install   # interactive: pick agents → pick channels → enter credentials
agent-notifier test      # send a test card to every configured channel
agent-notifier status    # inspect config and hook state
agent-notifier uninstall # remove hooks, keep backups
```

Non-interactive:

```bash
agent-notifier install \
  --agents claude,codex \
  --channels feishu,slack \
  --app-id cli_xxxxxxxx \
  --app-secret SECRET \
  --chat-id oc_xxxxxxxx \
  --url-slack https://hooks.slack.com/services/T/B/XXX
```

## Supported agents

| Agent | Trigger | Data source |
| --- | --- | --- |
| Claude Code | `Stop` hook | Injected into `~/.claude/settings.json`; reads the turn from `transcript_path` JSONL |
| Codex CLI | `notify` | Top-level `notify = [...]` in `~/.codex/config.toml`; JSON arrives as argv |
| Kimi Code | `Stop` hook | `[[hooks]]` in `~/.kimi/config.toml`; reply read from `~/.kimi/sessions/<hash>/<id>/context.jsonl` |

## Supported channels

| Channel | Auth | Card style |
| --- | --- | --- |
| Feishu / Lark | App bot: App ID + App Secret + chat ID | `interactive` card (lark_md) |
| Slack | Incoming webhook URL | Block Kit, long text split into sections, colored left bar |
| Bark | Device key URL | Plain text with `————来自<agent>` footer |
| DingTalk | Robot URL + optional signing secret | markdown |
| WeCom | Group robot URL | markdown |
| PushDeer | Push URL with `pushkey` | markdown |
| Bluebird (青鸟) | Generic gateway URL + optional bearer token | JSON (`title` / `body` / `level` / `fields`) |

### Feishu / Lark app setup

1. Create a self-built app at [open.feishu.cn](https://open.feishu.cn) (or [open.larksuite.com](https://open.larksuite.com))
2. Enable the bot and grant `im:message` and `im:message:send_as_bot`
3. Add the target group or user to the app's availability scope
4. Copy the **App ID** (`cli_…`) and **App Secret**
5. Use the chat ID: `oc_…` group, `ou_…` user, `on_…` department, or an email address

### DingTalk signing

If the robot uses **加签** (signing), paste the `SEC…` secret during install.
The signature is computed as `HmacSHA256(timestamp + "\n" + secret)` and
base64url-encoded, appended to the webhook URL.

## Commands

### `agent-notifier test`

Sends 《定风波·莫听穿林打叶声》 by Su Shi to every configured channel, verifying
credentials and reachability.

```bash
$ agent-notifier test
✓ feishu  → 200
✓ slack   → 200
✓ bark    → 200
```

Exits non-zero if any channel fails; failures print the first 300 bytes of the
response so you can see the provider's error code.

### `agent-notifier send`

The hook entrypoint. Normally invoked by the agent, not by you. For manual tests:

```bash
agent-notifier send --agent kimi --text "manual test message"
agent-notifier send --agent claude --text "build finished" --title "CI result"
```

Simulating real hook payloads:

```bash
# Codex notify — JSON as a positional argument
agent-notifier send --agent codex '{"type":"agent-turn-complete","last-assistant-message":"Fixed the refresh flow.","input-messages":["fix token refresh"],"thread-id":"abc"}'

# Kimi Stop — JSON on stdin
echo '{"session_id":"sess-1","cwd":"/tmp","hook_event_name":"Stop"}' | agent-notifier send --agent kimi --hook Stop

# Claude Stop — transcript path on stdin
echo '{"transcript_path":"/path/to/session.jsonl","session_id":"sess-2"}' | agent-notifier send --agent claude
```

Running `send` in a terminal without `--text` or piped input fails fast with a
usage hint instead of hanging.

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

Secrets are masked; safe to paste into an issue.

## Configuration

- Config: `~/.agent-hook/config.json` (mode `0600`)
- Agent config backups: `<agent-config>.bak.<unix-ts>`
- Kimi transcript: read in place from `~/.kimi/sessions/…`

### Example config

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

## Adding a channel

1. Add the type to `ChannelTypeSchema` in `src/config.ts`
2. Add a `ChannelMeta` entry (label, fields, docs URL) in `src/channels/registry.ts`
3. Implement `src/channels/<name>.ts` exporting a `ChannelAdapter`
4. Register it in `CHANNELS` in `src/commands/send.ts`
5. Add tests under `tests/`

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Development

```bash
npm install
npm run build        # tsc
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

Optional single binary (requires bun):

```bash
npm run build:bun    # → dist/agent-notifier-bun
```

## Roadmap

- [ ] Retry with backoff for transient network failures
- [ ] Per-channel message templates
- [ ] Windows support
- [ ] More agents (Gemini CLI, Cursor, Aider)

## License

[MIT](LICENSE)

Releases are published automatically when a `v*` tag is pushed — see
[RELEASING.md](RELEASING.md).