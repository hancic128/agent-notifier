import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractLastAssistantText, extractLastUserPrompt } from "../src/agents/claude.js";

describe("Claude JSONL extraction", () => {
  test("extractLastAssistantText takes the last assistant text", () => {
    const jsonl = [
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] } }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "first reply" }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "tool_use", id: "x" }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "later text " },
            { type: "text", text: "more" },
          ],
        },
      }),
    ].join("\n");
    expect(extractLastAssistantText(jsonl)).toBe("later text \nmore");
  });

  test("extractLastAssistantText handles string content", () => {
    const jsonl = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: "just a string" },
    });
    expect(extractLastAssistantText(jsonl)).toBe("just a string");
  });

  test("extractLastAssistantText returns empty on no assistant", () => {
    const jsonl = JSON.stringify({ type: "user", message: { role: "user", content: "hi" } });
    expect(extractLastAssistantText(jsonl)).toBe("");
  });

  test("extractLastUserPrompt takes the most recent user input", () => {
    const jsonl = [
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "hello world" }] } }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
      }),
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "later" }] } }),
    ].join("\n");
    expect(extractLastUserPrompt(jsonl)).toBe("later");
  });

  test("extractLastUserPrompt skips tool_result-only user entries", () => {
    const jsonl = [
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "real prompt" }] } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t" }] } }),
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "out" }] } }),
    ].join("\n");
    expect(extractLastUserPrompt(jsonl)).toBe("real prompt");
  });

  test("extractLastUserPrompt handles string content", () => {
    const jsonl = JSON.stringify({ type: "user", message: { role: "user", content: "raw string" } });
    expect(extractLastUserPrompt(jsonl)).toBe("raw string");
  });

  test("skips malformed JSONL lines", () => {
    const jsonl = [
      "{garbage",
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "real" }] } }),
      "{also garbage",
    ].join("\n");
    expect(extractLastUserPrompt(jsonl)).toBe("real");
    expect(extractLastAssistantText(jsonl)).toBe("");
  });
});