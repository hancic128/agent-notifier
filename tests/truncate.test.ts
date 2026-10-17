import { describe, expect, test } from "vitest";
import { truncateHead, truncateTail, closeCodeFence } from "../src/truncate.js";

describe("truncateHead", () => {
  test("returns original when shorter than max", () => {
    expect(truncateHead("hello", 10)).toBe("hello");
  });

  test("returns original at exact max", () => {
    expect(truncateHead("hello", 5)).toBe("hello");
  });

  test("keeps first N graphemes when longer", () => {
    expect(truncateHead("abcdef", 3)).toBe("…abc");
  });

  test("counts CJK characters as one grapheme each", () => {
    const s = "中文测试字符串";
    expect(truncateHead(s, 2)).toBe("…中文");
  });

  test("does not split a ZWJ emoji family into half", () => {
    const family = "👨‍👩‍👧‍👦"; // 1 grapheme
    const s = family.repeat(3);
    expect(truncateHead(s, 1)).toBe("…" + family);
    expect(truncateHead(s, 2)).toBe("…" + family + family);
  });

  test("zero max returns just ellipsis", () => {
    expect(truncateHead("hello", 0)).toBe("…");
  });
});

describe("truncateTail", () => {
  test("returns original when shorter than max", () => {
    expect(truncateTail("hello", 10)).toBe("hello");
  });

  test("keeps last N graphemes when longer", () => {
    expect(truncateTail("abcdef", 3)).toBe("…def");
  });

  test("CJK grapheme count", () => {
    const s = "中文测试字符串";
    expect(truncateTail(s, 3)).toBe("…字符串");
  });

  test("does not split ZWJ family", () => {
    const family = "👨‍👩‍👧‍👦";
    const s = family.repeat(3);
    expect(truncateTail(s, 1)).toBe("…" + family);
  });
});

describe("closeCodeFence", () => {
  test("empty string unchanged", () => {
    expect(closeCodeFence("")).toBe("");
  });

  test("balanced fences unchanged", () => {
    expect(closeCodeFence("```js\nx\n```")).toBe("```js\nx\n```");
  });

  test("unbalanced trailing fence is closed", () => {
    expect(closeCodeFence("```js\nx")).toBe("```js\nx\n```");
  });

  test("already closed twice stays closed", () => {
    const s = "```js\nx\n```\n\nmore text";
    expect(closeCodeFence(s)).toBe(s);
  });

  test("fence inside last 200 bytes counts", () => {
    const s = "preamble ".repeat(50) + "```js";
    expect(closeCodeFence(s)).toBe(s + "\n```");
  });
});