import type { ChannelType } from "../config.js";

export interface FieldSpec {
  key: "appId" | "appSecret" | "chatId" | "webhookUrl" | "secret" | "token";
  label: string;
  hint?: string;
  example?: string;
  required: boolean;
  secret?: boolean;
  initial?: string;
}

export interface ChannelMeta {
  type: ChannelType;
  label: string;
  summary: string;
  docsUrl?: string;
  fields: FieldSpec[];
}

const WEBHOOK_FIELD: FieldSpec = {
  key: "webhookUrl",
  label: "Webhook URL",
  hint: "粘贴完整地址；不要把 token 打进日志或 issue",
  example: "https://…",
  required: true,
};

export const CHANNEL_META: Record<ChannelType, ChannelMeta> = {
  feishu: {
    type: "feishu",
    label: "飞书 Feishu (app bot)",
    summary: "企业自建应用机器人；不需要群 webhook",
    docsUrl: "https://open.feishu.cn/document/server-docs/im-v1/message/create",
    fields: [
      { key: "appId", label: "App ID", example: "cli_a1b2c3d4e5f6", required: true, initial: "cli_" },
      { key: "appSecret", label: "App Secret", required: true, secret: true },
      {
        key: "chatId",
        label: "Chat ID",
        hint: "oc_ = 群聊，ou_ = 用户，on_ = 部门，或填邮箱",
        example: "oc_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
        required: true,
        initial: "oc_",
      },
    ],
  },
  lark: {
    type: "lark",
    label: "Lark (international)",
    summary: "Lark 国际版应用机器人，协议与飞书相同",
    docsUrl: "https://open.larksuite.com/document/server-docs/im-v1/message/create",
    fields: [
      { key: "appId", label: "App ID", example: "cli_a1b2c3d4e5f6", required: true, initial: "cli_" },
      { key: "appSecret", label: "App Secret", required: true, secret: true },
      { key: "chatId", label: "Chat ID", example: "oc_…", hint: "oc_ 群聊 / ou_ 用户", required: true, initial: "oc_" },
    ],
  },
  slack: {
    type: "slack",
    label: "Slack (incoming webhook)",
    summary: "Block Kit 卡片，支持长文自动分段",
    docsUrl: "https://api.slack.com/messaging/webhooks",
    fields: [
      {
        ...WEBHOOK_FIELD,
        hint: "https://api.slack.com/apps → Incoming Webhooks → Add New Webhook",
        example: "https://hooks.slack.com/services/TXXXXXXX/BXXXXXXX/your-webhook-token",
      },
    ],
  },
  bark: {
    type: "bark",
    label: "Bark (iOS push)",
    summary: "iOS 推送，正文底部带来源署名",
    docsUrl: "https://github.com/Finb/Bark",
    fields: [
      {
        ...WEBHOOK_FIELD,
        hint: "device_key 是 URL 路径第一段，例如 /ABCDE → key = ABCDE",
        example: "https://api.day.app/YourDeviceKey",
      },
    ],
  },
  dingtalk: {
    type: "dingtalk",
    label: "钉钉 DingTalk (group robot)",
    summary: "markdown 消息；支持加签校验",
    docsUrl: "https://open.dingtalk.com/document/robots/custom-robot-access",
    fields: [
      {
        ...WEBHOOK_FIELD,
        hint: "群设置 → 智能群助手 → 添加机器人 → 自定义（带加签）",
        example: "https://oapi.dingtalk.com/robot/send?access_token=xxxxx",
      },
      {
        key: "secret",
        label: "加签 Secret (可选，SEC 开头)",
        hint: "机器人安全设置选「加签」时填写；选 IP 白名单可留空",
        example: "SECxxxxxxxxxxxxxxxx",
        required: false,
        secret: true,
      },
    ],
  },
  wecom: {
    type: "wecom",
    label: "企业微信 WeCom (group robot)",
    summary: "markdown 消息",
    docsUrl: "https://developer.work.weixin.qq.com/document/path/91770",
    fields: [
      {
        ...WEBHOOK_FIELD,
        hint: "群设置 → 群机器人 → 添加 → 复制 Webhook 地址",
        example: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxx",
      },
    ],
  },
  pushdeer: {
    type: "pushdeer",
    label: "PushDeer",
    summary: "自建/官方 PushDeer 服务，markdown 推送",
    docsUrl: "https://github.com/easychen/pushdeer",
    fields: [
      {
        ...WEBHOOK_FIELD,
        hint: "建议直接填 API 地址：https://api2.pushdeer.com/message/push?pushkey=<KEY>",
        example: "https://api2.pushdeer.com/message/push?pushkey=PDUxxxxx",
      },
    ],
  },
  bluebird: {
    type: "bluebird",
    label: "青鸟 Bluebird (generic gateway)",
    summary: "通用 JSON 网关，可再分发到 Bark / 飞书 / WeCom",
    fields: [
      {
        ...WEBHOOK_FIELD,
        hint: "青鸟「设置 → 通知源 → 通用来源」展开后的 webhook 地址",
        example: "https://bluebird.example.com/hooks/your-source",
      },
      {
        key: "token",
        label: "Delivery Token (可选)",
        hint: "对应 Authorization: Bearer <token>",
        required: false,
        secret: true,
      },
    ],
  },
};

export const CHANNEL_ORDER: ChannelType[] = [
  "feishu",
  "lark",
  "slack",
  "bark",
  "dingtalk",
  "wecom",
  "pushdeer",
  "bluebird",
];