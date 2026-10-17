# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.0.1] - 2026-10-17

First public release.

### Added

- **Agents** — Claude Code (`Stop` hook), Codex CLI (`notify`), Kimi Code (`Stop` hook)
- **Channels** — Feishu, Lark, Slack, Bark, DingTalk, WeCom, PushDeer, Bluebird
- **Commands** — `install`, `uninstall`, `status`, `test`, `send`
- Multi-channel fan-out; one failing channel never blocks the others
- Interactive install wizard driven by a channel registry, plus full
  non-interactive flags (`--agents`, `--channels`, `--app-id`, `--url-*`, …)
- Idempotent hook injection with `.bak.<ts>` backups and clean restore
- Card titles use **this turn's** prompt; bodies use the agent's final reply
- Unicode grapheme-safe truncation
- `install.sh` for `curl | sh` installation with prefix and permission fallbacks
- Automated npm publishing on `v*` tags via GitHub Actions (OIDC + provenance)

### Notes

- Feishu / Lark use app bots (App ID + App Secret + chat ID), not group webhooks
- Slack renders a colored left bar and splits long bodies into multiple sections
- Bark appends a `————来自<agent>` footer
- Kimi replies are read from `~/.kimi/sessions/<hash>/<id>/context.jsonl`
- Requires Node.js ≥ 20; Bun is optional and only used for the single-binary build

[Unreleased]: https://github.com/hancic128/agent-notifier/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/hancic128/agent-notifier/releases/tag/v0.0.1
