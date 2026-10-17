import { realpath, symlink, unlink, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import prompts from "prompts";
import { claude } from "../agents/claude.js";
import { codex } from "../agents/codex.js";
import { kimi } from "../agents/kimi.js";
import type { AgentAdapter } from "../agents/types.js";
import type { ChannelConfig, ChannelType, Agents } from "../config.js";
import { makeDefaultConfig, saveConfig, setConfigPath } from "../config.js";
import { CHANNEL_META, CHANNEL_ORDER } from "../channels/registry.js";
import { runTest } from "./test.js";
import { log } from "../log.js";

const ALL_AGENTS: AgentAdapter[] = [claude, codex, kimi];

interface InstallOptions {
  binaryPath?: string;
  configPath?: string;
  nonInteractive?: boolean;
  channels?: ChannelType[];
  /** App-bot channels (feishu / lark). */
  appId?: string;
  appSecret?: string;
  chatId?: string;
  /** Per-channel webhook URLs, keyed by channel type. */
  urls?: Partial<Record<ChannelType, string>>;
  /** Per-channel secrets, keyed by channel type (dingtalk sign / bluebird token). */
  secrets?: Partial<Record<ChannelType, string>>;
  /** Pre-selected agents for non-interactive mode. */
  agents?: Array<"claude" | "codex" | "kimi">;
}

/** Map CLI flags to a channel config in non-interactive mode. */
function buildNonInteractiveChannel(type: ChannelType, opts: InstallOptions): ChannelConfig | null {
  const meta = CHANNEL_META[type];
  const url = opts.urls?.[type];
  const secret = opts.secrets?.[type];

  if (type === "feishu" || type === "lark") {
    if (!opts.appId || !opts.appSecret || !opts.chatId) {
      log.error(`non-interactive ${type} requires --app-id, --app-secret, --chat-id`);
      return null;
    }
    return { type, appId: opts.appId, appSecret: opts.appSecret, chatId: opts.chatId };
  }

  if (type === "bluebird") {
    if (!url) {
      log.error(`non-interactive bluebird requires --url-bluebird=<url>`);
      return null;
    }
    return { type, webhookUrl: url, ...(secret ? { token: secret } : {}) };
  }

  if (!url) {
    log.error(`non-interactive ${meta.type} requires --url-${meta.type}=<url>`);
    return null;
  }
  if (type === "dingtalk" && secret) return { type, webhookUrl: url, secret };
  return { type, webhookUrl: url } as ChannelConfig;
}

async function detectInstalled(): Promise<AgentAdapter[]> {
  const out: AgentAdapter[] = [];
  for (const a of ALL_AGENTS) {
    if (await a.detect()) out.push(a);
  }
  return out;
}

async function isExecutableFile(p: string): Promise<boolean> {
  try {
    const { stat, access, constants } = await import("node:fs/promises");
    const st = await stat(p);
    if (!st.isFile()) return false;
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the command hooks should invoke. `argv[1]` is the running script, which
 * may be the `bin/agent-notifier` shim (executable, good) or `dist/node/cli.js`
 * (not executable, must not be used as a command). Search upward for the shim.
 */
async function resolveBinaryPath(explicit?: string): Promise<string> {
  if (explicit) return resolve(explicit);
  const argv1 = process.argv[1];
  if (argv1) {
    const abs = await realpath(argv1).catch(() => resolve(argv1!));
    if (await isExecutableFile(abs)) return abs;
    // dist/node/cli.js → look for <root>/bin/agent-notifier
    const root = resolve(abs, "../../..");
    const shim = join(root, "bin", "agent-notifier");
    if (await isExecutableFile(shim)) return await realpath(shim).catch(() => shim);
  }
  return "agent-notifier";
}

function isOnPath(dir: string): boolean {
  const entries = (process.env.PATH ?? "").split(":").filter(Boolean);
  return entries.includes(dir);
}

async function sameFile(a: string, b: string): Promise<boolean> {
  const { realpath: rp } = await import("node:fs/promises");
  const [ra, rb] = await Promise.all([rp(a).catch(() => null), rp(b).catch(() => null)]);
  return ra !== null && ra === rb;
}

/**
 * Decide the command string hooks should invoke.
 *
 * Preference order:
 *  1. Bare `agent-notifier` if PATH already resolves to this exact binary
 *     (npm/pnpm global install — no extra work, survives package upgrades).
 *  2. Symlink into ~/.local/bin when that dir is on PATH.
 *  3. Absolute path to this binary (always works, but breaks if the install
 *     directory moves).
 */
async function resolveHookBinary(self: string): Promise<string> {
  const entries = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of entries) {
    const candidate = join(dir, "agent-notifier");
    if (await sameFile(candidate, self)) return "agent-notifier";
  }

  const localBin = join(homedir(), ".local", "bin");
  const target = join(localBin, "agent-notifier");
  if (target === self) return "agent-notifier";
  if (isOnPath(localBin) || !process.env.PATH) {
    try {
      await mkdir(localBin, { recursive: true });
      const { readlink } = await import("node:fs/promises");
      const current = await readlink(target).catch(() => null);
      if (current !== self) {
        await unlink(target).catch(() => {});
        await symlink(self, target);
      }
      return "agent-notifier";
    } catch {
      // fall through to absolute path
    }
  }

  return self;
}

async function promptAgentsChoices(detected: AgentAdapter[]): Promise<AgentAdapter[]> {
  if (detected.length === 0) {
    log.warn("no supported agents detected on this system");
    return [];
  }
  const response = await prompts({
    type: "multiselect",
    name: "ids",
    message: "Which agents should receive webhook hooks?",
    choices: detected.map((a) => ({ title: a.displayName, value: a.id, selected: true })),
    hint: "Space to toggle, Enter to confirm",
  });
  const ids = (response.ids ?? []) as string[];
  return detected.filter((a) => ids.includes(a.id));
}

async function promptChannels(): Promise<ChannelType[]> {
  const response = await prompts({
    type: "multiselect",
    name: "types",
    message: "Which notification channels do you want to enable?",
    choices: CHANNEL_ORDER.map((t, i) => ({
      title: CHANNEL_META[t].label,
      value: t,
      selected: i === 0,
    })),
    hint: "Space to toggle · multiple channels fan out concurrently",
  });
  return ((response.types ?? []) as ChannelType[]);
}

/** Generic field-driven prompt used by every channel in the registry. */
async function promptFields(type: ChannelType): Promise<ChannelConfig> {
  const meta = CHANNEL_META[type];
  console.error("");
  log.info(`${meta.label} — ${meta.summary}`);
  if (meta.docsUrl) log.info(`  docs: ${meta.docsUrl}`);

  const values: Record<string, string> = {};

  if (type === "feishu" || type === "lark") {
    const host = type === "feishu" ? "https://open.feishu.cn" : "https://open.larksuite.com";
    log.info(`  1. 在 ${host} 创建企业自建应用`);
    log.info("  2. 权限管理：勾选 im:message、im:message:send_as_bot");
    log.info("  3. 启用机器人能力，并把目标群/用户加入可用范围");
    log.info("  4. 在「凭证与基础信息」拿到 App ID 和 App Secret");
  }

  for (const f of meta.fields) {
    const answer = await prompts({
      type: f.secret ? "password" : "text",
      name: "value",
      message: `${f.label}${f.required ? "" : " (optional)"}`,
      initial: f.initial ?? "",
      hint: [f.hint, f.example ? `e.g. ${f.example}` : ""].filter(Boolean).join(" · "),
      validate: (v: string) => {
        const s = v.trim();
        if (!s) return f.required ? "required" : true;
        if (f.key === "webhookUrl") {
          if (!/^https?:\/\//.test(s)) return "must start with http(s)://";
        }
        if (f.key === "appId" && !/^cli_[a-zA-Z0-9]+$/.test(s)) {
          return "expected format: cli_xxxxxxxx";
        }
        if (f.key === "chatId" && !(s.startsWith("oc_") || s.startsWith("ou_") || s.startsWith("on_") || s.includes("@"))) {
          return "expected oc_ (group) / ou_ (user) / on_ (dept) or an email";
        }
        return true;
      },
    });
    values[f.key] = String(answer.value ?? "").trim();
  }

  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) if (v) base[k] = v;

  if (type === "bluebird") {
    return { type, webhookUrl: base.webhookUrl!, ...(base.token ? { token: base.token } : {}) };
  }
  if (type === "feishu" || type === "lark") {
    return { type, appId: base.appId!, appSecret: base.appSecret!, chatId: base.chatId! };
  }
  return { type, webhookUrl: base.webhookUrl!, ...(base.secret ? { secret: base.secret } : {}) } as ChannelConfig;
}

function buildAgentsMap(selected: AgentAdapter[]): Agents {
  const all: Record<string, boolean> = { claude: false, codex: false, kimi: false };
  for (const a of selected) all[a.id] = true;
  return { claude: all.claude ?? false, codex: all.codex ?? false, kimi: all.kimi ?? false };
}

export async function runInstall(opts: InstallOptions = {}): Promise<number> {
  const detected = await detectInstalled();
  if (detected.length === 0) {
    log.warn("no supported agents detected; install claude code / codex / kimi first");
    return 1;
  }

  const nonInteractive = opts.nonInteractive ?? process.env.AGENT_NOTIFIER_NONINTERACTIVE === "1";

  const selectedAgents = nonInteractive
    ? detected.filter((a) => (opts.agents ?? []).includes(a.id as "claude" | "codex" | "kimi"))
    : await promptAgentsChoices(detected);
  if (selectedAgents.length === 0) {
    log.warn("no agents selected; nothing to install");
    return 1;
  }

  const selectedChannels = nonInteractive ? (opts.channels ?? []) : await promptChannels();
  if (selectedChannels.length === 0) {
    log.warn("no channels selected; nothing to install");
    return 1;
  }
  for (const c of selectedChannels) {
    if (!CHANNEL_ORDER.includes(c)) {
      log.error(`unknown channel type: ${c}`);
      return 1;
    }
  }

  const channelConfigs: ChannelConfig[] = [];
  for (const c of selectedChannels) {
    if (nonInteractive) {
      const cfg = buildNonInteractiveChannel(c, opts);
      if (!cfg) return 1;
      channelConfigs.push(cfg);
    } else {
      channelConfigs.push(await promptFields(c));
    }
  }

  const binaryPath = await resolveBinaryPath(opts.binaryPath);
  const hookBinary = await resolveHookBinary(binaryPath);

  for (const a of selectedAgents) {
    try {
      await a.install({ binaryPath: hookBinary });
      log.info(`✓ installed hook for ${a.displayName}`);
    } catch (e) {
      log.error(`install failed for ${a.displayName}: ${(e as Error).message}`);
      return 2;
    }
  }

  if (opts.configPath) setConfigPath(opts.configPath);
  const cfg = makeDefaultConfig({
    channels: channelConfigs,
    agents: buildAgentsMap(selectedAgents),
    binaryPath: hookBinary,
  });
  await saveConfig(cfg);
  log.info(`✓ wrote config to ${(opts.configPath ?? "~/.agent-hook/config.json")}`);
  log.info(`✓ hooks will run: ${hookBinary} send`);

  log.info("— testing channels —");
  const testCode = await runTest({ configPath: opts.configPath });
  if (testCode !== 0) {
    log.warn("some channels failed to reach the webhook; check URLs and credentials above");
  }

  return 0;
}