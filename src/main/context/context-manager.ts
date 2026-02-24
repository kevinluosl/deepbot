/**
 * 上下文管理器
 * 
 * 统一管理上下文压缩，整合工具结果裁剪和历史消息裁剪
 * 这是上下文压缩的统一入口
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { 
  estimateMessagesTokens, 
  getContextWindowTokens,
  calculateContextUsage 
} from '../utils/token-estimator';
import { 
  pruneToolResults, 
  DEFAULT_PRUNING_SETTINGS,
  type PruningSettings 
} from './tool-result-pruner';
import { 
  pruneHistoryForContextShare,
  type HistoryPruneResult 
} from './history-pruner';

/**
 * 上下文管理配置
 */
export interface ContextSettings {
  enabled: boolean;                    // 是否启用上下文管理
  pruning: PruningSettings;            // 工具结果裁剪配置
  compaction: {
    maxHistoryShare: number;           // 历史消息最多占比（默认 0.5）
    reserveTokens: number;             // 预留 token 数（默认 2000）
  };
}

/**
 * 默认上下文管理配置
 */
export const DEFAULT_CONTEXT_SETTINGS: ContextSettings = {
  enabled: true,
  pruning: DEFAULT_PRUNING_SETTINGS,
  compaction: {
    maxHistoryShare: 0.5,
    reserveTokens: 2000,
  },
};

/**
 * 上下文管理统计信息
 */
export interface ContextStats {
  // 处理前
  messagesBefore: number;
  tokensBefore: number;
  usageRatioBefore: number;
  
  // 处理后
  messagesAfter: number;
  tokensAfter: number;
  usageRatioAfter: number;
  
  // 裁剪统计
  toolResultsPruned: {
    softTrimmed: number;
    hardCleared: number;
    tokensSaved: number;
  };
  
  // 历史裁剪统计
  historyPruned: {
    droppedMessages: number;
    droppedTokens: number;
  };
  
  // 总计
  totalTokensSaved: number;
  contextWindow: number;
}

/**
 * 上下文管理结果
 */
export interface ContextManageResult {
  messages: AgentMessage[];
  stats: ContextStats;
  compressed: boolean;  // 是否进行了压缩
}

/**
 * 管理上下文
 * 
 * 这是上下文压缩的统一入口，会自动：
 * 1. 估算当前上下文使用情况
 * 2. 如果超过 70%，裁剪工具结果
 * 3. 如果超过 85%，裁剪历史消息
 * 
 * @param params - 管理参数
 * @returns 管理结果
 */
