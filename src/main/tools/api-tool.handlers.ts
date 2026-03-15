/**
 * API 工具处理函数
 * 
 * 实现所有 API 工具的执行逻辑
 */

import { getErrorMessage } from '../../shared/utils/error-handler';
import { 
  DEFAULT_MODEL_CONFIG, 
  DEFAULT_IMAGE_GENERATION_CONFIG, 
  DEFAULT_WEB_SEARCH_CONFIG 
} from '../../shared/config/default-configs';
import * as formatters from './api-tool.formatters';

// ==================== 类型定义 ====================

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: any;
  isError?: boolean;
}

// ==================== 获取配置 ====================

/**
 * 获取系统配置
 */
export async function handleGetConfig(
  params: { configType: 'workspace' | 'model' | 'image-generation' | 'web-search' | 'all' },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
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
    
    // 🔥 添加 Connector 配置
    if (params.configType === 'all') {
      result.connectors = store.getAllConnectorConfigs();
    }
    
    // 🔥 检查浏览器工具（Chrome 安装情况）
    if (params.configType === 'all') {
      result.browserTool = await checkBrowserToolStatus();
    }
    
    // 🔥 检查邮件工具配置
    if (params.configType === 'all') {
      result.emailTool = await checkEmailToolConfig(result.workspace?.workspaceDir || '');
    }
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatGetConfigResult(result),
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
}

/**
 * 检查浏览器工具状态（Chrome 是否安装）
 */
async function checkBrowserToolStatus(): Promise<{
  chromeInstalled: boolean;
  chromePath?: string;
  error?: string;
}> {
  try {
    const { platform } = await import('os');
    const { existsSync } = await import('fs');
    
    const platformName = platform();
    let chromePath: string;
    
    // Chrome 默认安装路径
    if (platformName === 'darwin') {
      chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else if (platformName === 'win32') {
      // Windows 常见路径
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];
      chromePath = possiblePaths.find(p => existsSync(p)) || possiblePaths[0];
    } else {
      // Linux
      chromePath = '/usr/bin/google-chrome';
    }
    
    const installed = existsSync(chromePath);
    
    return {
      chromeInstalled: installed,
      chromePath: installed ? chromePath : undefined,
      error: installed ? undefined : 'Chrome 浏览器未安装或不在默认路径',
    };
  } catch (error) {
    return {
      chromeInstalled: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * 检查邮件工具配置状态
 */
async function checkEmailToolConfig(workspaceDir: string): Promise<{
  configured: boolean;
  configPath?: string;
  error?: string;
}> {
  try {
    const { existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const { safeJsonParse } = await import('../../shared/utils/json-utils');
    
    // 配置文件查找顺序：项目级别 > 用户级别
    const configPaths = [
      join(workspaceDir, '.deepbot', 'tools', 'email-tool', 'config.json'),
      join(homedir(), '.deepbot', 'tools', 'email-tool', 'config.json'),
    ];
    
    for (const configPath of configPaths) {
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf-8');
          const config = safeJsonParse<any>(content, {});
          
          // 验证必填字段
          if (!config.user || !config.password || !config.smtpServer) {
            return {
              configured: false,
              configPath,
              error: '配置文件存在但缺少必填字段（user、password、smtpServer）',
            };
          }
          
          return {
            configured: true,
            configPath,
          };
        } catch (error) {
          return {
            configured: false,
            configPath,
            error: `配置文件解析失败: ${getErrorMessage(error)}`,
          };
        }
      }
    }
    
    // 未找到配置文件
    return {
      configured: false,
      error: '未找到邮件工具配置文件',
    };
  } catch (error) {
    return {
      configured: false,
      error: getErrorMessage(error),
    };
  }
}

// ==================== 设置工作目录配置 ====================

/**
 * 设置工作目录配置
 */
export async function handleSetWorkspaceConfig(
  params: Partial<{
    workspaceDir: string;
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
      sessionDir: params.sessionDir || currentSettings.sessionDir, // 🔥 支持设置 sessionDir
    };
    
    // 保存配置
    store.saveWorkspaceSettings(newSettings);
    
    // 🔥 触发 Gateway 重新加载（与设置界面保持一致）
    const { getGatewayInstance } = await import('../gateway');
    const gateway = getGatewayInstance();
    
    if (gateway) {
      console.log('[API Tool] 🔄 工作目录配置已更新，重新加载 Gateway...');
      
      // 🔥 重新加载所有工作目录配置（包括 SessionManager 和 AgentRuntime）
      await gateway.reloadWorkspaceConfig();
      
      console.log('[API Tool] ✅ Gateway 工作目录配置已重新加载');
    }
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatSetWorkspaceConfigResult(params),
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
}

// ==================== 设置模型配置 ====================

/**
 * 设置模型配置
 */
export async function handleSetModelConfig(
  params: Partial<{
    providerType: 'qwen' | 'deepseek' | 'gemini' | 'custom';
    providerId: string;
    providerName: string;
    baseUrl: string;
    modelId: string;
    modelId2: string;
    modelName: string;
    apiType: string;
    apiKey: string;
    contextWindow: number;
  }>,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
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
      modelId2: params.modelId2 !== undefined ? params.modelId2 : currentConfig?.modelId2,
      modelName: params.modelName || currentConfig?.modelName || DEFAULT_MODEL_CONFIG.modelName,
      apiType: params.apiType || currentConfig?.apiType || DEFAULT_MODEL_CONFIG.apiType,
      apiKey: params.apiKey || currentConfig?.apiKey || DEFAULT_MODEL_CONFIG.apiKey,
      contextWindow: params.contextWindow || currentConfig?.contextWindow,
      lastFetched: params.contextWindow ? Date.now() : currentConfig?.lastFetched,
    };
    
    // 保存配置
    store.saveModelConfig(newConfig);
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatSetModelConfigResult(params),
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
}

// ==================== 设置图片生成工具配置 ====================

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
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatSetImageGenerationConfigResult(params),
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
}

