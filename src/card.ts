import { truncateHead, truncateTail, closeCodeFence } from "./truncate.js";
import type { CardData } from "./channels/types.js";

export type { CardData };

const TITLE_MAX = 40;
const BODY_MAX = 500;

export function buildCard(opts: {
  firstUserPrompt: string;
  lastAssistantText: string;
  agent: CardData["agent"];
  sessionId: string;
  ts?: number;
}): CardData {
  const titleRaw = opts.firstUserPrompt.trim();
  const title = titleRaw
    ? truncateHead(titleRaw, TITLE_MAX)
    : `${opts.agent} · ${opts.sessionId ? opts.sessionId.slice(0, 8) : "session"}`;
  return {
    title,
    body: closeCodeFence(truncateTail(opts.lastAssistantText, BODY_MAX)),
    fullBody: closeCodeFence(opts.lastAssistantText),
    agent: opts.agent,
    sessionId: opts.sessionId,
    ts: opts.ts ?? Date.now(),
  };
}