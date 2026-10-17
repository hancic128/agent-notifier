import type { CardData, ChannelAdapter, BuildContext, SendContext } from "./types.js";
import type { PostResult } from "../http.js";
import { feishuReceiveIdType, type FeishuChannel } from "../config.js";

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

export interface FeishuApiOptions {
  type: "feishu" | "lark";
  origin: string;
}

/** Build an app-bot adapter; Feishu and Lark differ only by API host. */
export function createFeishuAdapter(opts: FeishuApiOptions): ChannelAdapter & { _resetTokenCache(): void } {
  const tokenUrl = `${opts.origin}/open-apis/auth/v3/tenant_access_token/internal`;
  const msgUrl = `${opts.origin}/open-apis/im/v1/messages`;

  let tokenCache: TokenCacheEntry | null = null;
  let inFlightToken: Promise<TokenCacheEntry | null> | null = null;

  async function fetchToken(appId: string, appSecret: string): Promise<TokenCacheEntry | null> {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = (await res.json().catch(() => null)) as
      | { code?: number; tenant_access_token?: string; expire?: number; msg?: string }
      | null;
    if (!data || data.code !== 0 || !data.tenant_access_token) return null;
    return { token: data.tenant_access_token, expiresAt: Date.now() + (data.expire ?? 7200) * 1000 - 60_000 };
  }

  async function getToken(appId: string, appSecret: string): Promise<string | null> {
    if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
    if (inFlightToken) {
      const r = await inFlightToken;
      return r?.token ?? null;
    }
    inFlightToken = fetchToken(appId, appSecret);
    try {
      const entry = await inFlightToken;
      if (entry) tokenCache = entry;
      return entry?.token ?? null;
    } finally {
      inFlightToken = null;
    }
  }

  function buildCardJson(card: CardData): string {
    const timeStr = new Date(card.ts).toLocaleString();
    return JSON.stringify({
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: card.title },
        template: "blue",
      },
      elements: [
        { tag: "div", text: { tag: "lark_md", content: card.body } },
        { tag: "hr" },
        { tag: "note", elements: [{ tag: "plain_text", content: `${card.agent} · ${timeStr}` }] },
      ],
    });
  }

  function buildPayload(card: CardData, ctx: BuildContext = {}): unknown {
    if (!ctx.feishu) throw new Error(`${opts.type} buildPayload requires ctx.feishu`);
    return {
      receive_id: ctx.feishu.chatId,
      msg_type: "interactive",
      receive_id_type: feishuReceiveIdType(ctx.feishu.chatId),
      content: buildCardJson(card),
    };
  }

  return {
    type: opts.type,
    buildPayload,
    send: async (card: CardData, ctx: SendContext): Promise<PostResult> => {
      if (!ctx.feishu) {
        return { ok: false, kind: "http", status: 0, bodyText: "missing feishu channel config" };
      }
      const ch = ctx.feishu;
      const token = await getToken(ch.appId, ch.appSecret);
      if (!token) {
        return { ok: false, kind: "http", status: 0, bodyText: "failed to obtain tenant_access_token" };
      }
      const body = buildPayload(card, { feishu: ch });
      const url = `${msgUrl}?receive_id_type=${encodeURIComponent(feishuReceiveIdType(ch.chatId))}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? 8000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const text = await res.text().catch(() => "");
        let code: number | undefined;
        try {
          code = (JSON.parse(text) as { code?: number }).code;
        } catch {
          code = undefined;
        }
        if (res.status >= 200 && res.status < 300 && code === 0) {
          return { ok: true, status: res.status, bodyText: text };
        }
        return { ok: false, kind: "http", status: res.status, bodyText: text };
      } catch (err) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        if (controller.signal.aborted) return { ok: false, kind: "timeout", error: msg };
        return { ok: false, kind: "network", error: msg };
      }
    },
    _resetTokenCache: () => {
      tokenCache = null;
      inFlightToken = null;
    },
  };
}

export const feishu = createFeishuAdapter({ type: "feishu", origin: "https://open.feishu.cn" });
export const lark = createFeishuAdapter({ type: "lark", origin: "https://open.larksuite.com" });

/** Test helper kept for the existing suite. */
export function _resetFeishuTokenCache(): void {
  feishu._resetTokenCache();
}

export type { FeishuChannel };