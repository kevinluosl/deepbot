/**
 * API 工具（系统配置访问）
 * 
 * 让 Agent 可以访问 DeepBot 的系统配置，包括：
 * - 工作目录配置（workspaceDir, scriptDir, skillDirs, imageDir, memoryDir）
 * - 模型配置（provider, model, apiKey）
 * - 工具配置（图片生成、Web 搜索）
 * 
 * 注意：名字配置（agentName, userName）由 memory tool 管理，不在此工具中处理
 * 
 * 安全限制：
 * - 只读操作：查询配置
 * - 写操作：更新配置（需要用户确认）
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { TOOL_NAMES } from './tool-names';
import * as schemas from './api-tool.schemas';
import * as handlers from './api-tool.handlers';

/**
 * API 工具插件
 */
export const apiToolPlugin: ToolPlugin = {
  metadata: {
    id: 'api-tool',
    name: 'api',
    version: '1.0.0',
    description: '访问 DeepBot 系统配置。支持查询和设置工作目录、模型、工具等配置',
    author: 'DeepBot',
    category: 'system',
    tags: ['api', 'config', 'system'],
    requiresConfig: false,
  },
  
  create: (options: ToolCreateOptions) => {
    // 🔥 从 options 中获取 sessionId
    const sessionId = options.sessionId || 'default';
    
    return [
      // 获取配置
      {
        name: TOOL_NAMES.API_GET_CONFIG,
        label: '获取系统配置',
        description: '查询 DeepBot 的系统配置，包括工作目录、模型、工具等配置',
        parameters: schemas.GetConfigSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleGetConfig(args, signal);
        },
      },
      
      // 设置工作目录配置（已禁用：工作目录只能通过系统设置界面修改，不允许 Agent 调用）
      // {
      //   name: TOOL_NAMES.API_SET_WORKSPACE_CONFIG,
      //   label: '设置工作目录配置',
      //   description: '更新 DeepBot 的工作目录配置。可以设置工作目录、脚本目录、Skill 目录、图片目录、记忆目录',
      //   parameters: schemas.SetWorkspaceConfigSchema,
      //   execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
      //     return handlers.handleSetWorkspaceConfig(args, signal);
      //   },
      // },
      
      // 设置模型配置
      {
        name: TOOL_NAMES.API_SET_MODEL_CONFIG,
        label: '设置模型配置',
        description: '更新 DeepBot 的模型配置。可以设置提供商、模型、API 地址、API Key',
        parameters: schemas.SetModelConfigSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleSetModelConfig(args, signal);
        },
      },
      
      // 设置图片生成工具配置
      {
        name: TOOL_NAMES.API_SET_IMAGE_GENERATION_CONFIG,
        label: '设置图片生成工具配置',
        description: '更新图片生成工具的配置。可以设置模型、API 地址、API Key',
        parameters: schemas.SetImageGenerationConfigSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleSetImageGenerationConfig(args, signal);
        },
      },
      
      // 设置 Web 搜索工具配置
      {
        name: TOOL_NAMES.API_SET_WEB_SEARCH_CONFIG,
        label: '设置 Web 搜索工具配置',
        description: '更新 Web 搜索工具的配置。可以设置提供商、模型、API 地址、API Key',
        parameters: schemas.SetWebSearchConfigSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleSetWebSearchConfig(args, signal);
        },
      },
      
      // 设置飞书连接器配置
      {
        name: TOOL_NAMES.API_SET_FEISHU_CONNECTOR_CONFIG,
        label: '设置飞书连接器配置',
        description: '配置飞书连接器。设置 App ID 和 App Secret。配置后需要启用才能使用',
        parameters: schemas.SetFeishuConnectorConfigSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleSetFeishuConnectorConfig(args, signal);
        },
      },
      
      // 启用/禁用连接器
      {
        name: TOOL_NAMES.API_SET_CONNECTOR_ENABLED,
        label: '启用/禁用连接器',
        description: '启用或禁用外部通讯连接器（飞书、微信等）。需要先配置连接器才能启用',
        parameters: schemas.SetConnectorEnabledSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleSetConnectorEnabled(args, signal);
        },
      },
      
      // 获取配对记录
      {
        name: TOOL_NAMES.API_GET_PAIRING_RECORDS,
        label: '获取配对记录',
        description: '查询连接器的配对记录，包括待审核和已审核的配对请求。用于 pairing 模式下的用户管理',
        parameters: schemas.GetPairingRecordsSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleGetPairingRecords(args, signal);
        },
      },
      
      // 审核配对请求
      {
        name: TOOL_NAMES.API_APPROVE_PAIRING,
        label: '审核配对请求',
        description: '批准用户的配对请求。审核通过后，用户可以通过连接器与 DeepBot 进行私聊',
        parameters: schemas.ApprovePairingSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleApprovePairing(args, signal);
        },
      },
      
      // 拒绝配对请求
      {
        name: TOOL_NAMES.API_REJECT_PAIRING,
        label: '拒绝配对请求',
        description: '拒绝用户的配对请求。拒绝后，该用户的配对记录将被删除',
        parameters: schemas.RejectPairingSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleRejectPairing(args, signal);
        },
      },
      
      // 获取名字配置
      {
        name: TOOL_NAMES.API_GET_NAME,
        label: '获取名字配置',
        description: '查询智能体名字和用户称呼',
        parameters: Type.Object({}),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleGetNameConfig(signal);
        },
      },
      
      // 设置名字配置
      {
        name: TOOL_NAMES.API_SET_NAME,
        label: '设置名字配置',
        description: '更新智能体名字和用户称呼。名字最多 10 个字符。如果在主 Tab 中调用，会修改全局默认名字（影响所有未单独设置名字的 Tab）；如果在非主 Tab 中调用，只修改当前 Tab 的名字',
        parameters: schemas.SetNameConfigSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleSetNameConfig(sessionId, args, signal);
        },
      },
      
      // 获取 Session 文件路径
      {
        name: TOOL_NAMES.API_GET_SESSION_FILE_PATH,
        label: '获取 Session 文件路径',
        description: '获取当前 Tab 的 Session 文件路径，用于读取和分析对话历史',
        parameters: schemas.GetSessionFilePathSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleGetSessionFilePath(sessionId, signal);
        },
      },
      
      // 获取日期时间
      {
        name: TOOL_NAMES.API_GET_DATETIME,
        label: '获取日期时间',
        description: '获取系统当前日期时间和时区信息。支持多种格式：完整格式、仅日期、仅时间、ISO格式、时间戳等',
        parameters: schemas.GetDateTimeSchema,
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          return handlers.handleGetDateTime(args, signal);
        },
      },
    ];
  },
};
