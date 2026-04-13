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
import { SystemConfigStore } from './database/system-config-store';
import { createLogger } from '../shared/utils/logger';
import type { SessionManager } from './session/session-manager';
import type { AgentRuntime } from './agent-runtime/index';
import type { ConnectorManager } from './connectors/connector-manager';
import type { GatewayTabManager } from './gateway-tab';
import { setCurrentSenderIdForFeishuDocTool } from './tools/feishu-doc-tool';

const logger = createLogger('ConnectorHandler');

// 执行超时提醒节点（毫秒）
// 第一次 30 秒，之后每隔 1 分钟提醒一次
const PROGRESS_CHECKPOINTS = [30000, 90000, 150000, 210000, 270000, 330000, 390000, 450000];

// 各节点对应的提醒文案
const PROGRESS_MESSAGES: Record<number, string> = {
  30000:  '⏳ 任务正在执行中，需要一点时间，请耐心等待～ 如需停止可发送 /stop，查看进度可发送 /status',
  90000:  '⏳ 任务还在进行中，复杂的工作需要多一些时间，请继续等待～ 可发送 /status 查看当前输出内容',
  150000: '⏳ 仍在努力执行中，请不要着急，马上就好～ 可发送 /status 查看进度',
  210000: '⏳ 已经跑了三分多钟了，任务还没完成，请耐心等待～ 发送 /status 可查看当前状态',
  270000: '⏳ 执行时间较长，这是一个复杂的任务，请继续等待，不要着急～ 发送 /status 查看进度',
  330000: '⏳ 已经跑了五分多钟，任务仍在运行中，请耐心等待结果～ 可发送 /status 查看当前输出',
  390000: '⏳ 已经跑了六分多钟，还在继续处理，感谢你的耐心等待～ 发送 /status 查看进度',
  450000: '⏳ 已经跑了七分多钟，任务仍在进行，请继续等待～ 如需停止可发送 /stop，查看进度可发送 /status',
};

/**
 * Connector Handler 类
 */
export class GatewayConnectorHandler {
  private mainWindow: BrowserWindow | null = null;
  private connectorManager: ConnectorManager | null = null;
  private tabManager: GatewayTabManager | null = null;
  private sessionManager: SessionManager | null = null;

  // 每个 tabId 对应的进度提醒定时器列表
  private progressTimers: Map<string, ReturnType<typeof setTimeout>[]> = new Map();

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

      // 飞书群组消息：提前获取连接器实例，创建和更新 Tab 时都会用到
      const isFeishuGroup =
        message.source.connectorId === 'feishu' &&
        message.source.chatType === 'group' &&
        !!message.source.conversationId;
      const feishuConnector = isFeishuGroup
        ? (this.connectorManager!.getConnector('feishu') as any)
        : null;

      if (!tab) {
        // 生成 Tab 标题
        let title: string;
        let groupName: string | undefined;
        if (message.source.connectorId === 'feishu') {
          if (isFeishuGroup) {
            // 群组消息：调用飞书 API 获取真实群名称，格式为 FS-{群名称}
            let chatName: string | null = null;
            if (feishuConnector?.getChatName) {
              chatName = await feishuConnector.getChatName(message.source.conversationId || '');
            }
            
            if (chatName) {
              groupName = chatName;
              title = `FS-${chatName}`;
            } else {
              // 获取群名称失败，降级为 FS-GROUP-{数字}
              const existingTabs = this.tabManager.getAllTabs();
              const groupTabNumbers = existingTabs
                .filter(t => t.title?.startsWith('FS-GROUP-'))
                .map(t => {
                  const match = t.title?.match(/^FS-GROUP-(\d+)$/);
                  return match ? parseInt(match[1], 10) : 0;
                })
                .filter(n => n > 0);
              
              const nextNumber = groupTabNumbers.length > 0 ? Math.max(...groupTabNumbers) + 1 : 1;
              title = `FS-GROUP-${nextNumber}`;
            }
          } else {
            // 私聊消息：使用用户名
            const senderName = message.source.senderName || '';
            title = senderName ? `FS-${senderName}` : 'feishu';
          }
        } else {
          // 其他连接器使用 connectorId
          title = message.source.connectorId || 'unknown';
        }
        
        tab = await this.tabManager.createTab({
          type: 'connector',
          title,
          conversationKey,
          connectorId: message.source.connectorId,
          conversationId: message.source.conversationId,
          groupName,
        });
        logger.info('创建连接器 Tab:', { tabId: tab.id, title, conversationKey });
      } else if (isFeishuGroup && feishuConnector?.getChatName) {
        // Tab 已存在时，异步检查群名称是否有变化并更新
        const existingTab = tab;
        feishuConnector.getChatName(message.source.conversationId).then((chatName: string | null) => {
          if (chatName) {
            this.tabManager!.updateTabTitle(existingTab.id, `FS-${chatName}`, chatName);
          }
        }).catch((err: unknown) => {
          logger.warn('⚠️ 异步更新群名称失败:', err);
        });
      }

