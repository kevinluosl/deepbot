/**
 * HTTP 请求工具
 * 
 * 提供统一的 HTTP 请求方法，减少重复的 fetch 调用和错误处理
 */

import { getErrorMessage } from './error-handler';

/**
 * HTTP 请求配置
 */
export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * HTTP 响应
 */
export interface HttpResponse<T = any> {
  ok: boolean;
  status: number;
  statusText: string;
  data?: T;
  error?: string;
}

/**
 * 发送 HTTP 请求
 * 
 * @param url 请求 URL
 * @param options 请求配置
 * @returns HTTP 响应
 * 
 * @example
 * const response = await httpRequest('https://api.example.com/data', {
 *   method: 'POST',
 *   body: { name: 'test' },
 *   timeout: 5000
 * });
 */
export async function httpRequest<T = any>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 30000,
    signal,
  } = options;

  // 创建 AbortController（如果没有提供 signal）
  const controller = new AbortController();
  const timeoutId = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
  const finalSignal = signal || controller.signal;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: finalSignal,
    };

    if (body && method !== 'GET') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // 清除超时定时器
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // 尝试解析 JSON
    let data: T | undefined;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        data = (await response.json()) as T;
      } catch {
        // JSON 解析失败，忽略
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
    };
  } catch (error) {
    // 清除超时定时器
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      error: getErrorMessage(error),
    };
  }
}

/**
 * GET 请求
 * 
 * @param url 请求 URL
 * @param options 请求配置
 * @returns HTTP 响应
 * 
 * @example
 * const response = await httpGet('https://api.example.com/data');
 */
export async function httpGet<T = any>(
  url: string,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'GET' });
}

/**
 * POST 请求
 * 
 * @param url 请求 URL
 * @param body 请求体
 * @param options 请求配置
 * @returns HTTP 响应
 * 
 * @example
 * const response = await httpPost('https://api.example.com/data', { name: 'test' });
 */
export async function httpPost<T = any>(
  url: string,
  body?: any,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'POST', body });
}

/**
 * PUT 请求
 * 
 * @param url 请求 URL
 * @param body 请求体
 * @param options 请求配置
 * @returns HTTP 响应
 * 
 * @example
 * const response = await httpPut('https://api.example.com/data/123', { name: 'updated' });
 */
export async function httpPut<T = any>(
  url: string,
  body?: any,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'PUT', body });
}

/**
 * DELETE 请求
 * 
 * @param url 请求 URL
 * @param options 请求配置
 * @returns HTTP 响应
 * 
 * @example
 * const response = await httpDelete('https://api.example.com/data/123');
 */
export async function httpDelete<T = any>(
  url: string,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<HttpResponse<T>> {
  return httpRequest<T>(url, { ...options, method: 'DELETE' });
}

/**
 * 下载文件
 * 
 * @param url 文件 URL
 * @param options 请求配置
 * @returns 文件内容（Buffer）
 * 
 * @example
 * const buffer = await downloadFile('https://example.com/file.pdf');
 */
export async function downloadFile(
  url: string,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<Buffer | null> {
  const { timeout = 60000, signal } = options;

  const controller = new AbortController();
  const timeoutId = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
  const finalSignal = signal || controller.signal;

  try {
    const response = await fetch(url, { signal: finalSignal });

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    console.error('[Download Error]', getErrorMessage(error));
    return null;
  }
}

/**
 * 检查 URL 是否可访问
 * 
 * @param url 要检查的 URL
 * @param timeout 超时时间（毫秒）
 * @returns 是否可访问
 * 
 * @example
 * const isAccessible = await checkUrlAccessible('https://example.com');
 */
export async function checkUrlAccessible(
  url: string,
  timeout: number = 5000
): Promise<boolean> {
  try {
    const response = await httpGet(url, { timeout });
    return response.ok;
  } catch {
    return false;
  }
}
