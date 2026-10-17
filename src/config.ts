import { z } from "zod";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { log } from "./log.js";

export const ChannelTypeSchema = z.enum([
  "feishu",
  "lark",
  "slack",
  "bark",
  "dingtalk",
  "wecom",
  "pushdeer",
  "bluebird",
]);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

/** Lark (international Feishu) shares the app-bot protocol, different host. */
const FeishuChannelSchema = z.object({
  type: z.enum(["feishu", "lark"]),
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  /** receive_id; prefix determines the kind: `oc_`=group, `ou_`=user, `on_`=department. */
  chatId: z.string().min(1),
});
export type FeishuChannel = z.infer<typeof FeishuChannelSchema>;

/** Plain incoming-webhook channels. DingTalk may carry a signing secret. */
const WebhookChannelSchema = z.object({
  type: z.enum(["slack", "bark", "dingtalk", "wecom", "pushdeer"]),
  webhookUrl: z.string().url(),
  /** DingTalk signing secret (加签方式); optional when using an IP allowlist. */
  secret: z.string().optional(),
});
export type WebhookChannel = z.infer<typeof WebhookChannelSchema>;

/** Generic JSON webhook with an optional bearer token. */
const BluebirdChannelSchema = z.object({
  type: z.literal("bluebird"),
  webhookUrl: z.string().url(),
  token: z.string().optional(),
});
export type BluebirdChannel = z.infer<typeof BluebirdChannelSchema>;

export const ChannelConfigSchema = z.discriminatedUnion("type", [
  FeishuChannelSchema,
  WebhookChannelSchema,
  BluebirdChannelSchema,
]);
export type ChannelConfig = FeishuChannel | WebhookChannel | BluebirdChannel;

export const AgentsSchema = z.object({
  claude: z.boolean().default(false),
  codex: z.boolean().default(false),
  kimi: z.boolean().default(false),
});
export type Agents = z.infer<typeof AgentsSchema>;

export const ConfigSchema = z.object({
  version: z.literal(1),
  channels: z.array(ChannelConfigSchema).min(1),
  agents: AgentsSchema,
  installedAt: z.number().int().nonnegative(),
  binaryPath: z.string().min(1),
});
export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG_DIR = join(homedir(), ".agent-hook");
export const DEFAULT_CONFIG_PATH = join(DEFAULT_CONFIG_DIR, "config.json");

let configPath = DEFAULT_CONFIG_PATH;

export function setConfigPath(p: string | null): void {
  if (!p) {
    configPath = DEFAULT_CONFIG_PATH;
    return;
  }
  configPath = isAbsolute(p) ? p : join(process.cwd(), p);
}

export function getConfigPath(): string {
  return configPath;
}

export async function loadConfig(): Promise<Config | null> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    log.warn(`config.read failed at ${configPath}: ${(e as Error).message}`);
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    log.warn(`config.parse failed at ${configPath}: ${(e as Error).message}`);
    return null;
  }
  const result = ConfigSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const hint = looksLikeLegacyWebhookConfig(json)
      ? " — this looks like a pre-v0.1 config that used webhook URLs for feishu. Run `agent-notifier uninstall` then `agent-notifier install` to migrate (feishu now uses App ID / App Secret / chat ID)."
      : "";
    log.warn(`config schema mismatch at ${configPath}: ${issue?.message ?? result.error.message}${hint}`);
    return null;
  }
  return result.data;
}

/** Heuristic: detect legacy configs that stored feishu/bark/slack as webhookUrl. */
function looksLikeLegacyWebhookConfig(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  const channels = (json as Record<string, unknown>).channels;
  if (!Array.isArray(channels)) return false;
  return channels.some((c) => {
    if (!c || typeof c !== "object") return false;
    const ch = c as Record<string, unknown>;
    if (ch.type === "feishu") return typeof ch.webhookUrl === "string";
    return false;
  });
}

export async function saveConfig(config: Config): Promise<void> {
  const dir = configPath.replace(/\/[^/]+$/, "");
  await mkdir(dir, { recursive: true });
  const tmp = `${configPath}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(tmp, configPath);
}

export function makeDefaultConfig(opts: { channels: ChannelConfig[]; agents: Agents; binaryPath: string }): Config {
  return {
    version: 1 as const,
    channels: opts.channels,
    agents: opts.agents,
    installedAt: Math.floor(Date.now() / 1000),
    binaryPath: opts.binaryPath,
  };
}

/**
 * Derive the Feishu `receive_id_type` from an id prefix.
 * Valid API values: open_id | user_id | union_id | email | chat_id.
 * `oc_` is a chat id, `ou_` an open id, `on_` an open department id
 * (not a supported receive_id_type — falls back to open_id).
 */
export function feishuReceiveIdType(chatId: string): "chat_id" | "open_id" | "email" {
  if (chatId.startsWith("oc_")) return "chat_id";
  if (chatId.startsWith("ou_") || chatId.startsWith("on_")) return "open_id";
  if (chatId.includes("@")) return "email";
  return "chat_id";
}