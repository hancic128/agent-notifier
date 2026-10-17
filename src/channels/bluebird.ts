import type { CardData, ChannelAdapter, SendContext } from "./types.js";
import { postJson } from "../http.js";

/**
 * Bluebird (青鸟) generic gateway: `{title, text, body, level, ...}` with an
 * optional `Authorization: Bearer <token>`. Downstream delivery (Bark / Feishu
 * / WeCom) is handled by the gateway itself.
 */
export function buildPayload(card: CardData): unknown {
  const at = card.ts;
  return {
    title: card.title,
    text: `${card.title}\n${card.body}`,
    body: card.body,
    level: "resolved",
    emoji: "✅",
    color: "#2da44e",
    fields: [
      { label: "Agent", value: card.agent },
      ...(card.sessionId ? [{ label: "Session", value: card.sessionId.slice(0, 8) }] : []),
    ],
    at_unix_nano: at * 1_000_000,
  };
}

export const bluebird: ChannelAdapter = {
  type: "bluebird",
  buildPayload,
  send: async (card: CardData, opts: SendContext) => {
    if (!opts.bluebird) {
      return { ok: false, kind: "http", status: 0, bodyText: "missing bluebird config" };
    }
    const ch = opts.bluebird;
    const headers = ch.token ? { authorization: `Bearer ${ch.token}` } : undefined;
    return postJson(ch.webhookUrl, buildPayload(card), { timeoutMs: opts.timeoutMs, headers });
  },
};