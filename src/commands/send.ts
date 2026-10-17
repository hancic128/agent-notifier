import { readFile } from "node:fs/promises";
import { extractLastAssistantText, extractLastUserPrompt } from "../agents/claude.js";
import { buildCard } from "../card.js";
import { loadConfig } from "../config.js";
import { feishu, lark } from "../channels/feishu.js";
import { slack } from "../channels/slack.js";
import { bark } from "../channels/bark.js";
import { dingtalk } from "../channels/dingtalk.js";
import { wecom } from "../channels/wecom.js";
import { pushdeer } from "../channels/pushdeer.js";
import { bluebird } from "../channels/bluebird.js";
import type { ChannelAdapter } from "../channels/types.js";
import type { PostResult } from "../http.js";
import { log } from "../log.js";
import { VERSION } from "../version.js";

type AgentKind = "claude" | "codex" | "kimi";
type HookKind = "Stop" | "PostToolUse" | "Notify";

const CHANNELS: Record<string, ChannelAdapter> = {
  feishu,
  lark,
  slack,
  bark,
  dingtalk,
  wecom,
  pushdeer,
  bluebird,
};

async function readStdin(timeoutMs: number): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let buf = "";
    let resolved = false;
    const onData = (chunk: Buffer | string): void => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    };
    const finish = (err?: Error): void => {
      if (resolved) return;
      resolved = true;
      process.stdin.removeListener("data", onData);
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(buf);
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", () => finish());
    process.stdin.on("error", (e) => finish(e));
    const timer = setTimeout(() => finish(new Error("stdin timeout")), timeoutMs);
    if (process.stdin.readableEnded) finish();
  });
}

interface ParsedPayload {
  firstUserPrompt: string;
  lastAssistantText: string;
  sessionId: string;
}

async function parseClaude(transcriptPath: string): Promise<ParsedPayload> {
  const jsonl = await readFile(transcriptPath, "utf8").catch(() => "");
  return {
    firstUserPrompt: extractLastUserPrompt(jsonl),
    lastAssistantText: extractLastAssistantText(jsonl),
    sessionId: "",
  };
}

function parseCodexNotify(json: unknown): ParsedPayload {
  if (!json || typeof json !== "object") return { firstUserPrompt: "", lastAssistantText: "", sessionId: "" };
  const obj = json as Record<string, unknown>;
  const last =
    typeof obj["last-assistant-message"] === "string" ? (obj["last-assistant-message"] as string) : "";
  const sessionId =
    typeof obj["thread-id"] === "string"
      ? (obj["thread-id"] as string)
      : typeof obj["session-id"] === "string"
        ? (obj["session-id"] as string)
        : "";

  // Codex has no thread-title field. `input-messages` lists this turn's user
  // inputs in order, so the last one is the prompt that produced this reply.
  let title = typeof obj["thread-title"] === "string" ? (obj["thread-title"] as string) : "";
  if (!title) {
    const msgs = obj["input-messages"];
    if (Array.isArray(msgs)) {
      const lastText = [...msgs]
        .reverse()
        .find((m): m is string => typeof m === "string" && m.trim().length > 0);
      if (lastText) title = lastText.split("\n")[0]!;
    } else if (typeof msgs === "string") {
      title = msgs.split("\n")[0]!;
    }
  }
  return { firstUserPrompt: title, lastAssistantText: last, sessionId };
}

async function parseKimiStop(json: unknown): Promise<ParsedPayload> {
  if (!json || typeof json !== "object") return { firstUserPrompt: "", lastAssistantText: "", sessionId: "" };
  const obj = json as Record<string, unknown>;
  const sessionId = typeof obj.session_id === "string" ? obj.session_id : "";
  const sessionTitle = typeof obj.session_title === "string" ? obj.session_title : "";
  const cwd = typeof obj.cwd === "string" ? obj.cwd : "";

  // Kimi's Stop payload carries only the session id + session-wide title.
  // The current turn's user input and reply live in context.jsonl.
  const transcript = sessionId ? await findKimiContext(cwd, sessionId) : "";
  return {
    firstUserPrompt: extractKimiLastUser(transcript) || sessionTitle,
    lastAssistantText: extractKimiLastAssistant(transcript),
    sessionId,
  };
}

/**
 * Locate <sessionDir>/context.jsonl. Kimi stores sessions under
 * ~/.kimi/sessions/<workspace-hash>/<session-id>/, where the hash depends on
 * cwd. Try the cwd-derived hash first, then fall back to scanning.
 */
