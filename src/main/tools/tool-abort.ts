/**
 * 工具取消机制
 * 
 * 
 * 为工具添加 AbortSignal 支持，允许在执行前检查取消状态
 */

import { getErrorMessage } from '../../shared/utils/error-handler';

// pi-agent-core 的 Tool 类型定义
type Tool = {
  name: string;
  label: string; // 必需字段
  description?: string;
  parameters?: unknown;
  execute?: (
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: (partialResult: unknown) => void
  ) => Promise<unknown>;
};

/**
 * 抛出 AbortError
 * 
 * 创建一个标准的 AbortError，Agent 会识别这个错误并停止执行
 * 
 * @throws AbortError
 */
function throwAbortError(): never {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  throw err;
}

/**
 * 合并两个 AbortSignal
 * 
 * 如果任一 signal 被取消，返回的 signal 也会被取消
 * 
 * 注意：此函数会过滤掉已经 aborted 的 signal，避免污染新的执行
 * 
 * @param a - 第一个 AbortSignal
 * @param b - 第二个 AbortSignal
 * @returns 合并后的 AbortSignal
 */
function combineAbortSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  // 过滤掉已经 aborted 的 signal（避免污染新的执行）
  const validA = a && !a.aborted ? a : undefined;
  const validB = b && !b.aborted ? b : undefined;
  
  if (!validA && !validB) return undefined;
  if (validA && !validB) return validA;
  if (validB && !validA) return validB;
  
  // 使用 AbortSignal.any（Node.js 20+）
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([validA as AbortSignal, validB as AbortSignal]);
  }
  
  // 降级方案：手动合并
  const controller = new AbortController();
  
  // 监听两个 signal 的 abort 事件
  const onAbort = () => controller.abort();
  validA?.addEventListener('abort', onAbort, { once: true });
  validB?.addEventListener('abort', onAbort, { once: true });
  
  return controller.signal;
}

/**
 * 为工具添加 AbortSignal 支持
 * 
 * 
 * 包装工具的 execute 方法，添加取消支持
 * 
 * @param tool - 原始工具
 * @param abortSignal - AbortSignal（可选）
 * @returns 包装后的工具
 * 
 * @example
 * ```typescript
 * const tools = [tool1, tool2].map(t => 
 *   wrapToolWithAbortSignal(t, abortController.signal)
 * );
 * ```
 */
export function wrapToolWithAbortSignal(
  tool: Tool,
  abortSignal?: AbortSignal,
): Tool {
  if (!abortSignal) return tool;
  
  const execute = tool.execute;
  if (!execute) return tool;
  
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // 合并工具自己的 signal 和 runtime 的 signal
      const combined = combineAbortSignals(signal, abortSignal);
      
      // 检查是否已取消
      if (combined?.aborted) {
        throwAbortError();
      }
      
      // 执行工具，传入合并后的 signal
      return await execute(toolCallId, params, combined, onUpdate);
    },
  };
}

/**
 * 操作追踪器 - 检测重复操作和失败次数
 */
export class OperationTracker {
  private operations = new Map<string, number>();
  private failures = new Map<string, number>();
  private consecutiveFailures = 0;
  private readonly maxRepeats = 2; // 最多允许重复 2 次（总共执行 3 次）
  private readonly maxConsecutiveFailures = 5; // 最多连续失败 5 次
  
  /**
   * 追踪操作并检查是否重复
   * 
   * @param tool - 工具名称
   * @param params - 工具参数
   * @returns 是否允许执行（false = 重复太多次，阻止执行）
   */
  track(tool: string, params: any): boolean {
    // 生成操作的唯一键
    const key = this.generateKey(tool, params);
    const count = this.operations.get(key) || 0;
    
    // 检查是否超过最大重复次数
    if (count >= this.maxRepeats) {
      console.warn(`⚠️ 检测到重复操作 (${count + 1} 次): ${tool}`);
      console.warn(`   参数:`, params);
      return false; // 阻止执行
    }
    
    // 记录操作
    this.operations.set(key, count + 1);
    return true; // 允许执行
  }
  
  /**
   * 记录工具执行失败
   * 
   * @param tool - 工具名称
   * @param params - 工具参数
   * @returns 是否应该停止任务（true = 失败次数过多，应该停止）
   */
  recordFailure(tool: string, params: any): boolean {
    const key = this.generateKey(tool, params);
    const count = this.failures.get(key) || 0;
    this.failures.set(key, count + 1);
    
    // 增加连续失败计数
    this.consecutiveFailures++;
    
    // 检查是否超过最大连续失败次数
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      console.error(`❌ 连续失败 ${this.consecutiveFailures} 次，停止任务`);
      return true; // 应该停止任务
    }
    
