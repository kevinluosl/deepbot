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
import { getErrorMessage } from '../shared/utils/error-handler';
import { sleep, waitUntil } from '../shared/utils/async-utils';
import { generateMessageId, generateUserMessageId, generateTabId, generateExecutionId } from '../shared/utils/id-generator';
import { sendToWindow } from '../shared/utils/webcontents-utils';
import { setGatewayInstance } from './tools/scheduled-task-tool';
import type { GatewayMessage } from '../types/connector';
import { ConnectorManager } from './connectors/connector-manager';
import { FeishuConnector } from './connectors/feishu/feishu-connector';

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
  private connectorTabMap: Map<string, string> = new Map(); // 连接器会话 ID -> Tab ID 映射
  
  // 消息队列（每个会话一个队列）
  private messageQueues: Map<string, Array<{ content: string; displayContent?: string }>> = new Map();
  private processingQueues: Set<string> = new Set(); // 正在处理队列的会话
  
  // 连接器管理
  private connectorManager: ConnectorManager;

  constructor() {
    console.log('Gateway 初始化');
    
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
    
    // 创建默认 Tab
    this.createDefaultTab();
    
    // 🔥 异步启动已启用的连接器（不阻塞初始化）
    this.autoStartConnectors().catch(error => {
      console.error('[Gateway] ❌ 自动启动连接器失败:', error);
    });
  }
  
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
   * 当用户修改模型配置时调用，销毁所有现有的 AgentRuntime 并重新创建
   */
  async reloadModelConfig(): Promise<void> {
    console.log('[Gateway] 🔄 重新加载模型配置...');
    
    // 销毁所有现有的 AgentRuntime
    for (const [sessionId, runtime] of this.agentRuntimes.entries()) {
      console.log(`[Gateway] 销毁会话: ${sessionId}`);
      await runtime.destroy();
    }
    
    // 清空所有 Runtime
    this.agentRuntimes.clear();
    
    console.log('[Gateway] ✅ 模型配置已重新加载，所有会话已重置');
    
    // 🔥 等待 100ms 确保数据库写入完成（WAL 模式）
    await sleep(100);
    console.log('[Gateway] ⏳ 已等待数据库同步完成');
    
    // 🔥 通知前端清空所有聊天记录
    sendToWindow(this.mainWindow, 'message:clear-all');
    console.log('[Gateway] 📤 已发送清空聊天记录事件到前端');
    
    // 🔥 发送欢迎消息到默认会话
    const { SystemConfigStore } = await import('./database/system-config-store');
    const configStore = SystemConfigStore.getInstance();
    const nameConfig = configStore.getNameConfig();
    
    const isDefaultUserName = nameConfig.userName === 'user';
    const greeting = isDefaultUserName 
      ? `你好！我是 ${nameConfig.agentName}，一个运行在桌面的 AI 助手。`
      : `你好，${nameConfig.userName}！我是 ${nameConfig.agentName}，一个运行在桌面的 AI 助手。`;
    
    const welcomeMessage = `请按照以下方式欢迎用户：

1. 说"${greeting}"
2. ${isDefaultUserName ? '告诉用户可以随时给你改名字，也可以告诉你希望怎么称呼用户，你会永久记住' : `告诉${nameConfig.userName}可以随时给你改名字，你会永久记住`}
3. 简单介绍你的能力：处理文件、浏览网页、执行命令、管理任务、创建后台任务等
4. 使用 environment_check 工具检查运行环境
5. 如果环境未配置，提醒${isDefaultUserName ? '用户' : nameConfig.userName}你可以帮助安装

不要显示计划步骤，直接执行。`;
    
    // 异步发送，不阻塞
    this.handleSendMessage(welcomeMessage, 'default').catch(error => {
      console.error('[Gateway] 发送欢迎消息失败:', error);
    });
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
  async handleSendMessage(content: string, sessionId?: string, displayContent?: string, clearHistory?: boolean): Promise<void> {
    console.log('收到消息:', content);

    // 如果没有 sessionId，使用默认会话
    const currentSessionId = sessionId || this.defaultSessionId;
    
    // 🔥 如果提供了 displayContent，先发送用户消息到前端显示
    // 这样前端会显示原始任务内容，而不是带系统前缀的完整命令
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
    
    // 获取或创建 AgentRuntime（同步）
    const runtime = this.getOrCreateRuntime(currentSessionId);
    
    // 🔥 如果需要清空历史消息（定时任务场景）
    if (clearHistory) {
      console.log('[Gateway] 🗑️ 清空历史消息（定时任务模式）');
      await runtime.clearMessageHistory();
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
        
        // 如果队列正在处理中，直接返回（避免重复处理）
        if (this.processingQueues.has(currentSessionId)) {
          console.log('[Gateway] ⏳ 队列正在处理中，等待...');
          return;
        }
        
        // 标记队列正在处理
        this.processingQueues.add(currentSessionId);
        
        // 等待当前消息完成
        console.log('[Gateway] ⏳ 等待当前消息完成...');
        const { TIMEOUTS } = await import('./config/timeouts');
        await waitUntil(
          () => !runtime.isCurrentlyGenerating(),
          { timeout: TIMEOUTS.AGENT_MESSAGE_TIMEOUT, interval: 100 }
        );
        
        // 处理队列中的消息
        await this.processMessageQueue(currentSessionId);
        
        return;
      }
    }

    try {
      // 使用 Agent Runtime 处理消息
      await this.sendAIResponse(runtime, content, currentSessionId);
      
      // 处理完成后，检查队列
      await this.processMessageQueue(currentSessionId);
    } catch (error) {
      console.error('处理消息失败:', error);
      this.sendError(getErrorMessage(error), currentSessionId);
      
      // 即使出错，也要处理队列
      await this.processMessageQueue(currentSessionId);
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
    
    // 如果提供了 displayContent，发送用户消息到前端
    if (message.displayContent && this.mainWindow) {
      const userMessageId = generateUserMessageId();
      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
        messageId: userMessageId,
        content: message.displayContent,
        done: true,
        role: 'user',
        sessionId: sessionId,
      });
      console.log('[Gateway] 📤 已发送队列消息到前端:', message.displayContent);
    }
    
    try {
      // 处理消息
      await this.sendAIResponse(runtime, message.content, sessionId);
    } catch (error) {
      console.error('[Gateway] ❌ 处理队列消息失败:', error);
      this.sendError(getErrorMessage(error), sessionId);
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
    
    // 获取 AgentRuntime
    const runtime = this.agentRuntimes.get(currentSessionId);
    
    if (runtime) {
      await runtime.stopGeneration();
    } else {
      console.warn(`[Gateway] 会话不存在: ${currentSessionId}`);
    }
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

    try {
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

      // 发送完成信号（包含最终的执行步骤）
      const finalSteps = runtime.getExecutionSteps();
      this.sendStreamChunk(messageId, '', true, false, undefined, finalSteps, sessionId);
      
      // 🔥 如果是连接器 Tab，发送响应到连接器
      const tab = this.tabs.get(sessionId);
      if (tab && tab.type === 'connector' && fullResponse.trim()) {
        console.log('[Gateway] 🔄 检测到连接器 Tab，发送响应到连接器');
        await this.sendResponseToConnector(sessionId, fullResponse);
      }
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
   */
  private sendStreamChunk(
    messageId: string,
    content: string,
    done: boolean,
    isSubAgentResult?: boolean,
    subAgentTask?: string,
    executionSteps?: any[],
    sessionId?: string
  ) {
    sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
      messageId,
      content,
      done,
      isSubAgentResult,
      subAgentTask,
      executionSteps,
      sessionId, // 添加 sessionId
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
    
    // 销毁所有 AgentRuntime
    for (const [sessionId, runtime] of this.agentRuntimes.entries()) {
      console.info(`[Gateway] 销毁 AgentRuntime: ${sessionId}`);
      void runtime.destroy();
    }
    
    // 清空 Map
    this.agentRuntimes.clear();
    
    console.info('[Gateway] Gateway 已销毁');
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
   * 创建默认 Tab
   */
  private createDefaultTab(): void {
    const defaultTab: AgentTab = {
      id: 'default',
      title: 'Agent 1',
      messages: [],
      isLoading: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    
    this.tabs.set('default', defaultTab);
    console.log('[Gateway] 创建默认 Tab:', defaultTab.id);
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
  }): Promise<AgentTab> {
    // 检查 Tab 数量限制
    if (this.tabs.size >= this.MAX_TABS) {
      throw new Error(`最多只能创建 ${this.MAX_TABS} 个窗口`);
    }
    
    // 生成唯一的 Tab ID
    this.tabIdCounter++;
    const tabId = generateTabId(this.tabIdCounter);
    
    // 生成默认标题
    const tabTitle = options.title || `Agent ${this.tabCounter + 1}`;
    this.tabCounter++;
    
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
    };
    
    this.tabs.set(tabId, tab);
    console.log('[Gateway] 创建新 Tab:', tabId, tabTitle, options.type);
    
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
    const runtime = this.agentRuntimes.get(tabId);
    if (runtime) {
      await runtime.destroy();
      this.agentRuntimes.delete(tabId);
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
      
      // displayContent: 前端显示的内容（带发送者信息）
      const displayContent = `[来自: ${senderName}]\n${content}`;
      
      // 为连接器会话添加提示词，让 Agent 知道这是外部通讯会话
      const contentWithHint = `${content}\n\n[系统提示: 这是外部通讯会话，你可以使用 connector_send_image 和 connector_send_file 工具发送图片和文件]`;
      
      await this.handleSendMessage(contentWithHint, tab.id, displayContent);
      
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
