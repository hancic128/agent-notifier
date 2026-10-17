import type { BluebirdChannel, FeishuChannel, WebhookChannel } from "../config.js";

export interface CardData {
  title: string;
  /** Short body shared by Feishu / Bark (tail-truncated to 500 graphemes). */
  body: string;
  /** Untruncated body; channels that handle long text (Slack) use this. */
  fullBody: string;
  agent: "claude" | "codex" | "kimi";
  sessionId: string;
  ts: number;
}

export interface BuildContext {
  feishu?: FeishuChannel;
  webhook?: WebhookChannel;
  bluebird?: BluebirdChannel;
}

export interface SendContext extends BuildContext {
  webhookUrl?: string;
  timeoutMs?: number;
}

export interface ChannelAdapter {
  readonly type: import("../config.js").ChannelType;
  buildPayload(card: CardData, ctx?: BuildContext): unknown;
  send(card: CardData, opts: SendContext): Promise<import("../http.js").PostResult>;
}