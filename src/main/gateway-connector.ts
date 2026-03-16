/**
 * Gateway Connector Handler - 连接器和系统命令处理
 * 
 * 职责：
 * - 处理连接器消息
 * - 发送响应到连接器
 * - 执行系统命令（/new、/memory、/history）
 */

import { BrowserWindow } from 'electron';
import type { GatewayMessage } from '../types/connector';
import type { AgentTab } from '../types/agent-tab';
import { IPC_CHANNELS } from '../types/ipc';
import { getErrorMessage } from '../shared/utils/error-handler';
import { generateMessageId, generateUserMessageId } from '../shared/utils/id-generator';
import { sendToWindow } from '../shared/utils/webcontents-utils';
import type { SessionManager } from './session/session-manager';
import type { AgentRuntime } from './agent-runtime/index';
import type { ConnectorManager } from './connectors/connector-manager';
import type { GatewayTabManager } from './gateway-tab';

/**
 * Connector Handler 类
 */
export class GatewayConnectorHandler {
  private mainWindow: BrowserWindow | null = null;
  private connectorManager: ConnectorManager | null = null;
  private tabManager: GatewayTabManager | null = null;
  private sessionManager: SessionManager | null = null;
  
  // 回调函数
  private handleSendMessageFn: ((content: string, sessionId?: string, displayContent?: string, clearHistory?: boolean, skipHistory?: boolean) => Promise<void>) | null = null;
  private getOrCreateRuntimeFn: ((sessionId: string) => AgentRuntime) | null = null;
  private sendAIResponseFn: ((runtime: AgentRuntime, message: string, sessionId: string, sentAt?: number) => Promise<void>) | null = null;
  private sendErrorFn: ((error: string, sessionId?: string) => void) | null = null;
  private resetSessionRuntimeFn: ((sessionId: string, options: { reason?: string; recreate?: boolean }) => Promise<AgentRuntime | null>) | null = null;
  
  constructor() {}
  
  /**
   * 设置依赖
   */
  setDependencies(deps: {
    mainWindow: BrowserWindow;
    connectorManager: ConnectorManager;
    tabManager: GatewayTabManager;
    sessionManager: SessionManager | null;
    handleSendMessage: (content: string, sessionId?: string, displayContent?: string, clearHistory?: boolean, skipHistory?: boolean) => Promise<void>;
    getOrCreateRuntime: (sessionId: string) => AgentRuntime;
    sendAIResponse: (runtime: AgentRuntime, message: string, sessionId: string, sentAt?: number) => Promise<void>;
    sendError: (error: string, sessionId?: string) => void;
    resetSessionRuntime: (sessionId: string, options: { reason?: string; recreate?: boolean }) => Promise<AgentRuntime | null>;
  }): void {
    this.mainWindow = deps.mainWindow;
    this.connectorManager = deps.connectorManager;
    this.tabManager = deps.tabManager;
    this.sessionManager = deps.sessionManager;
    this.handleSendMessageFn = deps.handleSendMessage;
    this.getOrCreateRuntimeFn = deps.getOrCreateRuntime;
    this.sendAIResponseFn = deps.sendAIResponse;
    this.sendErrorFn = deps.sendError;
    this.resetSessionRuntimeFn = deps.resetSessionRuntime;
  }
  
  /**
   * 设置 SessionManager
   */
  setSessionManager(sessionManager: SessionManager | null): void {
    this.sessionManager = sessionManager;
  }
  
  /**
   * 处理连接器消息
   */
  async handleConnectorMessage(message: GatewayMessage): Promise<void> {
    if (!this.tabManager || !this.handleSendMessageFn) {
      console.error('[ConnectorHandler] 依赖未设置');
      return;
    }
    
    console.log('[ConnectorHandler] 处理连接器消息:', {
      connectorId: message.source.connectorId,
      conversationId: message.source.conversationId,
      senderId: message.source.senderId,
      senderName: message.source.senderName,
    });
    
    try {
      // 查找或创建 Tab
      const conversationKey = `${message.source.connectorId}_${message.source.conversationId}`;
      let tab = this.tabManager.findTabByConversationKey(conversationKey);
      
      if (!tab) {
        const title = message.source.connectorId;
        tab = await this.tabManager.createTab({
          type: 'connector',
          title,
          conversationKey,
          connectorId: message.source.connectorId,
          conversationId: message.source.conversationId,
        });
        
        console.log('[ConnectorHandler] 创建连接器 Tab:', {
          tabId: tab.id,
          title,
          conversationKey,
        });
      }
      
      // 发送消息给 Agent 处理
      const content = message.content.text || '';
      const senderName = message.source.senderName || '用户';
      const displayContent = content;
      const contentWithSource = `[来自: ${senderName}]\n${content}`;
      const systemHint = `\n\n[系统提示: 这是外部通讯会话。
你可以使用 connector_send_image 和 connector_send_file 工具发送图片和文件]`;
      const contentForAgent = contentWithSource + systemHint;
      
      await this.handleSendMessageFn(contentForAgent, tab.id, displayContent);
      console.log('[ConnectorHandler] ✅ 连接器消息已处理');
    } catch (error) {
      console.error('[ConnectorHandler] ❌ 处理连接器消息失败:', error);
      throw error;
    }
  }
  