      const rawContent = message.content.text || '';
      const senderName = message.source.senderName || '用户';

      // 检查是否是系统指令
      // 支持两种格式：
      // 1. /command - 行首的指令
      // 2. @xxx /command - @ 提及后的指令（飞书群组场景）
      const systemCommandMatch = rawContent.match(/^(?:@\S+\s+)?\/([\w-]+)(?:\s+(.*))?$/);
      if (systemCommandMatch) {
        const commandName = systemCommandMatch[1];
        const commandArgs = systemCommandMatch[2];
        logger.info('🔧 检测到系统指令:', { command: commandName, args: commandArgs, tabId: tab.id });

        if (this.executeSystemCommandFn) {
          // 🔥 特殊处理：/status 和 /stop 指令直接执行，不经过消息队列
          if (commandName.toLowerCase() === 'status') {
            const statusResult = await this.handleStatusCommand(tab.id);
            if (tab.type === 'connector') {
              try {
                await this.sendResponseToConnector(tab.id, statusResult);
              } catch (replyError) {
                logger.error('❌ 回复 status 指令结果失败:', replyError);
              }
            }
            return;
          }

          if (commandName.toLowerCase() === 'stop') {
            const stopResult = await this.handleStopCommand(tab.id);
            if (tab.type === 'connector') {
              try {
                await this.sendResponseToConnector(tab.id, stopResult);
              } catch (replyError) {
                logger.error('❌ 回复 stop 指令结果失败:', replyError);
              }
            }
            return;
          }

          // 其他系统指令正常处理
          await this.executeSystemCommandFn(commandName, commandArgs, tab.id);
          logger.info('✅ 系统指令已执行');

          // connector tab 的系统指令需要把结果回复给用户
          // （executeSystemCommand 只发到前端 UI，connector 用户看不到）
          if (tab.type === 'connector') {
            try {
              await this.sendResponseToConnector(tab.id, this.getSystemCommandReply(commandName));
            } catch (replyError) {
              logger.error('❌ 回复系统指令结果失败:', replyError);
            }
          }
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
      // 群组消息直接从 tab.groupName 读取群名称
      const isGroupMessage = message.source.chatType === 'group';
      const groupName = isGroupMessage ? tab.groupName : undefined;
      const { contentForAgent, displayContent } = this.buildAgentContent(message, senderName, rawContent, groupName);

      // 🔥 新增：将消息加入队列
      const pendingMessage = {
        messageId: message.replyToMessageId || `msg_${Date.now()}`,
        senderId: message.source.senderId || '',
        senderName,
        content: contentForAgent,
        displayContent,
        replyToMessageId: message.replyToMessageId,
        timestamp: Date.now(),
      };

      // 初始化队列（如果不存在）
      if (!tab.pendingMessages) {
        tab.pendingMessages = [];
      }

      // 加入队列
      tab.pendingMessages.push(pendingMessage);
      logger.info('📥 消息已加入队列:', {
        tabId: tab.id,
        messageId: pendingMessage.messageId,
        queueLength: tab.pendingMessages.length,
        isProcessing: !!tab.processingMessageId,
      });

      // 如果当前没有正在处理的消息，开始处理队列
      if (!tab.processingMessageId) {
        await this.processNextMessage(tab.id);
      } else {
        logger.info('⏳ 有消息正在处理中，当前消息已排队等待');
      }
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
    rawContent: string,
    groupName?: string
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
      displayContent = `[收到文件]`;
    } else {
      displayContent = content;
    }

    // 飞书专用工具提示（固定注入）
    const feishuToolsHint = `\n\n[系统提示: 这是飞书通讯会话，除了系统的工具，你还可以根据用户的需求使用以下专用工具:
- connector_send_image: 发送图片给对方
- connector_send_file: 发送文件给对方
- feishu_doc_create: 创建飞书云文档（参数: title, folder_token?）
- feishu_doc_get: 获取文档信息和纯文本内容（参数: document_id）
- feishu_doc_get_blocks: 获取文档所有块列表，更新/删除块前先调用此工具获取 block_id（参数: document_id）
- feishu_doc_update_block: 更新指定块的文本内容（参数: document_id, block_id, content）
- feishu_doc_delete_blocks: 删除文档中指定范围的块（参数: document_id, start_index, end_index，parent_block_id 可选默认同 document_id）
- feishu_doc_delete_file: 永久删除整篇文档文件，不可恢复（参数: document_id）
- feishu_doc_add_comment: 在文档中添加评论（参数: document_id, content）
- feishu_drive_download: 下载飞书云空间文件到本地（参数: file_token, file_name?）
- feishu_doc_insert_rich_blocks: 将 Markdown/HTML 内容转换为丰富格式文档块并插入文档，支持标题、表格、列表、代码块、引用、图片等（参数: document_id, content, content_type?, index?, parent_block_id?）

注意：
1. feishu_doc_add_comment 是添加文档评论，不是追加正文内容
2. 不要用markdown格式回复内容，不要使用表格回复内容，飞书只能接收无格式的的字符，除非需要创建飞书文档
3. 回复的内容超过1000个字，创建飞书文档回复
4. 创建飞书文档时，使用 feishu_doc_insert_rich_blocks 插入丰富格式内容（Markdown）
5. 回复的时候根据回复的内容，带上用户的名字
6. 来自信息中包含了发送信息的用户的姓名，群消息还包含群名称，收到消息中的“我”就是发送者，如果当前信息来自群，“我”指代群本身。执行任务时需要用正确名称代替。
7. 不要使用 feishu_send_message 工具回复，除非收到明确指令要给具体目标发送消息]`;

    // 额外系统通知（由连接器按需注入，如首次管理员授权提示）
    const extraNotice = message.systemContext ? `\n\n${message.systemContext}` : '';

    // 构建来源标注：群消息显示发送者和群名称，私聊只显示发送者
    let sourceLabel: string;
    if (groupName) {
      sourceLabel = `发送信息者：${senderName}、来自群：${groupName}`;
    } else {
      sourceLabel = `发送信息者：${senderName}`;
    }
    const contentForAgent = `[来自: ${sourceLabel}]\n${content}${feishuToolsHint}${extraNotice}`;

    return { contentForAgent, displayContent };
  }

