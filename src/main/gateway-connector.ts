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
import { IPC_CHANNELS } from '../types/ipc';
import { getErrorMessage } from '../shared/utils/error-handler';
import { generateMessageId, generateUserMessageId } from '../shared/utils/id-generator';
import { sendToWindow } from '../shared/utils/webcontents-utils';
import { createLogger } from '../shared/utils/logger';
import type { SessionManager } from './session/session-manager';
import type { AgentRuntime } from './agent-runtime/index';
import type { ConnectorManager } from './connectors/connector-manager';
import type { GatewayTabManager } from './gateway-tab';
import { setCurrentSenderIdForFeishuDocTool } from './tools/feishu-doc-tool';

const logger = createLogger('ConnectorHandler');

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
  private executeSystemCommandFn: ((commandName: string, commandArgs: string | undefined, sessionId: string) => Promise<void>) | null = null;

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
    executeSystemCommand: (commandName: string, commandArgs: string | undefined, sessionId: string) => Promise<void>;
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
    this.executeSystemCommandFn = deps.executeSystemCommand;
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
      logger.error('依赖未设置');
      return;
    }

    logger.info('📨 收到连接器消息:', {
      connectorId: message.source.connectorId,
      conversationId: message.source.conversationId,
      senderId: message.source.senderId,
      senderName: message.source.senderName,
      contentType: message.content.type,
      text: message.content.text,
      imagePath: message.content.imagePath,
      filePath: message.content.filePath,
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
        logger.info('创建连接器 Tab:', { tabId: tab.id, title, conversationKey });
      }

      // 保存 replyToMessageId 到 Tab（用于后续回复）
      if (message.replyToMessageId) {
        (tab as any).replyToMessageId = message.replyToMessageId;
        logger.info('保存 replyToMessageId:', message.replyToMessageId);
      }

      const rawContent = message.content.text || '';
      const senderName = message.source.senderName || '用户';

      // 检查是否是系统指令
      const systemCommandMatch = rawContent.match(/^\/(\w+)(?:\s+(.*))?$/);
      if (systemCommandMatch) {
        const commandName = systemCommandMatch[1];
        const commandArgs = systemCommandMatch[2];
        logger.info('🔧 检测到系统指令:', { command: commandName, args: commandArgs, tabId: tab.id });

        if (this.executeSystemCommandFn) {
          await this.executeSystemCommandFn(commandName, commandArgs, tab.id);
          logger.info('✅ 系统指令已执行');
          return;
        } else {
          logger.error('❌ executeSystemCommand 回调未设置');
          return;
        }
      }

      // 更新飞书文档工具的当前发送者 ID（用于创建文档后自动添加协作者）
      if (message.source.senderId) {
        setCurrentSenderIdForFeishuDocTool(message.source.senderId);
      }

      // 构建发给 agent 的内容
      const { contentForAgent, displayContent } = this.buildAgentContent(message, senderName, rawContent);

      logger.info('📤 准备发送给 Agent:', {
        displayContent: displayContent.substring(0, 200),
        tabId: tab.id,
      });

      await this.handleSendMessageFn(contentForAgent, tab.id, displayContent);
      logger.info('✅ 连接器消息已处理');
    } catch (error) {
      logger.error('❌ 处理连接器消息失败:', error);
      throw error;
    }
  }

  /**
   * 构建发给 agent 的消息内容
   *
   * 将以下部分组合成最终内容：
   * 1. 来源标注（[来自: xxx]）
   * 2. 消息正文（文本/图片/文件通知）
   * 3. 飞书专用工具提示（固定系统提示）
   * 4. 额外系统通知（如首次管理员授权提示，由连接器注入）
   */
  private buildAgentContent(
    message: GatewayMessage,
    senderName: string,
    rawContent: string
  ): { contentForAgent: string; displayContent: string } {
    let content = rawContent;
    let displayContent = '';

    // 根据消息类型构建正文
    if (message.content.type === 'image' && message.content.imagePath) {
      content = `[系统通知: 用户发送了一张图片]\n\n图片已自动下载并保存到: ${message.content.imagePath}\n\n请立即回复用户:\n1. 确认收到图片\n2. 告知图片保存位置\n3. 询问用户需要对图片做什么操作`;
      displayContent = `[收到图片]`;
    } else if (message.content.type === 'file' && message.content.filePath) {
      const fileName = message.content.fileName || '未知文件';
      content = `[系统通知: 用户发送了文件]\n\n文件名: ${fileName}\n文件已自动下载并保存到: ${message.content.filePath}\n\n请立即回复用户:\n1. 确认收到文件\n2. 告知文件保存位置\n3. 询问用户需要对文件做什么操作`;
      displayContent = `[收到文件: ${fileName}]`;
    } else {
      displayContent = content;
    }

    // 飞书专用工具提示（固定注入）
    const feishuToolsHint = `\n\n[系统提示: 这是飞书通讯会话，除了系统的工具，你还可以使用以下专用工具:
- connector_send_image: 发送图片给对方
- connector_send_file: 发送文件给对方
- feishu_doc_create: 创建飞书云文档（参数: title, folder_token?）
- feishu_doc_get: 获取文档信息和纯文本内容（参数: document_id）
- feishu_doc_get_blocks: 获取文档所有块列表，更新/删除块前先调用此工具获取 block_id（参数: document_id）
- feishu_doc_append: 追加内容到文档末尾（参数: document_id, content）
- feishu_doc_update_block: 更新指定块的文本内容（参数: document_id, block_id, content）
- feishu_doc_delete_blocks: 删除文档中指定范围的块（参数: document_id, start_index, end_index，parent_block_id 可选默认同 document_id）
- feishu_doc_delete_file: 永久删除整篇文档文件，不可恢复（参数: document_id）
- feishu_doc_add_comment: 在文档中添加评论（参数: document_id, content）

注意：
1. feishu_doc_append 是追加正文内容，feishu_doc_add_comment 是添加评论，客户要求添加评论时使用后者
2. 不用回复你有什么工具，需要的时候直接执行]`;

    // 额外系统通知（由连接器按需注入，如首次管理员授权提示）
    const extraNotice = message.systemContext ? `\n\n${message.systemContext}` : '';

    const contentForAgent = `[来自: ${senderName}]\n${content}${feishuToolsHint}${extraNotice}`;

    return { contentForAgent, displayContent };
  }

  /**
   * 发送响应到连接器
   */
  async sendResponseToConnector(tabId: string, response: string): Promise<void> {
    if (!this.tabManager || !this.connectorManager) {
      logger.error('依赖未设置');
      return;
    }

    const tab = this.tabManager.getTab(tabId);
    if (!tab || tab.type !== 'connector') {
      logger.info('Tab 不是连接器类型，跳过发送');
      return;
    }

    if (!tab.connectorId || !tab.conversationId) {
      logger.error('Tab 缺少连接器信息');
      return;
    }

    // 获取 replyToMessageId（如果有）
    const replyToMessageId = (tab as any).replyToMessageId;

    logger.info('发送响应到连接器:', {
      tabId,
      connectorId: tab.connectorId,
      conversationId: tab.conversationId,
      responseLength: response.length,
      replyToMessageId,
    });

    try {
      await this.connectorManager.sendOutgoingMessage(
        tab.connectorId as any,
        tab.conversationId,
        response,
        replyToMessageId
      );
      logger.info('✅ 响应已发送到连接器');
    } catch (error) {
      logger.error('❌ 发送响应到连接器失败:', error);
      throw error;
    }
  }

  /**
   * 执行系统命令
   */
  async executeSystemCommand(commandName: string, _commandArgs: string | undefined, sessionId: string): Promise<void> {
    if (!this.sendErrorFn) {
      logger.error('sendError 未设置');
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
      logger.error(`❌ 执行系统命令失败: /${commandName}`, error);
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
      logger.info(`执行 /new 指令，清空会话: ${sessionId}`);

      if (this.sessionManager) {
        await this.sessionManager.clearSession(sessionId);
        logger.info(`✅ 会话历史已清空: ${sessionId}`);
      }

      await this.resetSessionRuntimeFn(sessionId, { reason: '/new 指令清空会话', recreate: false });
      logger.info('✅ AgentRuntime 已重置，上下文已清除');

      sendToWindow(this.mainWindow, 'command:clear-chat', { sessionId });
      logger.info('✅ 已通知前端清空 UI');

      return '✅ 已清空会话历史，开始新对话';
    } catch (error) {
      logger.error('❌ 执行 /new 指令失败:', error);
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

    logger.info(`执行 /memory 指令: ${sessionId}`);

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
        logger.error('❌ 自动发送记忆查询失败:', error);
        this.sendErrorFn!(`查询记忆失败: ${getErrorMessage(error)}`, sessionId);
      }
    }, 100);

    return '✅ 正在查询记忆系统...';
  }

  /**
   * 处理 /history 命令
   */
  private async handleHistoryCommand(sessionId: string): Promise<string> {
    if (!this.getOrCreateRuntimeFn || !this.sendAIResponseFn || !this.sendErrorFn) {
      throw new Error('依赖未设置');
    }

    logger.info(`执行 /history 指令: ${sessionId}`);

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
        logger.error('❌ 自动发送历史分析失败:', error);
        this.sendErrorFn!(`分析历史失败: ${getErrorMessage(error)}`, sessionId);
      }
    }, 100);

    return '✅ 正在分析对话历史...';
  }
}