// ==================== 设置 Web 搜索工具配置 ====================

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
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatSetWebSearchConfigResult(params),
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
}

// ==================== 获取名字配置 ====================

/**
 * 获取名字配置
 */
export async function handleGetNameConfig(
  signal?: AbortSignal
): Promise<ToolResult> {
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
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatGetNameConfigResult(nameConfig),
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
}

// ==================== 设置名字配置 ====================

/**
 * 设置名字配置
 * 
 * 根据 sessionId 判断：
 * - 主 Tab (default)：设置全局名字，影响所有未单独设置名字的 Tab
 * - 非主 Tab：只设置当前 Tab 的名字
 * 
 * 注意：用户称呼只能在主 Tab 设置
 */
export async function handleSetNameConfig(
  sessionId: string,
  params: Partial<{
    agentName: string;
    userName: string;
  }>,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    console.log('[API Tool] 💾 设置名字配置:', { sessionId, params });
    
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
    
    // 判断是否是主 Tab
    const isMainTab = sessionId === 'default';
    
    // 加载 SystemConfigStore
    const { SystemConfigStore } = await import('../database/system-config-store');
    const store = SystemConfigStore.getInstance();
    
    // 获取当前配置
    const currentConfig = store.getNameConfig();
    
    // 🔥 根据 Tab 类型处理名字设置
    if (isMainTab) {
      // 主 Tab：设置全局名字
      if (params.agentName) {
        store.saveAgentName(params.agentName);
      }
      
      if (params.userName) {
        store.saveUserName(params.userName);
      }
      
      // 获取更新后的配置
      const updatedConfig = store.getNameConfig();
      
      // 🔥 更新 Gateway 中所有相关 Tab 的 title
      const { getGatewayInstance } = await import('../gateway');
      const gateway = getGatewayInstance();
      if (gateway && params.agentName) {
        const tabs = (gateway as any).tabs as Map<string, any>;
        
        // 更新主 Tab 的 title
        const defaultTab = tabs.get('default');
        if (defaultTab) {
          defaultTab.title = params.agentName;
          console.log('[API Tool] 📝 已更新主 Tab title:', params.agentName);
        }
        
        // 🔥 遍历所有 Tab，更新没有独立名字的 Tab
        const updatedTabIds: string[] = ['default']; // 记录已更新的 Tab ID
        
        for (const [tabId, tab] of tabs.entries()) {
          if (tabId === 'default') continue; // 跳过主 Tab
          
          // 检查 Tab 是否有独立的 Agent 名字
          const tabConfig = store.getTabConfig(tabId);
          const hasIndependentName = tabConfig?.agentName != null;
          
          if (!hasIndependentName) {
            // 没有独立名字的 Tab，需要更新 title
            // 提取原 title 中的数字部分（例如 "沐沐 2" -> 2）
            const match = tab.title.match(/\s+(\d+)$/);
            const number = match ? match[1] : '';
            
            if (number) {
              tab.title = `${params.agentName} ${number}`;
              console.log(`[API Tool] 📝 已更新 Tab ${tabId} title: ${tab.title}`);
              updatedTabIds.push(tabId);
            }
          }
        }
        
        console.log(`[API Tool] ✅ 共更新了 ${updatedTabIds.length} 个 Tab 的 title`);
      }
      
      // 发送事件到前端（包含完整的名字配置）
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        const { sendToWindow } = await import('../../shared/utils/webcontents-utils');
        // 🔥 发送全局更新事件（不设置 tabId，表示所有继承的 Tab 都需要更新）
        sendToWindow(mainWindow, 'name-config:updated', {
          agentName: updatedConfig.agentName,
          userName: updatedConfig.userName,
          isGlobalUpdate: true, // 🔥 标记为全局更新
        });
        console.log('[API Tool] 📤 已发送名字配置更新事件到前端:', updatedConfig);
      }
      
      // 重新加载系统提示词（确保下一次对话使用新名字）
      if (gateway) {
        console.log('[API Tool] 🔄 触发系统提示词重新加载...');
        await gateway.reloadSystemPrompts();
        console.log('[API Tool] ✅ 系统提示词已重新加载');
      } else {
        console.warn('[API Tool] ⚠️ Gateway 实例未设置，无法重新加载系统提示词');
      }
      
      return {
        content: [
          {
            type: 'text',
            text: formatters.formatSetNameConfigResult(params, currentConfig, true),
          },
        ],
        details: {
          success: true,
          isGlobal: true,
          oldConfig: currentConfig,
          newConfig: updatedConfig,
        },
      };
    } else {
      // 非主 Tab：只设置当前 Tab 的名字
      
      // 用户称呼只能在主 Tab 设置
      if (params.userName) {
        throw new Error('用户称呼只能在主 Tab 设置');
      }
      
      if (params.agentName) {
        // 保存 Tab 独立的 Agent 名字
        store.updateTabAgentName(sessionId, params.agentName);
        
        // 🔥 更新 Tab 的 title
        const { getGatewayInstance } = await import('../gateway');
        const gateway = getGatewayInstance();
        if (gateway) {
          // 使用 Gateway 的内部方法访问 tabs
          const tabs = (gateway as any).tabs as Map<string, any>;
          const tab = tabs.get(sessionId);
          
          if (tab) {
            tab.title = params.agentName;
            console.log(`[API Tool] 📝 已更新 Tab title: ${sessionId} -> ${params.agentName}`);
            
            // 如果 Tab 是持久化的，更新数据库
            if (tab.isPersistent) {
              const { saveTabConfig } = await import('../database/tab-config');
              const tabType = tab.type === 'scheduled_task' ? 'task' : tab.type === 'connector' ? 'connector' : 'manual';
              
              saveTabConfig((store as any).db, {
                id: tab.id,
                title: tab.title,
                type: tabType,
                memoryFile: tab.memoryFile || null,
                agentName: params.agentName,
                isPersistent: tab.isPersistent,
                createdAt: tab.createdAt,
                lastActiveAt: tab.lastActiveAt,
              });
            }
          }
        }
        
        // 🔥 发送事件到前端（触发前端刷新显示）
        const { BrowserWindow } = require('electron');
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          const { sendToWindow } = await import('../../shared/utils/webcontents-utils');
          // 🔥 发送 Tab 名字更新事件，包含完整信息避免前端重复查询
          sendToWindow(mainWindow, 'name-config:updated', { 
            tabId: sessionId,
            agentName: params.agentName,
            userName: currentConfig.userName, // 🔥 包含用户名，避免前端查询
          });
          console.log('[API Tool] 📤 已发送 Tab 名字更新事件到前端:', { sessionId, agentName: params.agentName });
        }
        
        // 只重新加载当前 Tab 的系统提示词
        if (gateway) {
          console.log('[API Tool] 🔄 触发当前 Tab 系统提示词重新加载...');
          await gateway.reloadSessionSystemPrompt(sessionId);
          console.log('[API Tool] ✅ 当前 Tab 系统提示词已重新加载');
        } else{
          console.warn('[API Tool] ⚠️ Gateway 实例未设置，无法重新加载系统提示词');
        }
        
        return {
          content: [
            {
              type: 'text',
              text: formatters.formatSetNameConfigResult(params, currentConfig, false),
            },
          ],
          details: {
            success: true,
            isGlobal: false,
            tabId: sessionId,
            agentName: params.agentName,
          },
        };
      }
    }
    
    // 不应该到达这里
    throw new Error('未知错误');
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
}

