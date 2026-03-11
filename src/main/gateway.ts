/**
 * Gateway - 会话管理和消息路由
 * 
 * 职责：
 * - 管理会话生命周期
 * - 路由消息到 Agent Runtime
 * - 处理流式响应
 * - 管理多个 AgentRuntime 实例（每个 Tab 一个）
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../types/ipc';
import { AgentRuntime } from './agent-runtime/index';
import type { AgentTab } from '../types/agent-tab';
import type { Message } from '../types/message';
import { getErrorMessage } from '../shared/utils/error-handler';
import { sleep, waitUntil } from '../shared/utils/async-utils';
import { generateMessageId, generateUserMessageId, generateTabId, generateExecutionId } from '../shared/utils/id-generator';
import { sendToWindow } from '../shared/utils/webcontents-utils';
import { setGatewayInstance } from './tools/scheduled-task-tool';
import type { GatewayMessage } from '../types/connector';
import { ConnectorManager } from './connectors/connector-manager';
import { FeishuConnector } from './connectors/feishu/feishu-connector';
import { SessionManager } from './session/session-manager';

export class Gateway {
  private mainWindow: BrowserWindow | null = null;
  private agentRuntimes: Map<string, AgentRuntime> = new Map(); // 每个 Tab 一个 Runtime
  private defaultSessionId: string = 'default'; // 默认会话 ID
  
  // Tab 管理
  private tabs: Map<string, AgentTab> = new Map(); // Tab ID -> Tab 数据
  private tabCounter: number = 1; // Tab 计数器
  private tabIdCounter: number = 0; // Tab ID 计数器（确保唯一性）
  private readonly MAX_TABS = 10; // 最多 10 个 Tab
  private taskTabMap: Map<string, string> = new Map(); // 任务 ID -> Tab ID 映射
  
  // 消息队列（每个会话一个队列）
  private messageQueues: Map<string, Array<{ content: string; displayContent?: string }>> = new Map();
  private processingQueues: Set<string> = new Set(); // 正在处理队列的会话
  
  // 连接器管理
  private connectorManager: ConnectorManager;
  
  // Session 管理
  private sessionManager: SessionManager | null = null;

  constructor() {
    // 🔥 初始化 SessionManager（异步）
    this.initializeSessionManager().catch(error => {
      console.error('[Gateway] ❌ 初始化 SessionManager 失败:', error);
    });
    
    // 初始化 ConnectorManager
    this.connectorManager = new ConnectorManager(this);
    
    // 注册飞书连接器
    const feishuConnector = new FeishuConnector(this.connectorManager);
    this.connectorManager.registerConnector(feishuConnector);
    console.log('[Gateway] ✅ 飞书连接器已注册');
    
    // 设置 Gateway 实例供 scheduled-task-tool 使用
    setGatewayInstance(this);
    
    // 🔥 设置 Gateway 实例供 memory-tool 使用
    const { setGatewayForMemoryTool } = require('./tools/memory-tool');
    setGatewayForMemoryTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Memory Tool');
    
    // 🔥 设置 Gateway 实例供 connector-tool 使用
    const { setGatewayForConnectorTool } = require('./tools/connector-tool');
    setGatewayForConnectorTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Connector Tool');
    
    // 🔥 设置 Gateway 实例供 cross-tab-call-tool 使用
    const { setGatewayForCrossTabCallTool } = require('./tools/cross-tab-call-tool');
    setGatewayForCrossTabCallTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Cross Tab Call Tool');
    
    // 创建默认 Tab
    this.createDefaultTab();
    
    // 🔥 异步加载持久化的 Tab（不阻塞初始化）
    this.loadPersistentTabs().catch(error => {
      console.error('[Gateway] ❌ 加载持久化 Tab 失败:', error);
    });
    
    // 🔥 异步启动已启用的连接器（不阻塞初始化）
    this.autoStartConnectors().catch(error => {
      console.error('[Gateway] ❌ 自动启动连接器失败:', error);
    });
    
    // AI 连接将在首次调用时自动建立和缓存
  }
  
  /**
   * 加载 Tab 历史消息
   * 
   * @param tabId - Tab ID
   */
  private async loadTabHistory(tabId: string): Promise<void> {
    if (!this.sessionManager) {
      console.warn('[Gateway] SessionManager 未初始化，跳过加载历史消息');
      return;
    }
    
    try {
      // 加载 UI 显示消息（最近 100 轮）
      const messages = await this.sessionManager.loadUIMessages(tabId);
      
      if (messages.length === 0) {
        console.log(`[Gateway] Tab ${tabId} 没有历史消息`);
        return;
      }
      
      console.log(`[Gateway] 📖 已加载 ${messages.length} 条历史消息: ${tabId}`);
      
      // 更新 Tab 的消息列表
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.messages = messages;
      }
      
      // 通知前端加载历史消息
      sendToWindow(this.mainWindow, 'tab:history-loaded', {
        tabId,
        messages,
      });
    } catch (error) {
      console.error(`[Gateway] ❌ 加载 Tab 历史消息失败: ${tabId}`, getErrorMessage(error));
    }
  }
  
  /**
   * 初始化 SessionManager
   */
  private async initializeSessionManager(): Promise<void> {
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      this.sessionManager = new SessionManager(settings.sessionDir);
      await this.sessionManager.initialize();
      
      console.log('[Gateway] ✅ SessionManager 已初始化');
    } catch (error) {
      console.error('[Gateway] ❌ 初始化 SessionManager 失败:', getErrorMessage(error));
    }
  }
  
  /**
   * 加载持久化的 Tab
   */
  private async loadPersistentTabs(): Promise<void> {
    try {
      console.log('[Gateway] 🔄 加载持久化的 Tab...');
      
      // 延迟 500ms 后加载（避免阻塞启动）
      await sleep(500);
      
      const { SystemConfigStore } = await import('./database/system-config-store');
      const { getAllPersistentTabs } = await import('./database/tab-config');
      const store = SystemConfigStore.getInstance();
      
      // 获取所有持久化的 Tab
      const persistentTabs = getAllPersistentTabs(store['db']);
      
      if (persistentTabs.length === 0) {
        console.log('[Gateway] ℹ️ 没有持久化的 Tab');
        return;
      }
      
      console.log(`[Gateway] 📋 找到 ${persistentTabs.length} 个持久化的 Tab`);
      
      // 恢复每个 Tab
      for (const tabConfig of persistentTabs) {
        try {
          // 生成 Tab ID（使用保存的 ID）
          const tabId = tabConfig.id;
          
          // 🔥 根据 Tab 类型确定 type 字段
          let tabType: 'normal' | 'connector' | 'scheduled_task' = 'normal';
          if (tabConfig.type === 'connector') {
            tabType = 'connector';
          } else if (tabConfig.type === 'task') {
            tabType = 'scheduled_task';
          }
          
          // 🔥 生成 conversationKey（用于连接器 Tab）
          const conversationKey = tabConfig.connectorId && tabConfig.conversationId
            ? `${tabConfig.connectorId}_${tabConfig.conversationId}`
            : undefined;
          
          // 创建 Tab（不持久化，因为已经在数据库中）
          const tab: AgentTab = {
            id: tabId,
            title: tabConfig.title,
            type: tabType,
            messages: [],
            isLoading: false,
            createdAt: tabConfig.createdAt,
            lastActiveAt: tabConfig.lastActiveAt,
            memoryFile: tabConfig.memoryFile,
            agentName: tabConfig.agentName,
            isPersistent: true,
            conversationKey,                    // 🔥 恢复 conversationKey
            connectorId: tabConfig.connectorId, // 🔥 恢复 connectorId
            conversationId: tabConfig.conversationId, // 🔥 恢复 conversationId
            taskId: tabConfig.taskId,           // 🔥 恢复 taskId
          };
          
          this.tabs.set(tabId, tab);
          console.log(`[Gateway] ✅ 已恢复 Tab: ${tabId} (${tabConfig.title}, type: ${tabType})`);
          
          // 🔥 加载历史消息（异步，不阻塞）
          if (this.sessionManager) {
            this.loadTabHistory(tabId).catch(error => {
              console.error(`[Gateway] ❌ 加载 Tab 历史消息失败: ${tabId}`, error);
            });
          }
          
          // 通知前端 Tab 已创建
          this.notifyTabCreated(tab);
        } catch (error) {
          console.error(`[Gateway] ❌ 恢复 Tab 失败: ${tabConfig.id}`, error);
        }
      }
      
      console.log('[Gateway] ✅ 持久化 Tab 加载完成');
    } catch (error) {
      console.error('[Gateway] ❌ 加载持久化 Tab 失败:', error);
    }
  }
  
  // 预热功能已移除，AI 连接将在首次调用时自动建立和缓存
  
  /**
   * 自动启动已启用的连接器
   */
  private async autoStartConnectors(): Promise<void> {
    console.log('[Gateway] 🔄 自动启动已启用的连接器...');
    
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      
      // 获取所有连接器
      const allConnectors = this.connectorManager.getAllConnectors();
      
      for (const connector of allConnectors) {
        try {
          // 检查配置
          const configData = store.getConnectorConfig(connector.id);
          
          if (configData && configData.enabled) {
            console.log(`[Gateway] 🚀 启动: ${connector.id}`);
            await this.connectorManager.startConnector(connector.id as any);
          }
        } catch (error) {
          console.error(`[Gateway] ❌ 启动连接器失败: ${connector.id}`, error);
          // 继续启动其他连接器
        }
      }
      
      console.log('[Gateway] ✅ 连接器启动完成');
    } catch (error) {
      console.error('[Gateway] ❌ 自动启动连接器过程失败:', error);
    }
  }

  /**
   * 重新加载模型配置
   * 
   * 当用户修改模型配置时调用，销毁所有现有的 AgentRuntime（但保留聊天记录）
   */
  async reloadModelConfig(): Promise<void> {
    console.log('[Gateway] 🔄 重新加载模型配置...');
    
    // 清除 AI 连接缓存
    const { clearAICache } = await import('./utils/ai-client');
    clearAICache();
    
    // 销毁所有现有的 AgentRuntime（下次使用时会用新模型配置重新创建）
    this.destroyAllRuntimes();
    
    console.log('[Gateway] ✅ 模型配置已重新加载');
    
    // AI 连接缓存已清除，将在下次调用时重新建立
    
    // 🔥 检查是否需要发送欢迎消息（首次配置模型的场景）
    this.checkAndSendWelcomeMessage().catch(error => {
      console.error('[Gateway] ❌ 检查欢迎消息失败:', getErrorMessage(error));
    });
  }

  /**
   * 重新加载工作目录配置
   * 
   * 当用户修改工作目录配置时调用，重新初始化 SessionManager 和 AgentRuntime
   */
  async reloadWorkspaceConfig(): Promise<void> {
    console.log('[Gateway] 🔄 重新加载工作目录配置...');
    
    // 🔥 重新加载 SessionManager
    await this.reloadSessionManager();
    
    // 🔥 销毁所有现有的 AgentRuntime（但不清空前端聊天记录）
    this.destroyAllRuntimes();
    
    console.log('[Gateway] ✅ 工作目录配置已重新加载，AgentRuntime 已重置');
  }

  /**
   * 重新加载 SessionManager
   * 
   * 当用户修改会话目录配置时调用，重新初始化 SessionManager
   */
  async reloadSessionManager(): Promise<void> {
    console.log('[Gateway] 🔄 重新加载 SessionManager...');
    
    try {
      // 重新初始化 SessionManager
      await this.initializeSessionManager();
      
      console.log('[Gateway] ✅ SessionManager 已重新加载');
    } catch (error) {
      console.error('[Gateway] ❌ 重新加载 SessionManager 失败:', getErrorMessage(error));
      throw error;
    }
  }

  /**
   * 重新加载系统提示词
   * 
   * 当记忆更新后调用，重新加载所有活跃会话的系统提示词
   */
  async reloadSystemPrompts(): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('[Gateway] 🔄 重新加载所有会话的系统提示词...');
    console.log('[Gateway] 活跃会话数量:', this.agentRuntimes.size);
    console.log('='.repeat(80));
    
    const reloadPromises: Promise<void>[] = [];
    
    for (const [sessionId, runtime] of this.agentRuntimes.entries()) {
      console.log(`[Gateway] 📝 重新加载会话: ${sessionId}`);
      reloadPromises.push(runtime.reloadSystemPrompt());
    }
    
    await Promise.all(reloadPromises);
    
    console.log('='.repeat(80));
    console.log('[Gateway] ✅ 所有会话的系统提示词已重新加载');
    console.log('='.repeat(80) + '\n');
  }
  /**
   * 重新加载单个会话的系统提示词
   * @param sessionId 会话 ID
   */
  async reloadSessionSystemPrompt(sessionId: string): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log(`[Gateway] 🔄 重新加载会话 ${sessionId} 的系统提示词...`);
    console.log('='.repeat(80));

    const runtime = this.agentRuntimes.get(sessionId);

    if (!runtime) {
      console.warn(`[Gateway] ⚠️ 会话 ${sessionId} 不存在，无法重新加载系统提示词`);
      return;
    }

    await runtime.reloadSystemPrompt();

    console.log('='.repeat(80));
    console.log(`[Gateway] ✅ 会话 ${sessionId} 的系统提示词已重新加载`);
    console.log('='.repeat(80) + '\n');
  }


  /**
   * 设置主窗口
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * 检查会话是否正在执行
   * 
   * @param sessionId - 会话 ID
   * @returns 如果会话正在执行返回 true，否则返回 false
   */
  isSessionExecuting(sessionId: string): boolean {
    const runtime = this.agentRuntimes.get(sessionId);
    if (!runtime) {
      return false;
    }
    return runtime.isCurrentlyGenerating();
  }

  /**
   * 获取或创建 AgentRuntime
   * 
   * @param sessionId - 会话 ID
   * @returns AgentRuntime 实例
   */
  private getOrCreateRuntime(sessionId: string): AgentRuntime {
    let runtime = this.agentRuntimes.get(sessionId);
    
    if (!runtime) {
      console.info(`[Gateway] 创建新的 AgentRuntime: ${sessionId}`);
      
      // 从数据库读取工作目录配置
      const { SystemConfigStore } = require('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      const workspaceDir = settings.workspaceDir;
      console.info(`[Gateway] 使用工作目录: ${workspaceDir}`);
      
      runtime = new AgentRuntime(workspaceDir, sessionId);
      
      this.agentRuntimes.set(sessionId, runtime);
    }
    
    return runtime;
  }

  /**
   * 处理发送消息请求
   * 
   * @param content - 消息内容
   * @param sessionId - 会话 ID（可选）
   * @param displayContent - 显示内容（可选，用于前端显示）
   * @param clearHistory - 是否清空历史消息（可选，用于定时任务）
   */
  async handleSendMessage(content: string, sessionId?: string, displayContent?: string, clearHistory?: boolean, skipHistory?: boolean): Promise<void> {
    console.log('收到消息:', content);

    // 如果没有 sessionId，使用默认会话
    const currentSessionId = sessionId || this.defaultSessionId;
    
    // 🔥 命令预处理：检查是否是系统命令（/xxx 格式）
    const commandMatch = content.trim().match(/^\/(\w+)(?:\s+(.*))?$/);
    if (commandMatch) {
      const [, commandName, commandArgs] = commandMatch;
      
      // 支持的命令列表
      const supportedCommands = ['new', 'memory', 'history'];
      
      if (supportedCommands.includes(commandName.toLowerCase())) {
        console.log(`[Gateway] 🎯 检测到系统命令: /${commandName}，直接执行`);
        await this.executeSystemCommand(commandName, commandArgs, currentSessionId);
        return; // 命令执行完成，不进入 Agent
      }
    }
    
    // 获取或创建 AgentRuntime（同步）
    const runtime = this.getOrCreateRuntime(currentSessionId);
    
    // 🔥 如果需要清空历史消息（定时任务场景）
    if (clearHistory) {
      console.log('[Gateway] 🗑️ 清空历史消息（定时任务模式）');
      await runtime.clearMessageHistory();
    }
    
    // 🔥 如果需要跳过历史记录（欢迎消息场景）
    if (skipHistory) {
      console.log('[Gateway] 📝 跳过历史记录（欢迎消息模式）');
      runtime.setSkipHistory(true);
    }

    // 🔥 检查是否正在生成
    if (runtime.isCurrentlyGenerating()) {
      const isTaskTab = currentSessionId.startsWith('task-tab-');
      
      if (isTaskTab) {
        // 定时任务 Tab：等待上一次执行完成
        console.log('[Gateway] 🔄 定时任务 Tab 正在处理消息，等待完成...');
        console.log(`[Gateway] 📝 当前消息: "${content}"`);
        console.log(`[Gateway] 🆔 Session ID: ${currentSessionId}`);
        
        // 等待上一次执行完成（最多等待 120 秒）
        const { TIMEOUTS } = await import('./config/timeouts');
        const success = await waitUntil(
          () => !runtime.isCurrentlyGenerating(),
          {
            timeout: TIMEOUTS.AGENT_MESSAGE_TIMEOUT,
            interval: 100,
            onProgress: (elapsed) => {
              // 每 5 秒打印一次等待状态
              if (Math.floor(elapsed / 5000) > Math.floor((elapsed - 100) / 5000)) {
                const seconds = (elapsed / 1000).toFixed(1);
                console.log(`[Gateway] ⏳ 已等待 ${seconds} 秒...`);
              }
            }
          }
        );
        
        if (!success) {
          console.error('[Gateway] ❌ 等待超时（120秒），强制停止上一次执行');
          console.error(`[Gateway] 📝 被放弃的消息: "${content}"`);
          
          // 强制停止上一次执行
          await runtime.stopGeneration();
          
          // 再等待 1 秒确保清理完成
          await sleep(1000);
          
          console.log('[Gateway] ✅ 已强制停止上一次执行，继续处理新消息');
        } else {
          console.log('[Gateway] ✅ 上一次执行已完成，继续处理新消息');
        }
        
        console.log(`[Gateway] 📝 新消息: "${content}"`);
      } else {
        // 普通 Tab：加入队列
        console.log('[Gateway] 📥 Agent 正在处理消息，将新消息加入队列');
        
        // 初始化队列
        if (!this.messageQueues.has(currentSessionId)) {
          this.messageQueues.set(currentSessionId, []);
        }
        
        // 加入队列
        const queue = this.messageQueues.get(currentSessionId)!;
        queue.push({ content, displayContent });
        console.log(`[Gateway] 📊 队列长度: ${queue.length}`);
        
        // 🔥 不在这里处理队列，而是在 sendAIResponse 完成后处理
        return;
      }
    }

    // 🔥 如果提供了 displayContent，发送用户消息到前端显示
    // 这样前端会显示原始任务内容，而不是带系统前缀的完整命令
    // 注意：只在直接处理消息时发送，队列消息由 processMessageQueue 发送
    if (displayContent && this.mainWindow) {
      const userMessageId = generateUserMessageId();
      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
        messageId: userMessageId,
        content: displayContent,
        done: true,
        role: 'user', // 标记为用户消息
        sessionId: currentSessionId,
      });
      console.log('[Gateway] 📤 已发送用户消息到前端:', displayContent);
    }

    try {
      // 使用 Agent Runtime 处理消息
      await this.sendAIResponse(runtime, content, currentSessionId);
      
      // 🔥 sendAIResponse 内部会调用 processMessageQueue，这里不需要再调用
    } catch (error) {
      console.error('处理消息失败:', error);
      
      // 🔥 检查是否是 AI 连接/超时错误，尝试自动恢复
      const errorMessage = getErrorMessage(error);
      const isAIConnectionError = 
        errorMessage.includes('timeout') ||
        errorMessage.includes('超时') ||
        errorMessage.includes('AI 返回空响应') ||
        errorMessage.includes('API 请求超时') ||
        errorMessage.includes('连接') ||
        errorMessage.includes('网络') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('fetch failed');
      
      if (isAIConnectionError) {
        console.warn('[Gateway] 🔧 检测到 AI 连接错误，尝试自动恢复...');
        console.warn(`[Gateway] 错误信息: ${errorMessage}`);
        console.warn(`[Gateway] 仅恢复当前 Tab: ${currentSessionId}`);
        
        try {
          // 🔥 使用统一的重置逻辑（AI 错误恢复必须重新创建 Runtime）
          const retryRuntime = await this.resetSessionRuntime(currentSessionId, {
            reason: `AI 连接错误: ${errorMessage}`,
            recreate: true  // AI 错误恢复必须重新创建
          });
          
          // 类型断言：recreate: true 时必定返回 AgentRuntime
          if (!retryRuntime) {
            throw new Error('重新创建 Runtime 失败');
          }
          
          // 重试发送消息
          console.log('[Gateway] 🔄 重试发送消息...');
          await this.sendAIResponse(retryRuntime, content, currentSessionId);
          
          console.log('[Gateway] ✅ 自动恢复成功（仅当前 Tab）');
          
          // 重试成功，直接返回
          return;
        } catch (retryError) {
          console.error('[Gateway] ❌ 自动恢复失败:', getErrorMessage(retryError));
          
          // 提供详细的错误提示
          const userMessage = `AI 连接超时，已尝试自动恢复但失败。\n\n可能的原因：\n1. 网络连接不稳定\n2. AI 服务响应缓慢\n3. API 配置错误\n\n建议操作：\n1. 检查网络连接\n2. 重新保存模型配置\n3. 如问题持续，请重启应用\n\n错误详情: ${getErrorMessage(retryError)}`;
          
          this.sendError(userMessage, currentSessionId);
          
          // 即使出错，也要处理队列
          await this.processMessageQueue(currentSessionId);
          return;
        }
      }
      
      // 其他错误直接显示
      this.sendError(errorMessage, currentSessionId);
      
      // 即使出错，也要处理队列
      await this.processMessageQueue(currentSessionId);
    } finally {
      // 🔥 恢复历史记录模式
      if (skipHistory) {
        runtime.setSkipHistory(false);
        console.log('[Gateway] ✅ 恢复历史记录模式');
      }
    }
  }
  
  /**
   * 处理消息队列
   * 
   * @param sessionId - 会话 ID
   */
  private async processMessageQueue(sessionId: string): Promise<void> {
    const queue = this.messageQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      // 清除处理标记
      this.processingQueues.delete(sessionId);
      return;
    }
    
    console.log(`[Gateway] 🔄 处理队列中的消息，队列长度: ${queue.length}`);
    
    // 取出第一条消息
    const message = queue.shift()!;
    
    // 获取 Runtime
    const runtime = this.agentRuntimes.get(sessionId);
    if (!runtime) {
      console.error('[Gateway] ❌ Runtime 不存在，清空队列');
      this.messageQueues.delete(sessionId);
      this.processingQueues.delete(sessionId);
      return;
    }
    
    // 🔥 如果提供了 displayContent，发送消息到前端
    // 跨 Tab 消息不显示在用户消息区（通过系统提示让 Agent 在响应中显示）
    if (message.displayContent && this.mainWindow) {
      // 检查是否为跨 Tab 消息
      const isCrossTabMessage = message.content.startsWith('[来自 ');
      
      if (!isCrossTabMessage) {
        // 普通消息：显示在用户消息区
        const userMessageId = generateUserMessageId();
        sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
          messageId: userMessageId,
          content: message.displayContent,
          done: true,
          role: 'user',
          sessionId: sessionId,
        });
        console.log('[Gateway] 📤 已发送队列消息到前端:', message.displayContent);
      } else {
        // 跨 Tab 消息：不显示（通过 Agent 响应显示）
        console.log('[Gateway] 🔄 跳过显示跨 Tab 队列消息（将通过 Agent 响应显示）');
      }
    }
    
    try {
      // 处理消息（sendAIResponse 会等待整个 Agent 执行完成，包括 autoContinue）
      await this.sendAIResponse(runtime, message.content, sessionId);
    } catch (error) {
      console.error('[Gateway] ❌ 处理队列消息失败:', error);
      
      // 🔥 检查是否是 AI 连接/超时错误，尝试自动恢复
      const errorMessage = getErrorMessage(error);
      const isAIConnectionError = 
        errorMessage.includes('timeout') ||
        errorMessage.includes('超时') ||
        errorMessage.includes('AI 返回空响应') ||
        errorMessage.includes('API 请求超时') ||
        errorMessage.includes('连接') ||
        errorMessage.includes('网络') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('fetch failed');
      
      const isAgentStateError = 
        errorMessage.includes('already processing') ||
        errorMessage.includes('Agent 未初始化') ||
        errorMessage.includes('卡在') ||
        errorMessage.includes('streaming');
      
      if (isAIConnectionError || isAgentStateError) {
        console.warn('[Gateway] 🔧 检测到 AI 连接或状态错误，尝试自动恢复...');
        console.warn(`[Gateway] 错误类型: ${isAIConnectionError ? 'AI连接错误' : 'Agent状态错误'}`);
        
        try {
          // 步骤 1: 清理 AI 连接缓存
          if (isAIConnectionError) {
            console.log('[Gateway] 🔄 清理 AI 连接缓存...');
            const { clearAICache } = await import('./utils/ai-client');
            clearAICache();
          }
          
          // 步骤 2: 重置 Runtime 状态
          console.log('[Gateway] 🔄 重置 Runtime 状态...');
          await runtime.stopGeneration();
          
          // 步骤 3: 等待一小段时间让连接完全释放
          await sleep(1000);
          
          // 步骤 4: 重试一次
          console.log('[Gateway] 🔄 重试消息处理...');
          await this.sendAIResponse(runtime, message.content, sessionId);
          
          console.log('[Gateway] ✅ 自动恢复成功');
          
          // 递归处理下一条消息
          await this.processMessageQueue(sessionId);
          return;
        } catch (retryError) {
          console.error('[Gateway] ❌ 自动恢复失败:', getErrorMessage(retryError));
          
          // 根据错误类型提供不同的提示
          let userMessage = '';
          if (isAIConnectionError) {
            userMessage = `AI 连接超时，已尝试自动恢复但失败。\n\n可能的原因：\n1. 网络连接不稳定\n2. AI 服务响应缓慢\n3. API 配置错误\n\n建议操作：\n1. 检查网络连接\n2. 重新保存模型配置\n3. 如问题持续，请重启应用\n\n错误详情: ${getErrorMessage(retryError)}`;
          } else {
            userMessage = `AI Agent 状态异常，已尝试自动恢复但失败。请重新保存模型配置或重启应用。\n\n错误详情: ${getErrorMessage(retryError)}`;
          }
          
          this.sendError(userMessage, sessionId);
        }
      } else {
        // 其他错误直接显示
        this.sendError(errorMessage, sessionId);
      }
    }
    
    // 递归处理下一条消息
    await this.processMessageQueue(sessionId);
  }

  /**
   * 处理停止生成请求
   */
  async handleStopGeneration(sessionId?: string): Promise<void> {
    console.log('收到停止生成请求');

    // 如果没有 sessionId，使用默认会话
    const currentSessionId = sessionId || this.defaultSessionId;
    
    // 🔥 使用统一的重置逻辑（仅清理，不重新创建）
    await this.resetSessionRuntime(currentSessionId, {
      reason: '用户点击 Stop 按钮',
      recreate: false  // 仅清理，用户下次发消息时会自动创建
    });
  }



  /**
   * 发送 AI 响应
   * 
   * @param runtime - AgentRuntime 实例
   * @param userMessage - 用户消息
   * @param sessionId - 会话 ID
   */
  private async sendAIResponse(runtime: AgentRuntime, userMessage: string, sessionId: string): Promise<void> {
    const messageId = generateMessageId();
    let fullResponse = ''; // 收集完整响应
    const startTime = Date.now(); // 🔥 记录开始时间

    try {
      // 🔥 过滤掉系统指令和系统提示（用于保存到历史记录）
      // 过滤 [系统指令] 和 [系统提示: ...]
      let messageForHistory = userMessage.replace(/\n\n\[系统指令\].*$/s, '');
      messageForHistory = messageForHistory.replace(/\n\n\[系统提示:.*?\]$/s, '');
      
      // 🔥 保存用户消息到 session（除非跳过历史记录或定时任务 Tab）
      const skipHistory = runtime.getSkipHistory();
      const isTaskTab = sessionId.startsWith('task-tab-');
      
      if (this.sessionManager && !skipHistory && !isTaskTab) {
        await this.sessionManager.saveUserMessage(sessionId, messageForHistory);
      } else if (skipHistory) {
        console.log('[Gateway] 🚫 跳过保存用户消息到历史记录（欢迎消息模式）');
      } else if (isTaskTab) {
        console.log('[Gateway] 🚫 跳过保存用户消息到历史记录（定时任务 Tab）');
      }
      
      // 设置执行步骤更新回调
      runtime.setExecutionStepCallback((steps) => {
        // 发送执行步骤更新到前端
        sendToWindow(this.mainWindow, IPC_CHANNELS.EXECUTION_STEP_UPDATE, {
          messageId,
          executionSteps: steps,
          sessionId, // 添加 sessionId
        });
      });

      // 获取流式响应
      const stream = runtime.sendMessage(userMessage);

      // 逐块发送
      for await (const chunk of stream) {
        fullResponse += chunk; // 收集响应
        this.sendStreamChunk(messageId, chunk, false, false, undefined, undefined, sessionId);
      }

      // 🔥 generator 完成后，确保 Agent 已完全空闲
      console.log('[Gateway] ✅ Generator 完成，等待 Agent 完全空闲...');
      const { TIMEOUTS } = await import('./config/timeouts');
      const success = await waitUntil(
        () => !runtime.isCurrentlyGenerating(),
        { timeout: TIMEOUTS.AGENT_MESSAGE_TIMEOUT, interval: 50 }
      );
      
      if (!success) {
        console.error('[Gateway] ❌ 等待 Agent 空闲超时');
      } else {
        console.log('[Gateway] ✅ Agent 已完全空闲');
      }

      // 发送完成信号（包含最终的执行步骤和总执行时间）
      const finalSteps = runtime.getExecutionSteps();
      const totalDuration = Date.now() - startTime; // 🔥 计算总执行时间
      console.log(`[Gateway] ⏱️ Agent 总执行时间: ${(totalDuration / 1000).toFixed(2)} 秒`);
      this.sendStreamChunk(messageId, '', true, false, undefined, finalSteps, sessionId, totalDuration);
      
      // 🔥 保存 AI 响应到 session
      // 注意：即使是欢迎消息模式（skipHistory=true），AI 的响应也要保存
      // 只有用户的欢迎消息不保存，AI 的欢迎回复要保存
      if (this.sessionManager && fullResponse.trim() && !isTaskTab) {
        // 保存响应内容和执行步骤
        await this.sessionManager.saveAssistantMessage(sessionId, fullResponse, finalSteps);
        console.log(`[Gateway] 💾 已保存 AI 响应和 ${finalSteps.length} 个执行步骤`);
      } else if (isTaskTab && fullResponse.trim()) {
        console.log('[Gateway] 🚫 跳过保存 AI 响应到历史记录（定时任务 Tab）');
      }
      
      // 🔥 如果是连接器 Tab，发送响应到连接器
      const tab = this.tabs.get(sessionId);
      if (tab && tab.type === 'connector' && fullResponse.trim()) {
        console.log('[Gateway] 🔄 检测到连接器 Tab，发送响应到连接器');
        await this.sendResponseToConnector(sessionId, fullResponse);
      }
      
      // 🔥 Agent 执行完成后，处理队列中的下一条消息
      console.log('[Gateway] ✅ Agent 执行完成，检查队列...');
      await this.processMessageQueue(sessionId);
    } catch (error) {
      console.error('AI 响应失败:', error);
      throw error;
    }
  }

  /**
   * 发送流式消息块
   * 
   * @param messageId - 消息 ID
   * @param content - 消息内容
   * @param done - 是否完成
   * @param isSubAgentResult - 是否为 Sub Agent 结果报告
   * @param subAgentTask - Sub Agent 任务描述（可选）
   * @param executionSteps - 执行步骤（可选）
   * @param sessionId - 会话 ID（可选）
   * @param totalDuration - 总执行时间（毫秒，可选）
   */
  private sendStreamChunk(
    messageId: string,
    content: string,
    done: boolean,
    isSubAgentResult?: boolean,
    subAgentTask?: string,
    executionSteps?: any[],
    sessionId?: string,
    totalDuration?: number
  ) {
    sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
      messageId,
      content,
      done,
      isSubAgentResult,
      subAgentTask,
      executionSteps,
      sessionId, // 添加 sessionId
      totalDuration, // 🔥 添加总执行时间
    });
  }

  /**
   * 发送错误
   */
  private sendError(error: string, sessionId?: string) {
    console.log('[Gateway] 📤 发送错误到前端:', error);
    sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_ERROR, {
      error,
      sessionId, // 添加 sessionId
    });
  }



  /**
   * 销毁 Gateway 并清理所有资源
   * 
   * 清理所有 AgentRuntime 实例和相关资源
   */
  destroy(): void {
    console.info('[Gateway] 开始销毁 Gateway...');
    this.destroyAllRuntimes();
    console.info('[Gateway] Gateway 已销毁');
  }

  /**
   * 销毁所有 AgentRuntime 实例
   * 
   * 用于批量清理所有会话的 Runtime
   */
  private destroyAllRuntimes(): void {
    for (const [sessionId, runtime] of this.agentRuntimes.entries()) {
      console.info(`[Gateway] 销毁 AgentRuntime: ${sessionId}`);
      void runtime.destroy();
    }
    this.agentRuntimes.clear();
  }

  /**
   * 销毁指定会话的 Runtime（用于清空会话上下文）
   * 
   * @param sessionId - 会话 ID
   */
  async destroySessionRuntime(sessionId: string): Promise<void> {
    const runtime = this.agentRuntimes.get(sessionId);
    
    if (runtime) {
      console.log(`[Gateway] 销毁会话 Runtime: ${sessionId}`);
      await runtime.destroy();
      this.agentRuntimes.delete(sessionId);
      console.log(`[Gateway] ✅ 会话 Runtime 已销毁并移除`);
    } else {
      console.log(`[Gateway] 会话 Runtime 不存在: ${sessionId}`);
    }
  }

  /**
   * 重置会话 Runtime（统一的重置逻辑）
   * 
   * 用于以下场景：
   * 1. 用户点击 Stop 按钮
   * 2. AI 调用出错时自动恢复
   * 3. 其他需要彻底重置 Agent 的场景
   * 
   * @param sessionId - 会话 ID
   * @param options - 重置选项
   * @returns 重新创建的 Runtime
   */
  async resetSessionRuntime(sessionId: string, options: {
    reason?: string;  // 重置原因（用于日志）
    recreate?: boolean;  // 是否重新创建 Runtime（默认 true）
  } = {}): Promise<AgentRuntime | null> {
    const { reason = '未知原因', recreate = true } = options;
    
    console.log(`[Gateway] 🔄 重置会话 Runtime: ${sessionId}`);
    console.log(`[Gateway] 📝 重置原因: ${reason}`);
    console.log(`[Gateway] 🔧 重新创建: ${recreate ? '是' : '否'}`);
    
    // 步骤 1: 停止当前 Runtime 的生成
    const runtime = this.agentRuntimes.get(sessionId);
    if (runtime) {
      console.log('[Gateway] 🛑 停止当前 Runtime 生成...');
      await runtime.stopGeneration();
    }
    
    // 步骤 2: 销毁当前 Runtime
    console.log('[Gateway] 🗑️ 销毁当前 Runtime...');
    await this.destroySessionRuntime(sessionId);
    
    if (!recreate) {
      console.log('[Gateway] ✅ 会话 Runtime 重置完成（仅销毁）');
      return null;
    }
    
    // 步骤 3: 等待一小段时间让 Runtime 完全释放
    await sleep(500);
    
    // 步骤 4: 重新创建 Runtime
    console.log('[Gateway] ✨ 重新创建 Runtime...');
    const newRuntime = this.getOrCreateRuntime(sessionId);
    
    console.log('[Gateway] ✅ 会话 Runtime 重置完成');
    
    return newRuntime;
  }

  /**
   * 获取活跃会话数量（用于调试）
   * 
   * @returns 活跃会话数量
   */
  getActiveSessionCount(): number {
    return this.agentRuntimes.size;
  }

  /**
   * 获取所有会话 ID（用于调试）
   * 
   * @returns 会话 ID 列表
   */
  getSessionIds(): string[] {
    return Array.from(this.agentRuntimes.keys());
  }

  /**
   * 处理 Skill Manager 请求
   * 
   * @param request - Skill Manager 请求
   * @returns 处理结果
   */
  async handleSkillManagerRequest(request: any): Promise<any> {
    console.log('[Gateway] 处理 Skill Manager 请求:', request);
    
    // 获取默认会话的 Runtime
    const runtime = this.getOrCreateRuntime(this.defaultSessionId);
    
    // 调用 Runtime 的 Skill Manager Tool
    return await runtime.handleSkillManagerRequest(request);
  }
  
  // ==================== Tab 管理方法 ====================
  
  /**
   * 发送欢迎消息
   * 
   * 🔥 统一的欢迎消息发送逻辑
   */
  private async sendWelcomeMessage(): Promise<void> {
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const configStore = SystemConfigStore.getInstance();
      const nameConfig = configStore.getNameConfig();
      
      const isDefaultUserName = nameConfig.userName === 'user';
      const isDefaultAgentName = nameConfig.agentName === 'DeepBot';
      
      // 🔥 清除默认 Tab 的所有消息（包括错误提示）
      const defaultTab = this.tabs.get('default');
      if (defaultTab) {
        defaultTab.messages = [];
        console.log('[Gateway] 🧹 已清除默认 Tab 的所有消息');
        
        // 通知前端清除消息
        sendToWindow(this.mainWindow, 'tab:messages-cleared', {
          tabId: 'default',
        });
      }
      
      // 🔥 清除历史记录
      if (this.sessionManager) {
        await this.sessionManager.clearSession('default');
        console.log('[Gateway] 🧹 已清除默认 Tab 的历史记录');
      }
      
      // 构建欢迎消息内容
      const welcomeContent = `👋 你好！欢迎第一次使用 DeepBot！

我是你的全能 AI 助手，24 小时待命帮你处理各种任务。在开始之前，让我们先互相认识一下吧！

---

关于我：

- 我还没有名字，你帮我取一个？（说"你叫 XXX"即可）${!isDefaultAgentName ? ` 当前名字：${nameConfig.agentName}` : ''}
- 我是谁？桌面 AI 助手，24 小时待命帮你干活
- 对话风格？你希望我正式/随意/专业/温暖？
- 记忆系统：你可以随时说"记住 XXX"，我会永久记住：
  - 你的偏好和习惯
  - 常用的工具和命令
  - 项目相关的信息
  - 任何你觉得重要的事
- 角色设定：你可以给我设定专业角色，比如：
  - 研发领域："你是 Python 开发专家"、"你擅长前端开发，熟悉 React"
  - 运维领域："你是运维工程师，精通 Docker 和 K8s"
  - 设计领域："你是 UI/UX 设计师，擅长用户体验优化"
  - 内容创作："你是内容创作者，擅长写作和视频制作"
  - 数据分析："你是数据分析师，精通 Excel 和数据可视化"
  - 项目管理："你是项目经理，擅长团队协作和进度管理"
  - 教育培训："你是培训讲师，擅长知识传授和课程设计"
  - 市场营销："你是营销专家，擅长品牌推广和用户增长"
  设定角色后，我会按照这个专业领域来帮你，还可以安装对应的 Skill 扩展能力

关于你：

- 怎么称呼你？（我会永久记住）${!isDefaultUserName ? ` 当前称呼：${nameConfig.userName}` : ''}
- 你主要做什么项目/工作？（我可以记住常用工具和命令）
- 有什么特别在意或讨厌的？（比如代码风格、工作习惯）

我能帮你做什么：

- 📁 文件操作：读写、搜索、整理文件
- 🌐 浏览网页：自动化网页操作、信息提取
- ⚙️ 执行命令：运行脚本、管理进程
- 📋 任务管理：创建、跟踪、提醒任务
- ⏰ 定时任务：设置后台自动执行的任务
- 🧠 记忆系统：记住你的偏好、常用工具、项目信息
- 🔧 Skill 扩展：安装专业技能包，扩展我的能力

在我们的沟通过程中，我会越来越了解你，知道怎么更好的完成任务。😊

有什么问题或者需要帮忙的，尽管说！`;

      const welcomeMessage = `请按照以下方式欢迎用户：

1. 直接输出以下内容（保持格式）：

${welcomeContent}

2. 然后使用 environment_check 工具检查运行环境
3. 如果环境未配置，提醒${isDefaultUserName ? '用户' : nameConfig.userName}你可以帮助安装

不要显示计划步骤，直接执行。`;
      
      console.log('[Gateway] 📤 发送欢迎消息到默认会话');
      
      // 🔥 发送欢迎消息，跳过历史记录（欢迎消息不应该被保存）
      await this.handleSendMessage(welcomeMessage, 'default', undefined, false, true);
    } catch (error) {
      console.error('[Gateway] ❌ 发送欢迎消息失败:', getErrorMessage(error));
    }
  }

  /**
   * 创建默认 Tab
   */
  private createDefaultTab(): void {
    // 🔥 获取全局 Agent 名字
    const { SystemConfigStore } = require('./database/system-config-store');
    const configStore = SystemConfigStore.getInstance();
    const nameConfig = configStore.getNameConfig();
    
    const defaultTab: AgentTab = {
      id: 'default',
      title: nameConfig.agentName, // 🔥 使用全局 Agent 名字
      messages: [],
      isLoading: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    
    this.tabs.set('default', defaultTab);
    console.log('[Gateway] 创建默认 Tab:', defaultTab.id, defaultTab.title);
    
    // 🔥 异步加载默认 Tab 的历史消息（在欢迎消息之后）
    this.loadDefaultTabHistory().catch(error => {
      console.error('[Gateway] ❌ 加载默认 Tab 历史消息失败:', error);
    });
  }
  
  /**
   * 加载默认 Tab 的历史消息
   * 
   * 🔥 如果没有历史记录，发送欢迎消息；如果有历史记录，直接加载
   */
  private async loadDefaultTabHistory(): Promise<void> {
    // 等待 SessionManager 初始化完成
    await sleep(500);
    
    if (!this.sessionManager) {
      console.warn('[Gateway] SessionManager 未初始化，发送欢迎消息');
      await this.sendWelcomeMessage();
      return;
    }
    
    try {
      console.log('[Gateway] 🔄 检查默认 Tab 是否有历史消息...');
      
      // 加载 UI 显示消息（最近 100 轮）
      const messages = await this.sessionManager.loadUIMessages('default');
      
      // 🔥 检查是否需要发送欢迎消息
      const shouldSendWelcome = this.shouldSendWelcomeMessage(messages);
      
      if (shouldSendWelcome) {
        console.log('[Gateway] 📝 需要发送欢迎消息');
        await this.sendWelcomeMessage();
      } else {
        console.log(`[Gateway] 📖 找到 ${messages.length} 条有效历史消息，跳过欢迎消息`);
        
        // 更新 Tab 的消息列表
        const tab = this.tabs.get('default');
        if (tab) {
          tab.messages = messages;
        }
        
        // 通知前端加载历史消息
        sendToWindow(this.mainWindow, 'tab:history-loaded', {
          tabId: 'default',
          messages,
        });
      }
    } catch (error) {
      console.error('[Gateway] ❌ 检查历史消息失败，发送欢迎消息:', getErrorMessage(error));
      await this.sendWelcomeMessage();
    }
  }
  
  /**
   * 检查并发送欢迎消息
   * 
   * 🔥 用于模型配置后检查是否需要发送欢迎消息
   */
  private async checkAndSendWelcomeMessage(): Promise<void> {
    // 等待 SessionManager 初始化完成
    await sleep(500);
    
    if (!this.sessionManager) {
      console.warn('[Gateway] SessionManager 未初始化，跳过欢迎消息检查');
      return;
    }
    
    try {
      console.log('[Gateway] 🔄 检查是否需要发送欢迎消息...');
      
      // 加载 UI 显示消息（最近 100 轮）
      const messages = await this.sessionManager.loadUIMessages('default');
      
      // 🔥 检查是否需要发送欢迎消息
      const shouldSendWelcome = this.shouldSendWelcomeMessage(messages);
      
      if (shouldSendWelcome) {
        console.log('[Gateway] 📝 需要发送欢迎消息');
        await this.sendWelcomeMessage();
      } else {
        console.log(`[Gateway] 📖 找到 ${messages.length} 条有效历史消息，跳过欢迎消息`);
      }
    } catch (error) {
      console.error('[Gateway] ❌ 检查欢迎消息失败:', getErrorMessage(error));
    }
  }
  
  /**
   * 判断是否需要发送欢迎消息
   * 
   * 条件：
   * 1. 没有历史记录
   * 2. 只有一条用户消息，没有 AI 回复
   * 3. 只有系统错误消息
   */
  private shouldSendWelcomeMessage(messages: Message[]): boolean {
    // 情况 1: 没有历史记录
    if (messages.length === 0) {
      console.log('[Gateway] 原因: 没有历史记录');
      return true;
    }
    
    // 情况 2: 只有一条用户消息，没有 AI 回复
    if (messages.length === 1 && messages[0].role === 'user') {
      console.log('[Gateway] 原因: 只有一条用户消息，没有 AI 回复');
      return true;
    }
    
    // 情况 3: 只有系统错误消息（通常是"模型未配置"的错误）
    const hasOnlySystemMessages = messages.every(msg => msg.role === 'system');
    if (hasOnlySystemMessages) {
      console.log('[Gateway] 原因: 只有系统错误消息');
      return true;
    }
    
    // 情况 4: 有用户消息但没有 assistant 回复
    const hasUserMessage = messages.some(msg => msg.role === 'user');
    const hasAssistantMessage = messages.some(msg => msg.role === 'assistant');
    if (hasUserMessage && !hasAssistantMessage) {
      console.log('[Gateway] 原因: 有用户消息但没有 AI 回复');
      return true;
    }
    
    return false;
  }
  
  /**
   * 创建新 Tab
   * 
   * @param options - 创建选项
   * @returns 新创建的 Tab
   */
  async createTab(options: {
    type?: 'normal' | 'connector' | 'scheduled_task';
    title?: string;
    conversationKey?: string;
    connectorId?: string;
    conversationId?: string;
    taskId?: string;
    memoryFile?: string | null;      // 🔥 新增：独立的 memory 文件
    agentName?: string | null;       // 🔥 新增：独立的 Agent 名字
    isPersistent?: boolean;          // 🔥 新增：是否持久化
  }): Promise<AgentTab> {
    // 检查 Tab 数量限制
    if (this.tabs.size >= this.MAX_TABS) {
      throw new Error(`最多只能创建 ${this.MAX_TABS} 个窗口`);
    }
    
    // 生成唯一的 Tab ID
    this.tabIdCounter++;
    const tabId = generateTabId(this.tabIdCounter);
    
    // 🔥 确定 Tab 类型（用于数据库）
    let tabType: 'manual' | 'task' | 'connector' = 'manual';
    if (options.type === 'scheduled_task') {
      tabType = 'task';
    } else if (options.type === 'connector') {
      tabType = 'connector';
    }
    
    // 🔥 生成默认标题（根据 Tab 类型和 Agent 名字）
    let tabTitle: string;
    
    if (options.title) {
      // 如果明确指定了标题，直接使用
      tabTitle = options.title;
    } else if (tabType === 'task' || tabType === 'connector') {
      // 定时任务和外连 Tab 保持原有逻辑（在调用处已经设置了 title）
      tabTitle = `Agent ${this.tabCounter + 1}`;
    } else {
      // 普通 Tab：根据是否有 agentName 决定标题
      if (options.agentName) {
        // 如果有独立的 Agent 名字，使用 Agent 名字作为标题
        tabTitle = options.agentName;
      } else {
        // 如果没有独立名字，使用"主 Agent 名字 + 数字"
        const { SystemConfigStore } = await import('./database/system-config-store');
        const configStore = SystemConfigStore.getInstance();
        const nameConfig = configStore.getNameConfig();
        tabTitle = `${nameConfig.agentName} ${this.tabCounter + 1}`;
      }
    }
    
    this.tabCounter++;
    
    // 🔥 确定是否持久化（默认：手动创建和连接器 Tab 持久化，定时任务 Tab 不持久化）
    const isPersistent = options.isPersistent !== undefined 
      ? options.isPersistent 
      : (tabType === 'manual' || tabType === 'connector');
    
    // 🔥 生成独立的 memory 文件名（如果未指定）
    const memoryFile = options.memoryFile !== undefined
      ? options.memoryFile
      : `memory-${tabId}.md`;
    
    // 创建 Tab
    const tab: AgentTab = {
      id: tabId,
      title: tabTitle,
      type: options.type || 'normal',
      messages: [],
      isLoading: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      conversationKey: options.conversationKey,
      connectorId: options.connectorId,
      conversationId: options.conversationId,
      taskId: options.taskId,
      memoryFile,                      // 🔥 新增
      agentName: options.agentName,    // 🔥 新增
      isPersistent,                    // 🔥 新增
    };
    
    this.tabs.set(tabId, tab);
    console.log('[Gateway] 创建新 Tab:', tabId, tabTitle, options.type, isPersistent ? '(持久化)' : '(临时)');
    
    // 🔥 如果是持久化 Tab，保存到数据库
    if (isPersistent) {
      try {
        const { SystemConfigStore } = await import('./database/system-config-store');
        const { saveTabConfig } = await import('./database/tab-config');
        const store = SystemConfigStore.getInstance();
        
        saveTabConfig(store['db'], {
          id: tabId,
          title: tabTitle,
          type: tabType,
          memoryFile,
          agentName: options.agentName || null,
          isPersistent: true,
          createdAt: tab.createdAt,
          lastActiveAt: tab.lastActiveAt,
          taskId: options.taskId,
          connectorId: options.connectorId,
          conversationId: options.conversationId,
        });
        
        console.log('[Gateway] 💾 Tab 配置已持久化:', tabId);
        
        // 🔥 创建 Tab 的 memory 文件（继承主 memory 内容）
        // 所有持久化的 Tab（包括手动创建和外部连接器）都创建独立的 memory 文件
        if (memoryFile) {
          try {
            const { createTabMemoryFile } = await import('./tools/memory-tool');
            await createTabMemoryFile(tabId, memoryFile);
          } catch (error) {
            console.error('[Gateway] ❌ 创建 Tab memory 文件失败:', error);
          }
        }
      } catch (error) {
        console.error('[Gateway] ❌ 保存 Tab 配置失败:', error);
      }
    }
    
    // 通知前端 Tab 已创建
    this.notifyTabCreated(tab);
    
    return tab;
  }
  
  /**
   * 获取或创建任务专属 Tab
   * 
   * @param taskId - 任务 ID
   * @param taskName - 任务名称
   * @returns 任务专属 Tab
   */
  getOrCreateTaskTab(taskId: string, taskName: string): AgentTab {
    // 检查是否已有该任务的 Tab
    const existingTabId = this.taskTabMap.get(taskId);
    if (existingTabId) {
      const existingTab = this.tabs.get(existingTabId);
      if (existingTab) {
        console.log('[Gateway] 复用任务 Tab:', existingTabId, taskName);
        return existingTab;
      }
    }
    
    // 生成任务名称缩写（取前 8 个字符）
    const shortName = taskName.length > 8 ? taskName.slice(0, 8) + '...' : taskName;
    const tabTitle = `⏰ ${shortName}`;
    
    // 生成 Tab ID
    const tabId = `task-tab-${taskId}`;
    
    // 创建锁定的任务 Tab
    const tab: AgentTab = {
      id: tabId,
      title: tabTitle,
      messages: [],
      isLoading: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      isLocked: true,      // 🔒 锁定状态
      taskId: taskId,      // 关联任务 ID
    };
    
    this.tabs.set(tabId, tab);
    this.taskTabMap.set(taskId, tabId);
    console.log('[Gateway] 创建任务专属 Tab:', tabId, tabTitle);
    
    // 通知前端 Tab 已创建
    this.notifyTabCreated(tab);
    
    return tab;
  }
  
  /**
   * 通知前端 Tab 已创建
   * 
   * @param tab - 新创建的 Tab
   */
  private notifyTabCreated(tab: AgentTab): void {
    sendToWindow(this.mainWindow, 'tab:created', { tab });
    console.log('[Gateway] 已通知前端 Tab 创建:', tab.id);
  }
  
  /**
   * 关闭 Tab
   * 
   * @param tabId - Tab ID
   */
  async closeTab(tabId: string): Promise<void> {
    // 不允许关闭默认 Tab
    if (tabId === 'default') {
      throw new Error('不能关闭默认窗口');
    }
    
    // 检查 Tab 是否存在
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error('窗口不存在');
    }
    
    // 🔥 如果是任务 Tab，暂停关联的任务
    if (tab.isLocked && tab.taskId) {
      console.log('[Gateway] 检测到任务 Tab 关闭，暂停任务:', tab.taskId);
      try {
        // 调用 scheduled-task-tool 暂停任务
        const { createScheduledTaskTool } = await import('./tools/scheduled-task-tool');
        const tool = createScheduledTaskTool();
        
        await tool.execute(
          generateExecutionId('pause-task'),
          {
            action: 'pause',
            taskId: tab.taskId,
          },
          new AbortController().signal,
          () => {}
        );
        
        console.log('[Gateway] 任务已暂停:', tab.taskId);
        
        // 清除任务 Tab 映射
        this.taskTabMap.delete(tab.taskId);
      } catch (error) {
        console.error('[Gateway] 暂停任务失败:', error);
        // 继续关闭 Tab，即使暂停失败
      }
    }
    
    // 销毁对应的 AgentRuntime
    await this.destroySessionRuntime(tabId);
    
    // 🔥 删除 Tab 的 memory 文件（必须在删除数据库配置之前）
    if (tab.memoryFile) {
      try {
        const { deleteTabMemoryFile } = await import('./tools/memory-tool');
        await deleteTabMemoryFile(tabId, tab.memoryFile);
      } catch (error) {
        console.error('[Gateway] ❌ 删除 Tab memory 文件失败:', error);
        // 继续关闭 Tab，即使删除失败
      }
    }
    
    // 🔥 清空 Tab 的 session 文件
    if (this.sessionManager) {
      try {
        await this.sessionManager.clearSession(tabId);
        console.log('[Gateway] 🗑️ 已清空 Tab session 文件:', tabId);
      } catch (error) {
        console.error('[Gateway] ❌ 清空 Tab session 文件失败:', error);
        // 继续关闭 Tab，即使清空失败
      }
    }
    
    // 🔥 如果是持久化 Tab，从数据库删除配置
    if (tab.isPersistent) {
      try {
        const { SystemConfigStore } = await import('./database/system-config-store');
        const { deleteTabConfig } = await import('./database/tab-config');
        const store = SystemConfigStore.getInstance();
        
        deleteTabConfig(store['db'], tabId);
        console.log('[Gateway] 🗑️ 已删除 Tab 持久化配置:', tabId);
      } catch (error) {
        console.error('[Gateway] ❌ 删除 Tab 配置失败:', error);
      }
    }
    
    // 删除 Tab
    this.tabs.delete(tabId);
    console.log('[Gateway] 关闭 Tab:', tabId);
  }
  
  /**
   * 获取所有 Tab
   * 
   * @returns Tab 列表
   */
  getAllTabs(): AgentTab[] {
    return Array.from(this.tabs.values()).sort((a, b) => {
      // 默认 Tab 始终在最前面
      if (a.id === 'default') return -1;
      if (b.id === 'default') return 1;
      return a.createdAt - b.createdAt;
    });
  }
  
  /**
   * 更新 Tab 的最后活跃时间
   * 
   * @param tabId - Tab ID
   */
  updateTabActivity(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.lastActiveAt = Date.now();
    }
  }
  
  // ========== 连接器相关方法 ==========
  
  /**
   * 处理连接器消息
   * 
   * @param message - Gateway 消息
   */
  async handleConnectorMessage(message: GatewayMessage): Promise<void> {
    console.log('[Gateway] 处理连接器消息:', {
      connectorId: message.source.connectorId,
      conversationId: message.source.conversationId,
      senderId: message.source.senderId,
      senderName: message.source.senderName,
    });
    
    try {
      // 1. 查找或创建 Tab
      const conversationKey = `${message.source.connectorId}_${message.source.conversationId}`;
      let tab = this.findTabByConversationKey(conversationKey);
      
      if (!tab) {
        // 创建新 Tab - 标题只显示连接器名称
        const title = message.source.connectorId;
        tab = await this.createTab({
          type: 'connector',
          title,
          conversationKey,
          connectorId: message.source.connectorId,
          conversationId: message.source.conversationId,
        });
        
        console.log('[Gateway] 创建连接器 Tab:', {
          tabId: tab.id,
          title,
          conversationKey,
        });
      }
      
      // 2. 发送消息给 Agent 处理
      const content = message.content.text || '';
      const senderName = message.source.senderName || '用户';
      
      // displayContent: 前端显示的内容（不显示来源信息，直接显示命令）
      const displayContent = content;
      
      // contentWithSource: Agent 接收的内容（包含来源信息）
      const contentWithSource = `[来自: ${senderName}]\n${content}`;
      
      // 为连接器会话添加系统提示，要求显示接收到的消息并真实调用工具
      const systemHint = `\n\n[系统提示: 这是外部通讯会话。
1. 禁止假装调用工具，说了调用工具必须执行。
2. 你可以使用 connector_send_image 和 connector_send_file 工具发送图片和文件]`;
      
      const contentForAgent = contentWithSource + systemHint;
      
      await this.handleSendMessage(contentForAgent, tab.id, displayContent);
      
      console.log('[Gateway] ✅ 连接器消息已处理');
    } catch (error) {
      console.error('[Gateway] ❌ 处理连接器消息失败:', error);
      throw error;
    }
  }
  
  /**
   * 发送响应到连接器
   * 
   * @param tabId - Tab ID
   * @param response - 响应内容
   */
  async sendResponseToConnector(tabId: string, response: string): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.type !== 'connector') {
      console.log('[Gateway] Tab 不是连接器类型，跳过发送');
      return;
    }
    
    if (!tab.connectorId || !tab.conversationId) {
      console.error('[Gateway] Tab 缺少连接器信息');
      return;
    }
    
    console.log('[Gateway] 发送响应到连接器:', {
      tabId,
      connectorId: tab.connectorId,
      conversationId: tab.conversationId,
      responseLength: response.length,
    });
    
    try {
      // 调用 ConnectorManager 发送消息
      await this.connectorManager.sendOutgoingMessage(
        tab.connectorId as any,
        tab.conversationId,
        response
      );
      
      console.log('[Gateway] ✅ 响应已发送到连接器');
    } catch (error) {
      console.error('[Gateway] ❌ 发送响应到连接器失败:', error);
      throw error;
    }
  }
  
  /**
   * 查找 Tab（基于 conversationKey）
   * 
   * @param key - 会话 Key
   * @returns Tab 或 null
   */
  private findTabByConversationKey(key: string): AgentTab | null {
    for (const tab of this.tabs.values()) {
      if (tab.conversationKey === key) {
        return tab;
      }
    }
    return null;
  }
  
  /**
   * 获取 ConnectorManager 实例
   * 
   * @returns ConnectorManager
   */
  getConnectorManager(): ConnectorManager {
    return this.connectorManager;
  }
  
  /**
   * 获取 SessionManager 实例
   * 
   * @returns SessionManager 或 null
   */
  getSessionManager(): SessionManager | null {
    return this.sessionManager;
  }
  /**
   * 获取指定会话的 AgentRuntime 实例
   * @param sessionId 会话 ID，如果不提供则使用默认会话
   * @returns AgentRuntime 实例，如果不存在则返回 null
   */
  getAgentRuntime(sessionId?: string): AgentRuntime | null {
    const currentSessionId = sessionId || this.defaultSessionId;
    return this.agentRuntimes.get(currentSessionId) || null;
  }

  /**
   * 执行系统命令（不通过 Agent）
   * 
   * @param commandName - 命令名称
   * @param commandArgs - 命令参数（可选）
   * @param sessionId - 会话 ID
   */
  private async executeSystemCommand(commandName: string, commandArgs: string | undefined, sessionId: string): Promise<void> {
    const messageId = generateMessageId();
    
    try {
      // 🔥 不需要发送用户消息到前端，因为前端已经显示过了
      // 前端在 handleSendMessage 中已经添加了用户消息到 UI
      
      // 执行命令
      let resultText = '';
      
      switch (commandName.toLowerCase()) {
        case 'new':
          resultText = await this.handleNewCommand(sessionId);
          break;
          
        case 'memory':
          resultText = await this.handleMemoryCommand(sessionId);
          break;
          
        case 'history':
          resultText = await this.handleHistoryCommand(sessionId);
          break;
          
        default:
          resultText = `❌ 未知指令: /${commandName}\n\n可用指令：\n- /new - 清空当前会话历史，开始新对话\n- /memory - 查看和管理记忆\n- /history - 查看对话历史统计`;
      }

      // 发送命令执行结果到前端
      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
        messageId,
        content: resultText,
        done: true,
        sessionId,
      });

    } catch (error) {
      console.error(`[Gateway] ❌ 执行系统命令失败: /${commandName}`, error);
      
      // 发送错误消息到前端
      this.sendError(`执行命令失败: ${getErrorMessage(error)}`, sessionId);
    }
  }

  /**
   * 处理 /new 命令 - 清空会话
   */
  private async handleNewCommand(sessionId: string): Promise<string> {
    try {
      console.log(`[Gateway] 执行 /new 指令，清空会话: ${sessionId}`);

      // 1. 清空 session 历史文件
      if (this.sessionManager) {
        await this.sessionManager.clearSession(sessionId);
        console.log(`[Gateway] ✅ 会话历史已清空: ${sessionId}`);
      }

      // 2. 使用统一的重置逻辑（销毁但不重新创建 Runtime）
      await this.resetSessionRuntime(sessionId, {
        reason: '/new 指令清空会话',
        recreate: false  // 仅清理，不重新创建（用户下次发消息时会自动创建）
      });
      console.log(`[Gateway] ✅ AgentRuntime 已重置，上下文已清除`);

      // 3. 通知前端清空 UI
      sendToWindow(this.mainWindow, 'command:clear-chat', { sessionId });
      console.log(`[Gateway] ✅ 已通知前端清空 UI`);

      return '✅ 已清空会话历史，开始新对话';
    } catch (error) {
      console.error('[Gateway] ❌ 执行 /new 指令失败:', error);
      throw error;
    }
  }

  /**
   * 处理 /memory 命令 - 查看和管理记忆
   */
  private async handleMemoryCommand(sessionId: string): Promise<string> {
    try {
      console.log(`[Gateway] 执行 /memory 指令: ${sessionId}`);

      // 发送命令执行成功的消息
      const successMessage = '✅ 正在查询记忆系统...';
      
      // 🔥 自动发送一条消息给 Agent，让 Agent 显示记忆并提示用户
      const agentPrompt = '显示当前的记忆是什么，提示用户如何更新记忆';
      
      // 延迟发送，确保命令结果先显示
      setTimeout(async () => {
        try {
          // 获取或创建 Runtime
          const runtime = this.getOrCreateRuntime(sessionId);
          
          // 发送用户消息到前端
          sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
            messageId: generateUserMessageId(),
            content: agentPrompt,
            done: true,
            role: 'user',
            sessionId,
          });

          // 发送到 Agent 处理
          await this.sendAIResponse(runtime, agentPrompt, sessionId);
        } catch (error) {
          console.error('[Gateway] ❌ 自动发送记忆查询失败:', error);
          this.sendError(`查询记忆失败: ${getErrorMessage(error)}`, sessionId);
        }
      }, 100);

      return successMessage;
    } catch (error) {
      console.error('[Gateway] ❌ 执行 /memory 指令失败:', error);
      throw error;
    }
  }

  /**
   * 处理 /history 命令 - 查看对话历史统计
   */
  private async handleHistoryCommand(sessionId: string): Promise<string> {
    try {
      console.log(`[Gateway] 执行 /history 指令: ${sessionId}`);

      // 发送命令执行成功的消息
      const successMessage = '✅ 正在分析对话历史...';
      
      // 获取 session 文件路径
      if (!this.sessionManager) {
        return '❌ SessionManager 未初始化';
      }
      
      const sessionFilePath = this.sessionManager.getSessionFilePath(sessionId);
      
      // 🔥 自动发送一条消息给 Agent，让 Agent 分析历史
      const agentPrompt = `读取我的对话历史文件并分析：${sessionFilePath}

请回答以下问题：
1. 一共进行了多少轮对话？（1 轮 = 1 条用户消息 + 1 条 AI 回复）
2. 消耗了多少 token？（估算所有消息的 token 总数）
3. 对话的主要话题是什么？

使用 file_read 工具读取文件内容后进行分析。`;
      
      // 延迟发送，确保命令结果先显示
      setTimeout(async () => {
        try {
          // 获取或创建 Runtime
          const runtime = this.getOrCreateRuntime(sessionId);
          
          // 发送用户消息到前端
          sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
            messageId: generateUserMessageId(),
            content: agentPrompt,
            done: true,
            role: 'user',
            sessionId,
          });

          // 发送到 Agent 处理
          await this.sendAIResponse(runtime, agentPrompt, sessionId);
        } catch (error) {
          console.error('[Gateway] ❌ 自动发送历史分析失败:', error);
          this.sendError(`分析历史失败: ${getErrorMessage(error)}`, sessionId);
        }
      }, 100);

      return successMessage;
    } catch (error) {
      console.error('[Gateway] ❌ 执行 /history 指令失败:', error);
      throw error;
    }
  }
}

// ==================== Gateway 实例管理 ====================

let gatewayInstance: Gateway | null = null;

/**
 * 设置 Gateway 实例（由 index.ts 调用）
 * 
 * @param gateway - Gateway 实例
 */
export function setGlobalGatewayInstance(gateway: Gateway): void {
  gatewayInstance = gateway;
  console.info('[Gateway] 全局 Gateway 实例已设置');
}

/**
 * 获取 Gateway 实例
 * 
 * @returns Gateway 实例，如果未设置则返回 null
 */
export function getGatewayInstance(): Gateway | null {
  return gatewayInstance;
}
