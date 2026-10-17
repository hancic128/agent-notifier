import type { CardData, ChannelAdapter, BuildContext, SendContext } from "./types.js";
import { postJson } from "../http.js";

/**
 * PushDeer accepts `{pushkey, text, desp, type}` at /message/push. The pushkey
 * normally lives in the URL query; we forward whatever query the user gave and
 * also include it in the body when it is present in the URL.
 */
export function buildPayload(card: CardData, ctx: BuildContext = {}): unknown {
  const webhookUrl = ctx.webhook?.webhookUrl ?? "";
  let pushkey = "";
  try {
    pushkey = new URL(webhookUrl).searchParams.get("pushkey") ?? "";
  } catch {
    pushkey = "";
  }
  return {
    pushkey,
    text: card.title,
    desp: `${card.body}\n\n————来自${card.agent}`,
    type: "markdown",
  };
}

export const pushdeer: ChannelAdapter = {
  type: "pushdeer",
  buildPayload,
  send: async (card: CardData, opts: SendContext) => {
    if (!opts.webhook || opts.webhook.type !== "pushdeer") {
      return { ok: false, kind: "http", status: 0, bodyText: "missing pushdeer webhook" };
    }
    return postJson(opts.webhook.webhookUrl, buildPayload(card, { webhook: opts.webhook }), {
      timeoutMs: opts.timeoutMs,
    });
  },
};