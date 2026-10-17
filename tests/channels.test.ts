import { describe, expect, test, beforeEach } from "vitest";
import { slack } from "../src/channels/slack.js";
import { bark } from "../src/channels/bark.js";
import { feishu, _resetFeishuTokenCache } from "../src/channels/feishu.js";
import type { CardData } from "../src/channels/types.js";

const baseCard: CardData = {
  title: "修复登录态失效",
  body: "原因：cookie 7 天过期，已改为 refresh token 续期。",
  fullBody: "原因：cookie 7 天过期，已改为 refresh token 续期。",
  agent: "claude",
  sessionId: "abc123def456",
  ts: Date.UTC(2026, 0, 1, 12, 0, 0),
};

const feishuCtx = {
  feishu: { type: "feishu" as const, appId: "cli_xxx", appSecret: "SEC", chatId: "oc_abc123" },
};

describe("slack", () => {
  test("renders blocks inside a colored attachment (left accent bar)", () => {
    const p = slack.buildPayload(baseCard) as { attachments: any[] };
    expect(p.attachments).toHaveLength(1);
    expect(p.attachments[0].color).toMatch(/^#[0-9A-F]{6}$/i);
    const blocks = p.attachments[0].blocks;
    expect(blocks[0].type).toBe("header");
    expect(blocks[0].text.text).toBe("修复登录态失效");
    expect(blocks[1].type).toBe("section");
    expect(blocks[1].text.text).toContain("refresh token");
    expect(blocks[2].type).toBe("context");
    expect(blocks[2].elements[0].text).toContain("claude");
    expect(blocks[2].elements[0].text).not.toContain("session");
  });

  test("footer shows agent, not session id", () => {
    const p = slack.buildPayload({ ...baseCard, agent: "kimi", sessionId: "abcdefghij" }) as { attachments: any[] };
    const blocks = p.attachments[0].blocks;
    const footer = blocks[blocks.length - 1].elements[0].text as string;
    expect(footer.startsWith("kimi · ")).toBe(true);
    expect(footer).not.toContain("abcdefgh");
  });

  test("uses fullBody and splits long content into multiple sections", () => {
    const long = "长".repeat(7000);
    const p = slack.buildPayload({ ...baseCard, fullBody: long }) as { attachments: any[] };
    const sections = p.attachments[0].blocks.filter((b: any) => b.type === "section");
    expect(sections.length).toBeGreaterThan(1);
    for (const s of sections) {
      expect(s.text.text.length).toBeLessThanOrEqual(3000);
    }
    expect(sections.map((s: any) => s.text.text).join("")).toContain("长");
  });

  test("sandbox: send rejects when slack webhook missing", async () => {
    const res = await slack.send(baseCard, {});
    expect(res.ok).toBe(false);
  });
});

describe("bark", () => {
  test("extracts device key from webhook url", () => {
    const p = bark.buildPayload(baseCard, { webhook: { type: "bark", webhookUrl: "https://api.day.app/MYKEY123" } }) as Record<string, any>;
    expect(p.device_key).toBe("MYKEY123");
    expect(p.title).toBe(baseCard.title);
    expect(p.body).toBe(`${baseCard.body}\n\n————来自${baseCard.agent}`);
    expect(p.group).toBe("agent-hook");
    expect(p.level).toBe("active");
  });

  test("send rejects when bark webhook missing", async () => {
    const res = await bark.send(baseCard, {});
    expect(res.ok).toBe(false);
  });
});

describe("feishu (app mode)", () => {
  beforeEach(() => _resetFeishuTokenCache());

  test("buildPayload for group chat uses chat_id and stringified content", () => {
    const p = feishu.buildPayload(baseCard, feishuCtx) as Record<string, any>;
    expect(p.receive_id).toBe("oc_abc123");
    expect(p.receive_id_type).toBe("chat_id");
    expect(p.msg_type).toBe("interactive");
    expect(typeof p.content).toBe("string");
    const inner = JSON.parse(p.content);
    expect(inner.header.title.content).toBe("修复登录态失效");
    expect(inner.elements[0].text.content).toContain("refresh token");
    const noteEl = inner.elements.find((e: any) => e.tag === "note");
    expect(noteEl.elements[0].content).toContain("claude");
    expect(noteEl.elements[0].content).not.toContain("session");
  });

  test("buildPayload for user chat uses open_id", () => {
    const p = feishu.buildPayload(baseCard, { feishu: { ...feishuCtx.feishu, chatId: "ou_user1" } }) as Record<string, any>;
    expect(p.receive_id_type).toBe("open_id");
  });

  test("buildPayload throws without feishu context", () => {
    expect(() => feishu.buildPayload(baseCard, {})).toThrow();
  });

  test("send fails gracefully when tenant_access_token cannot be obtained", async () => {
    const res = await feishu.send(baseCard, { ...feishuCtx, timeoutMs: 2000 });
    expect(res.ok).toBe(false);
  }, 10000);
});