// ==================== 获取 Session 文件路径 ====================

/**
 * 获取当前 Tab 的 Session 文件路径
 */
export async function handleGetSessionFilePath(
  sessionId: string,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    console.log('[API Tool] 📋 获取 Session 文件路径:', sessionId);
    
    // 检查是否被取消
    if (signal?.aborted) {
      const err = new Error('获取 Session 文件路径操作被取消');
      err.name = 'AbortError';
      throw err;
    }
    
    // 通过 Gateway 获取 SessionManager
    const { getGatewayInstance } = await import('../gateway');
    const gateway = getGatewayInstance();
    
    if (!gateway) {
      throw new Error('Gateway 实例未初始化');
    }
    
    // 获取 Session 文件路径
    const sessionManager = (gateway as any).sessionManager;
    if (!sessionManager) {
      throw new Error('SessionManager 未初始化');
    }
    
    const filePath = sessionManager.getSessionFilePath(sessionId);
    
    return {
      content: [
        {
          type: 'text',
          text: `✅ 当前 Tab 的 Session 文件路径：\n${filePath}`,
        },
      ],
      details: {
        success: true,
        sessionId,
        filePath,
      },
    };
  } catch (error) {
    console.error('[API Tool] ❌ 获取 Session 文件路径失败:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ 获取 Session 文件路径失败: ${getErrorMessage(error)}`,
        },
      ],
      details: {
        success: false,
        error: getErrorMessage(error),
      },
      isError: true,
    };
  }
}
// ==================== 获取日期时间 ====================

