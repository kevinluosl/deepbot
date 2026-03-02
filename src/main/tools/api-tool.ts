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
import { getErrorMessage } from '../../shared/utils/error-handler';
import { TOOL_NAMES } from './tool-names';
import { 
  DEFAULT_MODEL_CONFIG, 
  DEFAULT_IMAGE_GENERATION_CONFIG, 
  DEFAULT_WEB_SEARCH_CONFIG 
} from '../../shared/config/default-configs';

/**
 * API 工具参数 Schema - 获取配置
 */
const GetConfigSchema = Type.Object({
  configType: Type.Union([
    Type.Literal('workspace', { description: '工作目录配置' }),
    Type.Literal('model', { description: '模型配置' }),
    Type.Literal('image-generation', { description: '图片生成工具配置' }),
    Type.Literal('web-search', { description: 'Web 搜索工具配置' }),
    Type.Literal('all', { description: '所有配置' }),
  ]),
});

/**
 * API 工具参数 Schema - 设置工作目录配置
 */
const SetWorkspaceConfigSchema = Type.Object({
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
});

/**
 * API 工具参数 Schema - 设置模型配置
 */
const SetModelConfigSchema = Type.Object({
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
 * API 工具参数 Schema - 设置图片生成工具配置
 */
const SetImageGenerationConfigSchema = Type.Object({
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
 * API 工具参数 Schema - 设置 Web 搜索工具配置
 */
const SetWebSearchConfigSchema = Type.Object({
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
 * API 工具参数 Schema - 设置名字配置
 */
const SetNameConfigSchema = Type.Object({
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
    return [
      // 获取配置
      {
        name: TOOL_NAMES.API_GET_CONFIG,
        label: '获取系统配置',
        description: '查询 DeepBot 的系统配置，包括工作目录、模型、工具等配置',
        parameters: GetConfigSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            const params = args as {
              configType: 'workspace' | 'model' | 'image-generation' | 'web-search' | 'all';
            };
            
            console.log('[API Tool] 📋 获取配置:', params.configType);
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('获取配置操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 加载 SystemConfigStore
            const { SystemConfigStore } = await import('../database/system-config-store');
            const store = SystemConfigStore.getInstance();
            
            let result: any = {};
            
            // 根据类型获取配置
            if (params.configType === 'workspace' || params.configType === 'all') {
              result.workspace = store.getWorkspaceSettings();
            }
            
            if (params.configType === 'model' || params.configType === 'all') {
              result.model = store.getModelConfig();
            }
            
            if (params.configType === 'image-generation' || params.configType === 'all') {
              result.imageGeneration = store.getImageGenerationToolConfig();
            }
            
            if (params.configType === 'web-search' || params.configType === 'all') {
              result.webSearch = store.getWebSearchToolConfig();
            }
            
            // 构建结果消息
            let resultMessage = `✅ 系统配置查询成功\n\n`;
            
            if (result.workspace) {
              resultMessage += `📁 工作目录配置：\n`;
              resultMessage += `  • 工作目录: ${result.workspace.workspaceDir}\n`;
              resultMessage += `  • 脚本目录: ${result.workspace.scriptDir}\n`;
              resultMessage += `  • Skill 目录: ${result.workspace.skillDirs.join(', ')}\n`;
              resultMessage += `  • 默认 Skill 目录: ${result.workspace.defaultSkillDir}\n`;
              resultMessage += `  • 图片目录: ${result.workspace.imageDir}\n`;
              resultMessage += `  • 记忆目录: ${result.workspace.memoryDir}\n\n`;
            }
            
            if (result.model) {
              resultMessage += `🤖 模型配置：\n`;
              resultMessage += `  • 提供商类型: ${result.model.providerType}\n`;
              resultMessage += `  • 提供商: ${result.model.providerName}\n`;
              resultMessage += `  • 模型: ${result.model.modelName}\n`;
              resultMessage += `  • API 地址: ${result.model.baseUrl}\n`;
              resultMessage += `  • API Key: ${result.model.apiKey ? '已配置' : '未配置'}\n`;
              resultMessage += `  • 上下文窗口: ${result.model.contextWindow ? result.model.contextWindow.toLocaleString() + ' tokens' : '未设置'}\n\n`;
            }
            
            if (result.imageGeneration) {
              resultMessage += `🎨 图片生成工具配置：\n`;
              resultMessage += `  • 模型: ${result.imageGeneration.model}\n`;
              resultMessage += `  • API 地址: ${result.imageGeneration.apiUrl}\n`;
              resultMessage += `  • API Key: ${result.imageGeneration.apiKey ? '已配置' : '未配置'}\n\n`;
            }
            
            if (result.webSearch) {
              resultMessage += `🔍 Web 搜索工具配置：\n`;
              resultMessage += `  • 提供商: ${result.webSearch.provider}\n`;
              resultMessage += `  • 模型: ${result.webSearch.model}\n`;
              resultMessage += `  • API 地址: ${result.webSearch.apiUrl}\n`;
              resultMessage += `  • API Key: ${result.webSearch.apiKey ? '已配置' : '未配置'}\n`;
            }
            
            return {
              content: [
                {
                  type: 'text',
                  text: resultMessage,
                },
              ],
              details: {
                success: true,
                config: result,
              },
            };
          } catch (error) {
            console.error('[API Tool] ❌ 获取配置失败:', error);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 获取配置失败: ${getErrorMessage(error)}`,
                },
              ],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
        },
      },
      
      // 设置工作目录配置
      {
        name: TOOL_NAMES.API_SET_WORKSPACE_CONFIG,
        label: '设置工作目录配置',
        description: '更新 DeepBot 的工作目录配置。可以设置工作目录、脚本目录、Skill 目录、图片目录、记忆目录',
        parameters: SetWorkspaceConfigSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            const params = args as Partial<{
              workspaceDir: string;
              scriptDir: string;
              skillDirs: string[];
              defaultSkillDir: string;
              imageDir: string;
              memoryDir: string;
            }>;
            
            console.log('[API Tool] 💾 设置工作目录配置:', params);
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('设置配置操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 加载 SystemConfigStore
            const { SystemConfigStore } = await import('../database/system-config-store');
            const store = SystemConfigStore.getInstance();
            
            // 获取当前配置
            const currentSettings = store.getWorkspaceSettings();
            
            // 合并配置
            const newSettings = {
              workspaceDir: params.workspaceDir || currentSettings.workspaceDir,
              scriptDir: params.scriptDir || currentSettings.scriptDir,
              skillDirs: params.skillDirs || currentSettings.skillDirs,
              defaultSkillDir: params.defaultSkillDir || currentSettings.defaultSkillDir,
              imageDir: params.imageDir || currentSettings.imageDir,
              memoryDir: params.memoryDir || currentSettings.memoryDir,
            };
            
            // 保存配置
            store.saveWorkspaceSettings(newSettings);
            
            // 构建结果消息
            let resultMessage = `✅ 工作目录配置已更新\n\n`;
            
            if (params.workspaceDir) {
              resultMessage += `  • 工作目录: ${params.workspaceDir}\n`;
            }
            if (params.scriptDir) {
              resultMessage += `  • 脚本目录: ${params.scriptDir}\n`;
            }
            if (params.skillDirs) {
              resultMessage += `  • Skill 目录: ${params.skillDirs.join(', ')}\n`;
            }
            if (params.defaultSkillDir) {
              resultMessage += `  • 默认 Skill 目录: ${params.defaultSkillDir}\n`;
            }
            if (params.imageDir) {
              resultMessage += `  • 图片目录: ${params.imageDir}\n`;
            }
            if (params.memoryDir) {
              resultMessage += `  • 记忆目录: ${params.memoryDir}\n`;
            }
            
            resultMessage += `\n⚠️ 注意：配置已更新，下次创建新会话时生效`;
            
            return {
              content: [
                {
                  type: 'text',
                  text: resultMessage,
                },
              ],
              details: {
                success: true,
                settings: newSettings,
              },
            };
          } catch (error) {
            console.error('[API Tool] ❌ 设置工作目录配置失败:', error);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 设置工作目录配置失败: ${getErrorMessage(error)}`,
                },
              ],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
        },
      },
      
      // 设置模型配置
      {
        name: TOOL_NAMES.API_SET_MODEL_CONFIG,
        label: '设置模型配置',
        description: '更新 DeepBot 的模型配置。可以设置提供商、模型、API 地址、API Key',
        parameters: SetModelConfigSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            const params = args as Partial<{
              providerType: 'qwen' | 'deepseek' | 'custom';
              providerId: string;
              providerName: string;
              baseUrl: string;
              modelId: string;
              modelName: string;
              apiKey: string;
              contextWindow: number;
            }>;
            
            console.log('[API Tool] 💾 设置模型配置:', params);
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('设置配置操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 加载 SystemConfigStore
            const { SystemConfigStore } = await import('../database/system-config-store');
            const store = SystemConfigStore.getInstance();
            
            // 获取当前配置（如果没有则使用默认值）
            const currentConfig = store.getModelConfig();
            
            // 合并配置（优先级：用户输入 > 当前配置 > 默认配置）
            const newConfig = {
              providerType: params.providerType || currentConfig?.providerType || DEFAULT_MODEL_CONFIG.providerType,
              providerId: params.providerId || currentConfig?.providerId || DEFAULT_MODEL_CONFIG.providerId,
              providerName: params.providerName || currentConfig?.providerName || DEFAULT_MODEL_CONFIG.providerName,
              baseUrl: params.baseUrl || currentConfig?.baseUrl || DEFAULT_MODEL_CONFIG.baseUrl,
              modelId: params.modelId || currentConfig?.modelId || DEFAULT_MODEL_CONFIG.modelId,
              modelName: params.modelName || currentConfig?.modelName || DEFAULT_MODEL_CONFIG.modelName,
              apiKey: params.apiKey || currentConfig?.apiKey || DEFAULT_MODEL_CONFIG.apiKey,
              contextWindow: params.contextWindow || currentConfig?.contextWindow,
              lastFetched: params.contextWindow ? Date.now() : currentConfig?.lastFetched,
            };
            
            // 保存配置
            store.saveModelConfig(newConfig);
            
            // 构建结果消息
            let resultMessage = `✅ 模型配置已更新\n\n`;
            
            if (params.providerType) {
              resultMessage += `  • 提供商类型: ${params.providerType}\n`;
            }
            if (params.providerName) {
              resultMessage += `  • 提供商: ${params.providerName}\n`;
            }
            if (params.modelName) {
              resultMessage += `  • 模型: ${params.modelName}\n`;
            }
            if (params.baseUrl) {
              resultMessage += `  • API 地址: ${params.baseUrl}\n`;
            }
            if (params.apiKey) {
              resultMessage += `  • API Key: 已更新\n`;
            }
            if (params.contextWindow) {
              resultMessage += `  • 上下文窗口: ${params.contextWindow.toLocaleString()} tokens\n`;
            }
            
            resultMessage += `\n⚠️ 注意：配置已更新，下次创建新会话时生效`;
            
            return {
              content: [
                {
                  type: 'text',
                  text: resultMessage,
                },
              ],
              details: {
                success: true,
                config: newConfig,
              },
            };
          } catch (error) {
            console.error('[API Tool] ❌ 设置模型配置失败:', error);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 设置模型配置失败: ${getErrorMessage(error)}`,
                },
              ],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
        },
      },
      
      // 设置图片生成工具配置
      {
        name: TOOL_NAMES.API_SET_IMAGE_GENERATION_CONFIG,
        label: '设置图片生成工具配置',
        description: '更新图片生成工具的配置。可以设置模型、API 地址、API Key',
        parameters: SetImageGenerationConfigSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            const params = args as Partial<{
              model: string;
              apiUrl: string;
              apiKey: string;
            }>;
            
            console.log('[API Tool] 💾 设置图片生成工具配置:', params);
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('设置配置操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 加载 SystemConfigStore
            const { SystemConfigStore } = await import('../database/system-config-store');
            const store = SystemConfigStore.getInstance();
            
            // 获取当前配置（如果没有则使用默认值）
            const currentConfig = store.getImageGenerationToolConfig();
            
            // 合并配置（优先级：用户输入 > 当前配置 > 默认配置）
            const newConfig = {
              model: params.model || currentConfig?.model || DEFAULT_IMAGE_GENERATION_CONFIG.model,
              apiUrl: params.apiUrl || currentConfig?.apiUrl || DEFAULT_IMAGE_GENERATION_CONFIG.apiUrl,
              apiKey: params.apiKey || currentConfig?.apiKey || DEFAULT_IMAGE_GENERATION_CONFIG.apiKey,
            };
            
            // 保存配置
            store.saveImageGenerationToolConfig(newConfig);
            
            // 构建结果消息
            let resultMessage = `✅ 图片生成工具配置已更新\n\n`;
            
            if (params.model) {
              resultMessage += `  • 模型: ${params.model}\n`;
            }
            if (params.apiUrl) {
              resultMessage += `  • API 地址: ${params.apiUrl}\n`;
            }
            if (params.apiKey) {
              resultMessage += `  • API Key: 已更新\n`;
            }
            
            resultMessage += `\n⚠️ 注意：配置已更新，下次创建新会话时生效`;
            
            return {
              content: [
                {
                  type: 'text',
                  text: resultMessage,
                },
              ],
              details: {
                success: true,
                config: newConfig,
              },
            };
          } catch (error) {
            console.error('[API Tool] ❌ 设置图片生成工具配置失败:', error);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 设置图片生成工具配置失败: ${getErrorMessage(error)}`,
                },
              ],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
        },
      },
      
      // 设置 Web 搜索工具配置
      {
        name: TOOL_NAMES.API_SET_WEB_SEARCH_CONFIG,
        label: '设置 Web 搜索工具配置',
        description: '更新 Web 搜索工具的配置。可以设置提供商、模型、API 地址、API Key',
        parameters: SetWebSearchConfigSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            const params = args as Partial<{
              provider: 'qwen' | 'gemini';
              model: string;
              apiUrl: string;
              apiKey: string;
            }>;
            
            console.log('[API Tool] 💾 设置 Web 搜索工具配置:', params);
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('设置配置操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 加载 SystemConfigStore
            const { SystemConfigStore } = await import('../database/system-config-store');
            const store = SystemConfigStore.getInstance();
            
            // 获取当前配置（如果没有则使用默认值）
            const currentConfig = store.getWebSearchToolConfig();
            
            // 合并配置（优先级：用户输入 > 当前配置 > 默认配置）
            const newConfig = {
              provider: params.provider || currentConfig?.provider || DEFAULT_WEB_SEARCH_CONFIG.provider,
              model: params.model || currentConfig?.model || DEFAULT_WEB_SEARCH_CONFIG.model,
              apiUrl: params.apiUrl || currentConfig?.apiUrl || DEFAULT_WEB_SEARCH_CONFIG.apiUrl,
              apiKey: params.apiKey || currentConfig?.apiKey || DEFAULT_WEB_SEARCH_CONFIG.apiKey,
            };
            
            // 保存配置
            store.saveWebSearchToolConfig(newConfig);
            
            // 构建结果消息
            let resultMessage = `✅ Web 搜索工具配置已更新\n\n`;
            
            if (params.provider) {
              resultMessage += `  • 提供商: ${params.provider}\n`;
            }
            if (params.model) {
              resultMessage += `  • 模型: ${params.model}\n`;
            }
            if (params.apiUrl) {
              resultMessage += `  • API 地址: ${params.apiUrl}\n`;
            }
            if (params.apiKey) {
              resultMessage += `  • API Key: 已更新\n`;
            }
            
            resultMessage += `\n⚠️ 注意：配置已更新，下次创建新会话时生效`;
            
            return {
              content: [
                {
                  type: 'text',
                  text: resultMessage,
                },
              ],
              details: {
                success: true,
                config: newConfig,
              },
            };
          } catch (error) {
            console.error('[API Tool] ❌ 设置 Web 搜索工具配置失败:', error);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 设置 Web 搜索工具配置失败: ${getErrorMessage(error)}`,
                },
              ],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
        },
      },
      
      // 获取名字配置
      {
        name: TOOL_NAMES.API_GET_NAME,
        label: '获取名字配置',
        description: '查询智能体名字和用户称呼',
        parameters: Type.Object({}),
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            console.log('[API Tool] 📋 获取名字配置');
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('获取配置操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 加载 SystemConfigStore
            const { SystemConfigStore } = await import('../database/system-config-store');
            const store = SystemConfigStore.getInstance();
            
            const nameConfig = store.getNameConfig();
            
            const resultMessage = `✅ 名字配置查询成功\n\n` +
              `👤 智能体名字: ${nameConfig.agentName}\n` +
              `👥 用户称呼: ${nameConfig.userName}`;
            
            return {
              content: [
                {
                  type: 'text',
                  text: resultMessage,
                },
              ],
              details: {
                success: true,
                nameConfig,
              },
            };
          } catch (error) {
            console.error('[API Tool] ❌ 获取名字配置失败:', error);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 获取名字配置失败: ${getErrorMessage(error)}`,
                },
              ],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
        },
      },
      
      // 设置名字配置
      {
        name: TOOL_NAMES.API_SET_NAME,
        label: '设置名字配置',
        description: '更新智能体名字和用户称呼。名字最多 10 个字符。修改后会立即生效并重新加载系统提示词',
        parameters: SetNameConfigSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            const params = args as Partial<{
              agentName: string;
              userName: string;
            }>;
            
            console.log('[API Tool] 💾 设置名字配置:', params);
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('设置配置操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 至少需要提供一个参数
            if (!params.agentName && !params.userName) {
              throw new Error('至少需要提供 agentName 或 userName 参数');
            }
            
            // 加载 SystemConfigStore
            const { SystemConfigStore } = await import('../database/system-config-store');
            const store = SystemConfigStore.getInstance();
            
            // 获取当前配置
            const currentConfig = store.getNameConfig();
            
            // 更新配置
            if (params.agentName) {
              store.saveAgentName(params.agentName);
            }
            
            if (params.userName) {
              store.saveUserName(params.userName);
            }
            
            // 获取更新后的配置
            const updatedConfig = store.getNameConfig();
            
            // 🔥 发送事件到前端
            const { BrowserWindow } = require('electron');
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (mainWindow) {
              const { sendToWindow } = await import('../../shared/utils/webcontents-utils');
              sendToWindow(mainWindow, 'name-config:updated', updatedConfig);
              console.log('[API Tool] 📤 已发送名字配置更新事件到前端:', updatedConfig);
            }
            
            // 🔥 重新加载系统提示词（确保下一次对话使用新名字）
            const { getGatewayInstance } = await import('../gateway');
            const gateway = getGatewayInstance();
            if (gateway) {
              console.log('[API Tool] 🔄 触发系统提示词重新加载...');
              await gateway.reloadSystemPrompts();
              console.log('[API Tool] ✅ 系统提示词已重新加载');
            } else {
              console.warn('[API Tool] ⚠️ Gateway 实例未设置，无法重新加载系统提示词');
            }
            
            // 构建结果消息
            let resultMessage = `✅ 名字配置已更新\n\n`;
            
            if (params.agentName) {
              resultMessage += `  • 智能体名字: ${currentConfig.agentName} → ${params.agentName}\n`;
            }
            if (params.userName) {
              resultMessage += `  • 用户称呼: ${currentConfig.userName} → ${params.userName}\n`;
            }
            
            resultMessage += `\n✨ 配置已立即生效`;
            
            return {
              content: [
                {
                  type: 'text',
                  text: resultMessage,
                },
              ],
              details: {
                success: true,
                oldConfig: currentConfig,
                newConfig: updatedConfig,
              },
            };
          } catch (error) {
            console.error('[API Tool] ❌ 设置名字配置失败:', error);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 设置名字配置失败: ${getErrorMessage(error)}`,
                },
              ],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
        },
      },
    ];
  },
};
