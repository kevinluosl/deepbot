/**
 * 异步操作工具函数
 * 
 * 提供通用的异步操作辅助函数，减少重复代码
 */

/**
 * 延迟指定毫秒数
 * 
 * @param ms 延迟毫秒数
 * @returns Promise
 * 
 * @example
 * await sleep(1000); // 延迟 1 秒
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带超时的 Promise 竞速
 * 
 * @param promise 要执行的 Promise
 * @param timeoutMs 超时毫秒数
 * @param timeoutError 超时错误消息
 * @returns Promise 结果
 * 
 * @example
 * const result = await withTimeout(fetchData(), 5000, '请求超时');
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string = '操作超时'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * 轮询等待条件满足
 * 
 * @param condition 条件函数
 * @param options 配置选项
 * @returns 是否在超时前满足条件
 * 
 * @example
 * const success = await waitUntil(
 *   () => runtime.isReady(),
 *   { timeout: 30000, interval: 100 }
 * );
 */
export async function waitUntil(
  condition: () => boolean,
  options: {
    timeout?: number;
    interval?: number;
    onProgress?: (elapsed: number) => void;
  } = {}
): Promise<boolean> {
  const {
    timeout = 30000,
    interval = 100,
    onProgress
  } = options;

  const startTime = Date.now();

  while (!condition()) {
    const elapsed = Date.now() - startTime;
    
    if (elapsed >= timeout) {
      return false;
    }

    if (onProgress) {
      onProgress(elapsed);
    }

    await sleep(interval);
  }

  return true;
}

/**
 * 重试执行函数
 * 
 * @param fn 要执行的函数
 * @param options 配置选项
 * @returns 函数执行结果
 * 
 * @example
 * const result = await retry(
 *   () => fetchData(),
 *   { maxRetries: 3, delay: 1000 }
 * );
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delay = 1000,
    onRetry
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (onRetry) {
        onRetry(attempt, error);
      }

      if (attempt < maxRetries) {
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * 批量执行 Promise（带并发控制）
 * 
 * @param tasks 任务数组
 * @param concurrency 并发数
 * @returns 所有任务结果
 * 
 * @example
 * const results = await batchExecute(
 *   [task1, task2, task3],
 *   2 // 最多同时执行 2 个
 * );
 */
export async function batchExecute<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number = 5
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const promise = task().then(result => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex(p => p === promise),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}
