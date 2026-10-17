import type { CardData, ChannelAdapter, SendContext } from "./types.js";
import { postJson } from "../http.js";

export function buildPayload(card: CardData): unknown {
  return {
    msgtype: "markdown",
    markdown: {
      content: `### ${card.title}\n\n${card.body}\n\n> ${card.agent} · ${new Date(card.ts).toLocaleString()}`,
    },
  };
}

export const wecom: ChannelAdapter = {
  type: "wecom",
  buildPayload,
  send: async (card: CardData, opts: SendContext) => {
    if (!opts.webhook || opts.webhook.type !== "wecom") {
      return { ok: false, kind: "http", status: 0, bodyText: "missing wecom webhook" };
    }
    return postJson(opts.webhook.webhookUrl, buildPayload(card), { timeoutMs: opts.timeoutMs });
  },
};