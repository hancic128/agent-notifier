import type { CardData, ChannelAdapter, BuildContext, SendContext } from "./types.js";
import { postJson } from "../http.js";

function extractDeviceKey(webhookUrl: string): string {
  try {
    const u = new URL(webhookUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] ?? "";
  } catch {
    return "";
  }
}

export function buildPayload(card: CardData, ctx: BuildContext = {}): unknown {
  return {
    device_key: extractDeviceKey(ctx.webhook?.webhookUrl ?? ""),
    title: card.title,
    body: `${card.body}\n\n————来自${card.agent}`,
    group: "agent-hook",
    level: "active",
  };
}

export const bark: ChannelAdapter = {
  type: "bark",
  buildPayload,
  send: async (card: CardData, opts: SendContext) => {
    if (!opts.webhook || opts.webhook.type !== "bark") {
      return { ok: false, kind: "http", status: 0, bodyText: "missing bark webhook" };
    }
    const body = buildPayload(card, { webhook: opts.webhook }) as Record<string, unknown>;
    return postJson(opts.webhook.webhookUrl, body, { timeoutMs: opts.timeoutMs });
  },
};