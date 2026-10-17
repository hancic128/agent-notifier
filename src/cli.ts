import { Command, Option } from "commander";
import { setVerbose, log } from "./log.js";
import { VERSION } from "./version.js";
import { runInstall } from "./commands/install.js";
import { runUninstall } from "./commands/uninstall.js";
import { runStatus } from "./commands/status.js";
import { runSend } from "./commands/send.js";
import { runTest } from "./commands/test.js";

const program = new Command();

program
  .name("agent-notifier")
  .description("Push notifications for Claude Code, Codex CLI and Kimi Code — Feishu, Lark, Slack, Bark, DingTalk, WeCom, PushDeer and Bluebird.")
  .version(VERSION)
  .option("-v, --verbose", "verbose logging to stderr");

program
  .command("install")
  .description("Detect installed agents, choose channels, inject hooks.")
  .option("--agents <list>", "comma-separated agents (non-interactive): claude,codex,kimi")
  .option(
    "--channels <list>",
    "comma-separated channels: feishu,lark,slack,bark,dingtalk,wecom,pushdeer,bluebird",
  )
  .option("--app-id <id>", "feishu/lark App ID, e.g. cli_xxxxxxxx")
  .option("--app-secret <secret>", "feishu/lark App Secret")
  .option("--chat-id <id>", "feishu/lark receive_id (oc_ / ou_ / email)")
  .option("--url-slack <url>", "slack incoming webhook URL")
  .option("--url-bark <url>", "bark URL, e.g. https://api.day.app/<KEY>")
  .option("--url-dingtalk <url>", "dingtalk robot URL")
  .option("--secret-dingtalk <secret>", "dingtalk signing secret (SEC...)")
  .option("--url-wecom <url>", "wecom group robot URL")
  .option("--url-pushdeer <url>", "pushdeer push URL (with pushkey)")
  .option("--url-bluebird <url>", "bluebird generic source URL")
  .option("--token-bluebird <token>", "bluebird delivery token")
  .option("--config <path>", "override config path")
  .action(async (opts: Record<string, string>) => {
    const nonInteractive = process.env.AGENT_NOTIFIER_NONINTERACTIVE === "1" || !!opts.agents;
    const channels = opts.channels ? (opts.channels.split(",").map((s) => s.trim()).filter(Boolean) as Array<"feishu" | "lark" | "slack" | "bark" | "dingtalk" | "wecom" | "pushdeer" | "bluebird">) : undefined;
    const agents = opts.agents ? (opts.agents.split(",").map((s) => s.trim()).filter(Boolean) as Array<"claude" | "codex" | "kimi">) : undefined;
    const urls: Record<string, string> = {};
    for (const [key, value] of Object.entries(opts)) {
      const m = /^url([A-Z])([a-zA-Z]+)$/.exec(key);
      if (m && typeof value === "string" && value) urls[m[1]!.toLowerCase() + m[2]!] = value;
    }
    const secrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(opts)) {
      const m = /^(secret|token)([A-Z])([a-zA-Z]+)$/.exec(key);
      if (m && typeof value === "string" && value) secrets[m[2]!.toLowerCase() + m[3]!] = value;
    }
    const code = await runInstall({
      nonInteractive,
      channels,
      agents,
      ...(opts.appId ? { appId: opts.appId } : {}),
      ...(opts.appSecret ? { appSecret: opts.appSecret } : {}),
      ...(opts.chatId ? { chatId: opts.chatId } : {}),
      ...(Object.keys(urls).length ? { urls: urls as never } : {}),
      ...(Object.keys(secrets).length ? { secrets: secrets as never } : {}),
      ...(opts.config ? { configPath: opts.config } : {}),
    });
    process.exit(code);
  });

program
  .command("uninstall")
  .description("Remove hooks from agent config files. Preserves backups; use --purge to remove config too.")
  .option("--config <path>", "override config path")
  .option("--purge", "also delete ~/.agent-hook/ config and cache")
  .action(async (opts: { config?: string; purge?: boolean }) => {
    const code = await runUninstall({
      ...(opts.config ? { configPath: opts.config } : {}),
      purge: !!opts.purge,
    });
    process.exit(code);
  });

program
  .command("status")
  .description("Show current configuration and per-agent hook status.")
  .option("--config <path>", "override config path")
  .action(async (opts: { config?: string }) => {
    const code = await runStatus(opts.config ? { configPath: opts.config } : {});
    process.exit(code);
  });

program
  .command("test")
  .description("Send a test card to every configured channel.")
  .option("--config <path>", "override config path")
  .action(async (opts: { config?: string }) => {
    const code = await runTest(opts.config ? { configPath: opts.config } : {});
    process.exit(code);
  });

program
  .command("send")
  .description("Internal entrypoint invoked by agent hooks. Reads stdin/argv, fans out to channels.")
  .addOption(
    new Option("--agent <agent>", "agent invoking the hook")
      .choices(["claude", "codex", "kimi"])
      .makeOptionMandatory(),
  )
  .option("--hook <event>", "hook event name (kimi only, default: Stop)")
  .option("--marker <tag>", "internal: install marker embedded in hook commands")
  .option("--text <message>", "send a manual message instead of reading hook payload")
  .option("--title <title>", "card title for --text mode")
  .option("--config <path>", "override config path")
  .action(async (opts: { agent: "claude" | "codex" | "kimi"; hook?: string; text?: string; title?: string; config?: string }) => {
    const code = await runSend({
      agent: opts.agent,
      ...(opts.hook === "Stop" || opts.hook === "PostToolUse" ? { hook: opts.hook } : {}),
      ...(opts.text !== undefined ? { text: opts.text } : {}),
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.config ? { configPath: opts.config } : {}),
    });
    process.exit(code);
  });

program.parseAsync().catch((err) => {
  log.error(err.message);
  process.exit(1);
});

program.hook("preAction", () => {
  const opts = program.opts<{ verbose?: boolean }>();
  if (opts.verbose) setVerbose(true);
});