export function manageContext(params: {
  messages: AgentMessage[];
  modelId?: string;
  settings?: Partial<ContextSettings>;
}): ContextManageResult {
  const { messages, modelId } = params;
  const settings: ContextSettings = {
    ...DEFAULT_CONTEXT_SETTINGS,
    ...params.settings,
    pruning: {
      ...DEFAULT_CONTEXT_SETTINGS.pruning,
      ...params.settings?.pruning,
    },
    compaction: {
      ...DEFAULT_CONTEXT_SETTINGS.compaction,
      ...params.settings?.compaction,
    },
  };

  // 如果未启用，直接返回
  if (!settings.enabled) {
    const contextWindow = getContextWindowTokens(modelId);
    const tokensBefore = estimateMessagesTokens(messages);
    
    return {
      messages,
      stats: {
        messagesBefore: messages.length,
        tokensBefore,
        usageRatioBefore: tokensBefore / contextWindow,
        messagesAfter: messages.length,
        tokensAfter: tokensBefore,
        usageRatioAfter: tokensBefore / contextWindow,
        toolResultsPruned: {
          softTrimmed: 0,
          hardCleared: 0,
          tokensSaved: 0,
        },
        historyPruned: {
          droppedMessages: 0,
          droppedTokens: 0,
        },
        totalTokensSaved: 0,
        contextWindow,
      },
      compressed: false,
    };
  }

  // 计算初始状态
  const contextWindow = getContextWindowTokens(modelId);
  const tokensBefore = estimateMessagesTokens(messages);
  const usageRatioBefore = tokensBefore / contextWindow;
  const messagesBefore = messages.length;

  let currentMessages = messages;
  let compressed = false;

  // 统计信息
  let toolResultsStats = {
    softTrimmed: 0,
    hardCleared: 0,
    tokensSaved: 0,
  };
  let historyStats = {
    droppedMessages: 0,
    droppedTokens: 0,
  };

  // 步骤 1: 如果使用率 < 70%，不处理
  if (usageRatioBefore < settings.pruning.softTrimRatio) {
    console.debug(`[Context Manager] 使用率 ${(usageRatioBefore * 100).toFixed(1)}% < 70%，无需压缩`);
    
    return {
      messages: currentMessages,
      stats: {
        messagesBefore,
        tokensBefore,
        usageRatioBefore,
        messagesAfter: currentMessages.length,
        tokensAfter: tokensBefore,
        usageRatioAfter: usageRatioBefore,
        toolResultsPruned: toolResultsStats,
        historyPruned: historyStats,
        totalTokensSaved: 0,
        contextWindow,
      },
      compressed: false,
    };
  }

  console.info(`[Context Manager] 🔄 开始上下文压缩，使用率: ${(usageRatioBefore * 100).toFixed(1)}%`);

  // 步骤 2: 裁剪工具结果（70-85%）
  if (usageRatioBefore >= settings.pruning.softTrimRatio) {
    console.debug(`[Context Manager] 📋 裁剪工具结果...`);
    
    const pruneResult = pruneToolResults(currentMessages, settings.pruning, modelId);
    currentMessages = pruneResult.messages;
    toolResultsStats = {
      softTrimmed: pruneResult.stats.softTrimmed,
      hardCleared: pruneResult.stats.hardCleared,
      tokensSaved: pruneResult.stats.tokensSaved,
    };
    
    if (toolResultsStats.tokensSaved > 0) {
      compressed = true;
      console.info(
        `[Context Manager] ✂️ 工具结果裁剪: Soft=${toolResultsStats.softTrimmed}, ` +
        `Hard=${toolResultsStats.hardCleared}, 节省=${toolResultsStats.tokensSaved} tokens`
      );
    }
  }

  // 重新计算使用率
  const tokensAfterPruning = estimateMessagesTokens(currentMessages);
  const usageRatioAfterPruning = tokensAfterPruning / contextWindow;

  // 步骤 3: 裁剪历史消息（> 85%）
  if (usageRatioAfterPruning >= settings.pruning.hardClearRatio) {
    console.debug(`[Context Manager] 📦 裁剪历史消息...`);
    
    const historyResult = pruneHistoryForContextShare({
      messages: currentMessages,
      maxContextTokens: contextWindow,
      maxHistoryShare: settings.compaction.maxHistoryShare,
      parts: 2,
    });
    
    currentMessages = historyResult.messages;
    historyStats = {
      droppedMessages: historyResult.droppedMessages,
      droppedTokens: historyResult.droppedTokens,
    };
    
    if (historyStats.droppedMessages > 0) {
      compressed = true;
      console.info(
        `[Context Manager] 🗑️ 历史消息裁剪: 丢弃=${historyStats.droppedMessages} 条消息, ` +
        `节省=${historyStats.droppedTokens} tokens`
      );
    }
  }

  // 计算最终状态
  const tokensAfter = estimateMessagesTokens(currentMessages);
  const usageRatioAfter = tokensAfter / contextWindow;
  const messagesAfter = currentMessages.length;
  const totalTokensSaved = tokensBefore - tokensAfter;

  console.info(
    `[Context Manager] ✅ 压缩完成: ${messagesBefore} → ${messagesAfter} 条消息, ` +
    `${tokensBefore} → ${tokensAfter} tokens (${(usageRatioBefore * 100).toFixed(1)}% → ${(usageRatioAfter * 100).toFixed(1)}%)`
  );

  return {
    messages: currentMessages,
    stats: {
      messagesBefore,
      tokensBefore,
      usageRatioBefore,
      messagesAfter,
      tokensAfter,
      usageRatioAfter,
      toolResultsPruned: toolResultsStats,
      historyPruned: historyStats,
      totalTokensSaved,
      contextWindow,
    },
    compressed,
  };
}

/**
 * 检查是否需要压缩
 * 
 * @param messages - 消息数组
 * @param modelId - 模型 ID
 * @param threshold - 阈值（默认 0.7）
 * @returns 是否需要压缩
 */
export function shouldCompress(
  messages: AgentMessage[],
  modelId?: string,
  threshold: number = 0.7
): boolean {
  const usage = calculateContextUsage(messages, modelId);
  return usage >= threshold;
}

/**
 * 获取压缩建议
 * 
 * @param messages - 消息数组
 * @param modelId - 模型 ID
 * @returns 压缩建议
 */
export function getCompressionAdvice(
  messages: AgentMessage[],
  modelId?: string
): {
  shouldCompress: boolean;
  reason: string;
  usagePercent: number;
  action: 'none' | 'prune_tools' | 'prune_history';
} {
  const usage = calculateContextUsage(messages, modelId);
  const usagePercent = Math.round(usage * 100);

  if (usage < 0.7) {
    return {
      shouldCompress: false,
      reason: `上下文使用率 ${usagePercent}% < 70%，无需压缩`,
      usagePercent,
      action: 'none',
    };
  }

  if (usage < 0.85) {
    return {
      shouldCompress: true,
      reason: `上下文使用率 ${usagePercent}%，建议裁剪工具结果`,
      usagePercent,
      action: 'prune_tools',
    };
  }

  return {
    shouldCompress: true,
    reason: `上下文使用率 ${usagePercent}%，建议裁剪工具结果和历史消息`,
    usagePercent,
    action: 'prune_history',
  };
}