  /**
   * 处理队列中的下一条消息
   */
  private async processNextMessage(tabId: string): Promise<void> {
    if (!this.tabManager || !this.handleSendMessageFn) {
      logger.error('依赖未设置');
      return;
    }

    const tab = this.tabManager.getTab(tabId);
    if (!tab || !tab.pendingMessages || tab.pendingMessages.length === 0) {
      logger.info('📭 队列为空，无需处理');
      return;
    }

    // 取出队列第一条消息
    const message = tab.pendingMessages[0];
    tab.processingMessageId = message.messageId;

    logger.info('🚀 开始处理队列消息:', {
      tabId,
      messageId: message.messageId,
      senderName: message.senderName,
      queueLength: tab.pendingMessages.length,
    });

    try {
      // 启动进度提醒定时器
      this.startProgressTimers(tabId);

      // 发送给 agent 处理
      await this.handleSendMessageFn(message.content, tabId, message.displayContent);

      logger.info('✅ 消息处理完成:', { messageId: message.messageId });
    } catch (error) {
      logger.error('❌ 处理消息失败:', error);
    } finally {
      // 从队列中移除已处理的消息
      tab.pendingMessages.shift();
      tab.processingMessageId = undefined;

      logger.info('📤 消息已出队:', {
        messageId: message.messageId,
        remainingCount: tab.pendingMessages.length,
      });

      // 如果队列还有消息，继续处理下一条
      if (tab.pendingMessages.length > 0) {
        logger.info('⏭️ 继续处理下一条消息');
        // 使用 setImmediate 避免递归调用栈过深
        setImmediate(() => {
          this.processNextMessage(tabId).catch(err => {
            logger.error('❌ 处理下一条消息失败:', err);
          });
        });
      } else {
        logger.info('✅ 队列已清空');
      }
    }
  }

