/**
 * Session 管理器
 * 
 * 职责：
 * - 管理 SessionStore 实例
 * - 提供消息持久化和加载接口
 * - 管理上下文消息（最近 10 轮）
 */

import { SessionStore, type SessionMessage } from './session-store';
import { getErrorMessage } from '../../shared/utils/error-handler';
import type { Message } from '../../types/message';

/**
 * Session 管理器类
 */
export class SessionManager {
  private sessionStore: SessionStore;
  
  // 配置常量
  private readonly MAX_UI_ROUNDS = 100;      // UI 显示最多 100 轮
  private readonly MAX_CONTEXT_ROUNDS = 10;  // Agent 上下文最多 10 轮
  
  constructor(sessionDir: string) {
    this.sessionStore = new SessionStore(sessionDir);
  }
  
  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await this.sessionStore.initialize();
  }
  
  /**
   * 保存用户消息
   */
  async saveUserMessage(tabId: string, content: string, sentAt?: number): Promise<void> {
    const message: SessionMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
      sentAt, // 保存发送时间
    };
    
    await this.sessionStore.appendMessage(tabId, message);
  }
  
  /**
   * 保存 AI 响应
   * 
   * @param tabId - Tab ID
   * @param content - 响应内容
   * @param executionSteps - 执行步骤（可选）
   * @param totalDuration - 总执行时间（毫秒，可选）
   * @param sentAt - 对应的用户消息发送时间（可选）
   */
  async saveAssistantMessage(
    tabId: string, 
    content: string, 
    executionSteps?: Array<{
      id: string;
      toolName: string;
      toolLabel?: string;
      params?: any;
      result?: string;
      error?: string;
      status: 'running' | 'success' | 'error';
      timestamp: number;
      duration?: number;
    }>,
    totalDuration?: number,
    sentAt?: number
  ): Promise<void> {
    const message: SessionMessage = {
      role: 'assistant',
      content,
      timestamp: Date.now(),
      executionSteps, // 保存执行步骤
      totalDuration, // 保存总执行时间
      sentAt, // 保存对应的用户消息发送时间
    };
    
    await this.sessionStore.appendMessage(tabId, message);
  }
  
  /**
   * 保存系统消息
   */
  async saveSystemMessage(tabId: string, content: string): Promise<void> {
    const message: SessionMessage = {
      role: 'system',
      content,
      timestamp: Date.now(),
    };
    
    await this.sessionStore.appendMessage(tabId, message);
  }
  
  /**
   * 加载 UI 显示消息（最近 100 轮）
   */
  async loadUIMessages(tabId: string): Promise<Message[]> {
    try {
      const sessionMessages = await this.sessionStore.loadRecentMessages(
        tabId,
        this.MAX_UI_ROUNDS
      );
      
      return this.convertToUIMessages(sessionMessages);
    } catch (error) {
      console.error('[SessionManager] ❌ 加载 UI 消息失败:', getErrorMessage(error));
      return [];
    }
  }
  
  /**
   * 加载 Agent 上下文消息（最近 10 轮）
   */
  async loadContextMessages(tabId: string): Promise<SessionMessage[]> {
    try {
      return await this.sessionStore.loadContextMessages(
        tabId,
        this.MAX_CONTEXT_ROUNDS
      );
    } catch (error) {
      console.error('[SessionManager] ❌ 加载上下文消息失败:', getErrorMessage(error));
      return [];
    }
  }
  
  /**
   * 清空 Tab 的 session
   */
  async clearSession(tabId: string): Promise<void> {
    await this.sessionStore.clearSession(tabId);
  }
  
  /**
   * 检查 session 是否存在
   */
  async sessionExists(tabId: string): Promise<boolean> {
    return await this.sessionStore.sessionExists(tabId);
  }
  
  /**
   * 获取消息数量
   */
  async getMessageCount(tabId: string): Promise<number> {
    return await this.sessionStore.getMessageCount(tabId);
  }
  
  /**
   * 将 SessionMessage 转换为 UI Message
   */
  private convertToUIMessages(sessionMessages: SessionMessage[]): Message[] {
    return sessionMessages.map((msg, index) => {
      // 🔥 过滤掉系统指令和系统提示（作为保险，防止旧数据中有这些内容）
      let content = msg.content;
      content = content.replace(/\n\n\[系统指令\].*$/s, '');
      content = content.replace(/\n\n\[系统提示:.*?\]$/s, '');
      
      return {
        id: `${msg.timestamp}-${index}`,
        role: msg.role,
        content,
        timestamp: msg.timestamp,
        executionSteps: msg.executionSteps, // 恢复执行步骤
        totalDuration: msg.totalDuration, // 恢复总执行时间
        sentAt: msg.sentAt, // 恢复发送时间
      };
    });
  }
  
  /**
   * 获取 SessionStore 实例（用于高级操作）
   */
  getStore(): SessionStore {
    return this.sessionStore;
  }
  
  /**
   * 获取 session 文件路径
   */
  getSessionFilePath(tabId: string): string {
    // SessionStore 的 sessionDir 是私有的，我们需要通过 getStore 访问
    // 但是 getSessionFilePath 也是私有的，所以我们直接构造路径
    const { join } = require('path');
    // 从 sessionStore 获取 sessionDir（通过反射访问私有属性）
    const sessionDir = (this.sessionStore as any).sessionDir;
    return join(sessionDir, `${tabId}.jsonl`);
  }

  /**
   * 获取所有消息（用于 UI 显示）
   */
  async getMessages(tabId: string): Promise<Message[]> {
    return await this.loadUIMessages(tabId);
  }

  /**
   * 清空消息（别名方法）
   */
  async clearMessages(tabId: string): Promise<void> {
    await this.clearSession(tabId);
  }

  /**
   * 删除会话
   */
  async deleteSession(tabId: string): Promise<void> {
    await this.clearSession(tabId);
  }

  /**
   * 获取所有会话
   */
  async getAllSessions(): Promise<Array<{ id: string; title: string; messageCount: number }>> {
    // 这里需要实现获取所有会话的逻辑
    // 暂时返回空数组，后续可以扩展
    return [];
  }
}

