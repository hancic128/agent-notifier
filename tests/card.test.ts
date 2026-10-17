import { describe, expect, test } from "vitest";
import { buildCard } from "../src/card.js";

describe("buildCard", () => {
  test("truncates title to first 40 graphemes", () => {
    const card = buildCard({
      firstUserPrompt: "请帮我修复这个长达上百字的标题，大到两个字正文，正文不重要，标题也不重要，重要的是这是一段用来测试的字符串",
      lastAssistantText: "ok",
      agent: "claude",
      sessionId: "s1",
    });
    // 标题前面有 …… prefix。truncateHead 保留前 40 个 grapheme
    expect(card.title.startsWith("…")).toBe(true);
    // 总长度（含 "…"） = 1 + 40 = 41 个 grapheme
    const seg = new Intl.Segmenter("zh", { granularity: "grapheme" });
    const len = [...seg.segment(card.title)].length;
    expect(len).toBe(41);
  });

  test("body keeps last 500 graphemes", () => {
    const long = "x".repeat(800);
    const card = buildCard({
      firstUserPrompt: "t",
      lastAssistantText: long,
      agent: "codex",
      sessionId: "s1",
    });
    expect(card.body.startsWith("…")).toBe(true);
    expect(card.body.length).toBe(501); // 1 ellipsis + 500 x's
  });

  test("closes unterminated code fence", () => {
    const card = buildCard({
      firstUserPrompt: "t",
      lastAssistantText: "```js\nfunction f() {\n  return 1;\n",
      agent: "kimi",
      sessionId: "s1",
    });
    expect(card.body.endsWith("\n```")).toBe(true);
  });

  test("preserves session id and agent", () => {
    const card = buildCard({
      firstUserPrompt: "hello",
      lastAssistantText: "hi",
      agent: "claude",
      sessionId: "abc-def-123",
    });
    expect(card.agent).toBe("claude");
    expect(card.sessionId).toBe("abc-def-123");
    expect(typeof card.ts).toBe("number");
  });

  test("falls back to agent+session when firstUserPrompt is empty", () => {
    const card = buildCard({
      firstUserPrompt: "",
      lastAssistantText: "hi",
      agent: "kimi",
      sessionId: "abcdefgh1234",
    });
    expect(card.title).toBe("kimi · abcdefgh");
  });

  test("falls back to just agent label when both prompt and session empty", () => {
    const card = buildCard({
      firstUserPrompt: "   ",
      lastAssistantText: "hi",
      agent: "codex",
      sessionId: "",
    });
    expect(card.title).toBe("codex · session");
  });
});