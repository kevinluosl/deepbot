/**
 * Token 估算工具
 * 
 * 提供简单高效的 token 估算功能
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';

/**
 * Token 估算常量
 */
const CHARS_PER_TOKEN = 4;           // 平均 4 个字符 = 1 token
const IMAGE_TOKEN_ESTIMATE = 2000;   // 图片约 2000 tokens
const DEFAULT_CONTEXT_WINDOW = 128000; // 默认上下文窗口（128K）

/**
 * 模型上下文窗口配置
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Claude 系列
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-sonnet-latest': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus-20240229': 200000,
  'claude-3-sonnet-20240229': 200000,
  'claude-3-haiku-20240307': 200000,
  
  // GPT 系列
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  
  // DeepSeek 系列
  'deepseek-chat': 64000,
  'deepseek-coder': 64000,
  
  // Qwen 系列
  'qwen-max': 32000,
  'qwen-plus': 32000,
  'qwen-turbo': 8000,
  'qwen2.5-72b-instruct': 32000,
  'qwen2.5-32b-instruct': 32000,
  'qwen2.5-14b-instruct': 32000,
  'qwen2.5-7b-instruct': 32000,
  'qwen-long': 1000000,  // Qwen-Long 支持 100 万 tokens
};

/**
 * 估算单条消息的 token 数量
 * 
 * @param message - Agent 消息
 * @returns 估算的 token 数量
 */
export function estimateTokens(message: AgentMessage): number {
  if (!message) return 0;

  // User 消息
  if (message.role === 'user') {
    const content = message.content;
    
    // 字符串内容
    if (typeof content === 'string') {
      return Math.ceil(content.length / CHARS_PER_TOKEN);
    }
    
    // 数组内容（文本 + 图片）
    if (Array.isArray(content)) {
      let tokens = 0;
      for (const block of content) {
        if (block.type === 'text') {
          tokens += Math.ceil(block.text.length / CHARS_PER_TOKEN);
        } else if (block.type === 'image') {
          tokens += IMAGE_TOKEN_ESTIMATE;
        }
      }
      return tokens;
    }
    
    return 0;
  }

  // Assistant 消息
  if (message.role === 'assistant') {
    let tokens = 0;
    
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'text') {
          tokens += Math.ceil(block.text.length / CHARS_PER_TOKEN);
        } else if (block.type === 'thinking') {
          tokens += Math.ceil(block.thinking.length / CHARS_PER_TOKEN);
        } else if (block.type === 'toolCall') {
          // 工具调用：估算参数 JSON 的大小
          try {
            const argsStr = JSON.stringify(block.arguments ?? {});
            tokens += Math.ceil(argsStr.length / CHARS_PER_TOKEN);
          } catch {
            tokens += 32; // 默认 32 tokens
          }
        }
      }
    }
    
    return tokens;
  }

  // Tool Result 消息
  if (message.role === 'toolResult') {
    let tokens = 0;
    
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'text') {
          tokens += Math.ceil(block.text.length / CHARS_PER_TOKEN);
        } else if (block.type === 'image') {
          tokens += IMAGE_TOKEN_ESTIMATE;
        }
      }
    }
    
    return tokens;
  }

  // 其他类型消息（system 等）
  return 64; // 默认 64 tokens
}

/**
 * 估算消息数组的总 token 数量
 * 
 * @param messages - 消息数组
 * @returns 总 token 数量
 */
export function estimateMessagesTokens(messages: AgentMessage[]): number {
  if (!messages || messages.length === 0) return 0;
  
  return messages.reduce((sum, message) => sum + estimateTokens(message), 0);
}

/**
 * 获取模型的上下文窗口大小
 * 
 * @param modelId - 模型 ID
 * @returns 上下文窗口大小（token 数量）
 */
export function getContextWindowTokens(modelId?: string): number {
  if (!modelId) return DEFAULT_CONTEXT_WINDOW;
  
  // 精确匹配
  if (MODEL_CONTEXT_WINDOWS[modelId]) {
    return MODEL_CONTEXT_WINDOWS[modelId];
  }
  
  // 模糊匹配（处理带版本号的模型）
  const lowerModelId = modelId.toLowerCase();
  
  if (lowerModelId.includes('claude-3-5') || lowerModelId.includes('claude-3-opus')) {
    return 200000;
  }
  if (lowerModelId.includes('claude-3')) {
    return 200000;
  }
  if (lowerModelId.includes('gpt-4o')) {
    return 128000;
  }
  if (lowerModelId.includes('gpt-4-turbo')) {
    return 128000;
  }
  if (lowerModelId.includes('gpt-4')) {
    return 8192;
  }
  if (lowerModelId.includes('gpt-3.5')) {
    return 16385;
  }
  if (lowerModelId.includes('deepseek')) {
    return 64000;
  }
  if (lowerModelId.includes('qwen-long')) {
    return 1000000;  // Qwen-Long 特殊处理
  }
  if (lowerModelId.includes('qwen-max') || lowerModelId.includes('qwen-plus')) {
    return 32000;
  }
  if (lowerModelId.includes('qwen2.5') || lowerModelId.includes('qwen')) {
    return 32000;  // Qwen 系列默认 32K
  }
  
  // 默认值
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * 计算上下文使用率
 * 
 * @param messages - 消息数组
 * @param modelId - 模型 ID
 * @returns 使用率（0-1 之间的小数）
 */
export function calculateContextUsage(messages: AgentMessage[], modelId?: string): number {
  const totalTokens = estimateMessagesTokens(messages);
  const contextWindow = getContextWindowTokens(modelId);
  
  return totalTokens / contextWindow;
}

/**
 * 检查上下文是否接近限制
 * 
 * @param messages - 消息数组
 * @param modelId - 模型 ID
 * @param threshold - 阈值（默认 0.7，即 70%）
 * @returns 是否接近限制
 */
export function isContextNearLimit(
  messages: AgentMessage[],
  modelId?: string,
  threshold: number = 0.7
): boolean {
  const usage = calculateContextUsage(messages, modelId);
  return usage >= threshold;
}

/**
 * 获取上下文统计信息
 * 
 * @param messages - 消息数组
 * @param modelId - 模型 ID
 * @returns 统计信息
 */
export function getContextStats(messages: AgentMessage[], modelId?: string) {
  const totalTokens = estimateMessagesTokens(messages);
  const contextWindow = getContextWindowTokens(modelId);
  const usageRatio = totalTokens / contextWindow;
  const remainingTokens = Math.max(0, contextWindow - totalTokens);
  
  return {
    totalTokens,
    contextWindow,
    usageRatio,
    usagePercent: Math.round(usageRatio * 100),
    remainingTokens,
    messageCount: messages.length,
  };
}
