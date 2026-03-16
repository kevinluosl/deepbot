/**
 * Gateway Message Handler - 消息处理和队列管理
 * 
 * 职责：
 * - 处理用户消息发送
 * - 管理消息队列
 * - 处理 AI 响应流式输出
 * - 错误处理和自动恢复
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../types/ipc';
import { AgentRuntime } from './agent-runtime/index';
import { getErrorMessage } from '../shared/utils/error-handler';
import { sleep, waitUntil } from '../shared/utils/async-utils';
import { generateMessageId, generateUserMessageId } from '../shared/utils/id-generator';
import { sendToWindow } from '../shared/utils/webcontents-utils';
import type { SessionManager } from './session/session-manager';

/**
 * 消息队列项
 */
interface MessageQueueItem {
  content: string;
  displayContent?: string;
}

/**
 * Message Handler 类
 */
export class GatewayMessageHandler {
  private mainWindow: BrowserWindow | null = null;
  private sessionManager: SessionManager | null = null;
  
  // 消息队列（每个会话一个队列）
  private messageQueues: Map<string, MessageQueueItem[]> = new Map();
  private processingQueues: Set<string> = new Set();
  
  // 回调函数
  private getOrCreateRuntimeFn: ((sessionId: string) => AgentRuntime) | null = null;
  private resetSessionRuntimeFn: ((sessionId: string, options: { reason?: string; recreate?: boolean }) => Promise<AgentRuntime | null>) | null = null;
  private executeSystemCommandFn: ((commandName: string, commandArgs: string | undefined, sessionId: string) => Promise<void>) | null = null;
  
  constructor() {}
  
