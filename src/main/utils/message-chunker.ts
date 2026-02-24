/**
 * 消息分块工具
 * 
 * 提供消息分块功能，用于摘要生成和历史裁剪
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { estimateTokens, estimateMessagesTokens } from './token-estimator';

const DEFAULT_PARTS = 2; // 默认分成 2 块

/**
 * 标准化分块数量
 * 
 * @param parts - 期望的分块数量
 * @param messageCount - 消息总数
 * @returns 实际分块数量
 */
function normalizeParts(parts: number, messageCount: number): number {
  if (!Number.isFinite(parts) || parts <= 1) return 1;
  return Math.min(Math.max(1, Math.floor(parts)), Math.max(1, messageCount));
}

/**
 * 按 token 份额分割消息
 * 
 * 将消息数组按 token 数量均分成 N 块
 * 
 * @param messages - 消息数组
 * @param parts - 分块数量（默认 2）
 * @returns 分块后的消息数组
 */
export function splitMessagesByTokenShare(
  messages: AgentMessage[],
  parts: number = DEFAULT_PARTS
): AgentMessage[][] {
  if (messages.length === 0) return [];
  
  const normalizedParts = normalizeParts(parts, messages.length);
  if (normalizedParts <= 1) return [messages];

  const totalTokens = estimateMessagesTokens(messages);
  const targetTokens = totalTokens / normalizedParts;
  
  const chunks: AgentMessage[][] = [];
  let current: AgentMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateTokens(message);
    
    // 如果当前块已经接近目标大小，且还没到最后一块，则开始新块
    if (
      chunks.length < normalizedParts - 1 &&
      current.length > 0 &&
      currentTokens + messageTokens > targetTokens
    ) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(message);
    currentTokens += messageTokens;
  }

  // 添加最后一块
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * 按最大 token 数分块
 * 
 * 将消息数组分成多个块，每块不超过指定的 token 数量
 * 
 * @param messages - 消息数组
 * @param maxTokens - 每块最大 token 数
 * @returns 分块后的消息数组
 */
export function chunkMessagesByMaxTokens(
  messages: AgentMessage[],
  maxTokens: number
): AgentMessage[][] {
  if (messages.length === 0) return [];

  const chunks: AgentMessage[][] = [];
  let currentChunk: AgentMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const messageTokens = estimateTokens(message);
    
    // 如果添加这条消息会超过限制，先保存当前块
    if (currentChunk.length > 0 && currentTokens + messageTokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(message);
    currentTokens += messageTokens;

    // 如果单条消息就超过限制，立即开始新块（避免无限增长）
    if (messageTokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }
  }

  // 添加最后一块
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * 获取消息数组的最后 N 条消息
 * 
 * @param messages - 消息数组
 * @param count - 要获取的消息数量
 * @returns 最后 N 条消息
 */
export function getLastMessages(messages: AgentMessage[], count: number): AgentMessage[] {
  if (count <= 0) return [];
  if (count >= messages.length) return messages;
  
  return messages.slice(-count);
}

/**
 * 获取消息数组的前 N 条消息
 * 
 * @param messages - 消息数组
 * @param count - 要获取的消息数量
 * @returns 前 N 条消息
 */
export function getFirstMessages(messages: AgentMessage[], count: number): AgentMessage[] {
  if (count <= 0) return [];
  if (count >= messages.length) return messages;
  
  return messages.slice(0, count);
}

/**
 * 按 token 限制获取最后的消息
 * 
 * 从后往前获取消息，直到达到 token 限制
 * 
 * @param messages - 消息数组
 * @param maxTokens - 最大 token 数
 * @returns 符合限制的消息数组
 */
export function getLastMessagesByTokens(
  messages: AgentMessage[],
  maxTokens: number
): AgentMessage[] {
  if (messages.length === 0 || maxTokens <= 0) return [];

  const result: AgentMessage[] = [];
  let totalTokens = 0;

  // 从后往前遍历
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const messageTokens = estimateTokens(message);
    
    // 如果添加这条消息会超过限制，停止
    if (totalTokens + messageTokens > maxTokens && result.length > 0) {
      break;
    }
    
    result.unshift(message);
    totalTokens += messageTokens;
  }

  return result;
}

/**
 * 分块统计信息
 */
export interface ChunkStats {
  totalChunks: number;
  chunkSizes: number[];      // 每块的消息数量
  chunkTokens: number[];     // 每块的 token 数量
  totalMessages: number;
  totalTokens: number;
}

/**
 * 获取分块统计信息
 * 
 * @param chunks - 分块后的消息数组
 * @returns 统计信息
 */
export function getChunkStats(chunks: AgentMessage[][]): ChunkStats {
  const chunkSizes = chunks.map(chunk => chunk.length);
  const chunkTokens = chunks.map(chunk => estimateMessagesTokens(chunk));
  
  return {
    totalChunks: chunks.length,
    chunkSizes,
    chunkTokens,
    totalMessages: chunkSizes.reduce((sum, size) => sum + size, 0),
    totalTokens: chunkTokens.reduce((sum, tokens) => sum + tokens, 0),
  };
}
