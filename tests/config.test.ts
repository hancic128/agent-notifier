import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigSchema,
  ChannelConfigSchema,
  setConfigPath,
  loadConfig,
  saveConfig,
  makeDefaultConfig,
  feishuReceiveIdType,
} from "../src/config.js";

let tmp: string;
let cfgPath: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "agent-notifier-cfg-"));
  cfgPath = join(tmp, "config.json");
  setConfigPath(cfgPath);
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
  setConfigPath(null);
});

const validFeishu = {
  type: "feishu" as const,
  appId: "cli_xxxxxxxx",
  appSecret: "SECRETxxxxxxxx",
  chatId: "oc_abc123def456",
};
const validSlack = { type: "slack" as const, webhookUrl: "https://hooks.slack.com/services/T/B/x" };

describe("config schema", () => {
  test("accepts a fully-populated valid config with feishu app + slack webhook", () => {
    expect(() =>
      ConfigSchema.parse({
        version: 1,
        channels: [validFeishu, validSlack],
        agents: { claude: true, codex: false, kimi: true },
        installedAt: 1734000000,
        binaryPath: "/usr/local/bin/agent-notifier",
      }),
    ).not.toThrow();
  });

  test("rejects bad channel type", () => {
    expect(() => ChannelConfigSchema.parse({ type: "discord", webhookUrl: "x" } as any)).toThrow();
  });

  test("rejects feishu with webhookUrl field (discriminated union)", () => {
    expect(() =>
      ChannelConfigSchema.parse({ type: "feishu", webhookUrl: "https://x" } as any),
    ).toThrow();
  });

  test("rejects feishu missing appSecret", () => {
    expect(() =>
      ChannelConfigSchema.parse({ type: "feishu", appId: "x", chatId: "oc_1" } as any),
    ).toThrow();
  });

  test("rejects slack missing webhookUrl", () => {
    expect(() => ChannelConfigSchema.parse({ type: "slack" } as any)).toThrow();
  });

  test("rejects non-url webhookUrl on slack", () => {
    expect(() =>
      ChannelConfigSchema.parse({ type: "slack", webhookUrl: "not a url" }),
    ).toThrow();
  });

  test("requires at least one channel", () => {
    expect(() =>
      ConfigSchema.parse({
        version: 1,
        channels: [],
        agents: { claude: true, codex: false, kimi: false },
        installedAt: 0,
        binaryPath: "/x",
      }),
    ).toThrow();
  });

  test("agents defaults all-false when fields missing", () => {
    const partial = {
      version: 1,
      channels: [validFeishu],
      agents: { claude: true },
      installedAt: 0,
      binaryPath: "/x",
    };
    const parsed = ConfigSchema.parse(partial);
    expect(parsed.agents.codex).toBe(false);
    expect(parsed.agents.kimi).toBe(false);
  });
});

describe("loadConfig / saveConfig", () => {
  test("returns null when file is absent", async () => {
    expect(await loadConfig()).toBeNull();
  });

  test("round-trips feishu app config through file", async () => {
    const cfg = makeDefaultConfig({
      channels: [validFeishu],
      agents: { claude: true, codex: false, kimi: false },
      binaryPath: "/bin/x",
    });
    await saveConfig(cfg);
    const loaded = await loadConfig();
    expect(loaded).toEqual(cfg);
  });

  test("round-trips slack webhook config", async () => {
    const cfg = makeDefaultConfig({
      channels: [validSlack],
      agents: { claude: false, codex: true, kimi: false },
      binaryPath: "/bin/x",
    });
    await saveConfig(cfg);
    const loaded = await loadConfig();
    expect(loaded).toEqual(cfg);
  });

  test("returns null on malformed JSON", async () => {
    await writeFile(cfgPath, "{not json");
    expect(await loadConfig()).toBeNull();
  });

  test("returns null with migration hint on legacy feishu webhookUrl config", async () => {
    await writeFile(
      cfgPath,
      JSON.stringify({
        version: 1,
        channels: [{ type: "feishu", webhookUrl: "https://example.com/hook" }],
        agents: { claude: true },
        installedAt: 0,
        binaryPath: "/x",
      }),
    );
    expect(await loadConfig()).toBeNull();
  });
});

describe("feishuReceiveIdType", () => {
  test("oc_ prefix → chat_id (group)", () => {
    expect(feishuReceiveIdType("oc_abc123")).toBe("chat_id");
  });
  test("ou_ prefix → open_id (user)", () => {
    expect(feishuReceiveIdType("ou_user1")).toBe("open_id");
  });
  test("on_ prefix → open_id fallback", () => {
    expect(feishuReceiveIdType("on_dept")).toBe("open_id");
  });
  test("email shape → email", () => {
    expect(feishuReceiveIdType("alice@example.com")).toBe("email");
  });
  test("unknown prefix → chat_id fallback", () => {
    expect(feishuReceiveIdType("some_random_id")).toBe("chat_id");
  });
});