/**
 * 获取系统当前日期时间和时区信息
 */
export async function handleGetDateTime(
  args: { format?: string; timezone?: string },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    console.log('[API Tool] 🕐 获取日期时间:', args);
    
    // 检查是否被取消
    if (signal?.aborted) {
      const err = new Error('获取日期时间操作被取消');
      err.name = 'AbortError';
      throw err;
    }
    
    // 使用统一的日期时间工具
    const { getSystemTimezone, getDetailedDateTime, formatCurrentDate, formatCurrentTimeOnly } = await import('../../shared/utils/datetime-utils');
    
    const format = args.format || 'full';
    const timezone = args.timezone || getSystemTimezone();
    
    // 获取详细的日期时间信息
    const dateTimeInfo = getDetailedDateTime({ timezone });
    
    // 根据格式返回相应的时间字符串
    let formattedTime: string;
    let description: string;
    
    switch (format) {
      case 'date':
        formattedTime = dateTimeInfo.formatted.date;
        description = '仅日期';
        break;
        
      case 'time':
        formattedTime = dateTimeInfo.formatted.time;
        description = '仅时间';
        break;
        
      case 'datetime':
        formattedTime = dateTimeInfo.formatted.datetime;
        description = '日期时间';
        break;
        
      case 'iso':
        formattedTime = dateTimeInfo.iso;
        description = 'ISO 格式';
        break;
        
      case 'timestamp':
        formattedTime = dateTimeInfo.timestamp.toString();
        description = '时间戳（毫秒）';
        break;
        
      case 'full':
      default:
        formattedTime = `${dateTimeInfo.formatted.date} ${dateTimeInfo.formatted.time} (${timezone})`;
        description = '完整格式';
        break;
    }
    
    // 构建详细信息
    const details = {
      success: true,
      currentTime: formattedTime,
      format: format,
      timezone: timezone,
      systemTimezone: dateTimeInfo.timezone,
      timestamp: dateTimeInfo.timestamp,
      iso: dateTimeInfo.iso,
      offsetString: dateTimeInfo.offsetString,
      year: dateTimeInfo.year,
      month: dateTimeInfo.month,
      day: dateTimeInfo.day,
      hour: dateTimeInfo.hour,
      minute: dateTimeInfo.minute,
      second: dateTimeInfo.second,
      weekday: dateTimeInfo.weekday,
    };
    
    // 构建响应消息
    let message = `🕐 当前时间（${description}）：${formattedTime}`;
    
    if (format === 'full') {
      message += `\n\n📊 详细信息：`;
      message += `\n• 系统时区：${dateTimeInfo.timezone}`;
      message += `\n• 时区偏移：UTC${dateTimeInfo.offsetString}`;
      message += `\n• 时间戳：${dateTimeInfo.timestamp}`;
      message += `\n• ISO 格式：${dateTimeInfo.iso}`;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      details,
    };
  } catch (error) {
    console.error('[API Tool] ❌ 获取日期时间失败:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ 获取日期时间失败: ${getErrorMessage(error)}`,
        },
      ],
      details: {
        success: false,
        error: getErrorMessage(error),
      },
      isError: true,
    };
  }
}


