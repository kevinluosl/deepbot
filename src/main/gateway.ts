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
import { setLoadingStatusWindow } from './utils/loading-status';
import type { GatewayMessage } from '../types/connector';
import { ConnectorManager } from './connectors/connector-manager';
import { FeishuConnector } from './connectors/feishu/feishu-connector';
import { SessionManager } from './session/session-manager';
import { GatewayTabManager } from './gateway-tab';
import { GatewayConnectorHandler } from './gateway-connector';
import { GatewayMessageHandler } from './gateway-message';

export class Gateway {
  private mainWindow: BrowserWindow | null = null;
  private agentRuntimes: Map<string, AgentRuntime> = new Map(); // 每个 Tab 一个 Runtime
  private defaultSessionId: string = 'default'; // 默认会话 ID
  private isWebMode: boolean = false; // 是否为 Web 模式
  
  // Tab 管理器
  private tabManager: GatewayTabManager;
  
  // 连接器处理器
  private connectorHandler: GatewayConnectorHandler;
  
  // 消息处理器
  private messageHandler: GatewayMessageHandler;
  
  // 连接器管理
  private connectorManager: ConnectorManager;
  
  // Session 管理
  private sessionManager: SessionManager | null = null;

  // 延迟 AgentRuntime 重置标志
  private pendingRuntimeReset: boolean = false;

  constructor() {
    // 初始化 Tab 管理器
    this.tabManager = new GatewayTabManager();
    
    // 初始化连接器处理器
    this.connectorHandler = new GatewayConnectorHandler();
    
    // 初始化消息处理器
    this.messageHandler = new GatewayMessageHandler();
    
    // 初始化 SessionManager（异步）
    this.initializeSessionManager().catch(error => {
      console.error('[Gateway] ❌ 初始化 SessionManager 失败:', error);
    });
    
    // 初始化 ConnectorManager
    this.connectorManager = new ConnectorManager(this);
    
    // 注册飞书连接器
    const feishuConnector = new FeishuConnector(this.connectorManager);
    this.connectorManager.registerConnector(feishuConnector);
    console.log('[Gateway] ✅ 飞书连接器已注册');

    // 注册微信连接器（从数据库恢复已有实例，没有则创建默认实例）
    const { WechatConnector } = require('./connectors/wechat/wechat-connector');
    const { SystemConfigStore: ConfigStore } = require('./database/system-config-store');
    const store = ConfigStore.getInstance();
    const allConnectorConfigs = store.getAllConnectorConfigs();
    const wechatConfigs = allConnectorConfigs.filter((c: any) => c.connectorId.startsWith('wechat'));
    
    if (wechatConfigs.length > 0) {
      // 恢复已有的微信实例
      for (const cfg of wechatConfigs) {
        // 兼容旧数据：id 为 'wechat' 的迁移为 'wechat-1'
        let instanceId = cfg.connectorId;
        if (instanceId === 'wechat') {
          instanceId = 'wechat-1';
          // 迁移数据库：删除旧配置，以新 id 重新保存
          store.deleteConnectorConfig('wechat');
          store.saveConnectorConfig('wechat-1', '微信 1', cfg.config, cfg.enabled);
          // 迁移已有 Tab 的 connectorId
          this.migrateTabConnectorId('wechat', 'wechat-1');
          console.log('[Gateway] 🔄 已迁移旧微信配置: wechat → wechat-1');
        }
        const wc = new WechatConnector(this.connectorManager, instanceId);
        this.connectorManager.registerConnector(wc);
        console.log(`[Gateway] ✅ 微信连接器已恢复: ${instanceId}`);
      }
    } else {
      // 首次启动，创建默认实例
      const wechatConnector = new WechatConnector(this.connectorManager, 'wechat-1');
      this.connectorManager.registerConnector(wechatConnector);
      console.log('[Gateway] ✅ 微信连接器已注册: wechat-1');
    }
    
    // 设置 Gateway 实例供 scheduled-task-tool 使用
    setGatewayInstance(this);
    
    // 设置 Gateway 实例供 memory-tool 使用
    const { setGatewayForMemoryTool } = require('./tools/memory-tool');
    setGatewayForMemoryTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Memory Tool');
    
    // 设置 Gateway 实例供 connector-tool 使用
    const { setGatewayForConnectorTool } = require('./tools/connector-tool');
    setGatewayForConnectorTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Connector Tool');

    // 设置 Gateway 实例供 wechat-tool 使用
    const { setGatewayForWechatTool } = require('./tools/wechat-tool');
    setGatewayForWechatTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Wechat Tool');
    
    // 设置 configStore 供飞书云文档工具使用
    const { setConfigStoreForFeishuDocTool } = require('./tools/feishu-doc-tool');
    const { SystemConfigStore: FeishuDocConfigStore } = require('./database/system-config-store');
    setConfigStoreForFeishuDocTool(FeishuDocConfigStore.getInstance());
    console.info('[Gateway] configStore 已传递给 Feishu Doc Tool');
    
    // 设置 Gateway 实例供 cross-tab-call-tool 使用
    const { setGatewayForCrossTabCallTool } = require('./tools/cross-tab-call-tool');
    setGatewayForCrossTabCallTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Cross Tab Call Tool');
    
    // 创建默认 Tab
    this.tabManager.createDefaultTab();
    
    // 异步加载持久化的 Tab（不阻塞初始化）
    this.tabManager.loadPersistentTabs().catch(error => {
      console.error('[Gateway] ❌ 加载持久化 Tab 失败:', error);
    });
    
    // 异步启动已启用的连接器（不阻塞初始化）
    this.autoStartConnectors().catch(error => {
      console.error('[Gateway] ❌ 自动启动连接器失败:', error);
    });
    
    // AI 连接将在首次调用时自动建立和缓存
  }
  