  /**
   * 设置依赖
   */
  setDependencies(deps: {
    mainWindow: BrowserWindow;
    sessionManager: SessionManager | null;
    getOrCreateRuntime: (sessionId: string) => AgentRuntime;
    resetSessionRuntime: (sessionId: string, options: { reason?: string; recreate?: boolean }) => Promise<AgentRuntime | null>;
    executeSystemCommand: (commandName: string, commandArgs: string | undefined, sessionId: string) => Promise<void>;
  }): void {
    this.mainWindow = deps.mainWindow;
    this.sessionManager = deps.sessionManager;
    this.getOrCreateRuntimeFn = deps.getOrCreateRuntime;
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
   * 处理发送消息请求
   */
  async handleSendMessage(
    content: string,
    sessionId: string,
    displayContent?: string,
    clearHistory?: boolean,
    skipHistory?: boolean
  ): Promise<void> {
    console.log('收到消息:', content);
    
    const sentAt = Date.now();
    
    // 命令预处理：检查是否是系统命令
    const commandMatch = content.trim().match(/^\/(\w+)(?:\s+(.*))?$/);
    if (commandMatch) {
      const [, commandName, commandArgs] = commandMatch;
      const supportedCommands = ['new', 'memory', 'history'];
      
      if (supportedCommands.includes(commandName.toLowerCase())) {
        console.log(`[MessageHandler] 🎯 检测到系统命令: /${commandName}，直接执行`);
        if (this.executeSystemCommandFn) {
          await this.executeSystemCommandFn(commandName, commandArgs, sessionId);
        }
        return;
      }
    }
    
    // 获取或创建 AgentRuntime
    if (!this.getOrCreateRuntimeFn) {
      throw new Error('getOrCreateRuntime 回调未设置');
    }
    const runtime = this.getOrCreateRuntimeFn(sessionId);
    
    // 清空历史消息（定时任务场景）
    if (clearHistory) {
      console.log('[MessageHandler] 🗑️ 清空历史消息（定时任务模式）');
      await runtime.clearMessageHistory();
    }
    
    // 跳过历史记录（欢迎消息场景）
    if (skipHistory) {
      console.log('[MessageHandler] 📝 跳过历史记录（欢迎消息模式）');
      runtime.setSkipHistory(true);
    }
    
    // 检查是否正在生成
    if (runtime.isCurrentlyGenerating()) {
      const isTaskTab = sessionId.startsWith('task-tab-');
      
      if (isTaskTab) {
        // 定时任务 Tab：等待上一次执行完成
        await this.waitForTaskCompletion(runtime, content, sessionId);
      } else {
        // 普通 Tab：加入队列
        this.enqueueMessage(sessionId, content, displayContent);
        return;
      }
    }
    
    // 发送用户消息到前端显示
    if (displayContent && this.mainWindow) {
      this.sendUserMessage(displayContent, sessionId);
    }
    
    try {
      // 使用 Agent Runtime 处理消息
      await this.sendAIResponse(runtime, content, sessionId, sentAt);
    } catch (error) {
      console.error('处理消息失败:', error);
      
      // 检查是否是 AI 连接错误，尝试自动恢复
      const errorMessage = getErrorMessage(error);
      if (this.isAIConnectionError(errorMessage)) {
        await this.handleAIConnectionError(error, runtime, content, sessionId);
      } else {
        this.sendError(errorMessage, sessionId);
        await this.processMessageQueue(sessionId);
      }
    } finally {
      // 恢复历史记录模式
      if (skipHistory) {
        runtime.setSkipHistory(false);
        console.log('[MessageHandler] ✅ 恢复历史记录模式');
      }
    }
  }
  
  /**
   * 等待任务完成
   */
  private async waitForTaskCompletion(runtime: AgentRuntime, content: string, sessionId: string): Promise<void> {
    console.log('[MessageHandler] 🔄 定时任务 Tab 正在处理消息，等待完成...');
    console.log(`[MessageHandler] 📝 当前消息: "${content}"`);
    console.log(`[MessageHandler] 🆔 Session ID: ${sessionId}`);
    
    const { TIMEOUTS } = await import('./config/timeouts');
    const success = await waitUntil(
      () => !runtime.isCurrentlyGenerating(),
      {
        timeout: TIMEOUTS.AGENT_MESSAGE_TIMEOUT,
        interval: 100,
        onProgress: (elapsed) => {
          if (Math.floor(elapsed / 5000) > Math.floor((elapsed - 100) / 5000)) {
            const seconds = (elapsed / 1000).toFixed(1);
            console.log(`[MessageHandler] ⏳ 已等待 ${seconds} 秒...`);
          }
        }
      }
    );
    
    if (!success) {
      console.error('[MessageHandler] ❌ 等待超时（120秒），强制停止上一次执行');
      console.error(`[MessageHandler] 📝 被放弃的消息: "${content}"`);
      await runtime.stopGeneration();
      await sleep(1000);
      console.log('[MessageHandler] ✅ 已强制停止上一次执行，继续处理新消息');
    } else {
      console.log('[MessageHandler] ✅ 上一次执行已完成，继续处理新消息');
    }
    
    console.log(`[MessageHandler] 📝 新消息: "${content}"`);
  }
  
  /**
   * 将消息加入队列
   */
  private enqueueMessage(sessionId: string, content: string, displayContent?: string): void {
    console.log('[MessageHandler] 📥 Agent 正在处理消息，将新消息加入队列');
    
    if (!this.messageQueues.has(sessionId)) {
      this.messageQueues.set(sessionId, []);
    }
    
    const queue = this.messageQueues.get(sessionId)!;
    queue.push({ content, displayContent });
    console.log(`[MessageHandler] 📊 队列长度: ${queue.length}`);
  }
  
  /**
   * 发送用户消息到前端
   */
  private sendUserMessage(content: string, sessionId: string): void {
    const userMessageId = generateUserMessageId();
    sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
      messageId: userMessageId,
      content,
      done: true,
      role: 'user',
      sessionId,
    });
    console.log('[MessageHandler] 📤 已发送用户消息到前端:', content);
  }
  
  /**
   * 检查是否是 AI 连接错误
   */
  private isAIConnectionError(errorMessage: string): boolean {
    return errorMessage.includes('timeout') ||
      errorMessage.includes('超时') ||
      errorMessage.includes('AI 返回空响应') ||
      errorMessage.includes('API 请求超时') ||
      errorMessage.includes('连接') ||
      errorMessage.includes('网络') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('fetch failed');
  }
  
  /**
   * 处理 AI 连接错误
   */
  private async handleAIConnectionError(
    error: unknown,
    runtime: AgentRuntime,
    content: string,
    sessionId: string
  ): Promise<void> {
    const errorMessage = getErrorMessage(error);
    console.warn('[MessageHandler] 🔧 检测到 AI 连接错误，尝试自动恢复...');
    console.warn(`[MessageHandler] 错误信息: ${errorMessage}`);
    console.warn(`[MessageHandler] 仅恢复当前 Tab: ${sessionId}`);
    
    try {
      if (!this.resetSessionRuntimeFn) {
        throw new Error('resetSessionRuntime 回调未设置');
      }
      
      const retryRuntime = await this.resetSessionRuntimeFn(sessionId, {
        reason: `AI 连接错误: ${errorMessage}`,
        recreate: true
      });
      
      if (!retryRuntime) {
        throw new Error('重新创建 Runtime 失败');
      }
      
      console.log('[MessageHandler] 🔄 重试发送消息...');
      await this.sendAIResponse(retryRuntime, content, sessionId);
      console.log('[MessageHandler] ✅ 自动恢复成功（仅当前 Tab）');
      return;
    } catch (retryError) {
      console.error('[MessageHandler] ❌ 自动恢复失败:', getErrorMessage(retryError));
      
      const userMessage = `AI 连接超时，已尝试自动恢复但失败。\n\n可能的原因：\n1. 网络连接不稳定\n2. AI 服务响应缓慢\n3. API 配置错误\n\n建议操作：\n1. 检查网络连接\n2. 重新保存模型配置\n3. 如问题持续，请重启应用\n\n错误详情: ${getErrorMessage(retryError)}`;
      
      this.sendError(userMessage, sessionId);
      await this.processMessageQueue(sessionId);
    }
  }
  
  /**
   * 处理消息队列
   */
  private async processMessageQueue(sessionId: string): Promise<void> {
    const queue = this.messageQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      this.processingQueues.delete(sessionId);
      return;
    }
    
    console.log(`[MessageHandler] 🔄 处理队列中的消息，队列长度: ${queue.length}`);
    
    const message = queue.shift()!;
    
    if (!this.getOrCreateRuntimeFn) {
      console.error('[MessageHandler] ❌ getOrCreateRuntime 回调未设置，清空队列');
      this.messageQueues.delete(sessionId);
      this.processingQueues.delete(sessionId);
      return;
    }
    
    const runtime = this.getOrCreateRuntimeFn(sessionId);
    
    // 发送队列消息到前端
    if (message.displayContent && this.mainWindow) {
      const isCrossTabMessage = message.content.startsWith('[来自 ');
      
      if (!isCrossTabMessage) {
        this.sendUserMessage(message.displayContent, sessionId);
      } else {
        console.log('[MessageHandler] 🔄 跳过显示跨 Tab 队列消息（将通过 Agent 响应显示）');
      }
    }
    
    try {
      await this.sendAIResponse(runtime, message.content, sessionId);
    } catch (error) {
      console.error('[MessageHandler] ❌ 处理队列消息失败:', error);
      
      const errorMessage = getErrorMessage(error);
      const isAIConnectionError = this.isAIConnectionError(errorMessage);
      const isAgentStateError = 
        errorMessage.includes('already processing') ||
        errorMessage.includes('Agent 未初始化') ||
        errorMessage.includes('卡在') ||
        errorMessage.includes('streaming');
      
      if (isAIConnectionError || isAgentStateError) {
        console.warn('[MessageHandler] 🔧 检测到 AI 连接或状态错误，尝试自动恢复...');
        console.warn(`[MessageHandler] 错误类型: ${isAIConnectionError ? 'AI连接错误' : 'Agent状态错误'}`);
        
        try {
          if (isAIConnectionError) {
            console.log('[MessageHandler] 🔄 清理 AI 连接缓存...');
            const { clearAICache } = await import('./utils/ai-client');
            clearAICache();
          }
          
          console.log('[MessageHandler] 🔄 重置 Runtime 状态...');
          await runtime.stopGeneration();
          await sleep(1000);
          
          console.log('[MessageHandler] 🔄 重试消息处理...');
          await this.sendAIResponse(runtime, message.content, sessionId);
          console.log('[MessageHandler] ✅ 自动恢复成功');
          
          await this.processMessageQueue(sessionId);
          return;
        } catch (retryError) {
          console.error('[MessageHandler] ❌ 自动恢复失败:', getErrorMessage(retryError));
          
          let userMessage = '';
          if (isAIConnectionError) {
            userMessage = `AI 连接超时，已尝试自动恢复但失败。\n\n可能的原因：\n1. 网络连接不稳定\n2. AI 服务响应缓慢\n3. API 配置错误\n\n建议操作：\n1. 检查网络连接\n2. 重新保存模型配置\n3. 如问题持续，请重启应用\n\n错误详情: ${getErrorMessage(retryError)}`;
          } else {
            userMessage = `AI Agent 状态异常，已尝试自动恢复但失败。请重新保存模型配置或重启应用。\n\n错误详情: ${getErrorMessage(retryError)}`;
          }
          
          this.sendError(userMessage, sessionId);
        }
      } else {
        this.sendError(errorMessage, sessionId);
      }
    }
    
    await this.processMessageQueue(sessionId);
  }
  
  /**
   * 发送 AI 响应
   */
  private async sendAIResponse(
    runtime: AgentRuntime,
    userMessage: string,
    sessionId: string,
    sentAt?: number
  ): Promise<void> {
    const messageId = generateMessageId();
    let fullResponse = '';
    const startTime = Date.now();
    
    try {
      // 过滤系统指令和系统提示
      let messageForHistory = userMessage.replace(/\n\n\[系统指令\].*$/s, '');
      messageForHistory = messageForHistory.replace(/\n\n\[系统提示:.*?\]$/s, '');
      
      // 保存用户消息到 session
      const skipHistory = runtime.getSkipHistory();
      const isTaskTab = sessionId.startsWith('task-tab-');
      
      if (this.sessionManager && !skipHistory && !isTaskTab) {
        await this.sessionManager.saveUserMessage(sessionId, messageForHistory, sentAt);
      } else if (skipHistory) {
        console.log('[MessageHandler] 🚫 跳过保存用户消息到历史记录（欢迎消息模式）');
      } else if (isTaskTab) {
        console.log('[MessageHandler] 🚫 跳过保存用户消息到历史记录（定时任务 Tab）');
      }
      
      // 设置执行步骤更新回调
      runtime.setExecutionStepCallback((steps) => {
        console.log(`📋 [MessageHandler] 发送执行步骤更新到前端: ${steps.length} 个步骤`);
        sendToWindow(this.mainWindow, IPC_CHANNELS.EXECUTION_STEP_UPDATE, {
          messageId,
          executionSteps: steps,
          sessionId,
        });
      });
      
      // 获取流式响应
      const stream = runtime.sendMessage(userMessage);
      
      for await (const chunk of stream) {
        fullResponse += chunk;
        this.sendStreamChunk(messageId, chunk, false, false, undefined, undefined, sessionId);
      }
      
      // 等待 Agent 完全空闲
      console.log('[MessageHandler] ✅ Generator 完成，等待 Agent 完全空闲...');
      const { TIMEOUTS } = await import('./config/timeouts');
      const success = await waitUntil(
        () => !runtime.isCurrentlyGenerating(),
        { timeout: TIMEOUTS.AGENT_MESSAGE_TIMEOUT, interval: 50 }
      );
      
      if (!success) {
        console.error('[MessageHandler] ❌ 等待 Agent 空闲超时');
      } else {
        console.log('[MessageHandler] ✅ Agent 已完全空闲');
      }
      
      // 发送完成信号
      const finalSteps = runtime.getExecutionSteps();
      const totalDuration = Date.now() - startTime;
      console.log(`[MessageHandler] ⏱️ Agent 总执行时间: ${(totalDuration / 1000).toFixed(2)} 秒`);
      this.sendStreamChunk(messageId, '', true, false, undefined, finalSteps, sessionId, totalDuration, sentAt);
      
      // 保存 AI 响应到 session
      if (this.sessionManager && fullResponse.trim() && !isTaskTab) {
        await this.sessionManager.saveAssistantMessage(sessionId, fullResponse, finalSteps, totalDuration, sentAt);
        console.log(`[MessageHandler] 💾 已保存 AI 响应和 ${finalSteps.length} 个执行步骤`);
      } else if (isTaskTab && fullResponse.trim()) {
        console.log('[MessageHandler] 🚫 跳过保存 AI 响应到历史记录（定时任务 Tab）');
      }
      
      // Agent 执行完成后，处理队列中的下一条消息
      console.log('[MessageHandler] ✅ Agent 执行完成，检查队列...');
      await this.processMessageQueue(sessionId);
    } catch (error) {
      console.error('AI 响应失败:', error);
      throw error;
    }
  }
  
  /**
   * 发送流式消息块
   */
  private sendStreamChunk(
    messageId: string,
    content: string,
    done: boolean,
    isSubAgentResult?: boolean,
    subAgentTask?: string,
    executionSteps?: any[],
    sessionId?: string,
    totalDuration?: number,
    sentAt?: number
  ): void {
    sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_STREAM, {
      messageId,
      content,
      done,
      isSubAgentResult,
      subAgentTask,
      executionSteps,
      sessionId,
      totalDuration,
      sentAt,
    });
  }
  
  /**
   * 发送错误
   */
  sendError(error: string, sessionId?: string): void {
    console.log('[MessageHandler] 📤 发送错误到前端:', error);
    sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGE_ERROR, {
      error,
      sessionId,
    });
  }
  
  /**
   * 处理停止生成请求
   */
  async handleStopGeneration(sessionId: string, resetSessionRuntimeFn: (sessionId: string, options: { reason?: string; recreate?: boolean }) => Promise<AgentRuntime | null>): Promise<void> {
    console.log('收到停止生成请求');
    await resetSessionRuntimeFn(sessionId, {
      reason: '用户点击 Stop 按钮',
      recreate: false
    });
  }
}