    return false; // 继续执行
  }
  
  /**
   * 记录工具执行成功（重置连续失败计数）
   */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }
  
  /**
   * 生成操作的唯一键
   */
  private generateKey(tool: string, params: any): string {
    // 对于 read 工具，只关心路径
    if (tool === 'read' && params?.path) {
      return `read:${params.path}`;
    }
    
    // 对于 bash 工具，只关心命令
    if (tool === 'bash' && params?.command) {
      return `bash:${params.command}`;
    }
    
    // 其他工具使用完整参数
    return `${tool}:${JSON.stringify(params)}`;
  }
  
  /**
   * 清空追踪记录（每次新消息时调用）
   */
  clear(): void {
    this.operations.clear();
    this.failures.clear();
    this.consecutiveFailures = 0;
  }
  
  /**
   * 获取统计信息
   */
  getStats(): { 
    operations: { tool: string; count: number }[];
    failures: { tool: string; count: number }[];
    consecutiveFailures: number;
  } {
    const operations: { tool: string; count: number }[] = [];
    this.operations.forEach((count, key) => {
      operations.push({ tool: key, count });
    });
    
    const failures: { tool: string; count: number }[] = [];
    this.failures.forEach((count, key) => {
      failures.push({ tool: key, count });
    });
    
    return {
      operations,
      failures,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

/**
 * 为工具添加重复检测和失败检测
 * 
 * @param tool - 原始工具
 * @param tracker - 操作追踪器
 * @returns 包装后的工具
 */
export function wrapToolWithDuplicateDetection(
  tool: Tool,
  tracker: OperationTracker,
): Tool {
  const execute = tool.execute;
  if (!execute) return tool;
  
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // 1. 检查是否重复
      const allowed = tracker.track(tool.name, params);
      
      if (!allowed) {
        // 返回错误结果，不执行工具
        const stats = tracker.getStats();
        const operationCount = stats.operations.find(s => s.tool.includes(tool.name))?.count || 0;
        
        return {
          content: [
            {
              type: 'text',
              text: `❌ 操作被阻止：检测到重复操作\n` +
                    `   工具: ${tool.name}\n` +
                    `   原因: 此操作已执行 ${operationCount} 次\n` +
                    `\n` +
                    `⚠️ 不要重复执行相同的操作。\n` +
                    `   如果操作失败，请分析错误原因并尝试不同的方法。\n` +
                    `   如果需要验证结果，使用不同的命令或参数。`
            }
          ],
          details: {
            blocked: true,
            reason: 'duplicate_operation',
            count: operationCount,
          },
          isError: true,
        };
      }
      
      // 2. 执行工具
      try {
        const result = await execute(toolCallId, params, signal, onUpdate);
        
        // 3. 检查执行结果
        // 方法 1: 检查 isError 字段
        const hasErrorFlag = result && typeof result === 'object' && 'isError' in result && result.isError;
        
        // 方法 2: 检查内容中是否包含错误信息（bash 工具）
        let hasErrorContent = false;
        if (result && typeof result === 'object' && 'content' in result) {
          const content = result.content;
          if (Array.isArray(content)) {
            hasErrorContent = content.some(c => {
              if (typeof c === 'object' && c !== null && 'text' in c) {
                const text = String(c.text);
                // 检查常见的错误标志
                return text.includes('Command exited with code') && 
                       !text.includes('Command exited with code 0') ||
                       text.includes('SyntaxError') ||
                       text.includes('Error:') ||
                       text.includes('Exception:') ||
                       text.includes('Failed:');
              }
              return false;
            });
          }
        }
        
        const isError = hasErrorFlag || hasErrorContent;
        
        if (isError) {
          // 记录失败
          const shouldStop = tracker.recordFailure(tool.name, params);
          
          if (shouldStop) {
            // 连续失败次数过多，强制停止
            const stats = tracker.getStats();
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 任务已停止：连续失败 ${stats.consecutiveFailures} 次\n` +
                        `\n` +
                        `⚠️ 请检查以下问题：\n` +
                        `   1. 命令或参数是否正确\n` +
                        `   2. 是否有权限问题\n` +
                        `   3. 是否需要安装依赖\n` +
                        `   4. 是否需要换一个完全不同的方法\n` +
                        `\n` +
                        `💡 建议：重新开始任务，使用不同的方法。`
                }
              ],
              details: {
                blocked: true,
                reason: 'too_many_failures',
                consecutiveFailures: stats.consecutiveFailures,
              },
              isError: true,
            };
          }
        } else {
          // 记录成功（重置连续失败计数）
          tracker.recordSuccess();
        }
        
        return result;
      } catch (error) {
        // 记录失败
        const shouldStop = tracker.recordFailure(tool.name, params);
        
        if (shouldStop) {
          // 连续失败次数过多，强制停止
          const stats = tracker.getStats();
          return {
            content: [
              {
                type: 'text',
                text: `❌ 任务已停止：连续失败 ${stats.consecutiveFailures} 次\n` +
                      `\n` +
                      `最后的错误: ${getErrorMessage(error)}\n` +
                      `\n` +
                      `⚠️ 请检查以下问题：\n` +
                      `   1. 命令或参数是否正确\n` +
                      `   2. 是否有权限问题\n` +
                      `   3. 是否需要安装依赖\n` +
                      `   4. 是否需要换一个完全不同的方法\n` +
                      `\n` +
                      `💡 建议：重新开始任务，使用不同的方法。`
              }
            ],
            details: {
              blocked: true,
              reason: 'too_many_failures',
              consecutiveFailures: stats.consecutiveFailures,
              lastError: getErrorMessage(error),
            },
            isError: true,
          };
        }
        
        // 重新抛出错误
        throw error;
      }
    },
  };
}
