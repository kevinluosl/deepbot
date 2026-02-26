/**
 * Browser HTTP Client
 * 
 * 职责：
 * - 提供 HTTP 客户端方法调用 Browser Server
 * - 封装请求和响应处理
 * - 错误处理和超时控制
 * 
 */

import type { BrowserStatus, BrowserTab, SnapshotResult } from '../../types/browser';
import { DEFAULT_BROWSER_TIMEOUT_MS } from './constants';
import type { BrowserConsoleMessage } from './pw-session';
import { TIMEOUTS } from '../config/timeouts';

/**
 * 发送 HTTP 请求到 Browser Server
 * 
 * @param baseUrl - Server 基础 URL
 * @param path - 请求路径
 * @param options - 请求选项
 * @returns 响应数据
 */
async function fetchBrowserJson<T>(
  baseUrl: string,
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
  }
): Promise<T> {
  const { httpRequest } = await import('../../shared/utils/http-utils');
  const url = `${baseUrl}${path}`;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS;

  const response = await httpRequest<T>(url, {
    method: (options?.method ?? 'GET') as any,
    headers: {
      'Content-Type': 'application/json',
    },
    body: options?.body,
    timeout: timeoutMs,
  });

  if (!response.ok) {
    throw new Error(response.error || `HTTP ${response.status}`);
  }

  return response.data!;
}

/**
 * 获取浏览器状态
 * 
 * @param baseUrl - Server 基础 URL（默认 http://127.0.0.1:18791）
 * @returns 浏览器状态
 */
export async function browserStatus(
  baseUrl: string = 'http://127.0.0.1:18791'
): Promise<BrowserStatus> {
  return await fetchBrowserJson<BrowserStatus>(baseUrl, '/status', {
    timeoutMs: TIMEOUTS.HTTP_REQUEST_TIMEOUT,
  });
}

/**
 * 启动浏览器
 * 
 * @param baseUrl - Server 基础 URL
 */
export async function browserStart(
  baseUrl: string = 'http://127.0.0.1:18791'
): Promise<void> {
  await fetchBrowserJson(baseUrl, '/start', {
    method: 'POST',
    timeoutMs: TIMEOUTS.HTTP_START_TIMEOUT, // 启动可能需要较长时间
  });
}

/**
 * 停止浏览器
 * 
 * @param baseUrl - Server 基础 URL
 */
export async function browserStop(
  baseUrl: string = 'http://127.0.0.1:18791'
): Promise<void> {
  await fetchBrowserJson(baseUrl, '/stop', {
    method: 'POST',
    timeoutMs: TIMEOUTS.HTTP_STOP_TIMEOUT,
  });
}

/**
 * 获取标签页列表
 * 
 * @param baseUrl - Server 基础 URL
 * @returns 标签页列表
 */
export async function browserTabs(
  baseUrl: string = 'http://127.0.0.1:18791'
): Promise<BrowserTab[]> {
  const result = await fetchBrowserJson<{ tabs: BrowserTab[] }>(baseUrl, '/tabs', {
    timeoutMs: TIMEOUTS.HTTP_REQUEST_TIMEOUT,
  });
  return result.tabs ?? [];
}

/**
 * 打开新标签页
 * 
 * @param baseUrl - Server 基础 URL
 * @param url - 要打开的 URL
 * @returns 标签页信息
 */
export async function browserOpenTab(
  baseUrl: string = 'http://127.0.0.1:18791',
  url: string
): Promise<BrowserTab> {
  return await fetchBrowserJson<BrowserTab>(baseUrl, '/tabs/open', {
    method: 'POST',
    body: { url },
    timeoutMs: TIMEOUTS.BROWSER_CLIENT_NAVIGATE_TIMEOUT,
  });
}

/**
 * 获取页面快照（AI 格式）
 * 
 * @param baseUrl - Server 基础 URL
 * @param targetId - 标签页 ID（可选）
 * @param maxChars - 最大字符数（可选）
 * @returns 快照结果
 */
export async function browserSnapshot(
  baseUrl: string = 'http://127.0.0.1:18791',
  targetId?: string,
  maxChars?: number
): Promise<SnapshotResult> {
  return await fetchBrowserJson<SnapshotResult>(baseUrl, '/snapshot', {
    method: 'POST',
    body: { targetId, maxChars },
    timeoutMs: TIMEOUTS.BROWSER_CLIENT_CONTENT_TIMEOUT,
  });
}

