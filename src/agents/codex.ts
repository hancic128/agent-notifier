import { readFile, writeFile, copyFile, rename, access, constants } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "@iarna/toml";
import { MARKER } from "../version.js";
import { log } from "../log.js";
import type { AgentAdapter, BackupRecord } from "./types.js";

export const CODEX_CONFIG_PATH = join(homedir(), ".codex", "config.toml");

const MARKER_CMD_REGEX = /agent-notifier:v\d/;

function buildCommand(binaryPath: string): string {
  return `${binaryPath} send --agent=codex --marker=${MARKER}`;
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

async function readToml(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf8");
    return parse(raw) as Record<string, unknown>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function writeTomlAtomic(path: string, data: Record<string, unknown>): Promise<void> {
  const tmp = `${path}.tmp.${process.pid}`;
  await writeFile(tmp, stringify(data as Parameters<typeof stringify>[0]), { encoding: "utf8" });
  await rename(tmp, path);
}

function readNotify(data: Record<string, unknown>): string[] {
  const v = data.notify;
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

export const codex: AgentAdapter = {
  id: "codex",
  displayName: "Codex CLI",
  configPath: CODEX_CONFIG_PATH,

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
      const cmds = readNotify(data);
      return cmds.some((c) => c === buildCommand(binaryPath));
    } catch (e) {
      log.warn(`codex.isInstalled failed: ${(e as Error).message}`);
      return false;
    }
  },

  async install(opts: { binaryPath: string }): Promise<BackupRecord> {
    const ts = Math.floor(Date.now() / 1000);
    const data = await readToml(this.configPath);
    const backup = await backupIfMissing(this.configPath, ts);
    const cmds = readNotify(data).filter((c) => !MARKER_CMD_REGEX.test(c));
    cmds.push(buildCommand(opts.binaryPath));
    data.notify = cmds;
    await writeTomlAtomic(this.configPath, data);
    return backup ?? { path: `${this.configPath}.bak.${ts}`, ts };
  },

  async remove(opts: { binaryPath: string }): Promise<void> {
    try {
      const data = await readToml(this.configPath);
      const cmds = readNotify(data).filter((c) => !MARKER_CMD_REGEX.test(c));
      if (cmds.length === 0) {
        delete data.notify;
      } else {
        data.notify = cmds;
      }
      await writeTomlAtomic(this.configPath, data);
    } catch (e) {
      log.warn(`codex.remove failed: ${(e as Error).message}`);
    }
    void opts;
  },

  async restoreFromBackup(backup: BackupRecord): Promise<void> {
    await copyFile(backup.path, this.configPath);
  },
};