// ==================== 飞书连接器配置 ====================

/**
 * 设置飞书连接器配置
 */
export async function handleSetFeishuConnectorConfig(
  params: {
    appId: string;
    appSecret: string;
    verificationToken?: string;
    encryptKey?: string;
    botName?: string;
    dmPolicy?: 'open' | 'pairing' | 'allowlist';
    groupPolicy?: 'open' | 'allowlist' | 'disabled';
    requireMention?: boolean;
    allowFrom?: string[];
    enabled?: boolean;
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    console.log('[API Tool] 💾 设置飞书连接器配置');
    
    // 检查是否被取消
    if (signal?.aborted) {
      const err = new Error('设置配置操作被取消');
      err.name = 'AbortError';
      throw err;
    }
    
    // 加载 SystemConfigStore
    const { SystemConfigStore } = await import('../database/system-config-store');
    const store = SystemConfigStore.getInstance();
    
    // 构建配置对象
    const config = {
      appId: params.appId,
      appSecret: params.appSecret,
      verificationToken: params.verificationToken || '',
      encryptKey: params.encryptKey || '',
      botName: params.botName || 'DeepBot',
      dmPolicy: params.dmPolicy || 'pairing',
      groupPolicy: params.groupPolicy || 'open',
      requireMention: params.requireMention !== undefined ? params.requireMention : true,
      allowFrom: params.allowFrom || [],
    };
    
    const enabled = params.enabled !== undefined ? params.enabled : false;
    
    // 保存配置
    store.saveConnectorConfig('feishu', '飞书', config, enabled);
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatSetFeishuConnectorConfigResult(params, enabled),
        },
      ],
      details: {
        success: true,
        config,
        enabled,
      },
    };
  } catch (error) {
    console.error('[API Tool] ❌ 设置飞书连接器配置失败:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ 设置飞书连接器配置失败: ${getErrorMessage(error)}`,
        },
      ],
      details: {
        success: false,
        error: getErrorMessage(error),
      },
      isError: true,
    };
  }
}


