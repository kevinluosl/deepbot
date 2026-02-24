/**
 * 浏览器生命周期处理器
 */

import type { BrowserServerState } from '../types';
import { launchBrowser, closeBrowser } from '../../pw-session';
import { createErrorResponse } from '../../../../shared/utils/error-handler';

/**
 * 启动浏览器处理器
 */
export function handleStartBrowser(state: BrowserServerState | null) {
  return async (_req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (state.browser.running) {
      res.json({ ok: true, message: 'Browser already running' });
      return;
    }

    try {
      console.log('[Browser Server] 启动浏览器...');
      
      // 启动浏览器
      const session = await launchBrowser();
      
      state.browser.running = true;
      state.browser.pid = session.pid;

      res.json({ ok: true, message: 'Browser started' });
    } catch (error) {
      console.error('[Browser Server] 启动浏览器失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}

/**
 * 停止浏览器处理器
 */
export function handleStopBrowser(state: BrowserServerState | null) {
  return async (_req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.json({ ok: true, message: 'Browser not running' });
      return;
    }

    try {
      console.log('[Browser Server] 停止浏览器...');
      
      // 停止浏览器
      await closeBrowser();
      
      state.browser.running = false;
      state.browser.pid = null;

      res.json({ ok: true, message: 'Browser stopped' });
    } catch (error) {
      console.error('[Browser Server] 停止浏览器失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}