  /**
   * 加载 Tab 历史消息
   * 
   * @param tabId - Tab ID
   * @param isActiveTab - 是否是当前激活的 Tab（激活的 Tab 立即加载，其他延迟加载）
   */
  private async loadTabHistory(tabId: string, isActiveTab: boolean = false): Promise<void> {
    await this.tabManager.loadTabHistory(tabId, isActiveTab);
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
      
      // 更新到 Tab 管理器、连接器处理器和消息处理器
      this.tabManager.setSessionManager(this.sessionManager);
      this.connectorHandler.setSessionManager(this.sessionManager);
      this.messageHandler.setSessionManager(this.sessionManager);
      
      console.log('[Gateway] ✅ SessionManager 已初始化');
    } catch (error) {
      console.error('[Gateway] ❌ 初始化 SessionManager 失败:', getErrorMessage(error));
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
    
    // 检查是否需要发送欢迎消息（首次配置模型的场景）
    this.tabManager.checkAndSendWelcomeMessage().catch(error => {
      console.error('[Gateway] ❌ 检查欢迎消息失败:', getErrorMessage(error));
    });
  }

  /**
   * 重新加载工具配置（禁用/启用工具）
   * 
   * 当用户修改工具禁用配置时调用，销毁所有现有的 AgentRuntime（下次使用时用新工具列表重新创建）
   */
  async reloadToolConfig(): Promise<void> {
    console.log('[Gateway] 🔄 重新加载工具配置...');
    this.destroyAllRuntimes();
    console.log('[Gateway] ✅ 工具配置已重新加载，AgentRuntime 已重置');
  }

  /**
   * 标记需要在当前执行完成后重置 AgentRuntime
   * 供工具调用或其他操作使用，避免中断正在进行的任务
   */
  markPendingRuntimeReset(): void {
    this.pendingRuntimeReset = true;
    console.log('[Gateway] 🏷️ 已标记延迟 AgentRuntime 重置');
  }

