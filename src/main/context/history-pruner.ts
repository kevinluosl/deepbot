/**
 * 历史消息裁剪器
 * 
 * 当上下文接近限制时，裁剪旧的历史消息
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { estimateMessagesTokens } from '../utils/token-estimator';
import { splitMessagesByTokenShare } from '../utils/message-chunker';

const DEFAULT_PARTS = 2; // 默认分成 2 块
const SAFETY_MARGIN = 1.2; // 20% 安全边界

/**
 * 标准化分块数量
 */
function normalizeParts(parts: number, messageCount: number): number {
  if (!Number.isFinite(parts) || parts <= 1) return 1;
  return Math.min(Math.max(1, Math.floor(parts)), Math.max(1, messageCount));
}

/**
 * 历史消息裁剪结果
 */
export interface HistoryPruneResult {
  messages: AgentMessage[];           // 保留的消息
  droppedMessagesList: AgentMessage[]; // 丢弃的消息列表
  droppedChunks: number;              // 丢弃的块数
  droppedMessages: number;            // 丢弃的消息数
  droppedTokens: number;              // 丢弃的 token 数
  keptTokens: number;                 // 保留的 token 数
  budgetTokens: number;               // 预算 token 数
}

/**
 * 按上下文份额裁剪历史消息
 * 
 * 策略：
 * 1. 计算历史消息的 token 预算（maxContextTokens * maxHistoryShare）
 * 2. 如果当前消息超过预算，按块丢弃最旧的消息
 * 3. 返回保留的消息和丢弃的消息列表
 * 
 * @param params - 裁剪参数
 * @returns 裁剪结果
 */
export function pruneHistoryForContextShare(params: {
  messages: AgentMessage[];
  maxContextTokens: number;
  maxHistoryShare?: number;  // 历史消息最多占多少比例（默认 0.5）
  parts?: number;            // 分块数量（默认 2）
}): HistoryPruneResult {
  const maxHistoryShare = params.maxHistoryShare ?? 0.5;
  const budgetTokens = Math.max(1, Math.floor(params.maxContextTokens * maxHistoryShare * SAFETY_MARGIN));
  
  let keptMessages = params.messages;
  const allDroppedMessages: AgentMessage[] = [];
  let droppedChunks = 0;
  let droppedMessages = 0;
  let droppedTokens = 0;

  const parts = normalizeParts(params.parts ?? DEFAULT_PARTS, keptMessages.length);

  // 循环裁剪，直到满足预算
  while (keptMessages.length > 0 && estimateMessagesTokens(keptMessages) > budgetTokens) {
    const chunks = splitMessagesByTokenShare(keptMessages, parts);
    
    // 如果只有一块，无法继续裁剪
    if (chunks.length <= 1) break;
    
    // 丢弃第一块（最旧的消息）
    const [dropped, ...rest] = chunks;
    droppedChunks += 1;
    droppedMessages += dropped.length;
    droppedTokens += estimateMessagesTokens(dropped);
    allDroppedMessages.push(...dropped);
    keptMessages = rest.flat();
  }

  return {
    messages: keptMessages,
    droppedMessagesList: allDroppedMessages,
    droppedChunks,
    droppedMessages,
    droppedTokens,
    keptTokens: estimateMessagesTokens(keptMessages),
    budgetTokens,
  };
}

/**
 * 简单裁剪：直接丢弃最旧的 N 条消息
 * 
 * @param messages - 消息数组
 * @param keepCount - 保留的消息数量
 * @returns 裁剪结果
 */
export function pruneOldestMessages(
  messages: AgentMessage[],
  keepCount: number
): HistoryPruneResult {
  if (keepCount >= messages.length) {
    return {
      messages,
      droppedMessagesList: [],
      droppedChunks: 0,
      droppedMessages: 0,
      droppedTokens: 0,
      keptTokens: estimateMessagesTokens(messages),
      budgetTokens: 0,
    };
  }

  const dropped = messages.slice(0, messages.length - keepCount);
  const kept = messages.slice(-keepCount);

  return {
    messages: kept,
    droppedMessagesList: dropped,
    droppedChunks: 1,
    droppedMessages: dropped.length,
    droppedTokens: estimateMessagesTokens(dropped),
    keptTokens: estimateMessagesTokens(kept),
    budgetTokens: 0,
  };
}

/**
 * 按 token 限制裁剪历史消息
 * 
 * 从后往前保留消息，直到达到 token 限制
 * 
 * @param messages - 消息数组
 * @param maxTokens - 最大 token 数
 * @returns 裁剪结果
 */
