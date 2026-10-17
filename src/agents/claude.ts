import { readFile, writeFile, copyFile, rename, access, constants } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { MARKER } from "../version.js";
import { log } from "../log.js";
import type { AgentAdapter, BackupRecord } from "./types.js";

export const CLAUDE_CONFIG_PATH = join(homedir(), ".claude", "settings.json");

interface ClaudeHook {
  type?: string;
  command?: string;
  [k: string]: unknown;
}

interface ClaudeHookGroup {
  matcher?: string;
  hooks: ClaudeHook[];
  [k: string]: unknown;
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookGroup[]>;
  [k: string]: unknown;
}

interface ClaudeContentBlock {
  type?: string;
  text?: string;
  [k: string]: unknown;
}

interface ClaudeMessage {
  role?: string;
  content?: string | ClaudeContentBlock[];
}

interface ClaudeEntry {
  type?: string;
  message?: ClaudeMessage;
  [k: string]: unknown;
}

const MARKER_CMD_REGEX = /agent-notifier:v\d/;

function buildCommand(binaryPath: string): string {
  return `${binaryPath} send --agent=claude --marker=${MARKER}`;
}

function hasMarkerInStop(settings: ClaudeSettings): boolean {
  const groups = settings.hooks?.Stop ?? [];
  return groups.some((g) => g.hooks.some((h) => typeof h.command === "string" && MARKER_CMD_REGEX.test(h.command)));
}

async function backupIfMissing(target: string, ts: number): Promise<BackupRecord | null> {
  const bakPath = `${target}.bak.${ts}`;
  try {
    await access(bakPath, constants.F_OK);
    return null; // backup already exists
  } catch {
    await copyFile(target, bakPath);
    return { path: bakPath, ts };
  }
}

async function readSettings(path: string): Promise<ClaudeSettings> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as ClaudeSettings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function writeSettingsAtomic(path: string, settings: ClaudeSettings): Promise<void> {
  const tmp = `${path}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(settings, null, 2), { encoding: "utf8" });
  await rename(tmp, path);
}

export const claude: AgentAdapter = {
  id: "claude",
  displayName: "Claude Code",
  configPath: CLAUDE_CONFIG_PATH,

  async detect(): Promise<boolean> {
    try {
      await access(this.configPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },

  async isInstalled(binaryPath: string): Promise<boolean> {
    try {
      const settings = await readSettings(this.configPath);
      return hasMarkerInStop(settings) && containsCommand(settings, buildCommand(binaryPath));
    } catch (e) {
      log.warn(`claude.isInstalled failed: ${(e as Error).message}`);
      return false;
    }
  },

  async install(opts: { binaryPath: string }): Promise<BackupRecord> {
    const ts = Math.floor(Date.now() / 1000);
    const settings = await readSettings(this.configPath);
    const backup = await backupIfMissing(this.configPath, ts);
    if (hasMarkerInStop(settings)) {
      // Already injected — idempotent. Make sure our command is in the list, replace others.
      const groups = settings.hooks?.Stop ?? [];
      const desiredCmd = buildCommand(opts.binaryPath);
      for (const g of groups) {
        g.hooks = g.hooks.filter((h) => !(typeof h.command === "string" && MARKER_CMD_REGEX.test(h.command)));
        g.hooks.push({ type: "command", command: desiredCmd });
      }
    } else {
      const groups = settings.hooks?.Stop ?? [];
      groups.push({
        matcher: "",
        hooks: [{ type: "command", command: buildCommand(opts.binaryPath) }],
      });
      settings.hooks = { ...(settings.hooks ?? {}), Stop: groups };
    }
    await writeSettingsAtomic(this.configPath, settings);
    return backup ?? { path: `${this.configPath}.bak.${ts}`, ts };
  },

  async remove(opts: { binaryPath: string }): Promise<void> {
    try {
      const settings = await readSettings(this.configPath);
      const groups = settings.hooks?.Stop ?? [];
      const filtered = groups
        .map((g) => ({ ...g, hooks: g.hooks.filter((h) => !(typeof h.command === "string" && MARKER_CMD_REGEX.test(h.command))) }))
        .filter((g) => g.hooks.length > 0);
      settings.hooks = { ...(settings.hooks ?? {}), Stop: filtered };
      await writeSettingsAtomic(this.configPath, settings);
    } catch (e) {
      log.warn(`claude.remove failed: ${(e as Error).message}`);
    }
    void opts;
  },

  async restoreFromBackup(backup: BackupRecord): Promise<void> {
    await copyFile(backup.path, this.configPath);
  },
};

function containsCommand(settings: ClaudeSettings, cmd: string): boolean {
  const groups = settings.hooks?.Stop ?? [];
  return groups.some((g) => g.hooks.some((h) => h.command === cmd));
}

/** Extract last assistant text from a JSONL transcript. Returns "" if none. */
export function extractLastAssistantText(jsonl: string): string {
  const lines = jsonl.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    let entry: ClaudeEntry;
    try {
      entry = JSON.parse(line) as ClaudeEntry;
    } catch {
      continue;
    }
    if (entry.type !== "assistant") continue;
    if (entry.message?.role !== "assistant") continue;
    const blocks = entry.message.content;
    if (typeof blocks === "string") return blocks;
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b): b is ClaudeContentBlock => !!b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text!)
        .join("\n");
    }
  }
  return "";
}

/**
 * Extract the most recent user prompt from a JSONL transcript. Returns "" if
 * none. Entries whose content is only tool_result blocks are skipped, since
 * those are tool plumbing rather than typed input.
 */
export function extractLastUserPrompt(jsonl: string): string {
  const lines = jsonl.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]?.trim();
    if (!trimmed) continue;
    let entry: ClaudeEntry;
    try {
      entry = JSON.parse(trimmed) as ClaudeEntry;
    } catch {
      continue;
    }
    if (entry.type !== "user") continue;
    const blocks = entry.message?.content;
    if (typeof blocks === "string") {
      if (blocks.trim()) return blocks;
      continue;
    }
    if (Array.isArray(blocks)) {
      const texts = blocks
        .filter((b): b is ClaudeContentBlock => !!b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text!.trim())
        .filter(Boolean);
      if (texts.length > 0) return texts.join("\n");
    }
  }
  return "";
}