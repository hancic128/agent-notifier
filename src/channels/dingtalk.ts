import { createHmac } from "node:crypto";
import type { CardData, ChannelAdapter, BuildContext, SendContext } from "./types.js";
import { postJson } from "../http.js";

/** DingTalk custom-robot signing: HmacSHA256(`${ts}\n${secret}`) base64url. */
export function computeSign(secret: string, tsMs: number): string {
  const stringToSign = `${tsMs}\n${secret}`;
  const digest = createHmac("sha256", secret).update(stringToSign, "utf8").digest("base64");
  // DingTalk expects base64url (no padding) in the URL.
  return digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signedUrl(webhookUrl: string, secret: string, tsMs: number): string {
  const u = new URL(webhookUrl);
  u.searchParams.set("timestamp", String(tsMs));
  u.searchParams.set("sign", computeSign(secret, tsMs));
  return u.toString();
}

export function buildPayload(card: CardData): unknown {
  return {
    msgtype: "markdown",
    markdown: {
      title: card.title,
      text: `### ${card.title}\n\n${card.body}\n\n> ${card.agent}`,
    },
  };
}

export const dingtalk: ChannelAdapter = {
  type: "dingtalk",
  buildPayload,
  send: async (card: CardData, opts: SendContext) => {
    if (!opts.webhook || opts.webhook.type !== "dingtalk") {
      return { ok: false, kind: "http", status: 0, bodyText: "missing dingtalk webhook" };
    }
    const url = opts.webhook.secret
      ? signedUrl(opts.webhook.webhookUrl, opts.webhook.secret, Date.now())
      : opts.webhook.webhookUrl;
    return postJson(url, buildPayload(card), { timeoutMs: opts.timeoutMs });
  },
};