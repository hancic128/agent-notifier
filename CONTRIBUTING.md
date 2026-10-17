# Contributing

Thanks for taking the time to contribute.

## Development setup

```bash
git clone https://github.com/hancic128/agent-notifier.git
cd agent-notifier
npm install
npm run build
npm test
```

Requirements: Node.js ≥ 20. Bun is optional and only used for the single-binary
build (`npm run build:bun`).

## Project layout

```
src/
  cli.ts              command routing
  config.ts           config schema + persistence
  card.ts             shared card data (title/body truncation)
  truncate.ts         grapheme-safe truncation, Slack section splitting
  agents/             per-agent detection, hook install/remove, transcript parsing
  channels/           per-channel payload builders (see registry.ts)
  commands/           install / uninstall / status / test / send
tests/                vitest suites
```

## Adding a channel

1. **Schema** — add the type to `ChannelTypeSchema` in `src/config.ts` and to
   the appropriate shape (`FeishuChannelSchema`, `WebhookChannelSchema`, or a
   new schema).
2. **Metadata** — add a `ChannelMeta` entry in `src/channels/registry.ts`:

   ```ts
   mychannel: {
     type: "mychannel",
     label: "My Channel",
     summary: "one-line description",
     docsUrl: "https://…",
     fields: [{ key: "webhookUrl", label: "Webhook URL", example: "https://…", required: true }],
   }
   ```

   The install wizard renders prompts from these fields, so no prompt code is
   needed.
3. **Adapter** — create `src/channels/mychannel.ts`:

   ```ts
   import type { CardData, ChannelAdapter, SendContext } from "./types.js";
   import { postJson } from "../http.js";

   export function buildPayload(card: CardData): unknown {
     return { /* your platform's JSON */ };
   }

   export const mychannel: ChannelAdapter = {
     type: "mychannel",
     buildPayload,
     send: async (card, opts) => {
       if (!opts.webhook) return { ok: false, kind: "http", status: 0, bodyText: "missing config" };
       return postJson(opts.webhook.webhookUrl, buildPayload(card), { timeoutMs: opts.timeoutMs });
     },
   };
   ```
4. **Register** — add it to `CHANNELS` in `src/commands/send.ts` and to
   `CHANNEL_ORDER` in `src/channels/registry.ts`.
5. **Test** — add a `buildPayload` snapshot-ish test in
   `tests/channels-extra.test.ts`.

Keep payload builders pure (no network) so they stay trivially testable.

## Code style

- TypeScript strict mode; `tsc --noEmit` must pass
- No new runtime dependencies without discussion — this tool aims to stay small
- Comments explain *why*, not *what*
- Channel modules must never write to stdout (hooks are silent by contract)

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(channels): add DingTalk signing support
fix(codex): pass --marker through CLI parsing
docs: clarify Feishu app scope setup
```

## Pull requests

- Keep changes focused; one feature or fix per PR
- Include tests for behavior changes
- Update both `README.md` and `README.zh-CN.md` when user-facing behavior changes
- CI must be green (`npm run typecheck`, `npm test`, `npm run build`)

## Reporting bugs

Open an issue with:

- OS and Node version
- `agent-notifier status` output (secrets are masked)
- The failing agent and channel
- Relevant stderr — the hook writes diagnostics there

Please **do not** paste raw webhook URLs, App Secrets, or push keys.

## Security

See [SECURITY.md](SECURITY.md).