/**
 * Gateway 主入口 - 会话管理和消息路由（重构版）
 * 
 * 职责：
 * - 协调各个子模块
 * - 管理会话生命周期
 * - 路由消息到 Agent Runtime
 * - 处理流式响应
 */

import { BrowserWindow } from 'electron';
import { AgentRuntime } from './agent-runtime/index';
import { setGatewayInstance } from './tools/scheduled-task-tool';
import { ConnectorManager } from './connectors/connector-manager';
import { FeishuConnector } from './connectors/feishu/feishu-connector';

// 导入子模块
import { TabManager } from './gateway/tab-manager';
import { RuntimeManager } from './gateway/runtime-manager';
import { MessageHandler } from './gateway/message-handler';
import { ConnectorHandler } from './gateway/connector-handler';
import { ConfigManager } from './gateway/config-manager';
import { CommandHandler } from './gateway/command-handler';

// 导入类型
import type { GatewayMessage } from '../types/connector';
import type { AgentTab } from '../types/agent-tab';
import type { CreateTabOptions, ResetRuntimeOptions } from './gateway/types';

export class Gateway {
  private mainWindow: BrowserWindow | null = null;
  private defaultSessionId: string = 'default';
  
  // 子模块
  private tabManager: TabManager;
  private runtimeManager: RuntimeManager;
  private messageHandler: MessageHandler;
  private connectorHandler: ConnectorHandler;
  private configManager: ConfigManager;
  private commandHandler: CommandHandler;
  
  // 连接器管理
  private connectorManager: ConnectorManager;

  constructor() {
    // 初始化连接器管理
    this.connectorManager = new ConnectorManager(this);
    
    // 初始化子模块
    this.tabManager = new TabManager(this.mainWindow);
    this.runtimeManager = new RuntimeManager();
    this.messageHandler = new MessageHandler(this.mainWindow);
    this.connectorHandler = new ConnectorHandler(this.connectorManager);
    this.configManager = new ConfigManager();
    this.commandHandler = new CommandHandler(this.mainWindow);
    
    // 注册飞书连接器
    const feishuConnector = new FeishuConnector(this.connectorManager);
    this.connectorManager.registerConnector(feishuConnector);
    console.log('[Gateway] ✅ 飞书连接器已注册');
    
    // 设置工具实例
    this.setupToolInstances();
    
    // 创建默认 Tab
    this.tabManager.createDefaultTab();
    
    // 异步初始化（不阻塞启动）
    this.asyncInitialization();
  }

  // ==================== 初始化方法 ====================

  /**
   * 设置工具实例
   */
  private setupToolInstances(): void {
    setGatewayInstance(this);
    
    const { setGatewayForMemoryTool } = require('../tools/memory-tool');
    setGatewayForMemoryTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Memory Tool');
    
    const { setGatewayForConnectorTool } = require('../tools/connector-tool');
    setGatewayForConnectorTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Connector Tool');
    
    const { setGatewayForCrossTabCallTool } = require('../tools/cross-tab-call-tool');
    setGatewayForCrossTabCallTool(this);
    console.info('[Gateway] Gateway 实例已传递给 Cross Tab Call Tool');
  }
  /**
   * 异步初始化
   */
  private async asyncInitialization(): Promise<void> {
    try {
      // 初始化 SessionManager
      await this.configManager.initializeSessionManager();
      
      // 加载持久化的 Tab
      await this.tabManager.loadPersistentTabs(this.configManager.getSessionManager());
      
      // 自动启动已启用的连接器
      await this.connectorHandler.autoStartConnectors();
      
      // 加载默认 Tab 历史消息
      await this.tabManager.loadDefaultTabHistory(
        this.configManager.getSessionManager(),
        () => this.commandHandler.sendWelcomeMessage(this.configManager.getSessionManager())
      );
    } catch (error) {
      console.error('[Gateway] ❌ 异步初始化失败:', error);
    }
  }

  // ==================== 配置重新加载方法 ====================