  /**
   * 发送响应到连接器
   * @param isProgressNotice 是否是进度提醒消息（进度提醒不清除定时器）
   */
  async sendResponseToConnector(tabId: string, response: string, isProgressNotice = false): Promise<void> {
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

    // 🔥 修改：从队列中获取 replyToMessageId（当前正在处理的消息）
    let replyToMessageId: string | undefined;
    if (tab.processingMessageId && tab.pendingMessages && tab.pendingMessages.length > 0) {
      const currentMessage = tab.pendingMessages[0];
      if (currentMessage.messageId === tab.processingMessageId) {
        replyToMessageId = currentMessage.replyToMessageId;
      }
    }

    logger.info('发送响应到连接器:', {
      tabId,
      connectorId: tab.connectorId,
      conversationId: tab.conversationId,
      responseLength: response.length,
      replyToMessageId,
      processingMessageId: tab.processingMessageId,
    });

    try {
      await this.connectorManager.sendOutgoingMessage(
        tab.connectorId as any,
        tab.conversationId,
        response,
        replyToMessageId
      );
      logger.info('✅ 响应已发送到连接器');

      // 只有真实 agent 回复才清除定时器，进度提醒本身不触发清除
      if (!isProgressNotice) {
        this.clearProgressTimers(tabId);
      }
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
    const isEn = SystemConfigStore.getInstance().getAppSetting('language') === 'en';

    try {
      let resultText = '';

      switch (commandName.toLowerCase()) {
        case 'new':
          resultText = await this.handleNewCommand(sessionId);
          break;

        case 'memory':
          resultText = await this.handleMemoryCommand(sessionId, isEn);
          break;

        case 'history':
          resultText = await this.handleHistoryCommand(sessionId, isEn);
          break;

        case 'stop':
          resultText = await this.handleStopCommand(sessionId);
          break;

        case 'status':
          resultText = await this.handleStatusCommand(sessionId);
          break;

        case 'reload-env':
          resultText = await this.handleReloadEnvCommand();
          break;

        default:
          resultText = isEn
            ? `❌ Unknown command: /${commandName}\n\nAvailable commands:\n- /new - Clear session history\n- /memory - View and manage memory\n- /history - View conversation stats\n- /reload-env - Reload environment variables\n- /stop - Stop current task\n- /status - View task status`
            : `❌ 未知指令: /${commandName}\n\n可用指令：\n- /new - 清空当前会话历史，开始新对话\n- /memory - 查看和管理记忆\n- /history - 查看对话历史统计\n- /reload-env - 刷新环境变量\n- /stop - 停止当前正在执行的任务\n- /status - 查看当前任务执行状态`;
      }

      // /new 命令需要延迟发送结果，确保 clear-chat 先被前端处理
      if (commandName.toLowerCase() === 'new') {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // 先发送内容（创建消息），再发送完成标记
      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
        messageId,
        content: resultText,
        done: false,
        sessionId,
      });
      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
        messageId,
        content: '',
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

      const isEn = SystemConfigStore.getInstance().getAppSetting('language') === 'en';
      return isEn ? '✅ Session cleared, starting fresh' : '✅ 已清空会话历史，开始新对话';
    } catch (error) {
      logger.error('❌ 执行 /new 指令失败:', error);
      throw error;
    }
  }

