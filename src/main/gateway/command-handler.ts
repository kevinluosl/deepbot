/**
 * 命令处理器 - 负责系统命令处理和欢迎消息管理
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../types/ipc';
import type { Message } from '../../types/message';
import type { SessionManager } from '../session/session-manager';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { generateMessageId, generateUserMessageId } from '../../shared/utils/id-generator';
import { sendToWindow } from '../../shared/utils/webcontents-utils';
import type { SystemCommandResult, WelcomeMessageCheck } from './types';

export class CommandHandler {
  constructor(private mainWindow: BrowserWindow | null) {}

  /**
   * 更新主窗口引用
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * 执行系统命令
   */
  async executeSystemCommand(
    commandName: string,
    commandArgs: string | undefined,
    sessionId: string,
    sessionManager: SessionManager | null,
    resetSessionRuntime: (sessionId: string, options?: any) => Promise<any>,
    getOrCreateRuntime: (sessionId: string) => any,
    sendAIResponse: (runtime: any, message: string, sessionId: string) => Promise<void>
  ): Promise<void> {
    const messageId = generateMessageId();
    
    try {
      let resultText = '';
      
      switch (commandName.toLowerCase()) {
        case 'new':
          resultText = await this.handleNewCommand(sessionId, sessionManager, resetSessionRuntime);
          break;
          
        case 'memory':
          resultText = await this.handleMemoryCommand(sessionId, getOrCreateRuntime, sendAIResponse);
          break;
          
        case 'history':
          resultText = await this.handleHistoryCommand(sessionId, sessionManager, getOrCreateRuntime, sendAIResponse);
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
      console.error(`[CommandHandler] ❌ 执行系统命令失败: /${commandName}`, error);
      
      // 发送错误消息到前端
      this.sendError(`执行命令失败: ${getErrorMessage(error)}`, sessionId);
    }
  }

  /**
   * 处理 /new 命令 - 清空会话
   */
  private async handleNewCommand(
    sessionId: string,
    sessionManager: SessionManager | null,
    resetSessionRuntime: (sessionId: string, options?: any) => Promise<any>
  ): Promise<string> {
    try {
      console.log(`[CommandHandler] 执行 /new 指令，清空会话: ${sessionId}`);

      // 1. 清空 session 历史文件
      if (sessionManager) {
        await sessionManager.clearSession(sessionId);
        console.log(`[CommandHandler] ✅ 会话历史已清空: ${sessionId}`);
      }

      // 2. 使用统一的重置逻辑（销毁但不重新创建 Runtime）
      await resetSessionRuntime(sessionId, {
        reason: '/new 指令清空会话',
        recreate: false  // 仅清理，不重新创建（用户下次发消息时会自动创建）
      });
      console.log(`[CommandHandler] ✅ AgentRuntime 已重置，上下文已清除`);

      // 3. 通知前端清空 UI
      sendToWindow(this.mainWindow, 'command:clear-chat', { sessionId });
      console.log(`[CommandHandler] ✅ 已通知前端清空 UI`);

      return '✅ 已清空会话历史，开始新对话';
    } catch (error) {
      console.error('[CommandHandler] ❌ 执行 /new 指令失败:', error);
      throw error;
    }
  }
  /**
   * 处理 /memory 命令 - 查看和管理记忆
   */
  private async handleMemoryCommand(
    sessionId: string,
    getOrCreateRuntime: (sessionId: string) => any,
    sendAIResponse: (runtime: any, message: string, sessionId: string) => Promise<void>
  ): Promise<string> {
    try {
      console.log(`[CommandHandler] 执行 /memory 指令: ${sessionId}`);

      const successMessage = '✅ 正在查询记忆系统...';
      
      const agentPrompt = '显示当前的记忆是什么，提示用户如何更新记忆';
      
      // 延迟发送，确保命令结果先显示
      setTimeout(async () => {
        try {
          const runtime = getOrCreateRuntime(sessionId);
          
          // 发送用户消息到前端
          sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
            messageId: generateUserMessageId(),
            content: agentPrompt,
            done: true,
            role: 'user',
            sessionId,
          });

          // 发送到 Agent 处理
          await sendAIResponse(runtime, agentPrompt, sessionId);
        } catch (error) {
          console.error('[CommandHandler] ❌ 自动发送记忆查询失败:', error);
          this.sendError(`查询记忆失败: ${getErrorMessage(error)}`, sessionId);
        }
      }, 100);

      return successMessage;
    } catch (error) {
      console.error('[CommandHandler] ❌ 执行 /memory 指令失败:', error);
      throw error;
    }
  }

  /**
   * 处理 /history 命令 - 查看对话历史统计
   */
  private async handleHistoryCommand(
    sessionId: string,
    sessionManager: SessionManager | null,
    getOrCreateRuntime: (sessionId: string) => any,
    sendAIResponse: (runtime: any, message: string, sessionId: string) => Promise<void>
  ): Promise<string> {
    try {
      console.log(`[CommandHandler] 执行 /history 指令: ${sessionId}`);

      const successMessage = '✅ 正在分析对话历史...';
      
      if (!sessionManager) {
        return '❌ SessionManager 未初始化';
      }
      
      const sessionFilePath = sessionManager.getSessionFilePath(sessionId);
      
      const agentPrompt = `读取我的对话历史文件并分析：${sessionFilePath}

请回答以下问题：
1. 总共有多少条对话记录？
2. 用户消息和助手消息各有多少条？
3. 最早和最新的对话时间是什么时候？
4. 主要讨论了哪些话题？
5. 有哪些重要的决定或结论？

请用简洁的格式展示这些统计信息。`;
      
      // 延迟发送，确保命令结果先显示
      setTimeout(async () => {
        try {
          const runtime = getOrCreateRuntime(sessionId);
          
          // 发送用户消息到前端
          sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
            messageId: generateUserMessageId(),
            content: agentPrompt,
            done: true,
            role: 'user',
            sessionId,
          });

          // 发送到 Agent 处理
          await sendAIResponse(runtime, agentPrompt, sessionId);
        } catch (error) {
          console.error('[CommandHandler] ❌ 自动发送历史分析失败:', error);
          this.sendError(`分析历史失败: ${getErrorMessage(error)}`, sessionId);
        }
      }, 100);

      return successMessage;
    } catch (error) {
      console.error('[CommandHandler] ❌ 执行 /history 指令失败:', error);
      throw error;
    }
  }

  /**
   * 发送欢迎消息
   */
  async sendWelcomeMessage(sessionManager: SessionManager | null): Promise<void> {
    const { SystemConfigStore } = require('../database/system-config-store');
    const configStore = SystemConfigStore.getInstance();
    const nameConfig = configStore.getNameConfig();
    
    const welcomeMessage: Message = {
      id: generateMessageId(),
      role: 'assistant',
      content: `你好！我是 ${nameConfig.agentName}，你的 AI 助手。我可以帮你处理各种任务，包括文件操作、网页浏览、代码编写等。有什么我可以帮助你的吗？`,
      timestamp: Date.now(),
      sessionId: 'default',
    };

    // 保存欢迎消息到数据库
    if (sessionManager) {
      try {
        await sessionManager.saveAssistantMessage('default', welcomeMessage.content);
        console.log('[CommandHandler] ✅ 欢迎消息已保存到数据库');
      } catch (error) {
        console.error('[CommandHandler] ❌ 保存欢迎消息失败:', error);
      }
    }

    // 发送欢迎消息到前端
    sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_RECEIVED, welcomeMessage);
    console.log('[CommandHandler] ✅ 欢迎消息已发送');
  }

  /**
   * 检查并发送欢迎消息
   */
  async checkAndSendWelcomeMessage(sessionManager: SessionManager | null): Promise<void> {
    if (!sessionManager) {
      console.log('[CommandHandler] SessionManager 未初始化，发送欢迎消息');
      await this.sendWelcomeMessage(sessionManager);
      return;
    }

    try {
      const messages = await sessionManager.getMessages('default');
      
      if (this.shouldSendWelcomeMessage(messages)) {
        console.log('[CommandHandler] 📝 需要发送欢迎消息');
        await this.sendWelcomeMessage(sessionManager);
      } else {
        console.log('[CommandHandler] 📚 已有历史消息，跳过欢迎消息');
      }
    } catch (error) {
      console.error('[CommandHandler] ❌ 检查欢迎消息失败:', error);
      await this.sendWelcomeMessage(sessionManager);
    }
  }

  /**
   * 判断是否应该发送欢迎消息
   */
  private shouldSendWelcomeMessage(messages: Message[]): boolean {
    if (messages.length === 0) {
      return true;
    }

    const assistantMessages = messages.filter(msg => msg.role === 'assistant');
    if (assistantMessages.length === 0) {
      return true;
    }

    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    const isWelcomeMessage = lastAssistantMessage.content.includes('你好！我是') && 
                            lastAssistantMessage.content.includes('AI 助手');

    return !isWelcomeMessage;
  }

  /**
   * 处理 Skill Manager 请求
   */
  async handleSkillManagerRequest(request: any, getOrCreateRuntime: (sessionId: string) => any): Promise<any> {
    console.log('[CommandHandler] 处理 Skill Manager 请求:', request);
    
    const runtime = getOrCreateRuntime('default');
    
    return await runtime.handleSkillManagerRequest(request);
  }

  /**
   * 发送错误消息
   */
  private sendError(error: string, sessionId?: string): void {
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
}