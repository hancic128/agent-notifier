import { buildCard } from "../card.js";
import { loadConfig, setConfigPath } from "../config.js";
import { fanOut } from "./send.js";
import { log } from "../log.js";

export interface TestOptions {
  configPath?: string;
}

const TEST_TITLE = "定风波·莫听穿林打叶声";
const TEST_BODY = [
  "莫听穿林打叶声，何妨吟啸且徐行。",
  "竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。",
  "",
  "料峭春风吹酒醒，微冷，山头斜照却相迎。",
  "回首向来萧瑟处，归去，也无风雨也无晴。",
].join("\n");

export async function runTest(opts: TestOptions = {}): Promise<number> {
  if (opts.configPath) setConfigPath(opts.configPath);
  const cfg = await loadConfig();
  if (!cfg) {
    log.error("config not found; run `agent-notifier install` first");
    return 4;
  }
  const card = buildCard({
    firstUserPrompt: TEST_TITLE,
    lastAssistantText: TEST_BODY,
    agent: "claude",
    sessionId: "test",
  });
  const result = await fanOut(card, cfg.channels);
  for (const ch of result.perChannel) {
    if (ch.ok) {
      log.info(`✓ ${ch.type} → ${ch.status}`);
    } else {
      log.warn(`✗ ${ch.type} failed (status=${ch.status ?? "?"}): ${ch.error ?? ""}`);
    }
  }
  return result.ok ? 0 : 3;
}