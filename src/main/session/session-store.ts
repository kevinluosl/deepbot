/**
 * Session 存储管理
 * 
 * 职责：
 * - 管理每个 Tab 的对话历史（JSONL 格式）
 * - 支持消息持久化和加载
 * - 支持最近 N 轮消息查询
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { expandUserPath } from '../../shared/utils/path-utils';
import { ensureDirectoryExists } from '../../shared/utils/fs-utils';
import { getErrorMessage } from '../../shared/utils/error-handler';

/**
 * Session 消息数据结构
 */
export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  // 执行步骤（工具调用记录）- 仅 assistant 消息有
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
  }>;
}

/**
 * Session 存储类
 */
export class SessionStore {
  private sessionDir: string;
  
  constructor(sessionDir: string) {
    this.sessionDir = expandUserPath(sessionDir);
  }
  
  /**
   * 初始化 session 目录
   */
  async initialize(): Promise<void> {
    try {
      await ensureDirectoryExists(this.sessionDir);
      console.log('[SessionStore] ✅ Session 目录已初始化:', this.sessionDir);
    } catch (error) {
      console.error('[SessionStore] ❌ 初始化 session 目录失败:', getErrorMessage(error));
      throw error;
    }
  }
  
  /**
   * 获取 Tab 的 session 文件路径
   */
  private getSessionFilePath(tabId: string): string {
    return join(this.sessionDir, `${tabId}.jsonl`);
  }
  
  /**
   * 追加消息到 session 文件
   */
  async appendMessage(tabId: string, message: SessionMessage): Promise<void> {
    try {
      const filePath = this.getSessionFilePath(tabId);
      const line = JSON.stringify(message) + '\n';
      
      await fs.appendFile(filePath, line, 'utf-8');
      // console.log(`[SessionStore] 💾 已保存消息: ${tabId} (${message.role})`);
    } catch (error) {
      console.error('[SessionStore] ❌ 保存消息失败:', getErrorMessage(error));
      throw error;
    }
  }
  
  /**
   * 批量追加消息
   */
  async appendMessages(tabId: string, messages: SessionMessage[]): Promise<void> {
    try {
      const filePath = this.getSessionFilePath(tabId);
      const lines = messages.map(msg => JSON.stringify(msg) + '\n').join('');
      
      await fs.appendFile(filePath, lines, 'utf-8');
      console.log(`[SessionStore] 💾 已批量保存 ${messages.length} 条消息: ${tabId}`);
    } catch (error) {
      console.error('[SessionStore] ❌ 批量保存消息失败:', getErrorMessage(error));
      throw error;
    }
  }
  
  /**
   * 加载所有消息
   */
  async loadAllMessages(tabId: string): Promise<SessionMessage[]> {
    try {
      const filePath = this.getSessionFilePath(tabId);
      
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        // 文件不存在，返回空数组
        return [];
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      const messages: SessionMessage[] = [];
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          messages.push(message);
        } catch (error) {
          console.warn('[SessionStore] ⚠️ 解析消息失败，跳过:', line.substring(0, 50));
        }
      }
      
      console.log(`[SessionStore] 📖 已加载 ${messages.length} 条消息: ${tabId}`);
      return messages;
    } catch (error) {
      console.error('[SessionStore] ❌ 加载消息失败:', getErrorMessage(error));
      return [];
    }
  }
  
  /**
   * 加载最近 N 轮消息（用于 UI 显示）
   * 
   * @param tabId - Tab ID
   * @param maxRounds - 最多加载多少轮对话（默认 100）
   * @returns 最近的消息列表
   */
  async loadRecentMessages(tabId: string, maxRounds: number = 100): Promise<SessionMessage[]> {
    const allMessages = await this.loadAllMessages(tabId);
    
    // 计算最多保留多少条消息（每轮 2 条：user + assistant）
    const maxMessages = maxRounds * 2;
    
    if (allMessages.length <= maxMessages) {
      return allMessages;
    }
    
    // 返回最后 N 条消息
    return allMessages.slice(-maxMessages);
  }
  
  /**
   * 加载最近 N 轮对话（用于 Agent 上下文）
   * 
   * @param tabId - Tab ID
   * @param maxRounds - 最多加载多少轮对话（默认 10）
   * @returns 最近的消息列表
   */
  async loadContextMessages(tabId: string, maxRounds: number = 10): Promise<SessionMessage[]> {
    const allMessages = await this.loadAllMessages(tabId);
    
    // 计算最多保留多少条消息（每轮 2 条：user + assistant）
    const maxMessages = maxRounds * 2;
    
    if (allMessages.length <= maxMessages) {
      return allMessages;
    }
    
    // 返回最后 N 条消息
    return allMessages.slice(-maxMessages);
  }
  
  /**
   * 清空 Tab 的 session 文件
   */
  async clearSession(tabId: string): Promise<void> {
    try {
      const filePath = this.getSessionFilePath(tabId);
      
      // 检查文件是否存在
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        console.log(`[SessionStore] 🗑️ 已清空 session: ${tabId}`);
      } catch {
        // 文件不存在，无需删除
      }
    } catch (error) {
      console.error('[SessionStore] ❌ 清空 session 失败:', getErrorMessage(error));
      throw error;
    }
  }
  
  /**
   * 删除 Tab 的 session 文件
   */
  async deleteSession(tabId: string): Promise<void> {
    await this.clearSession(tabId);
  }
  
  /**
   * 检查 session 文件是否存在
   */
  async sessionExists(tabId: string): Promise<boolean> {
    try {
      const filePath = this.getSessionFilePath(tabId);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 获取 session 文件大小（字节）
   */
  async getSessionSize(tabId: string): Promise<number> {
    try {
      const filePath = this.getSessionFilePath(tabId);
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }
  
  /**
   * 获取 session 消息数量
   */
  async getMessageCount(tabId: string): Promise<number> {
    const messages = await this.loadAllMessages(tabId);
    return messages.length;
  }
}