  /**
   * 处理 /memory 命令
   */
  private async handleMemoryCommand(sessionId: string, isEn = false): Promise<string> {
    if (!this.getOrCreateRuntimeFn || !this.sendAIResponseFn || !this.sendErrorFn) {
      throw new Error('依赖未设置');
    }

    logger.info(`执行 /memory 指令: ${sessionId}`);

    const agentPrompt = isEn
      ? 'Show the current memory content and tell the user how to update it'
      : '显示当前的记忆是什么，提示用户如何更新记忆';

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

    return isEn ? '✅ Querying memory...' : '✅ 正在查询记忆系统...';
  }

  /**
   * 获取系统指令的简短回复文本（用于 connector 回复用户）
   */
  private getSystemCommandReply(commandName: string): string {
    const isEn = SystemConfigStore.getInstance().getAppSetting('language') === 'en';
    switch (commandName.toLowerCase()) {
      case 'stop': return '⏹️ ' + (isEn ? 'Task stopped' : '任务已停止');
      case 'new': return '✅ ' + (isEn ? 'Session cleared, starting fresh' : '已清空会话历史，开始新对话');
      case 'memory': return '✅ ' + (isEn ? 'Querying memory...' : '正在查询记忆系统...');
      case 'history': return '✅ ' + (isEn ? 'Analyzing history...' : '正在分析对话历史...');
      case 'status': return '📊 ' + (isEn ? 'Getting status...' : '正在获取当前状态...');
      default: return `❌ ${isEn ? 'Unknown command' : '未知指令'}: /${commandName}`;
    }
  }

  /**
   * 处理 /stop 命令（停止当前正在执行的任务）
   */
  private async handleStopCommand(sessionId: string): Promise<string> {
    if (!this.resetSessionRuntimeFn || !this.getOrCreateRuntimeFn) {
      throw new Error('依赖未设置');
    }

    logger.info(`执行 /stop 指令，停止任务: ${sessionId}`);

    const runtime = this.getOrCreateRuntimeFn(sessionId);
    const wasGenerating = runtime.isCurrentlyGenerating();

    // 停止 agent（等同于点击 Stop 按钮）
    await this.resetSessionRuntimeFn(sessionId, {
      reason: '用户发送 /stop 指令',
      recreate: false,
    });

    // 清除进度提醒定时器
    this.clearProgressTimers(sessionId);

    logger.info('✅ /stop 指令已执行');
    return wasGenerating ? '⏹️ 任务已停止' : '⏹️ 当前没有正在执行的任务';
  }

  /**
   * 处理 /status 命令（查看当前任务执行状态）
   */
  private async handleStatusCommand(sessionId: string): Promise<string> {
    if (!this.tabManager) {
      throw new Error('依赖未设置');
    }

    logger.info(`执行 /status 指令: ${sessionId}`);

    try {
      const tab = this.tabManager.getTab(sessionId);

      if (!tab) {
        return '❌ 未找到当前会话';
      }

      if (this.getOrCreateRuntimeFn) {
        const runtime = this.getOrCreateRuntimeFn(sessionId);
        if (runtime) {
          const isGenerating = runtime.isCurrentlyGenerating();

          if (isGenerating) {
            const steps = runtime.getExecutionSteps();
            const streamingContent = runtime.getCurrentStreamingContent();
            
            let statusText = '📊 任务正在执行中\n\n';
            
            // 显示 AI 已输出的文本内容
            if (streamingContent && streamingContent.trim()) {
              statusText += `💬 AI 输出内容:\n${streamingContent}\n\n`;
            }
            
            // 显示执行步骤
            if (steps && steps.length > 0) {
              const runningSteps = steps.filter((s: { status: string }) => s.status === 'running');
              const completedSteps = steps.filter((s: { status: string }) => s.status === 'success' || s.status === 'error');
              
              statusText += `⚙️ 已完成 ${completedSteps.length} 个步骤，正在执行 ${runningSteps.length} 个步骤\n\n`;
              
              for (const step of runningSteps) {
                statusText += `🔄 正在执行: ${step.toolLabel || step.toolName}\n`;
              }
              
              const recentCompleted = completedSteps.slice(-3);
              if (recentCompleted.length > 0) {
                statusText += `\n最近完成的步骤:\n`;
                for (const step of recentCompleted) {
                  const icon = step.status === 'success' ? '✅' : '❌';
                  statusText += `${icon} ${step.toolLabel || step.toolName}\n`;
                }
              }
            } else if (!streamingContent || !streamingContent.trim()) {
              statusText += '正在等待 AI 响应...';
            }
            
            return statusText;
          }
        }
      }

      return '📊 当前没有正在执行的任务';
    } catch (error) {
      logger.error('❌ 执行 /status 指令失败:', error);
      return `❌ 获取状态失败: ${getErrorMessage(error)}`;
    }
  }

