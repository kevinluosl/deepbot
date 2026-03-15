/**
 * API 工具 Schema 定义
 * 
 * 定义所有 API 工具的参数 Schema
 */

import { Type } from '@sinclair/typebox';

/**
 * 获取配置 Schema
 */
export const GetConfigSchema = Type.Object({
  configType: Type.Union([
    Type.Literal('workspace', { description: '工作目录配置' }),
    Type.Literal('model', { description: '模型配置' }),
    Type.Literal('image-generation', { description: '图片生成工具配置' }),
    Type.Literal('web-search', { description: 'Web 搜索工具配置' }),
    Type.Literal('all', { description: '所有配置' }),
  ]),
});

/**
 * 设置工作目录配置 Schema
 */
export const SetWorkspaceConfigSchema = Type.Object({
  workspaceDir: Type.Optional(Type.String({
    description: '默认工作目录（所有操作限制在此目录及其子目录）',
  })),
  
  scriptDir: Type.Optional(Type.String({
    description: 'Python 脚本目录',
  })),
  
  skillDirs: Type.Optional(Type.Array(Type.String(), {
    description: 'Skill 目录列表（支持多个路径）',
  })),
  
  defaultSkillDir: Type.Optional(Type.String({
    description: '默认 Skill 目录',
  })),
  
  imageDir: Type.Optional(Type.String({
    description: '图片生成目录',
  })),
  
  memoryDir: Type.Optional(Type.String({
    description: '记忆管理目录',
  })),
  
  sessionDir: Type.Optional(Type.String({
    description: '会话历史目录',
  })),
});

/**
 * 设置模型配置 Schema
 */
export const SetModelConfigSchema = Type.Object({
  providerType: Type.Optional(Type.Union([
    Type.Literal('qwen', { description: '通义千问' }),
    Type.Literal('deepseek', { description: 'DeepSeek' }),
    Type.Literal('custom', { description: '自定义提供商' }),
  ])),
  
  providerId: Type.Optional(Type.String({
    description: '提供商 ID',
  })),
  
  providerName: Type.Optional(Type.String({
    description: '提供商名称',
  })),
  
  baseUrl: Type.Optional(Type.String({
    description: 'API 地址',
  })),
  
  modelId: Type.Optional(Type.String({
    description: '模型 ID',
  })),
  
  modelId2: Type.Optional(Type.String({
    description: '快速模型 ID（可选，用于轻量级任务）',
  })),
  
  modelName: Type.Optional(Type.String({
    description: '模型名称',
  })),
  
  apiKey: Type.Optional(Type.String({
    description: 'API Key',
  })),
  
  contextWindow: Type.Optional(Type.Number({
    description: '上下文窗口大小（tokens），范围：1000 - 2000000',
    minimum: 1000,
    maximum: 2000000,
  })),
});

/**
 * 设置图片生成工具配置 Schema
 */
export const SetImageGenerationConfigSchema = Type.Object({
  model: Type.Optional(Type.String({
    description: '模型名称',
  })),
  
  apiUrl: Type.Optional(Type.String({
    description: 'API 地址',
  })),
  
  apiKey: Type.Optional(Type.String({
    description: 'API Key',
  })),
});

/**
 * 设置 Web 搜索工具配置 Schema
 */
export const SetWebSearchConfigSchema = Type.Object({
  provider: Type.Optional(Type.Union([
    Type.Literal('qwen', { description: '通义千问' }),
    Type.Literal('gemini', { description: 'Google Gemini' }),
  ])),
  
  model: Type.Optional(Type.String({
    description: '模型名称',
  })),
  
  apiUrl: Type.Optional(Type.String({
    description: 'API 地址',
  })),
  
  apiKey: Type.Optional(Type.String({
    description: 'API Key',
  })),
});

/**
 * 设置名字配置 Schema
 */
export const SetNameConfigSchema = Type.Object({
  agentName: Type.Optional(Type.String({
    description: '智能体名字（最多 10 个字符）',
    maxLength: 10,
  })),
  
  userName: Type.Optional(Type.String({
    description: '用户称呼（最多 10 个字符）',
    maxLength: 10,
  })),
});