async function findKimiContext(cwd: string, sessionId: string): Promise<string> {
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  const { createHash } = await import("node:crypto");

  const roots = [join(homedir(), ".kimi", "sessions")];
  const candidates: string[] = [];

  const hash = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 32);
  if (cwd) {
    // Kimi has used both bare-cwd and slug variants across versions; try both.
    const slug = cwd.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
    for (const key of [cwd, slug]) {
      candidates.push(join(homedir(), ".kimi", "sessions", hash(key), sessionId, "context.jsonl"));
    }
  }

  let best: { path: string; mtime: number } | null = null;
  for (const candidate of candidates) {
    const st = await stat(candidate).catch(() => null);
    if (st && (!best || st.mtimeMs > best.mtime)) best = { path: candidate, mtime: st.mtimeMs };
  }

  if (!best) {
    for (const root of roots) {
      const projects = await readdir(root).catch(() => []);
      for (const project of projects) {
        const candidate = join(root, project, sessionId, "context.jsonl");
        const st = await stat(candidate).catch(() => null);
        if (st && (!best || st.mtimeMs > best.mtime)) best = { path: candidate, mtime: st.mtimeMs };
      }
    }
  }

  return best ? await readFile(best.path, "utf8").catch(() => "") : "";
}

interface KimiContextEntry {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

function kimiEntryText(entry: KimiContextEntry): string {
  const c = entry.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("\n");
}

function parseKimiLines(jsonl: string): KimiContextEntry[] {
  const out: KimiContextEntry[] = [];
  for (const line of jsonl.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as KimiContextEntry);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

function extractKimiLastAssistant(jsonl: string): string {
  const entries = parseKimiLines(jsonl);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e || e.role !== "assistant") continue;
    const text = kimiEntryText(e).trim();
    if (text) return text;
  }
  return "";
}

function extractKimiLastUser(jsonl: string): string {
  const entries = parseKimiLines(jsonl);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e || e.role !== "user") continue;
    const text = kimiEntryText(e).trim();
    if (text) return text;
  }
  return "";
}

export interface FanOutResult {
  ok: boolean;
  perChannel: Array<{ type: string; ok: boolean; status?: number; error?: string }>;
}

export async function fanOut(card: ReturnType<typeof buildCard>, channels: import("../config.js").ChannelConfig[]): Promise<FanOutResult> {
  const tasks = channels.map(async (ch): Promise<{ type: string; ok: boolean; status?: number; error?: string }> => {
    const adapter = CHANNELS[ch.type];
    if (!adapter) return { type: ch.type, ok: false, error: `unknown channel ${ch.type}` };
    try {
      const opts: import("../channels/types.js").SendContext = {};
      if (ch.type === "feishu" || ch.type === "lark") opts.feishu = ch;
      else if (ch.type === "bluebird") opts.bluebird = ch;
      else opts.webhook = ch as Extract<typeof ch, { webhookUrl: string }>;
      const res: PostResult = await adapter.send(card, opts);
      if (res.ok) return { type: ch.type, ok: true, status: res.status };
      const detail = "bodyText" in res && res.bodyText ? `: ${res.bodyText.slice(0, 300)}` : "";
      return {
        type: ch.type,
        ok: false,
        status: "status" in res ? res.status : undefined,
        error: `${"error" in res ? res.error : res.kind}${detail}`,
      };
    } catch (e) {
      return { type: ch.type, ok: false, error: (e as Error).message };
    }
  });
  const results = await Promise.allSettled(tasks);
  const perChannel: FanOutResult["perChannel"] = [];
  let anyFail = false;
  for (const r of results) {
    if (r.status === "fulfilled") {
      perChannel.push(r.value);
      if (!r.value.ok) anyFail = true;
    } else {
      perChannel.push({ type: "?", ok: false, error: String(r.reason) });
      anyFail = true;
    }
  }
  return { ok: !anyFail, perChannel };
}

/**
 * Return the last positional (non-flag) argument at or after `startIdx`.
 * Codex's notify contract appends the JSON payload as the final argv element,
 * but users may also pass flags after it (commander tolerates either order).
 * Flags are `--name` / `--name=value`; a standalone token following a bare
 * `--name` is treated as that flag's value, not a positional.
 */