  /**
   * 重新加载模型配置
   */
  async reloadModelConfig(): Promise<void> {
    await this.configManager.reloadModelConfig(
      () => this.runtimeManager.destroyAllRuntimes(),
      () => this.commandHandler.checkAndSendWelcomeMessage(this.configManager.getSessionManager())
    );
  }

  /**
   * 重新加载工作目录配置
   */
  async reloadWorkspaceConfig(): Promise<void> {
    await this.configManager.reloadWorkspaceConfig(
      () => this.runtimeManager.destroyAllRuntimes()
    );
  }

  /**
   * 重新加载 SessionManager
   */
  async reloadSessionManager(): Promise<void> {
    await this.configManager.reloadSessionManager();
  }

  /**
   * 重新加载系统提示词
   */
  async reloadSystemPrompts(): Promise<void> {
    await this.configManager.reloadSystemPrompts(
      () => this.runtimeManager['agentRuntimes'] // 访问私有属性
    );
  }

  /**
   * 重新加载单个会话的系统提示词
   */
  async reloadSessionSystemPrompt(sessionId: string): Promise<void> {
    await this.configManager.reloadSessionSystemPrompt(
      sessionId,
      (sessionId: string) => this.runtimeManager.getAgentRuntime(sessionId)
    );
  }

  // ==================== 基础方法 ====================

  /**
   * 设置主窗口
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
    // 更新子模块的 mainWindow 引用
    this.tabManager.setMainWindow(window);
    this.messageHandler.setMainWindow(window);
    this.commandHandler.setMainWindow(window);
  }

  /**
   * 检查会话是否正在执行
   */
  isSessionExecuting(sessionId: string): boolean {
    return this.runtimeManager.isSessionExecuting(sessionId);
  }

  // ==================== 消息处理方法 ====================

  /**
   * 处理发送消息请求
   */
  async handleSendMessage(
    content: string,
    sessionId?: string,
    displayContent?: string,
    clearHistory?: boolean,
    skipHistory?: boolean
  ): Promise<void> {
    const currentSessionId = sessionId || this.defaultSessionId;
    
    // 检查是否是系统命令
    const commandMatch = content.trim().match(/^\/(\w+)(?:\s+(.*))?$/);
    if (commandMatch) {
      const [, commandName, commandArgs] = commandMatch;
      
      const supportedCommands = ['new', 'memory', 'history'];
      
      if (supportedCommands.includes(commandName.toLowerCase())) {
        console.log(`[Gateway] 🎯 检测到系统命令: /${commandName}，直接执行`);
        await this.commandHandler.executeSystemCommand(
          commandName,
          commandArgs,
          currentSessionId,
          this.configManager.getSessionManager(),
          (sessionId: string, options?: any) => this.runtimeManager.resetSessionRuntime(sessionId, options),
          (sessionId: string) => this.runtimeManager.getOrCreateRuntime(sessionId),
          (runtime: any, message: string, sessionId: string) => this.messageHandler.sendAIResponse(runtime, message, sessionId, this.configManager.getSessionManager())
        );
        return;
      }
    }
    
    // 更新 Tab 活跃时间
    this.tabManager.updateTabActivity(currentSessionId);
    
    // 获取或创建 Runtime
    const runtime = this.runtimeManager.getOrCreateRuntime(currentSessionId);
    
    // 使用 MessageHandler 处理消息
    await this.messageHandler.handleSendMessage(
      content,
      currentSessionId,
      displayContent,
      clearHistory,
      skipHistory,
      runtime,
      this.configManager.getSessionManager()
    );
  }
  /**
   * 处理停止生成请求
   */
  async handleStopGeneration(sessionId?: string): Promise<void> {
    console.log('收到停止生成请求');

    const currentSessionId = sessionId || this.defaultSessionId;
    
    await this.runtimeManager.resetSessionRuntime(currentSessionId, {
      reason: '用户点击 Stop 按钮',
      recreate: false
    });
  }