/**
 * 截图
 * 
 * @param baseUrl - Server 基础 URL
 * @param targetId - 标签页 ID（可选）
 * @param type - 图片类型（png 或 jpeg）
 * @param fullPage - 是否全页截图
 * @returns 截图结果（base64 编码）
 */
export async function browserScreenshot(
  baseUrl: string = 'http://127.0.0.1:18791',
  targetId?: string,
  type: 'png' | 'jpeg' = 'png',
  fullPage: boolean = false
): Promise<{ ok: true; type: string; data: string }> {
  return await fetchBrowserJson(baseUrl, '/screenshot', {
    method: 'POST',
    body: { targetId, type, fullPage },
    timeoutMs: TIMEOUTS.BROWSER_CLIENT_SNAPSHOT_TIMEOUT,
  });
}

/**
 * 导出 PDF
 * 
 * @param baseUrl - Server 基础 URL
 * @param targetId - 标签页 ID（可选）
 * @returns PDF 结果（base64 编码）
 */
export async function browserPdf(
  baseUrl: string = 'http://127.0.0.1:18791',
  targetId?: string
): Promise<{ ok: true; data: string }> {
  return await fetchBrowserJson(baseUrl, '/pdf', {
    method: 'POST',
    body: { targetId },
    timeoutMs: TIMEOUTS.BROWSER_CLIENT_CONSOLE_TIMEOUT,
  });
}

/**
 * 导航到 URL
 * 
 * @param baseUrl - Server 基础 URL
 * @param url - 目标 URL
 * @param targetId - 标签页 ID（可选）
 * @param timeoutMs - 超时时间（毫秒）
 * @returns 导航结果
 */
export async function browserNavigate(
  baseUrl: string = 'http://127.0.0.1:18791',
  url: string,
  targetId?: string,
  timeoutMs?: number
): Promise<{ ok: true; url: string; targetId: string }> {
  return await fetchBrowserJson(baseUrl, '/navigate', {
    method: 'POST',
    body: { targetId, url, timeoutMs },
    timeoutMs: (timeoutMs ?? 20000) + 5000, // 额外 5 秒缓冲
  });
}

/**
 * 执行交互操作
 * 
 * @param baseUrl - Server 基础 URL
 * @param action - 操作类型
 * @param options - 操作选项
 * @returns 操作结果
 */
export async function browserAct(
  baseUrl: string = 'http://127.0.0.1:18791',
  action: string,
  options: {
    targetId?: string;
    selector?: string;
    value?: string;
    key?: string;
    x?: number;
    y?: number;
    timeout?: number;
  } = {}
): Promise<{ ok: true }> {
  return await fetchBrowserJson(baseUrl, '/act', {
    method: 'POST',
    body: { action, ...options },
    timeoutMs: (options.timeout ?? 5000) + 5000,
  });
}

/**
 * 获取控制台消息
 * 
 * @param baseUrl - Server 基础 URL
 * @param targetId - 标签页 ID（可选）
 * @param limit - 最大消息数（可选）
 * @returns 控制台消息列表
 */
export async function browserConsoleMessages(
  baseUrl: string = 'http://127.0.0.1:18791',
  targetId?: string,
  limit?: number
): Promise<{ ok: true; messages: BrowserConsoleMessage[] }> {
  return await fetchBrowserJson(baseUrl, '/console', {
    method: 'POST',
    body: { targetId, limit },
    timeoutMs: TIMEOUTS.BROWSER_CLIENT_TAB_TIMEOUT,
  });
}

/**
 * 关闭标签页
 * 
 * @param baseUrl - Server 基础 URL
 * @param targetId - 标签页 ID
 */
export async function browserCloseTab(
  baseUrl: string = 'http://127.0.0.1:18791',
  targetId: string
): Promise<{ ok: true }> {
  return await fetchBrowserJson(baseUrl, `/tabs/${targetId}`, {
    method: 'DELETE',
    timeoutMs: TIMEOUTS.BROWSER_CLIENT_TAB_TIMEOUT,
  });
}