function pickPositional(argv: string[], startIdx: number): string | undefined {
  let last: string | undefined;
  let expectValueForBareFlag = false;
  for (let i = startIdx; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) continue;
    if (expectValueForBareFlag) {
      expectValueForBareFlag = false;
      continue;
    }
    if (tok.startsWith("--")) {
      if (!tok.includes("=")) expectValueForBareFlag = true;
      continue;
    }
    last = tok;
  }
  return last;
}

export interface SendOptions {
  agent: AgentKind;
  hook?: HookKind;
  /** Override config path (mainly for tests). */
  configPath?: string;
  /** Override argv (for testing Codex path without mutating process.argv). */
  argv?: string[];
  /** Override stdin (for testing). Pass a function that returns the raw JSON. */
  stdinProvider?: () => Promise<string>;
  /** Manual message text. Skips hook payload parsing entirely. */
  text?: string;
  /** Optional title for --text mode. */
  title?: string;
}

export async function runSend(opts: SendOptions): Promise<number> {
  const argv = opts.argv ?? process.argv;
  let inputJson: unknown = null;
  let manualText: string | null = null;

  if (opts.text !== undefined) {
    manualText = opts.text;
  } else if (opts.agent === "codex") {
    // Codex notify passes the JSON as a positional argument after all flags.
    // Find the last argv token that is not a flag or flag value.
    const rawArg = pickPositional(argv, 3);
    if (typeof rawArg === "string" && rawArg.length > 0) {
      try {
        inputJson = JSON.parse(rawArg);
      } catch (e) {
        log.error(`failed to parse codex notify JSON: ${(e as Error).message}`);
        return 4;
      }
    } else {
      log.error("codex send requires a JSON argument");
      return 4;
    }
  } else if (!opts.stdinProvider && process.stdin.isTTY) {
    log.error(
      `stdin is a TTY — nothing to read. This command is meant to be invoked by ${opts.agent}'s hook.` +
        ` For a manual test use: agent-notifier send --agent=${opts.agent} --text "some message"`,
    );
    return 2;
  } else {
    const raw = opts.stdinProvider
      ? await opts.stdinProvider()
      : await readStdin(8000).catch((e) => {
          log.error(`stdin read failed: ${(e as Error).message}`);
          return "";
        });
    if (raw.trim()) {
      try {
        inputJson = JSON.parse(raw);
      } catch (e) {
        log.error(`failed to parse stdin JSON: ${(e as Error).message}`);
        return 4;
      }
    }
  }

  if (opts.agent === "kimi" && opts.hook === "PostToolUse" && manualText === null) {
    // Kimi's PostToolUse payload carries tool output, not the assistant reply.
    // The reply is read from context.jsonl on Stop, so this event is a no-op.
    return 0;
  }

  let parsed: ParsedPayload;
  if (manualText !== null) {
    parsed = {
      firstUserPrompt: opts.title ?? "",
      lastAssistantText: manualText,
      sessionId: "",
    };
  } else if (opts.agent === "claude") {
    const transcriptPath =
      inputJson && typeof inputJson === "object" && typeof (inputJson as Record<string, unknown>).transcript_path === "string"
        ? ((inputJson as Record<string, unknown>).transcript_path as string)
        : "";
    const sessionId =
      inputJson && typeof inputJson === "object" && typeof (inputJson as Record<string, unknown>).session_id === "string"
        ? ((inputJson as Record<string, unknown>).session_id as string)
        : "";
    const cl = await parseClaude(transcriptPath);
    parsed = { ...cl, sessionId };
  } else if (opts.agent === "codex") {
    parsed = parseCodexNotify(inputJson);
  } else if (opts.agent === "kimi") {
    parsed = await parseKimiStop(inputJson);
  } else {
    log.error(`unknown agent ${opts.agent}`);
    return 4;
  }

  if (!parsed.lastAssistantText) {
    log.warn("no assistant text to send; skipping");
    return 0;
  }

  if (opts.configPath) {
    const { setConfigPath } = await import("../config.js");
    setConfigPath(opts.configPath);
  }
  const cfg = await loadConfig();
  if (!cfg) {
    log.error("config not found; agent-notifier not installed?");
    return 4;
  }

  const card = buildCard({
    firstUserPrompt: parsed.firstUserPrompt,
    lastAssistantText: parsed.lastAssistantText,
    agent: opts.agent,
    sessionId: parsed.sessionId,
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

export { VERSION };