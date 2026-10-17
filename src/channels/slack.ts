import type { CardData, ChannelAdapter, BuildContext, SendContext } from "./types.js";
import { postJson } from "../http.js";
import { splitForSections } from "../truncate.js";

// Slack rejects section text over 3000 chars; leave headroom for fence repair.
const SECTION_MAX = 2900;
const ACCENT = "#2EB67D";

export function buildPayload(card: CardData, _ctx: BuildContext = {}): unknown {
  const unixSec = Math.floor(card.ts / 1000);

  const bodyChunks = splitForSections(card.fullBody || card.body, SECTION_MAX);
  const attachmentBlocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: card.title },
    },
    ...bodyChunks.map((text) => ({
      type: "section",
      text: { type: "mrkdwn", text },
    })),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${card.agent} · <!date^${unixSec}^{date_short_pretty} {time}|now>`,
        },
      ],
    },
  ];

  // Blocks inside an attachment get the colored left border.
  return {
    attachments: [{ color: ACCENT, blocks: attachmentBlocks }],
  };
}

export const slack: ChannelAdapter = {
  type: "slack",
  buildPayload,
  send: async (card: CardData, opts: SendContext) => {
    if (!opts.webhook || opts.webhook.type !== "slack") {
      return { ok: false, kind: "http", status: 0, bodyText: "missing slack webhook" };
    }
    const body = buildPayload(card, {});
    return postJson(opts.webhook.webhookUrl, body, { timeoutMs: opts.timeoutMs });
  },
};