  /**
   * 处理 /reload-env 命令 - 刷新环境变量缓存
   */
  private async handleReloadEnvCommand(): Promise<string> {
    try {
      logger.info('执行 /reload-env 指令，刷新环境变量缓存');
      const { resetShellPathCache } = require('./tools/shell-env');
      resetShellPathCache();
      logger.info('✅ 环境变量缓存已清除，下次执行命令时将重新加载');
      return '✅ 环境变量已刷新\n\n下次执行命令时将从系统重新加载所有环境变量（包括 .zshrc/.bashrc 中新增的变量）';
    } catch (error) {
      logger.error('❌ 刷新环境变量失败:', error);
      return `❌ 刷新环境变量失败: ${getErrorMessage(error)}`;
    }
  }

  /**
   * 处理 /history 命令
   */
  private async handleHistoryCommand(sessionId: string, isEn = false): Promise<string> {
    if (!this.getOrCreateRuntimeFn || !this.sendAIResponseFn || !this.sendErrorFn) {
      throw new Error('依赖未设置');
    }

    logger.info(`执行 /history 指令: ${sessionId}`);

    if (!this.sessionManager) {
      return isEn ? '❌ SessionManager not initialized' : '❌ SessionManager 未初始化';
    }

    const sessionFilePath = this.sessionManager.getSessionFilePath(sessionId);
    const agentPrompt = isEn
      ? `Read and analyze my conversation history file: ${sessionFilePath}

Please answer:
1. How many conversation rounds? (1 round = 1 user message + 1 AI reply)
2. Estimated total token usage?
3. What were the main topics?

Use the file_read tool to read the file content.`
      : `读取我的对话历史文件并分析：${sessionFilePath}

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

    return isEn ? '✅ Analyzing history...' : '✅ 正在分析对话历史...';
  }

  /**
   * 启动进度提醒定时器
   * 在 agent 开始执行后，按预设时间节点向用户发送"还在执行中"的提醒
   */
  private startProgressTimers(tabId: string): void {
    // 先清除该 tab 已有的定时器，避免重复
    this.clearProgressTimers(tabId);

    const timers: ReturnType<typeof setTimeout>[] = [];

    logger.info(`🚀 开始注册进度提醒定时器: ${tabId}, 节点数: ${PROGRESS_CHECKPOINTS.length}`);

    for (const ms of PROGRESS_CHECKPOINTS) {
      const timer = setTimeout(async () => {
        const msg = PROGRESS_MESSAGES[ms];
        logger.info(`⏳ 进度提醒触发 [${ms / 1000}s]: ${tabId}`);
        try {
          await this.sendResponseToConnector(tabId, msg, true);
          logger.info(`✅ 进度提醒已发送 [${ms / 1000}s]: ${tabId}`);
        } catch (error) {
          logger.error(`❌ 发送进度提醒失败 [${ms / 1000}s]:`, error);
        }
      }, ms);

      timers.push(timer);
    }

    this.progressTimers.set(tabId, timers);
    logger.info(`✅ 已启动 ${timers.length} 个进度提醒定时器: ${tabId}`);
  }

  /**
   * 清除进度提醒定时器
   * 在 agent 回复完成或任务停止时调用
   */
  private clearProgressTimers(tabId: string): void {
    const timers = this.progressTimers.get(tabId);
    if (timers && timers.length > 0) {
      timers.forEach(t => clearTimeout(t));
      this.progressTimers.delete(tabId);
      logger.info(`🗑️ 已清除进度提醒定时器: ${tabId}`);
    }
  }
}
