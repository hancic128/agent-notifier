import { claude } from "../agents/claude.js";
import { codex } from "../agents/codex.js";
import { kimi } from "../agents/kimi.js";
import type { AgentAdapter } from "../agents/types.js";
import type { ChannelConfig } from "../config.js";
import { feishuReceiveIdType, loadConfig, getConfigPath, setConfigPath } from "../config.js";
import { log } from "../log.js";

const ALL_AGENTS: AgentAdapter[] = [claude, codex, kimi];

export interface StatusOptions {
  configPath?: string;
  binaryPath?: string;
}

/** Keep the first 4 and last 4 visible, mask the middle. */
function mask(value: string): string {
  if (value.length <= 12) return value.slice(0, 4) + "…";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function maskUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return mask(raw);
  }
  const segments = u.pathname.split("/").filter(Boolean);
  const masked = segments
    .map((seg) => (seg.length > 8 ? mask(seg) : seg))
    .join(" / ");
  return `${u.origin}/${masked}`;
}

function describeChannel(ch: ChannelConfig): string {
  if (ch.type === "feishu" || ch.type === "lark") {
    const kind =
      feishuReceiveIdType(ch.chatId) === "chat_id"
        ? "群聊"
        : feishuReceiveIdType(ch.chatId) === "open_id"
          ? "用户"
          : "邮箱";
    return `app ${mask(ch.appId)} · ${kind} ${mask(ch.chatId)}`;
  }
  if (!("webhookUrl" in ch)) return "?";
  if (ch.type === "bark") {
    const key = (() => {
      try {
        return new URL(ch.webhookUrl).pathname.split("/").filter(Boolean)[0] ?? "";
      } catch {
        return "";
      }
    })();
    return `device ${mask(key || ch.webhookUrl)}`;
  }
  if (ch.type === "dingtalk") {
    return `${maskUrl(ch.webhookUrl)}${ch.secret ? " · signed" : ""}`;
  }
  if (ch.type === "bluebird") {
    return `${maskUrl(ch.webhookUrl)}${ch.token ? " · token" : ""}`;
  }
  return maskUrl(ch.webhookUrl);
}

export async function runStatus(opts: StatusOptions = {}): Promise<number> {
  if (opts.configPath) setConfigPath(opts.configPath);
  const cfg = await loadConfig();
  const cfgPath = opts.configPath ?? getConfigPath();

  console.log(`config: ${cfgPath}`);
  if (!cfg) {
    log.warn("no config found — run `agent-notifier install`");
    return 1;
  }
  console.log(`installed at: ${new Date(cfg.installedAt * 1000).toLocaleString()}`);
  console.log(`binary path: ${cfg.binaryPath}`);
  console.log(`channels (${cfg.channels.length}):`);
  for (const ch of cfg.channels) {
    console.log(`  ${ch.type.padEnd(7)} ${describeChannel(ch)}`);
  }

  console.log("agents:");
  const binary = opts.binaryPath ?? cfg.binaryPath;
  for (const a of ALL_AGENTS) {
    const present = await a.detect();
    if (!present) {
      console.log(`  ${a.displayName}: not detected at ${a.configPath}`);
      continue;
    }
    const installed = await a.isInstalled(binary);
    console.log(`  ${a.displayName}: ${installed ? "✓ installed" : "○ detected, hook not yet injected"}`);
  }
  return 0;
}