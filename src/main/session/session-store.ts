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
  // 总执行时间（毫秒）- 仅 assistant 消息有
  totalDuration?: number;
  // 发送时间（毫秒时间戳）
  // - user 消息：自己的发送时间
  // - assistant 消息：对应的用户消息的发送时间
  sentAt?: number;
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
          // 跳过无效消息
        }
      }
      
      return messages;
    } catch (error) {
      console.error('[SessionStore] ❌ 加载消息失败:', getErrorMessage(error));
      return [];
    }
  }
  
  /**
   * 加载最近 N 轮消息（用于 UI 显示）
   * 
   * 🔥 性能优化：倒序读取文件，只读取需要的消息数量
   * 
   * @param tabId - Tab ID
   * @param maxRounds - 最多加载多少轮对话（默认 100）
   * @returns 最近的消息列表
   */
  async loadRecentMessages(tabId: string, maxRounds: number = 100): Promise<SessionMessage[]> {
    try {
      const filePath = this.getSessionFilePath(tabId);
      
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        return [];
      }
      
      // 🔥 倒序读取文件（从末尾开始）
      const messages = await this.loadRecentMessagesFromFile(filePath, maxRounds);
      
      return messages;
    } catch (error) {
      console.error('[SessionStore] ❌ 加载最近消息失败:', getErrorMessage(error));
      return [];
    }
  }
  
  /**
   * 从文件倒序读取最近 N 轮消息
   * 
   * 🔥 性能优化：
   * 1. 使用流式读取，避免一次性加载整个文件
   * 2. 从文件末尾开始读取
   * 3. 读取到足够的轮次后立即停止
   * 
   * @param filePath - 文件路径
   * @param maxRounds - 最多加载多少轮对话
   * @returns 最近的消息列表
   */
  private async loadRecentMessagesFromFile(filePath: string, maxRounds: number): Promise<SessionMessage[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return [];
    }
    
    // 🔥 倒序解析消息（从最新的开始）
    const messages: SessionMessage[] = [];
    const rounds: SessionMessage[][] = [];
    let currentRound: SessionMessage[] = [];
    
    // 从后往前遍历
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const message = JSON.parse(lines[i]);
        
        // 倒序构建轮次
        if (message.role === 'assistant') {
          currentRound.unshift(message);
        } else if (message.role === 'user') {
          currentRound.unshift(message);
          rounds.unshift(currentRound);
          currentRound = [];
          
          // 🔥 读取到足够的轮次后停止
          if (rounds.length >= maxRounds) {
            break;
          }
        }
      } catch (error) {
        // 跳过无效消息
      }
    }
    
    // 展平为消息列表
    return rounds.flat();
  }
  
  /**
   * 加载最近 N 轮对话（用于 Agent 上下文）
   * 
   * 🔥 性能优化：倒序读取文件，只读取需要的消息数量
   * 
   * 一轮对话 = 1 条 user 消息 + 1 条 assistant 消息（assistant 消息可能包含多个工具调用）
   * 
   * @param tabId - Tab ID
   * @param maxRounds - 最多加载多少轮对话（默认 10）
   * @returns 最近的消息列表
   */
  async loadContextMessages(tabId: string, maxRounds: number = 10): Promise<SessionMessage[]> {
    try {
      const filePath = this.getSessionFilePath(tabId);
      
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        return [];
      }
      
      // 🔥 复用倒序读取逻辑
      return await this.loadRecentMessagesFromFile(filePath, maxRounds);
    } catch (error) {
      console.error('[SessionStore] ❌ 加载上下文消息失败:', getErrorMessage(error));
      return [];
    }
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
      } catch {
        // 文件不存在，无需删除
      }
    } catch (error) {
      console.error('[SessionStore] ❌ 清空 session 失败:', getErrorMessage(error));
      throw error;
    }
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
   * 
   * 🔥 性能优化：只统计行数，不解析消息内容
   */
  async getMessageCount(tabId: string): Promise<number> {
    try {
      const filePath = this.getSessionFilePath(tabId);
      
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch {
        return 0;
      }
      
      // 🔥 只读取文件统计行数，不解析 JSON
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      return lines.length;
    } catch (error) {
      console.error('[SessionStore] ❌ 获取消息数量失败:', getErrorMessage(error));
      return 0;
    }
  }
}