/**
 * 获取 Session 文件路径 Schema
 */
export const GetSessionFilePathSchema = Type.Object({});

/**
 * 获取日期时间 Schema
 */
export const GetDateTimeSchema = Type.Object({
  format: Type.Optional(Type.Union([
    Type.Literal('full', { description: '完整格式：2026年3月11日 星期二 15:51:30 (Asia/Shanghai)' }),
    Type.Literal('date', { description: '仅日期：2026年3月11日 星期二' }),
    Type.Literal('time', { description: '仅时间：15:51:30' }),
    Type.Literal('datetime', { description: '日期时间：2026年3月11日 15:51:30' }),
    Type.Literal('iso', { description: 'ISO格式：2026-03-11T15:51:30+08:00' }),
    Type.Literal('timestamp', { description: '时间戳：1741766290000' }),
  ], { default: 'full' })),
  
  timezone: Type.Optional(Type.String({
    description: '时区（如：Asia/Shanghai, UTC, America/New_York），默认为系统时区',
  })),
});


/**
 * 设置飞书连接器配置 Schema
 */
export const SetFeishuConnectorConfigSchema = Type.Object({
  appId: Type.String({
    description: '飞书应用 ID（cli_xxx 格式）',
  }),
  
  appSecret: Type.String({
    description: '飞书应用密钥',
  }),
  
  verificationToken: Type.Optional(Type.String({
    description: '验证 Token（可选，用于事件验证）',
  })),
  
  encryptKey: Type.Optional(Type.String({
    description: '加密 Key（可选，用于消息加密）',
  })),
  
  botName: Type.Optional(Type.String({
    description: '机器人名称（可选，默认为"DeepBot"）',
  })),
  
  dmPolicy: Type.Optional(Type.Union([
    Type.Literal('open', { description: '开放模式：所有用户都可以私聊' }),
    Type.Literal('pairing', { description: '配对模式：需要配对码才能私聊' }),
    Type.Literal('allowlist', { description: '白名单模式：只有白名单用户可以私聊' }),
  ], { default: 'pairing' })),
  
  groupPolicy: Type.Optional(Type.Union([
    Type.Literal('open', { description: '开放模式：所有群组都可以使用' }),
    Type.Literal('allowlist', { description: '白名单模式：只有白名单群组可以使用' }),
    Type.Literal('disabled', { description: '禁用模式：禁止群组使用' }),
  ], { default: 'open' })),
  
  requireMention: Type.Optional(Type.Boolean({
    description: '是否需要 @ 机器人才能触发（默认：true）',
    default: true,
  })),
  
  allowFrom: Type.Optional(Type.Array(Type.String(), {
    description: '白名单用户/群组 ID 列表（可选，格式：ou_xxx 或 oc_xxx）',
  })),
  
  enabled: Type.Optional(Type.Boolean({
    description: '是否启用飞书连接器（默认：false）',
    default: false,
  })),
});

/**
 * 启用/禁用连接器 Schema
 */
export const SetConnectorEnabledSchema = Type.Object({
  connectorId: Type.Literal('feishu', { description: '飞书连接器' }),
  
  enabled: Type.Boolean({
    description: '是否启用连接器（true=启用，false=禁用）',
  }),
});

/**
 * 获取配对记录 Schema
 */
export const GetPairingRecordsSchema = Type.Object({
  connectorId: Type.Optional(Type.Literal('feishu', { description: '飞书连接器（可选，不指定则返回所有连接器的配对记录）' })),
});

/**
 * 审核配对请求 Schema
 */
export const ApprovePairingSchema = Type.Object({
  pairingCode: Type.String({
    description: '配对码（6位字母数字组合，如 MXNA5E）',
    pattern: '^[A-Z0-9]{6}$',
  }),
});

/**
 * 拒绝配对请求 Schema
 */
export const RejectPairingSchema = Type.Object({
  connectorId: Type.Literal('feishu', { description: '飞书连接器' }),
  
  userId: Type.String({
    description: '用户 ID（飞书格式：ou_xxx）',
  }),
});
