/**
 * IPC 通信工具
 * 
 * 提供统一的 IPC Handler 包装器，减少重复的错误处理代码
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { getErrorMessage } from './error-handler';

/**
 * IPC Handler 的返回类型
 */
export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * IPC Handler 函数类型
 */
export type IpcHandler<TParams = any, TResult = any> = (
  event: IpcMainInvokeEvent,
  params: TParams
) => Promise<TResult> | TResult;

/**
 * 包装 IPC Handler，自动处理错误
 * 
 * @param handler IPC 处理函数
 * @returns 包装后的 Handler
 * 
 * @example
 * ipcMain.handle('my-channel', wrapIpcHandler(async (event, params) => {
 *   // 业务逻辑
 *   return { result: 'success' };
 * }));
 */
export function wrapIpcHandler<TParams = any, TResult = any>(
  handler: IpcHandler<TParams, TResult>
): (event: IpcMainInvokeEvent, params: TParams) => Promise<IpcResponse<TResult>> {
  return async (event: IpcMainInvokeEvent, params: TParams): Promise<IpcResponse<TResult>> => {
    try {
      const result = await handler(event, params);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('[IPC Error]', getErrorMessage(error));
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  };
}

/**
 * 注册 IPC Handler（带自动错误处理）
 * 
 * @param channel IPC 频道名称
 * @param handler 处理函数
 * 
 * @example
 * registerIpcHandler('get-data', async (event, params) => {
 *   return await fetchData(params);
 * });
 */
export function registerIpcHandler<TParams = any, TResult = any>(
  channel: string,
  handler: IpcHandler<TParams, TResult>
): void {
  ipcMain.handle(channel, wrapIpcHandler(handler));
}

/**
 * 批量注册 IPC Handlers
 * 
 * @param handlers Handler 映射表
 * 
 * @example
 * registerIpcHandlers({
 *   'get-data': async (event, params) => fetchData(params),
 *   'save-data': async (event, params) => saveData(params),
 * });
 */
export function registerIpcHandlers(
  handlers: Record<string, IpcHandler<any, any>>
): void {
  for (const [channel, handler] of Object.entries(handlers)) {
    registerIpcHandler(channel, handler);
  }
}

/**
 * 创建标准的成功响应
 * 
 * @param data 响应数据
 * @param message 成功消息（可选）
 * @returns IPC 响应
 * 
 * @example
 * return createSuccessResponse({ id: 123 }, '保存成功');
 */
export function createSuccessResponse<T = any>(
  data?: T,
  message?: string
): IpcResponse<T> {
  return {
    success: true,
    data,
    message,
  };
}

/**
 * 创建标准的错误响应
 * 
 * @param error 错误对象或消息
 * @returns IPC 响应
 * 
 * @example
 * return createErrorResponse('操作失败');
 */
export function createErrorResponse(error: unknown): IpcResponse {
  return {
    success: false,
    error: getErrorMessage(error),
  };
}