/**
 * 启用/禁用连接器
 */
export async function handleSetConnectorEnabled(
  params: {
    connectorId: 'feishu';
    enabled: boolean;
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    console.log('[API Tool] 🔄 设置连接器状态:', params.connectorId, params.enabled ? '启用' : '禁用');
    
    // 检查是否被取消
    if (signal?.aborted) {
      const err = new Error('设置连接器状态操作被取消');
      err.name = 'AbortError';
      throw err;
    }
    
    // 加载 SystemConfigStore
    const { SystemConfigStore } = await import('../database/system-config-store');
    const store = SystemConfigStore.getInstance();
    
    // 检查连接器是否已配置
    const connectorConfig = store.getConnectorConfig(params.connectorId);
    if (!connectorConfig) {
      throw new Error(`连接器 ${params.connectorId} 尚未配置，请先配置后再启用`);
    }
    
    // 更新启用状态
    store.setConnectorEnabled(params.connectorId, params.enabled);
    
    // 🔥 获取 Gateway 实例（统一处理，避免重复）
    const { getGatewayInstance } = await import('../gateway');
    const gateway = getGatewayInstance();
    
    if (!gateway) {
      console.warn('[API Tool] ⚠️ Gateway 未初始化，连接器将在下次启动时生效');
    } else {
      try {
        const connectorManager = gateway.getConnectorManager();
        
        if (params.enabled) {
          console.log('[API Tool] 🚀 启动连接器:', params.connectorId);
          await connectorManager.startConnector(params.connectorId as any);
          console.log('[API Tool] ✅ 连接器已启动:', params.connectorId);
        } else {
          console.log('[API Tool] 🛑 停止连接器:', params.connectorId);
          await connectorManager.stopConnector(params.connectorId as any);
          console.log('[API Tool] ✅ 连接器已停止:', params.connectorId);
        }
      } catch (operationError) {
        console.error(`[API Tool] ❌ ${params.enabled ? '启动' : '停止'}连接器失败:`, operationError);
        if (params.enabled) {
          console.warn('[API Tool] ⚠️ 连接器状态已更新，但启动失败。请重启应用或手动启动连接器');
        }
      }
    }
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatSetConnectorEnabledResult(params),
        },
      ],
      details: {
        success: true,
        connectorId: params.connectorId,
        enabled: params.enabled,
      },
    };
  } catch (error) {
    console.error('[API Tool] ❌ 设置连接器状态失败:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ 设置连接器状态失败: ${getErrorMessage(error)}`,
        },
      ],
      details: {
        success: false,
        error: getErrorMessage(error),
      },
      isError: true,
    };
  }
}


// ==================== 配对管理 ====================

/**
 * 获取配对记录
 */
