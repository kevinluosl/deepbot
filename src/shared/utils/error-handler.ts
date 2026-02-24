/**
 * 统一的错误处理工具
 */

/**
 * 提取错误消息
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 检查是否是特定类型的错误
 */
export function isErrorType(error: unknown, type: string): boolean {
  return error instanceof Error && error.message.includes(type);
}

/**
 * 检查是否是 AbortError
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * 检查是否是用户取消错误
 */
export function isCancelError(error: unknown): boolean {
  return error instanceof Error && error.message === '用户取消';
}

/**
 * 记录错误日志
 */
export function logError(module: string, operation: string, error: unknown): void {
  console.error(`[${module}] ${operation}失败:`, error);
}

/**
 * 创建错误响应（Express）
 */
export function createErrorResponse(error: unknown) {
  return {
    error: getErrorMessage(error)
  };
}