export function pruneByTokenLimit(
  messages: AgentMessage[],
  maxTokens: number
): HistoryPruneResult {
  if (messages.length === 0 || maxTokens <= 0) {
    return {
      messages: [],
      droppedMessagesList: messages,
      droppedChunks: 1,
      droppedMessages: messages.length,
      droppedTokens: estimateMessagesTokens(messages),
      keptTokens: 0,
      budgetTokens: maxTokens,
    };
  }

  const kept: AgentMessage[] = [];
  let totalTokens = 0;

  // 从后往前遍历
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const messageTokens = estimateMessagesTokens([message]);
    
    // 如果添加这条消息会超过限制，停止
    if (totalTokens + messageTokens > maxTokens && kept.length > 0) {
      break;
    }
    
    kept.unshift(message);
    totalTokens += messageTokens;
  }

  const dropped = messages.slice(0, messages.length - kept.length);

  return {
    messages: kept,
    droppedMessagesList: dropped,
    droppedChunks: dropped.length > 0 ? 1 : 0,
    droppedMessages: dropped.length,
    droppedTokens: estimateMessagesTokens(dropped),
    keptTokens: totalTokens,
    budgetTokens: maxTokens,
  };
}

/**
 * 智能裁剪：保护重要消息
 * 
 * 保护策略：
 * 1. 保留第一条 user 消息（通常是任务描述）
 * 2. 保留最后 N 条消息（最近的对话）
 * 3. 裁剪中间的消息
 * 
 * @param messages - 消息数组
 * @param maxTokens - 最大 token 数
 * @param keepLastCount - 保留最后 N 条消息（默认 10）
 * @returns 裁剪结果
 */
export function smartPrune(
  messages: AgentMessage[],
  maxTokens: number,
  keepLastCount: number = 10
): HistoryPruneResult {
  if (messages.length === 0) {
    return {
      messages: [],
      droppedMessagesList: [],
      droppedChunks: 0,
      droppedMessages: 0,
      droppedTokens: 0,
      keptTokens: 0,
      budgetTokens: maxTokens,
    };
  }

  // 找到第一条 user 消息
  let firstUserIndex = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      firstUserIndex = i;
      break;
    }
  }

  // 保护区域：第一条 user 消息 + 最后 N 条消息
  const protectedMessages: AgentMessage[] = [];
  const protectedIndexes = new Set<number>();

  // 保护第一条 user 消息
  if (firstUserIndex >= 0) {
    protectedMessages.push(messages[firstUserIndex]);
    protectedIndexes.add(firstUserIndex);
  }

  // 保护最后 N 条消息
  const lastMessages = messages.slice(-keepLastCount);
  const lastStartIndex = Math.max(0, messages.length - keepLastCount);
  for (let i = 0; i < lastMessages.length; i++) {
    const index = lastStartIndex + i;
    if (!protectedIndexes.has(index)) {
      protectedMessages.push(lastMessages[i]);
      protectedIndexes.add(index);
    }
  }

  // 计算保护消息的 token 数
  const protectedTokens = estimateMessagesTokens(protectedMessages);

  // 如果保护消息已经超过限制，只保留最后 N 条
  if (protectedTokens > maxTokens) {
    return pruneByTokenLimit(messages, maxTokens);
  }

  // 可用于中间消息的 token 预算
  const remainingTokens = maxTokens - protectedTokens;

  // 收集中间消息（不在保护区域的消息）
  const middleMessages: AgentMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (!protectedIndexes.has(i)) {
      middleMessages.push(messages[i]);
    }
  }

  // 从中间消息中选择一些保留
  const keptMiddle: AgentMessage[] = [];
  let middleTokens = 0;

  for (let i = middleMessages.length - 1; i >= 0; i--) {
    const message = middleMessages[i];
    const messageTokens = estimateMessagesTokens([message]);
    
    if (middleTokens + messageTokens <= remainingTokens) {
      keptMiddle.unshift(message);
      middleTokens += messageTokens;
    }
  }

  // 重建消息数组（保持原始顺序）
  const kept: AgentMessage[] = [];
  const dropped: AgentMessage[] = [];
  const keptMiddleSet = new Set(keptMiddle);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (protectedIndexes.has(i) || keptMiddleSet.has(message)) {
      kept.push(message);
    } else {
      dropped.push(message);
    }
  }

  return {
    messages: kept,
    droppedMessagesList: dropped,
    droppedChunks: dropped.length > 0 ? 1 : 0,
    droppedMessages: dropped.length,
    droppedTokens: estimateMessagesTokens(dropped),
    keptTokens: estimateMessagesTokens(kept),
    budgetTokens: maxTokens,
  };
}
