import { describe, expect, test } from "vitest";
import { dingtalk, computeSign, signedUrl } from "../src/channels/dingtalk.js";
import { wecom } from "../src/channels/wecom.js";
import { pushdeer } from "../src/channels/pushdeer.js";
import { bluebird } from "../src/channels/bluebird.js";
import { lark } from "../src/channels/feishu.js";
import { CHANNEL_META, CHANNEL_ORDER } from "../src/channels/registry.js";
import type { CardData } from "../src/channels/types.js";

const card: CardData = {
  title: "修复登录态失效",
  body: "已改为 refresh token 续期。",
  fullBody: "已改为 refresh token 续期。",
  agent: "codex",
  sessionId: "abcdefghijk",
  ts: Date.UTC(2026, 0, 1, 12, 0, 0),
};

describe("dingtalk", () => {
  test("markdown payload includes title and agent footer", () => {
    const p = dingtalk.buildPayload(card) as any;
    expect(p.msgtype).toBe("markdown");
    expect(p.markdown.title).toBe(card.title);
    expect(p.markdown.text).toContain("### 修复登录态失效");
    expect(p.markdown.text).toContain("codex");
  });

  test("sign is base64url without padding", () => {
    const sign = computeSign("SECtest", 1704110400000);
    expect(sign).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sign).not.toContain("=");
  });

  test("signedUrl appends timestamp and sign", () => {
    const url = signedUrl("https://oapi.dingtalk.com/robot/send?access_token=abc", "SECx", 1704110400000);
    const u = new URL(url);
    expect(u.searchParams.get("access_token")).toBe("abc");
    expect(u.searchParams.get("timestamp")).toBe("1704110400000");
    expect(u.searchParams.get("sign")).toBeTruthy();
  });
});

describe("wecom", () => {
  test("markdown payload", () => {
    const p = wecom.buildPayload(card) as any;
    expect(p.msgtype).toBe("markdown");
    expect(p.markdown.content).toContain("### 修复登录态失效");
    expect(p.markdown.content).toContain("codex");
  });
});

describe("pushdeer", () => {
  test("extracts pushkey from url and appends agent signature", () => {
    const p = pushdeer.buildPayload(card, {
      webhook: { type: "pushdeer", webhookUrl: "https://api2.pushdeer.com/message/push?pushkey=PDU123" },
    }) as any;
    expect(p.pushkey).toBe("PDU123");
    expect(p.text).toBe(card.title);
    expect(p.desp).toContain("————来自codex");
    expect(p.type).toBe("markdown");
  });
});

describe("bluebird", () => {
  test("generic gateway payload", () => {
    const p = bluebird.buildPayload(card) as any;
    expect(p.title).toBe(card.title);
    expect(p.body).toBe(card.body);
    expect(p.level).toBe("resolved");
    expect(p.emoji).toBe("✅");
    expect(p.fields).toEqual(
      expect.arrayContaining([{ label: "Agent", value: "codex" }]),
    );
    expect(p.at_unix_nano).toBe(card.ts * 1_000_000);
  });

  test("send rejects without config", async () => {
    const r = await bluebird.send(card, {});
    expect(r.ok).toBe(false);
  });
});

describe("lark", () => {
  test("shares the feishu card shape", () => {
    const p = lark.buildPayload(card, {
      feishu: { type: "lark", appId: "cli_x", appSecret: "s", chatId: "oc_1" },
    }) as any;
    expect(p.receive_id_type).toBe("chat_id");
    const inner = JSON.parse(p.content);
    expect(inner.header.title.content).toBe(card.title);
  });

  test("rejects missing context", () => {
    expect(() => lark.buildPayload(card, {})).toThrow();
  });
});

describe("registry", () => {
  test("every channel type has metadata and fields", () => {
    for (const t of CHANNEL_ORDER) {
      const meta = CHANNEL_META[t];
      expect(meta.type).toBe(t);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.fields.length).toBeGreaterThan(0);
      expect(meta.fields.some((f) => f.required)).toBe(true);
    }
  });

  test("registry covers exactly the supported channels", () => {
    expect(CHANNEL_ORDER).toEqual([
      "feishu",
      "lark",
      "slack",
      "bark",
      "dingtalk",
      "wecom",
      "pushdeer",
      "bluebird",
    ]);
  });
});