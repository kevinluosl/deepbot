/**
 * 工具结果裁剪器
 * 
 * 自动裁剪冗长的工具调用结果，节省上下文空间
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { estimateTokens, getContextWindowTokens } from '../utils/token-estimator';

/**
 * 裁剪配置
 */
export interface PruningSettings {
  softTrimRatio: number;      // 开始 Soft Trim 的阈值（默认 0.7）
  hardClearRatio: number;     // 开始 Hard Clear 的阈值（默认 0.85）
  headChars: number;          // Soft Trim 保留的头部字符数
  tailChars: number;          // Soft Trim 保留的尾部字符数
  placeholder: string;        // Hard Clear 的占位符
  keepLastAssistants: number; // 保护最后 N 个 assistant 消息
  minPrunableChars: number;   // 最小可裁剪字符数
}

/**
 * 默认裁剪配置
 */
export const DEFAULT_PRUNING_SETTINGS: PruningSettings = {
  softTrimRatio: 0.7,
  hardClearRatio: 0.85,
  headChars: 500,
  tailChars: 500,
  placeholder: '[工具结果已清除以节省上下文空间]',
  keepLastAssistants: 3,
  minPrunableChars: 2000, // 只裁剪超过 2000 字符的结果
};

/**
 * 文本内容块
 */
interface TextContent {
  type: 'text';
  text: string;
}

/**
 * 图片内容块
 */
interface ImageContent {
  type: 'image';
  source: unknown;
}

/**
 * 工具结果消息
 */
interface ToolResultMessage {
  role: 'toolResult';
  toolName: string;
  content: Array<TextContent | ImageContent>;
  toolCallId?: string;
  isError?: boolean;
  timestamp?: number;
}

/**
 * 收集文本片段
 */
function collectTextSegments(content: Array<TextContent | ImageContent>): string[] {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      parts.push(block.text);
    }
  }
  return parts;
}

/**
 * 估算拼接后的文本长度
 */
function estimateJoinedTextLength(parts: string[]): number {
  if (parts.length === 0) return 0;
  
  let len = 0;
  for (const p of parts) {
    len += p.length;
  }
  
  // 加上换行符的长度
  len += Math.max(0, parts.length - 1);
  
  return len;
}

/**
 * 从拼接文本中提取头部
 */
function takeHeadFromJoinedText(parts: string[], maxChars: number): string {
  if (maxChars <= 0 || parts.length === 0) return '';
  
  let remaining = maxChars;
  let out = '';
  
  for (let i = 0; i < parts.length && remaining > 0; i++) {
    if (i > 0) {
      out += '\n';
      remaining -= 1;
      if (remaining <= 0) break;
    }
    
    const p = parts[i];
    if (p.length <= remaining) {
      out += p;
      remaining -= p.length;
    } else {
      out += p.slice(0, remaining);
      remaining = 0;
    }
  }
  
  return out;
}

/**
 * 从拼接文本中提取尾部
 */
function takeTailFromJoinedText(parts: string[], maxChars: number): string {
  if (maxChars <= 0 || parts.length === 0) return '';
  
  let remaining = maxChars;
  const out: string[] = [];
  
  for (let i = parts.length - 1; i >= 0 && remaining > 0; i--) {
    const p = parts[i];
    
    if (p.length <= remaining) {
      out.push(p);
      remaining -= p.length;
    } else {
      out.push(p.slice(p.length - remaining));
      remaining = 0;
      break;
    }
    
    if (remaining > 0 && i > 0) {
      out.push('\n');
      remaining -= 1;
    }
  }
  
  out.reverse();
  return out.join('');
}

/**
 * 检查内容是否包含图片
 */
function hasImageBlocks(content: Array<TextContent | ImageContent>): boolean {
  for (const block of content) {
    if (block.type === 'image') return true;
  }
  return false;
}

/**
 * 查找最后 N 个 assistant 消息的截止索引
 */
function findAssistantCutoffIndex(
  messages: AgentMessage[],
  keepLastAssistants: number
): number | null {
  if (keepLastAssistants <= 0) return messages.length;

  let remaining = keepLastAssistants;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'assistant') continue;
    remaining--;
    if (remaining === 0) return i;
  }

  return null; // 没有足够的 assistant 消息
}

/**
 * 查找第一个 user 消息的索引
 */
function findFirstUserIndex(messages: AgentMessage[]): number | null {
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'user') return i;
  }
  return null;
}

/**
 * Soft Trim：保留头尾，中间用省略号替代
 */
function softTrimToolResult(
  msg: ToolResultMessage,
  settings: PruningSettings
): ToolResultMessage | null {
  // 跳过包含图片的工具结果
  if (hasImageBlocks(msg.content)) return null;

  const parts = collectTextSegments(msg.content);
  const rawLen = estimateJoinedTextLength(parts);
  
  // 如果长度不超过限制，不裁剪
  if (rawLen <= settings.minPrunableChars) return null;

  const headChars = Math.max(0, settings.headChars);
  const tailChars = Math.max(0, settings.tailChars);
  
  // 如果头尾加起来已经超过原长度，不裁剪
  if (headChars + tailChars >= rawLen) return null;

  const head = takeHeadFromJoinedText(parts, headChars);
  const tail = takeTailFromJoinedText(parts, tailChars);
  
  const trimmed = `${head}\n...\n${tail}`;
  const note = `\n\n[工具结果已裁剪: 保留前 ${headChars} 字符和后 ${tailChars} 字符，共 ${rawLen} 字符]`;

  return {
    ...msg,
    content: [{ type: 'text', text: trimmed + note }],
  };
}