  /**
   * 检查并执行延迟的 AgentRuntime 重置
   * 在每次 Agent 执行完成后调用
   */
  async checkAndApplyPendingReset(): Promise<void> {
    if (!this.pendingRuntimeReset) return;
    this.pendingRuntimeReset = false;
    console.log('[Gateway] 🔄 执行延迟 AgentRuntime 重置...');
    this.destroyAllRuntimes();
    console.log('[Gateway] ✅ 延迟 AgentRuntime 重置完成');
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
   * 标记所有会话的系统提示词需要重建（下次发消息时自动重新组装）
   */
  invalidateAllSystemPrompts(): void {
    for (const [sessionId, runtime] of this.agentRuntimes.entries()) {
      runtime.invalidateSystemPrompt();
    }
    console.log(`[Gateway] 已标记 ${this.agentRuntimes.size} 个会话的系统提示词需要重建`);
  }

  /**
   * 标记单个会话的系统提示词需要重建
   */
  invalidateSessionSystemPrompt(sessionId: string): void {
    const runtime = this.agentRuntimes.get(sessionId);
    if (runtime) {
      runtime.invalidateSystemPrompt();
    }
  }


  /**
   * 设置所有处理器的依赖（统一的依赖注入逻辑）
   * 
   * @param window - BrowserWindow 或虚拟窗口对象
   * @param options - 额外选项
   */
  private setupHandlerDependencies(window: any, options: { getIsWebMode?: () => boolean } = {}): void {
    // 设置 Tab 管理器的依赖
    this.tabManager.setDependencies({
      mainWindow: window,
      sessionManager: this.sessionManager,
      handleSendMessage: this.handleSendMessage.bind(this),
      destroySessionRuntime: this.destroySessionRuntime.bind(this),
      getIsWebMode: options.getIsWebMode,
    });
    
    // 设置连接器处理器的依赖
    this.connectorHandler.setDependencies({
      mainWindow: window,
      connectorManager: this.connectorManager,
      tabManager: this.tabManager,
      sessionManager: this.sessionManager,
      handleSendMessage: this.handleSendMessage.bind(this),
      getOrCreateRuntime: this.getOrCreateRuntime.bind(this),
      sendAIResponse: (runtime, content, sessionId, sentAt) => {
        return this.messageHandler.handleSendMessage(content, sessionId, undefined, false, false);
      },
      sendError: (error, sessionId) => {
        this.messageHandler.sendError(error, sessionId);
      },
      resetSessionRuntime: this.resetSessionRuntime.bind(this),
      executeSystemCommand: this.executeSystemCommand.bind(this),
    });
    
    // 设置消息处理器的依赖
    this.messageHandler.setDependencies({
      mainWindow: window,
      sessionManager: this.sessionManager,
      getOrCreateRuntime: this.getOrCreateRuntime.bind(this),
      resetSessionRuntime: this.resetSessionRuntime.bind(this),
      executeSystemCommand: this.executeSystemCommand.bind(this),
      sendResponseToConnector: this.sendResponseToConnector.bind(this),
    });
  }

  /**
   * 设置主窗口
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
    setLoadingStatusWindow(window);
    this.setupHandlerDependencies(window);
  }

  /**
   * Web 模式初始化（无需 BrowserWindow）
   * 
   * 在 Web 模式下，我们不需要 BrowserWindow，但仍需要设置各个处理器的依赖
   * 
   * @param virtualWindow 虚拟窗口对象（由 GatewayAdapter 提供）
   */
  async initializeForWebMode(virtualWindow: any): Promise<void> {
    // 标记为 Web 模式
    this.isWebMode = true;
    
    // 等待 SessionManager 初始化完成
    const { TIMEOUTS } = await import('./config/timeouts');
    await waitUntil(() => this.sessionManager !== null, { timeout: TIMEOUTS.SESSION_MANAGER_INIT_TIMEOUT });
    
    // 使用虚拟窗口（而不是 null）
    this.mainWindow = virtualWindow;
    setLoadingStatusWindow(virtualWindow);
    
    // 设置所有处理器的依赖（传入 Web 模式状态）
    this.setupHandlerDependencies(virtualWindow, {
      getIsWebMode: () => this.isWebMode
    });
    
    console.log('[Gateway] ✅ Web 模式初始化完成');
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
      
      // 获取 tab 级别的模型覆盖配置
      const tabConfig = store.getTabConfig(sessionId);
      const modelConfigOverride = tabConfig?.modelConfig || undefined;
      
      runtime = new AgentRuntime(workspaceDir, sessionId, modelConfigOverride);
      
      this.agentRuntimes.set(sessionId, runtime);
    }
    
    return runtime;
  }

  /**
   * 处理发送消息请求（代理到 messageHandler）
   */
  async handleSendMessage(content: string, sessionId?: string, displayContent?: string, clearHistory?: boolean, skipHistory?: boolean): Promise<void> {
    const currentSessionId = sessionId || this.defaultSessionId;
    await this.messageHandler.handleSendMessage(content, currentSessionId, displayContent, clearHistory, skipHistory);
  }
  
