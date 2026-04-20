/**
 * 配置管理相关的处理函数
 * 处理工作空间、模型、图片生成、Web搜索等配置的获取和设置
 */

import { 
  DEFAULT_MODEL_CONFIG, 
  DEFAULT_IMAGE_GENERATION_CONFIG, 
  DEFAULT_WEB_SEARCH_CONFIG 
} from '../../../shared/config/default-configs';
import * as formatters from '../api-tool.formatters';
import { checkBrowserToolStatus } from './tool-check-handlers';
import {
  ToolResult,
  checkAbortSignal,
  getSystemConfigStore,
  createSuccessResponse,
  createErrorResponse,
  getGatewayInstance,
} from './handler-utils';
import { createLogger } from '../../../shared/utils/logger';

// ==================== 日志记录器 ====================

const logger = createLogger('Config-Handlers');

// ==================== 获取配置 ====================

/**
 * 获取系统配置
 */
export async function handleGetConfig(
  params: { configType: 'workspace' | 'model' | 'image-generation' | 'web-search' | 'all' },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('获取配置:', params.configType);
    
    checkAbortSignal(signal, '获取配置');
    
    const store = await getSystemConfigStore();
    
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
    
    // 查询工具禁用状态
    const disabledTools = store.getDisabledTools();
    result.disabledTools = disabledTools;
    
    // 添加 Connector 配置
    if (params.configType === 'all') {
      result.connectors = store.getAllConnectorConfigs();
    }
    
    // 检查浏览器工具（Chrome 安装情况）
    if (params.configType === 'all') {
      result.browserTool = await checkBrowserToolStatus();
    }
    
    return createSuccessResponse(
      formatters.formatGetConfigResult(result),
      { config: result }
    );
  } catch (error) {
    return createErrorResponse(error, '获取配置');
  }
}

/**
 * 设置工作目录配置
 */
export async function handleSetWorkspaceConfig(
  params: Partial<{
    workspaceDir: string;
    workspaceDirs: string[];
    scriptDir: string;
    skillDirs: string[];
    defaultSkillDir: string;
    imageDir: string;
    memoryDir: string;
    sessionDir: string;
  }>,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('设置工作目录配置:', params);
    
    checkAbortSignal(signal, '设置配置');
    
    const store = await getSystemConfigStore();
    
    // 获取当前配置
    const currentSettings = store.getWorkspaceSettings();
    
    // 合并配置
    const newSettings = {
      workspaceDir: params.workspaceDir || currentSettings.workspaceDir,
      workspaceDirs: params.workspaceDirs || currentSettings.workspaceDirs,
      scriptDir: params.scriptDir || currentSettings.scriptDir,
      skillDirs: params.skillDirs || currentSettings.skillDirs,
      defaultSkillDir: params.defaultSkillDir || currentSettings.defaultSkillDir,
      imageDir: params.imageDir || currentSettings.imageDir,
      memoryDir: params.memoryDir || currentSettings.memoryDir,
      sessionDir: params.sessionDir || currentSettings.sessionDir,
    };
    
    // 保存配置
    store.saveWorkspaceSettings(newSettings);
    
    // 触发 Gateway 重新加载
    const gateway = await getGatewayInstance();
    
    if (gateway) {
      logger.info('工作目录配置已更新，重新加载 Gateway...');
      await gateway.reloadWorkspaceConfig();
      logger.info('Gateway 工作目录配置已重新加载');
    }
    
    return createSuccessResponse(
      formatters.formatSetWorkspaceConfigResult(params),
      { settings: newSettings }
    );
  } catch (error) {
    return createErrorResponse(error, '设置工作目录配置');
  }
}

/**
 * 设置模型配置
 */
export async function handleSetModelConfig(
  params: Partial<{
    providerType: 'qwen' | 'deepseek' | 'gemini' | 'minimax' | 'custom';
    providerId: string;
    providerName: string;
    baseUrl: string;
    modelId: string;
    modelId2: string;
    apiType: string;
    apiKey: string;
    contextWindow: number;
  }>,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('设置模型配置:', params);
    
    checkAbortSignal(signal, '设置配置');
    
    const store = await getSystemConfigStore();
    
    // 获取当前配置（如果没有则使用默认值）
    const currentConfig = store.getModelConfig();
    
    // 合并配置（优先级：用户输入 > 当前配置 > 默认配置）
    const newConfig = {
      providerType: params.providerType || currentConfig?.providerType || DEFAULT_MODEL_CONFIG.providerType,
      providerId: params.providerId || currentConfig?.providerId || DEFAULT_MODEL_CONFIG.providerId,
      providerName: params.providerName || currentConfig?.providerName || DEFAULT_MODEL_CONFIG.providerName,
      baseUrl: params.baseUrl || currentConfig?.baseUrl || DEFAULT_MODEL_CONFIG.baseUrl,
      modelId: params.modelId !== undefined ? params.modelId : currentConfig?.modelId || DEFAULT_MODEL_CONFIG.modelId,
      modelId2: params.modelId2 !== undefined ? params.modelId2 : currentConfig?.modelId2,
      apiType: params.apiType || currentConfig?.apiType || DEFAULT_MODEL_CONFIG.apiType,
      apiKey: params.apiKey || currentConfig?.apiKey || DEFAULT_MODEL_CONFIG.apiKey,
      contextWindow: params.contextWindow || currentConfig?.contextWindow,
      lastFetched: params.contextWindow ? Date.now() : currentConfig?.lastFetched,
    };
    
    // 保存配置
    store.saveModelConfig(newConfig);
    
    // 🔥 触发 Gateway 重新加载模型配置
    const gateway = await getGatewayInstance();
    
    if (gateway) {
      logger.info('模型配置已更新，重新加载 Gateway...');
      await gateway.reloadModelConfig();
      logger.info('Gateway 模型配置已重新加载');
    }
    
    return createSuccessResponse(
      formatters.formatSetModelConfigResult(params),
      { config: newConfig }
    );
  } catch (error) {
    return createErrorResponse(error, '设置模型配置');
  }
}

