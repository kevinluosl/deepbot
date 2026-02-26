/**
 * WebContents 工具
 * 
 * 提供统一的 Electron WebContents 消息发送方法
 */

import type { BrowserWindow, WebContents } from 'electron';

/**
 * 安全发送消息到 WebContents
 * 
 * @param webContents WebContents 实例
 * @param channel 频道名称
 * @param data 消息数据
 * @returns 是否发送成功
 * 
 * @example
 * safeSend(mainWindow.webContents, 'message:update', { id: 123, content: 'Hello' });
 */
export function safeSend(
  webContents: WebContents | null | undefined,
  channel: string,
  data?: any
): boolean {
  if (!webContents || webContents.isDestroyed()) {
    console.warn(`[WebContents] 无法发送消息到 ${channel}：WebContents 不可用`);
    return false;
  }

  try {
    webContents.send(channel, data);
    return true;
  } catch (error) {
    console.error(`[WebContents] 发送消息失败 (${channel}):`, error);
    return false;
  }
}

/**
 * 安全发送消息到 BrowserWindow
 * 
 * @param window BrowserWindow 实例
 * @param channel 频道名称
 * @param data 消息数据
 * @returns 是否发送成功
 * 
 * @example
 * sendToWindow(mainWindow, 'message:update', { id: 123, content: 'Hello' });
 */
export function sendToWindow(
  window: BrowserWindow | null | undefined,
  channel: string,
  data?: any
): boolean {
  if (!window || window.isDestroyed()) {
    console.warn(`[WebContents] 无法发送消息到 ${channel}：窗口不可用`);
    return false;
  }

  return safeSend(window.webContents, channel, data);
}

/**
 * 批量发送消息到多个 WebContents
 * 
 * @param webContentsList WebContents 列表
 * @param channel 频道名称
 * @param data 消息数据
 * @returns 成功发送的数量
 * 
 * @example
 * broadcastToWebContents([wc1, wc2, wc3], 'update', { status: 'ready' });
 */
export function broadcastToWebContents(
  webContentsList: Array<WebContents | null | undefined>,
  channel: string,
  data?: any
): number {
  let successCount = 0;

  for (const webContents of webContentsList) {
    if (safeSend(webContents, channel, data)) {
      successCount++;
    }
  }

  return successCount;
}

/**
 * 广播消息到所有窗口
 * 
 * @param windows BrowserWindow 列表
 * @param channel 频道名称
 * @param data 消息数据
 * @returns 成功发送的数量
 * 
 * @example
 * broadcastToWindows([window1, window2], 'global:update', { version: '1.0.0' });
 */
export function broadcastToWindows(
  windows: Array<BrowserWindow | null | undefined>,
  channel: string,
  data?: any
): number {
  const webContentsList = windows
    .filter((w): w is BrowserWindow => w !== null && w !== undefined && !w.isDestroyed())
    .map(w => w.webContents);

  return broadcastToWebContents(webContentsList, channel, data);
}

/**
 * 创建消息发送器（柯里化）
 * 
 * @param webContents WebContents 实例
 * @returns 消息发送函数
 * 
 * @example
 * const send = createSender(mainWindow.webContents);
 * send('message:update', { id: 123 });
 * send('message:delete', { id: 456 });
 */
export function createSender(
  webContents: WebContents | null | undefined
): (channel: string, data?: any) => boolean {
  return (channel: string, data?: any) => safeSend(webContents, channel, data);
}

/**
 * 创建窗口消息发送器
 * 
 * @param window BrowserWindow 实例
 * @returns 消息发送函数
 * 
 * @example
 * const send = createWindowSender(mainWindow);
 * send('message:update', { id: 123 });
 */
export function createWindowSender(
  window: BrowserWindow | null | undefined
): (channel: string, data?: any) => boolean {
  return (channel: string, data?: any) => sendToWindow(window, channel, data);
}
