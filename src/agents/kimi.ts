import { readFile, writeFile, copyFile, rename, access, constants } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "@iarna/toml";
import { MARKER } from "../version.js";
import { log } from "../log.js";
import type { AgentAdapter, BackupRecord } from "./types.js";

export const KIMI_CONFIG_PATH = join(homedir(), ".kimi", "config.toml");

interface HookEntry {
  event?: string;
  command?: string;
  [k: string]: unknown;
}

const MARKER_CMD_REGEX = /agent-notifier:v\d/;

function buildStopCmd(binaryPath: string): string {
  return `${binaryPath} send --agent=kimi --hook=Stop --marker=${MARKER}`;
}

async function backupIfMissing(target: string, ts: number): Promise<BackupRecord | null> {
  const bakPath = `${target}.bak.${ts}`;
  try {
    await access(bakPath, constants.F_OK);
    return null;
  } catch {
    await copyFile(target, bakPath);
    return { path: bakPath, ts };
  }
}

async function readToml(path: string): Promise<{ hooks: unknown[]; [k: string]: unknown }> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = parse(raw) as Record<string, unknown>;
    return { ...parsed, hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [] };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { hooks: [] };
    throw e;
  }
}

async function writeTomlAtomic(path: string, data: Record<string, unknown>): Promise<void> {
  const tmp = `${path}.tmp.${process.pid}`;
  await writeFile(tmp, stringify(data as Parameters<typeof stringify>[0]), { encoding: "utf8" });
  await rename(tmp, path);
}

function isOurHookEntry(e: unknown, event: string): boolean {
  if (!e || typeof e !== "object") return false;
  const entry = e as HookEntry;
  return entry.event === event && typeof entry.command === "string" && MARKER_CMD_REGEX.test(entry.command);
}

export const kimi: AgentAdapter = {
  id: "kimi",
  displayName: "Kimi Code",
  configPath: KIMI_CONFIG_PATH,

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
      const data = await readToml(this.configPath);
      const hooks = data.hooks as unknown[];
      return hooks.some((h) => isOurHookEntry(h, "Stop") && (h as HookEntry).command === buildStopCmd(binaryPath));
    } catch (e) {
      log.warn(`kimi.isInstalled failed: ${(e as Error).message}`);
      return false;
    }
  },

  async install(opts: { binaryPath: string }): Promise<BackupRecord> {
    const ts = Math.floor(Date.now() / 1000);
    const data = await readToml(this.configPath);
    const backup = await backupIfMissing(this.configPath, ts);
    // Drop any previously-installed entries (including the old PostToolUse one).
    const hooks = (data.hooks as unknown[]).filter(
      (h) => !isOurHookEntry(h, "PostToolUse") && !isOurHookEntry(h, "Stop"),
    );
    hooks.push({ event: "Stop", command: buildStopCmd(opts.binaryPath) });
    data.hooks = hooks;
    await writeTomlAtomic(this.configPath, data);
    return backup ?? { path: `${this.configPath}.bak.${ts}`, ts };
  },

  async remove(_opts: { binaryPath: string }): Promise<void> {
    try {
      const data = await readToml(this.configPath);
      const hooks = (data.hooks as unknown[]).filter(
        (h) => !isOurHookEntry(h, "PostToolUse") && !isOurHookEntry(h, "Stop"),
      );
      data.hooks = hooks;
      await writeTomlAtomic(this.configPath, data);
    } catch (e) {
      log.warn(`kimi.remove failed: ${(e as Error).message}`);
    }
  },

  async restoreFromBackup(backup: BackupRecord): Promise<void> {
    await copyFile(backup.path, this.configPath);
  },
};