/**
 * 设置图片生成工具配置
 */
export async function handleSetImageGenerationConfig(
  params: Partial<{
    model: string;
    apiUrl: string;
    apiKey: string;
  }>,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('设置图片生成工具配置:', params);
    
    checkAbortSignal(signal, '设置配置');
    
    const store = await getSystemConfigStore();
    
    // 获取当前配置（如果没有则使用默认值）
    const currentConfig = store.getImageGenerationToolConfig();
    
    // 合并配置（优先级：用户输入 > 当前配置 > 默认配置）
    const newConfig = {
      model: params.model !== undefined ? params.model : currentConfig?.model || DEFAULT_IMAGE_GENERATION_CONFIG.model,
      apiUrl: params.apiUrl !== undefined ? params.apiUrl : currentConfig?.apiUrl || DEFAULT_IMAGE_GENERATION_CONFIG.apiUrl,
      apiKey: params.apiKey !== undefined ? params.apiKey : currentConfig?.apiKey || DEFAULT_IMAGE_GENERATION_CONFIG.apiKey,
    };
    
    // 保存配置
    store.saveImageGenerationToolConfig(newConfig);
    
    return createSuccessResponse(
      formatters.formatSetImageGenerationConfigResult(params),
      { config: newConfig }
    );
  } catch (error) {
    return createErrorResponse(error, '设置图片生成工具配置');
  }
}

/**
 * 设置工具启用/禁用状态
 * 
 * 保存配置后标记延迟重置，等当前 Agent 执行完成后再 reset runtime，
 * 避免中断正在进行的任务。
 */
export async function handleSetToolEnabled(
  params: { toolName: string; enabled: boolean },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('设置工具启用状态:', params);

    checkAbortSignal(signal, '设置工具状态');

    const store = await getSystemConfigStore();
    store.setToolDisabled(params.toolName, !params.enabled);

    const statusText = params.enabled ? '启用' : '禁用';
    const hint = params.enabled
      ? `✅ 工具 "${params.toolName}" 已启用。配置将在本次对话结束后生效。`
      : `✅ 工具 "${params.toolName}" 已禁用，后续请优先使用已安装的 Skill 替代该功能。配置将在本次对话结束后生效。`;

    // 标记延迟重置，等本次 Agent 执行完成后再重载工具列表
    const gateway = await getGatewayInstance();
    if (gateway) {
      gateway.markPendingRuntimeReset();
    }

    return createSuccessResponse(
      hint,
      { toolName: params.toolName, enabled: params.enabled }
    );
  } catch (error) {
    return createErrorResponse(error, '设置工具状态');
  }
}

/**
 * 设置 Web 搜索工具配置
 */
export async function handleSetWebSearchConfig(
  params: Partial<{
    provider: 'qwen' | 'gemini';
    model: string;
    apiUrl: string;
    apiKey: string;
  }>,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('设置 Web 搜索工具配置:', params);
    
    checkAbortSignal(signal, '设置配置');
    
    const store = await getSystemConfigStore();
    
    // 获取当前配置（如果没有则使用默认值）
    const currentConfig = store.getWebSearchToolConfig();
    
    // 合并配置（优先级：用户输入 > 当前配置 > 默认配置）
    const newConfig = {
      provider: params.provider !== undefined ? params.provider : currentConfig?.provider || DEFAULT_WEB_SEARCH_CONFIG.provider,
      model: params.model !== undefined ? params.model : currentConfig?.model || DEFAULT_WEB_SEARCH_CONFIG.model,
      apiUrl: params.apiUrl !== undefined ? params.apiUrl : currentConfig?.apiUrl || DEFAULT_WEB_SEARCH_CONFIG.apiUrl,
      apiKey: params.apiKey !== undefined ? params.apiKey : currentConfig?.apiKey || DEFAULT_WEB_SEARCH_CONFIG.apiKey,
    };
    
    // 保存配置
    store.saveWebSearchToolConfig(newConfig);
    
    return createSuccessResponse(
      formatters.formatSetWebSearchConfigResult(params),
      { config: newConfig }
    );
  } catch (error) {
    return createErrorResponse(error, '设置 Web 搜索工具配置');
  }
}