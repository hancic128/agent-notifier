import { rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { claude } from "../agents/claude.js";
import { codex } from "../agents/codex.js";
import { kimi } from "../agents/kimi.js";
import type { AgentAdapter } from "../agents/types.js";
import { loadConfig, setConfigPath } from "../config.js";
import { log } from "../log.js";

const ALL_AGENTS: AgentAdapter[] = [claude, codex, kimi];

export interface UninstallOptions {
  binaryPath?: string;
  configPath?: string;
  /** If true, also remove ~/.agent-hook/ entirely. */
  purge?: boolean;
}

export async function runUninstall(opts: UninstallOptions = {}): Promise<number> {
  if (opts.configPath) setConfigPath(opts.configPath);
  const cfg = await loadConfig();

  const binaryPath = opts.binaryPath ?? cfg?.binaryPath ?? "agent-notifier";

  for (const a of ALL_AGENTS) {
    const present = await a.detect();
    if (!present) continue;
    try {
      await a.remove({ binaryPath });
      log.info(`✓ removed hook from ${a.displayName}`);
    } catch (e) {
      log.warn(`remove failed for ${a.displayName}: ${(e as Error).message}`);
    }
  }

  if (opts.purge) {
    const home = homedir();
    await rm(join(home, ".agent-hook"), { recursive: true, force: true });
    log.info("✓ purged ~/.agent-hook/");
  } else {
    log.info("config and backups preserved (use --purge to delete)");
  }
  return 0;
}