/**
 * Hard Clear：完全替换为占位符
 */
function hardClearToolResult(
  msg: ToolResultMessage,
  settings: PruningSettings
): ToolResultMessage {
  return {
    ...msg,
    content: [{ type: 'text', text: settings.placeholder }],
  };
}

/**
 * 裁剪工具结果
 * 
 * @param messages - 消息数组
 * @param settings - 裁剪配置
 * @param modelId - 模型 ID
 * @returns 裁剪后的消息数组和统计信息
 */
export function pruneToolResults(
  messages: AgentMessage[],
  settings: PruningSettings = DEFAULT_PRUNING_SETTINGS,
  modelId?: string
): {
  messages: AgentMessage[];
  stats: {
    totalMessages: number;
    softTrimmed: number;
    hardCleared: number;
    tokensBefore: number;
    tokensAfter: number;
    tokensSaved: number;
  };
} {
  const contextWindow = getContextWindowTokens(modelId);
  const charWindow = contextWindow * 4; // 字符数 = token 数 * 4

  // 计算初始 token 数
  const tokensBefore = messages.reduce((sum, m) => sum + estimateTokens(m), 0);
  let totalChars = tokensBefore * 4;
  let ratio = totalChars / charWindow;

  // 如果使用率 < softTrimRatio，不裁剪
  if (ratio < settings.softTrimRatio) {
    return {
      messages,
      stats: {
        totalMessages: messages.length,
        softTrimmed: 0,
        hardCleared: 0,
        tokensBefore,
        tokensAfter: tokensBefore,
        tokensSaved: 0,
      },
    };
  }

  // 找到保护区域
  const cutoffIndex = findAssistantCutoffIndex(messages, settings.keepLastAssistants);
  const firstUserIndex = findFirstUserIndex(messages);
  const pruneStartIndex = firstUserIndex === null ? messages.length : firstUserIndex;

  // 如果没有可裁剪的区域
  if (cutoffIndex === null || pruneStartIndex >= cutoffIndex) {
    return {
      messages,
      stats: {
        totalMessages: messages.length,
        softTrimmed: 0,
        hardCleared: 0,
        tokensBefore,
        tokensAfter: tokensBefore,
        tokensSaved: 0,
      },
    };
  }

  let softTrimmed = 0;
  let hardCleared = 0;
  let next: AgentMessage[] | null = null;
  const prunableIndexes: number[] = [];

  // 第一阶段：Soft Trim
  for (let i = pruneStartIndex; i < cutoffIndex; i++) {
    const msg = messages[i];
    if (!msg || msg.role !== 'toolResult') continue;
    if (hasImageBlocks((msg as ToolResultMessage).content)) continue;
    
    prunableIndexes.push(i);

    const updated = softTrimToolResult(msg as ToolResultMessage, settings);
    if (!updated) continue;

    const beforeChars = estimateTokens(msg) * 4;
    const afterChars = estimateTokens(updated as AgentMessage) * 4;
    totalChars += afterChars - beforeChars;
    
    if (!next) next = messages.slice();
    next[i] = updated as AgentMessage;
    softTrimmed++;
  }

  const outputAfterSoftTrim = next ?? messages;
  ratio = totalChars / charWindow;

  // 如果使用率 < hardClearRatio，停止
  if (ratio < settings.hardClearRatio) {
    const tokensAfter = outputAfterSoftTrim.reduce((sum, m) => sum + estimateTokens(m), 0);
    return {
      messages: outputAfterSoftTrim,
      stats: {
        totalMessages: messages.length,
        softTrimmed,
        hardCleared: 0,
        tokensBefore,
        tokensAfter,
        tokensSaved: tokensBefore - tokensAfter,
      },
    };
  }

  // 第二阶段：Hard Clear
  for (const i of prunableIndexes) {
    if (ratio < settings.hardClearRatio) break;
    
    const msg = (next ?? messages)[i];
    if (!msg || msg.role !== 'toolResult') continue;

    const beforeChars = estimateTokens(msg) * 4;
    const cleared = hardClearToolResult(msg as ToolResultMessage, settings);
    
    if (!next) next = messages.slice();
    next[i] = cleared as AgentMessage;
    
    const afterChars = estimateTokens(cleared as AgentMessage) * 4;
    totalChars += afterChars - beforeChars;
    ratio = totalChars / charWindow;
    hardCleared++;
  }

  const finalMessages = next ?? messages;
  const tokensAfter = finalMessages.reduce((sum, m) => sum + estimateTokens(m), 0);

  return {
    messages: finalMessages,
    stats: {
      totalMessages: messages.length,
      softTrimmed,
      hardCleared,
      tokensBefore,
      tokensAfter,
      tokensSaved: tokensBefore - tokensAfter,
    },
  };
}