  /**
   * 处理停止生成请求（代理到 messageHandler）
   */
  async handleStopGeneration(sessionId?: string): Promise<void> {
    const currentSessionId = sessionId || this.defaultSessionId;
    await this.messageHandler.handleStopGeneration(currentSessionId, this.resetSessionRuntime.bind(this));
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
    
    // destroy() 内部已包含 stopGeneration()，直接销毁即可
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
   * 创建新 Tab（代理到 tabManager）
   */
  async createTab(options: {
    type?: 'normal' | 'connector' | 'scheduled_task';
    title?: string;
    conversationKey?: string;
    connectorId?: string;
    conversationId?: string;
    taskId?: string;
    memoryFile?: string | null;
    agentName?: string | null;
    isPersistent?: boolean;
  }): Promise<AgentTab> {
    return await this.tabManager.createTab(options);
  }
  
  /**
   * 关闭 Tab（代理到 tabManager）
   */
  async closeTab(tabId: string): Promise<void> {
    await this.tabManager.closeTab(tabId);
  }
  
  /**
   * 获取或创建任务专属 Tab（代理到 tabManager）
   */
  getOrCreateTaskTab(taskId: string, taskName: string): AgentTab {
    return this.tabManager.getOrCreateTaskTab(taskId, taskName);
  }
  
  /**
   * 获取所有 Tab
   * 
   * @returns Tab 列表
   */
  getAllTabs(): AgentTab[] {
    return this.tabManager.getAllTabs();
  }
  
  /**
   * 更新 Tab 的最后活跃时间
   * 
   * @param tabId - Tab ID
   */
  updateTabActivity(tabId: string): void {
    this.tabManager.updateTabActivity(tabId);
  }
  
  // ========== 连接器相关方法 ==========
  
  /**
   * 处理连接器消息
   * 
   * @param message - Gateway 消息
   */
  async handleConnectorMessage(message: GatewayMessage): Promise<void> {
    await this.connectorHandler.handleConnectorMessage(message);
  }
  
  /**
   * 发送响应到连接器
   * 
   * @param tabId - Tab ID
   * @param response - 响应内容
   */
  async sendResponseToConnector(tabId: string, response: string): Promise<void> {
    await this.connectorHandler.sendResponseToConnector(tabId, response);
  }
  
  /**
   * 查找 Tab（基于 conversationKey）
   * 
   * @param key - 会话 Key
   * @returns Tab 或 null
   */
  private findTabByConversationKey(key: string): AgentTab | null {
    return this.tabManager.findTabByConversationKey(key);
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
   * 获取 TabManager 实例
   * 
   * @returns GatewayTabManager
   */
  getTabManager(): GatewayTabManager {
    return this.tabManager;
  }

  /**
   * 获取主窗口（Electron 模式为 BrowserWindow，Web 模式为虚拟窗口）
   */
  getMainWindow(): any {
    return this.mainWindow;
  }

  /**
   * 迁移 Tab 中的 connectorId（旧 id → 新 id）
   * 同时更新数据库和内存中的 Tab 数据
   */
  private migrateTabConnectorId(oldId: string, newId: string): void {
    try {
      // 更新数据库
      const { SystemConfigStore: ConfigStore } = require('./database/system-config-store');
      const db = ConfigStore.getInstance().getDb();
      const stmt = db.prepare('UPDATE agent_tabs SET connector_id = ? WHERE connector_id = ?');
      const result = stmt.run(newId, oldId);
      if (result.changes > 0) {
        console.log(`[Gateway] 🔄 已迁移 ${result.changes} 个 Tab 的 connectorId: ${oldId} → ${newId}`);
      }

      // 更新内存中的 Tab
      const allTabs = this.tabManager.getAllTabs();
      for (const tab of allTabs) {
        if (tab.connectorId === oldId) {
          tab.connectorId = newId;
          // conversationKey 也需要更新
          if (tab.conversationKey?.startsWith(`${oldId}_`)) {
            tab.conversationKey = tab.conversationKey.replace(`${oldId}_`, `${newId}_`);
          }
        }
      }
    } catch (error) {
      console.error(`[Gateway] ❌ 迁移 Tab connectorId 失败:`, error);
    }
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
  private async executeSystemCommand(commandName: string, commandArgs: string | undefined, sessionId: string): Promise<string> {
    return await this.connectorHandler.executeSystemCommand(commandName, commandArgs, sessionId);
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