  // ==================== Tab 管理方法 ====================

  /**
   * 创建新 Tab
   */
  async createTab(options: CreateTabOptions): Promise<AgentTab> {
    return await this.tabManager.createTab(options);
  }

  /**
   * 获取或创建任务专属 Tab
   */
  getOrCreateTaskTab(taskId: string, taskName: string): AgentTab {
    return this.tabManager.getOrCreateTaskTab(taskId, taskName);
  }

  /**
   * 关闭 Tab
   */
  async closeTab(tabId: string): Promise<void> {
    // 销毁对应的 AgentRuntime
    await this.runtimeManager.destroySessionRuntime(tabId);
    
    // 委托给 TabManager
    await this.tabManager.closeTab(tabId, this.configManager.getSessionManager());
  }

  /**
   * 获取所有 Tab
   */
  getAllTabs(): AgentTab[] {
    return this.tabManager.getAllTabs();
  }

  /**
   * 更新 Tab 的最后活跃时间
   */
  updateTabActivity(tabId: string): void {
    this.tabManager.updateTabActivity(tabId);
  }

  // ==================== 连接器相关方法 ====================

  /**
   * 处理连接器消息
   */
  async handleConnectorMessage(message: GatewayMessage): Promise<void> {
    await this.connectorHandler.handleConnectorMessage(
      message,
      (key: string) => this.tabManager.findTabByConversationKey(key),
      (options: CreateTabOptions) => this.tabManager.createTab(options),
      (content: string, sessionId: string, displayContent?: string) => this.handleSendMessage(content, sessionId, displayContent)
    );
  }

  /**
   * 发送响应到连接器
   */
  async sendResponseToConnector(tabId: string, response: string): Promise<void> {
    await this.connectorHandler.sendResponseToConnector(
      tabId,
      response,
      (tabId: string) => this.tabManager.getTab(tabId)
    );
  }

  // ==================== 其他方法 ====================

  /**
   * 处理 Skill Manager 请求
   */
  async handleSkillManagerRequest(request: any): Promise<any> {
    return await this.commandHandler.handleSkillManagerRequest(
      request,
      (sessionId: string) => this.runtimeManager.getOrCreateRuntime(sessionId)
    );
  }

  /**
   * 获取活跃会话数量
   */
  getActiveSessionCount(): number {
    return this.runtimeManager.getActiveSessionCount();
  }

  /**
   * 获取所有会话 ID
   */
  getSessionIds(): string[] {
    return this.runtimeManager.getSessionIds();
  }

  /**
   * 获取 ConnectorManager 实例
   */
  getConnectorManager(): ConnectorManager {
    return this.connectorManager;
  }

  /**
   * 获取 SessionManager 实例
   */
  getSessionManager() {
    return this.configManager.getSessionManager();
  }

  /**
   * 获取指定会话的 AgentRuntime 实例
   */
  getAgentRuntime(sessionId?: string) {
    return this.runtimeManager.getAgentRuntime(sessionId);
  }

  /**
   * 重置会话运行时
   */
  async resetSessionRuntime(sessionId: string, options?: ResetRuntimeOptions): Promise<any> {
    return await this.runtimeManager.resetSessionRuntime(sessionId, options);
  }

  /**
   * 销毁 Gateway 并清理所有资源
   */
  destroy(): void {
    console.info('[Gateway] 开始销毁 Gateway...');
    this.runtimeManager.destroy();
    console.info('[Gateway] Gateway 已销毁');
  }
}

// ==================== Gateway 实例管理 ====================

let gatewayInstance: Gateway | null = null;

/**
 * 设置 Gateway 实例（由 index.ts 调用）
 */
export function setGlobalGatewayInstance(gateway: Gateway): void {
  gatewayInstance = gateway;
  console.info('[Gateway] 全局 Gateway 实例已设置');
}

/**
 * 获取 Gateway 实例
 */
export function getGatewayInstance(): Gateway | null {
  return gatewayInstance;
}