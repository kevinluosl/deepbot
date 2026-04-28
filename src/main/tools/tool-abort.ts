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
 * 检查是否是 AbortError
 * 
 * @param error - 错误对象
 * @returns 是否是 AbortError
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * 合并两个 AbortSignal
 * 
 * 如果任一 signal 被取消，返回的 signal 也会被取消
 * 
 * @param a - 第一个 AbortSignal
 * @param b - 第二个 AbortSignal
 * @returns 合并后的 AbortSignal
 */
function combineAbortSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  // 🔥 不过滤已 aborted 的 signal，因为我们需要检测用户停止
  if (!a && !b) return undefined;
  if (a && !b) return a;
  if (b && !a) return b;
  
  // 使用 AbortSignal.any（Node.js 20+）
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([a as AbortSignal, b as AbortSignal]);
  }
  
  // 降级方案：手动合并
  const controller = new AbortController();
  
  // 如果任一 signal 已经 aborted，立即 abort
  if (a?.aborted || b?.aborted) {
    controller.abort();
    return controller.signal;
  }
  
  // 监听两个 signal 的 abort 事件
  const onAbort = () => controller.abort();
  a?.addEventListener('abort', onAbort, { once: true });
  b?.addEventListener('abort', onAbort, { once: true });
  
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
      
      // 执行前检查是否已取消
      if (combined?.aborted) {
        console.log(`⏹️ [${tool.name}] 工具执行前检测到 abort，跳过执行`);
        throwAbortError();
      }
      
      // 执行工具，传入合并后的 signal
      try {
        const result = await execute(toolCallId, params, combined, onUpdate);
        
        // 执行后再次检查（防止执行过程中被取消）
        if (combined?.aborted) {
          console.log(`⏹️ [${tool.name}] 工具执行后检测到 abort`);
          throwAbortError();
        }
        
        return result;
      } catch (error) {
        // 如果是 abort 错误，重新抛出
        if (isAbortError(error)) {
          console.log(`⏹️ [${tool.name}] 工具执行被中断`);
          throw error;
        }
        // 其他错误也重新抛出
        throw error;
      }
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
  private lastOperationKey: string | null = null; // 上一次操作的 key
  private consecutiveCount = 0; // 连续相同操作的次数
  private readonly maxConsecutiveRepeats = 2; // 最多允许连续重复 2 次（总共执行 3 次）
  private readonly maxConsecutiveFailures = 5; // 最多连续失败 5 次
  
  /**
   * 追踪操作并检查是否连续重复
   * 只有连续执行相同操作才算重复，中间执行了其他操作则重置计数
   */
  track(tool: string, params: any): boolean {
    const key = this.generateKey(tool, params);
    
    if (key === this.lastOperationKey) {
      // 和上一次操作相同，增加连续计数
      this.consecutiveCount++;
      
      if (this.consecutiveCount > this.maxConsecutiveRepeats) {
        console.warn(`⚠️ 检测到连续重复操作 (${this.consecutiveCount + 1} 次): ${tool}`);
        console.warn(`   参数:`, params);
        return false; // 阻止执行
      }
    } else {
      // 和上一次操作不同，重置连续计数
      this.lastOperationKey = key;
      this.consecutiveCount = 0;
    }
    
    // 记录总操作次数（用于统计）
    const count = this.operations.get(key) || 0;
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
    // 🔥 浏览器工具特殊处理：允许重复执行
    // 浏览器操作（snapshot、click、scroll 等）通常需要多次执行
    if (tool === 'browser') {
      // 对于浏览器工具，使用 action + 时间戳，确保每次都是唯一的
      // 这样就不会被认为是重复操作
      const action = params?.action || 'unknown';
      return `browser:${action}:${Date.now()}`;
    }
    
    // 对于 read 工具，关心路径 + offset + limit（不同参数不算重复）
    if (tool === 'read' && params?.path) {
      const offset = params.offset ?? '';
      const limit = params.limit ?? '';
      return `read:${params.path}:${offset}:${limit}`;
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
    this.lastOperationKey = null;
    this.consecutiveCount = 0;
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
