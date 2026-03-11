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