  /**
   * 发送响应到连接器
   */
  async sendResponseToConnector(tabId: string, response: string): Promise<void> {
    if (!this.tabManager || !this.connectorManager) {
      console.error('[ConnectorHandler] 依赖未设置');
      return;
    }
    
    const tab = this.tabManager.getTab(tabId);
    if (!tab || tab.type !== 'connector') {
      console.log('[ConnectorHandler] Tab 不是连接器类型，跳过发送');
      return;
    }
    
    if (!tab.connectorId || !tab.conversationId) {
      console.error('[ConnectorHandler] Tab 缺少连接器信息');
      return;
    }
    
    console.log('[ConnectorHandler] 发送响应到连接器:', {
      tabId,
      connectorId: tab.connectorId,
      conversationId: tab.conversationId,
      responseLength: response.length,
    });
    
    try {
      await this.connectorManager.sendOutgoingMessage(
        tab.connectorId as any,
        tab.conversationId,
        response
      );
      console.log('[ConnectorHandler] ✅ 响应已发送到连接器');
    } catch (error) {
      console.error('[ConnectorHandler] ❌ 发送响应到连接器失败:', error);
      throw error;
    }
  }
  
  /**
   * 执行系统命令
   */
  async executeSystemCommand(commandName: string, commandArgs: string | undefined, sessionId: string): Promise<void> {
    if (!this.sendErrorFn) {
      console.error('[ConnectorHandler] sendError 未设置');
      return;
    }
    
    const messageId = generateMessageId();
    
    try {
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

      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
        messageId,
        content: resultText,
        done: true,
        sessionId,
      });

    } catch (error) {
      console.error(`[ConnectorHandler] ❌ 执行系统命令失败: /${commandName}`, error);
      this.sendErrorFn(`执行命令失败: ${getErrorMessage(error)}`, sessionId);
    }
  }
  
  /**
   * 处理 /new 命令
   */
  private async handleNewCommand(sessionId: string): Promise<string> {
    if (!this.resetSessionRuntimeFn) {
      throw new Error('resetSessionRuntime 未设置');
    }
    
    try {
      console.log(`[ConnectorHandler] 执行 /new 指令，清空会话: ${sessionId}`);

      // 清空 session 历史文件
      if (this.sessionManager) {
        await this.sessionManager.clearSession(sessionId);
        console.log(`[ConnectorHandler] ✅ 会话历史已清空: ${sessionId}`);
      }

      // 重置 Runtime
      await this.resetSessionRuntimeFn(sessionId, {
        reason: '/new 指令清空会话',
        recreate: false
      });
      console.log(`[ConnectorHandler] ✅ AgentRuntime 已重置，上下文已清除`);

      // 通知前端清空 UI
      sendToWindow(this.mainWindow, 'command:clear-chat', { sessionId });
      console.log(`[ConnectorHandler] ✅ 已通知前端清空 UI`);

      return '✅ 已清空会话历史，开始新对话';
    } catch (error) {
      console.error('[ConnectorHandler] ❌ 执行 /new 指令失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理 /memory 命令
   */
  private async handleMemoryCommand(sessionId: string): Promise<string> {
    if (!this.getOrCreateRuntimeFn || !this.sendAIResponseFn || !this.sendErrorFn) {
      throw new Error('依赖未设置');
    }
    
    try {
      console.log(`[ConnectorHandler] 执行 /memory 指令: ${sessionId}`);

      const successMessage = '✅ 正在查询记忆系统...';
      const agentPrompt = '显示当前的记忆是什么，提示用户如何更新记忆';
      
      setTimeout(async () => {
        try {
          const runtime = this.getOrCreateRuntimeFn!(sessionId);
          
          sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
            messageId: generateUserMessageId(),
            content: agentPrompt,
            done: true,
            role: 'user',
            sessionId,
          });

          await this.sendAIResponseFn!(runtime, agentPrompt, sessionId);
        } catch (error) {
          console.error('[ConnectorHandler] ❌ 自动发送记忆查询失败:', error);
          this.sendErrorFn!(`查询记忆失败: ${getErrorMessage(error)}`, sessionId);
        }
      }, 100);

      return successMessage;
    } catch (error) {
      console.error('[ConnectorHandler] ❌ 执行 /memory 指令失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理 /history 命令
   */
  private async handleHistoryCommand(sessionId: string): Promise<string> {
    if (!this.getOrCreateRuntimeFn || !this.sendAIResponseFn || !this.sendErrorFn) {
      throw new Error('依赖未设置');
    }
    
    try {
      console.log(`[ConnectorHandler] 执行 /history 指令: ${sessionId}`);

      const successMessage = '✅ 正在分析对话历史...';
      
      if (!this.sessionManager) {
        return '❌ SessionManager 未初始化';
      }
      
      const sessionFilePath = this.sessionManager.getSessionFilePath(sessionId);
      const agentPrompt = `读取我的对话历史文件并分析：${sessionFilePath}

请回答以下问题：
1. 一共进行了多少轮对话？（1 轮 = 1 条用户消息 + 1 条 AI 回复）
2. 消耗了多少 token？（估算所有消息的 token 总数）
3. 对话的主要话题是什么？

使用 file_read 工具读取文件内容后进行分析。`;
      
      setTimeout(async () => {
        try {
          const runtime = this.getOrCreateRuntimeFn!(sessionId);
          
          sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
            messageId: generateUserMessageId(),
            content: agentPrompt,
            done: true,
            role: 'user',
            sessionId,
          });

          await this.sendAIResponseFn!(runtime, agentPrompt, sessionId);
        } catch (error) {
          console.error('[ConnectorHandler] ❌ 自动发送历史分析失败:', error);
          this.sendErrorFn!(`分析历史失败: ${getErrorMessage(error)}`, sessionId);
        }
      }, 100);

      return successMessage;
    } catch (error) {
      console.error('[ConnectorHandler] ❌ 执行 /history 指令失败:', error);
      throw error;
    }
  }
}
