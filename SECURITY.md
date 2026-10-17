# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Email the maintainers at `security@example.com` with:

- a description of the issue
- steps to reproduce
- affected version (`agent-notifier --version`)

You can expect an acknowledgement within 72 hours and a fix or mitigation plan
within 14 days.

## Threat model

`agent-notifier` runs locally and stores credentials on disk. It does not
operate a server and does not phone home.

### Credentials at rest

- `~/.agent-hook/config.json` is written with mode `0600`
- Agent config files (`~/.claude/settings.json`, `~/.codex/config.toml`,
  `~/.kimi/config.toml`) are modified in place; backups keep the original
  permissions
- `agent-notifier status` masks App IDs, chat IDs, device keys and webhook
  tokens before printing

### Hook execution

Injected hook commands invoke the CLI by path; the Codex/Kimi commands include
a static `--marker` tag that the CLI accepts and ignores. Hook processes:

- never write to the agent's stdout
- exit `0` on "nothing to send" so they cannot block the agent loop
- have 8-second network timeouts

### What we do not protect against

- A local attacker with read access to your home directory
- Malicious edits to your agent config files
- Compromise of the third-party chat providers

## Dependencies

Dependencies are pinned in `package-lock.json`. Please report supply-chain
concerns even if they are not exploitable in this project.
