/**
 * 消息处理器 - 负责消息处理、队列管理和 AI 响应
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../types/ipc';
import type { Message } from '../../types/message';
import type { AgentRuntime } from '../agent-runtime/index';
import type { SessionManager } from '../session/session-manager';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { sleep, waitUntil } from '../../shared/utils/async-utils';
import { generateMessageId, generateUserMessageId, generateExecutionId } from '../../shared/utils/id-generator';
import { sendToWindow } from '../../shared/utils/webcontents-utils';
import type { MessageQueueItem } from './types';

export class MessageHandler {
  // 消息队列（每个会话一个队列）
  private messageQueues: Map<string, MessageQueueItem[]> = new Map();
  private processingQueues: Set<string> = new Set(); // 正在处理队列的会话

  constructor(private mainWindow: BrowserWindow | null) {}

  /**
   * 更新主窗口引用
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * 处理发送消息请求
   */
  async handleSendMessage(
    content: string,
    sessionId: string,
    displayContent?: string,
    clearHistory?: boolean,
    skipHistory?: boolean,
    runtime?: AgentRuntime,
    sessionManager?: SessionManager | null
  ): Promise<void> {
    console.log('收到消息:', content);
    
    try {
      // 更新 Tab 活跃时间（由调用方处理）
      
      // 清空历史记录
      if (clearHistory && sessionManager) {
        await sessionManager.clearMessages(sessionId);
        console.log(`[MessageHandler] ✅ 会话历史已清空: ${sessionId}`);
      }

      // 创建用户消息
      const userMessage: Message = {
        id: generateUserMessageId(),
        role: 'user',
        content: displayContent || content,
        timestamp: Date.now(),
        sessionId,
      };

      // 保存用户消息到数据库
      if (!skipHistory && sessionManager) {
        await sessionManager.saveUserMessage(sessionId, userMessage.content);
      }

      // 发送用户消息到前端
      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_RECEIVED, userMessage);

      // 如果没有提供 runtime，由调用方创建
      if (!runtime) {
        throw new Error('Runtime 未提供');
      }

      // 生成执行 ID
      const executionId = generateExecutionId('message-handler');
      console.log(`[MessageHandler] 🚀 开始执行: ${executionId}`);

      // 处理 AI 响应
      await this.sendAIResponse(runtime, content, sessionId, sessionManager);

      console.log(`[MessageHandler] ✅ 执行完成: ${executionId}`);
    } catch (error) {
      console.error('[MessageHandler] ❌ 处理消息失败:', error);
      
      // 发送错误消息到前端
      const errorMessage: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content: `处理消息时发生错误: ${getErrorMessage(error)}`,
        timestamp: Date.now(),
        sessionId,
        isError: true,
      };

      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_RECEIVED, errorMessage);
    }
  }
  /**
   * 处理消息队列
   */
  async processMessageQueue(sessionId: string, getRuntime: (sessionId: string) => AgentRuntime | undefined): Promise<void> {
    const queue = this.messageQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      this.processingQueues.delete(sessionId);
      return;
    }
    
    console.log(`[MessageHandler] 🔄 处理队列中的消息，队列长度: ${queue.length}`);
    
    const message = queue.shift()!;
    
    const runtime = getRuntime(sessionId);
    if (!runtime) {
      console.error('[MessageHandler] ❌ Runtime 不存在，清空队列');
      this.messageQueues.delete(sessionId);
      this.processingQueues.delete(sessionId);
      return;
    }
    
    // 如果提供了 displayContent，发送消息到前端
    if (message.displayContent && this.mainWindow) {
      const isCrossTabMessage = message.content.startsWith('[来自 ');
      
      if (!isCrossTabMessage) {
        const userMessageId = generateUserMessageId();
        sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
          messageId: userMessageId,
          content: message.displayContent,
          done: true,
          role: 'user',
          sessionId: sessionId,
        });
        console.log('[MessageHandler] 📤 已发送队列消息到前端:', message.displayContent);
      } else {
        console.log('[MessageHandler] 🔄 跳过显示跨 Tab 队列消息（将通过 Agent 响应显示）');
      }
    }
    
    try {
      await this.sendAIResponse(runtime, message.content, sessionId);
    } catch (error) {
      console.error('[MessageHandler] ❌ 处理队列消息失败:', error);
      
      const errorMessage = getErrorMessage(error);
      const isAIConnectionError = 
        errorMessage.includes('timeout') ||
        errorMessage.includes('超时') ||
        errorMessage.includes('AI 返回空响应') ||
        errorMessage.includes('API 请求超时') ||
        errorMessage.includes('连接');
      
      if (isAIConnectionError) {
        console.log('[MessageHandler] 🔄 检测到 AI 连接错误，尝试自动恢复...');
        
        try {
          const { clearAICache } = await import('../utils/ai-client');
          clearAICache();
          console.log('[MessageHandler] ✅ AI 缓存已清除');
          
          await sleep(2000);
          
          console.log('[MessageHandler] 🔄 重试处理消息...');
          await this.sendAIResponse(runtime, message.content, sessionId);
          console.log('[MessageHandler] ✅ 重试成功');
        } catch (retryError) {
          console.error('[MessageHandler] ❌ 重试失败:', retryError);
          this.sendError(`处理消息失败: ${getErrorMessage(retryError)}`, sessionId);
        }
      } else {
        this.sendError(`处理消息失败: ${errorMessage}`, sessionId);
      }
    }
    
    await sleep(100);
    
    if (queue.length > 0) {
      await this.processMessageQueue(sessionId, getRuntime);
    } else {
      this.processingQueues.delete(sessionId);
    }
  }
  /**
   * 发送 AI 响应
   */
  async sendAIResponse(runtime: AgentRuntime, userMessage: string, sessionId: string, sessionManager?: SessionManager | null, sentAt?: number): Promise<void> {
    const startTime = sentAt || Date.now();
    
    try {
      console.log(`[MessageHandler] 🤖 开始 AI 处理: ${sessionId}`);
      
      let responseContent = '';
      let messageId = generateMessageId();
      let isFirstChunk = true;
      
      const stream = runtime.sendMessage(userMessage);
      
      for await (const chunk of stream) {
        // chunk 是字符串类型
        responseContent += chunk;
        
        this.sendStreamChunk(
          messageId,
          chunk,
          false,
          isFirstChunk ? 'assistant' : undefined,
          sessionId
        );
        
        isFirstChunk = false;
      }
      
      this.sendStreamChunk(messageId, '', true, undefined, sessionId);
      
      if (responseContent.trim()) {
        const assistantMessage: Message = {
          id: messageId,
          role: 'assistant',
          content: responseContent,
          timestamp: Date.now(),
          sessionId,
        };
        
        if (sessionManager) {
          await sessionManager.saveAssistantMessage(sessionId, assistantMessage.content);
        }
        
        console.log(`[MessageHandler] ✅ AI 响应完成: ${sessionId} (${Date.now() - startTime}ms)`);
      } else {
        console.warn(`[MessageHandler] ⚠️ AI 返回空响应: ${sessionId}`);
        this.sendError('AI 返回空响应，请重试', sessionId);
      }
    } catch (error) {
      console.error(`[MessageHandler] ❌ AI 处理失败: ${sessionId}`, error);
      
      const errorMessage = getErrorMessage(error);
      this.sendError(`AI 处理失败: ${errorMessage}`, sessionId);
      
      throw error;
    }
  }

  /**
   * 发送流式响应块
   */
  sendStreamChunk(
    messageId: string,
    content: string,
    done: boolean,
    role?: 'user' | 'assistant',
    sessionId?: string
  ): void {
    if (this.mainWindow) {
      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
        messageId,
        content,
        done,
        role,
        sessionId,
      });
    }
  }

  /**
   * 发送错误消息
   */
  sendError(error: string, sessionId?: string): void {
    if (this.mainWindow) {
      const errorMessage: Message = {
        id: generateMessageId(),
        role: 'assistant',
        content: error,
        timestamp: Date.now(),
        sessionId: sessionId || 'default',
        isError: true,
      };
      
      sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_RECEIVED, errorMessage);
    }
  }

  /**
   * 添加消息到队列
   */
  addToQueue(sessionId: string, content: string, displayContent?: string): void {
    if (!this.messageQueues.has(sessionId)) {
      this.messageQueues.set(sessionId, []);
    }
    
    const queue = this.messageQueues.get(sessionId)!;
    queue.push({ content, displayContent });
    
    console.log(`[MessageHandler] 📝 消息已加入队列: ${sessionId} (队列长度: ${queue.length})`);
  }

  /**
   * 检查队列是否正在处理
   */
  isProcessingQueue(sessionId: string): boolean {
    return this.processingQueues.has(sessionId);
  }

  /**
   * 开始处理队列
   */
  startProcessingQueue(sessionId: string): void {
    this.processingQueues.add(sessionId);
  }

  /**
   * 清空指定会话的消息队列
   */
  clearQueue(sessionId: string): void {
    this.messageQueues.delete(sessionId);
    this.processingQueues.delete(sessionId);
    console.log(`[MessageHandler] 🗑️ 已清空消息队列: ${sessionId}`);
  }

  /**
   * 清空所有消息队列
   */
  clearAllQueues(): void {
    this.messageQueues.clear();
    this.processingQueues.clear();
    console.log('[MessageHandler] 🗑️ 已清空所有消息队列');
  }
}