export async function handleGetPairingRecords(
  params: {
    connectorId?: 'feishu';
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    console.log('[API Tool] 📋 获取配对记录:', params.connectorId || '所有连接器');
    
    // 检查是否被取消
    if (signal?.aborted) {
      const err = new Error('获取配对记录操作被取消');
      err.name = 'AbortError';
      throw err;
    }
    
    // 加载 SystemConfigStore
    const { SystemConfigStore } = await import('../database/system-config-store');
    const store = SystemConfigStore.getInstance();
    
    // 获取配对记录
    const records = store.getAllPairingRecords(params.connectorId);
    
    // 添加 connectorName 并转换时间格式
    const connectorNames: Record<string, string> = {
      feishu: '飞书',
      wechat: '微信',
    };
    
    const formattedRecords = records.map(record => ({
      connectorId: record.connectorId,
      connectorName: connectorNames[record.connectorId] || record.connectorId,
      userId: record.userId,
      pairingCode: record.pairingCode,
      approved: record.approved,
      createdAt: new Date(record.createdAt).toISOString(),
      approvedAt: record.approvedAt ? new Date(record.approvedAt).toISOString() : undefined,
    }));
    
    // 统计待审核数量
    const pendingCount = formattedRecords.filter(r => !r.approved).length;
    const approvedCount = formattedRecords.filter(r => r.approved).length;
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatGetPairingRecordsResult(formattedRecords, pendingCount, approvedCount),
        },
      ],
      details: {
        success: true,
        records: formattedRecords,
        pendingCount,
        approvedCount,
      },
    };
  } catch (error) {
    console.error('[API Tool] ❌ 获取配对记录失败:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ 获取配对记录失败: ${getErrorMessage(error)}`,
        },
      ],
      details: {
        success: false,
        error: getErrorMessage(error),
      },
      isError: true,
    };
  }
}

/**
 * 审核配对请求
 */
export async function handleApprovePairing(
  params: {
    pairingCode: string;
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    console.log('[API Tool] ✅ 审核配对请求:', params.pairingCode);
    
    // 检查是否被取消
    if (signal?.aborted) {
      const err = new Error('审核配对操作被取消');
      err.name = 'AbortError';
      throw err;
    }
    
    // 加载 SystemConfigStore
    const { SystemConfigStore } = await import('../database/system-config-store');
    const store = SystemConfigStore.getInstance();
    
    // 检查配对码是否存在
    const record = store.getPairingRecordByCode(params.pairingCode);
    if (!record) {
      throw new Error(`配对码 ${params.pairingCode} 不存在或已过期`);
    }
    
    if (record.approved) {
      throw new Error(`配对码 ${params.pairingCode} 已经审核通过，无需重复审核`);
    }
    
    // 批准配对
    store.approvePairingRecord(params.pairingCode);
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatApprovePairingResult(params.pairingCode, record),
        },
      ],
      details: {
        success: true,
        pairingCode: params.pairingCode,
        connectorId: record.connectorId,
        userId: record.userId,
      },
    };
  } catch (error) {
    console.error('[API Tool] ❌ 审核配对失败:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ 审核配对失败: ${getErrorMessage(error)}`,
        },
      ],
      details: {
        success: false,
        error: getErrorMessage(error),
      },
      isError: true,
    };
  }
}

/**
 * 拒绝配对请求
 */
export async function handleRejectPairing(
  params: {
    connectorId: 'feishu';
    userId: string;
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    console.log('[API Tool] ❌ 拒绝配对请求:', params.connectorId, params.userId);
    
    // 检查是否被取消
    if (signal?.aborted) {
      const err = new Error('拒绝配对操作被取消');
      err.name = 'AbortError';
      throw err;
    }
    
    // 加载 SystemConfigStore
    const { SystemConfigStore } = await import('../database/system-config-store');
    const store = SystemConfigStore.getInstance();
    
    // 检查配对记录是否存在
    const record = store.getPairingRecordByUser(params.connectorId, params.userId);
    if (!record) {
      throw new Error(`用户 ${params.userId} 在 ${params.connectorId} 连接器中没有配对记录`);
    }
    
    // 删除配对记录（拒绝）
    store.deletePairingRecord(params.connectorId, params.userId);
    
    return {
      content: [
        {
          type: 'text',
          text: formatters.formatRejectPairingResult(params.connectorId, params.userId),
        },
      ],
      details: {
        success: true,
        connectorId: params.connectorId,
        userId: params.userId,
      },
    };
  } catch (error) {
    console.error('[API Tool] ❌ 拒绝配对失败:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ 拒绝配对失败: ${getErrorMessage(error)}`,
        },
      ],
      details: {
        success: false,
        error: getErrorMessage(error),
      },
      isError: true,
    };
  }
}
