/**
 * 状态相关处理器
 */

import type { BrowserServerState } from '../types';
import { resolveBrowserConfig } from '../../config';
import type { BrowserStatus } from '../../../../types/browser';

/**
 * 健康检查处理器
 */
export function handleHealthCheck(_req: any, res: any): void {
  res.json({ ok: true, message: 'DeepBot Browser Control Server' });
}

/**
 * 获取浏览器状态处理器
 */
export function handleGetStatus(state: BrowserServerState | null) {
  return (_req: any, res: any): void => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    const config = resolveBrowserConfig();
    const status: BrowserStatus = {
      enabled: config.enabled,
      running: state.browser.running,
      cdpReady: state.browser.running,
      pid: state.browser.pid,
      cdpPort: config.cdpPort,
      cdpUrl: `http://127.0.0.1:${config.cdpPort}`,
      profile: state.profile.name,
      headless: config.headless,
    };

    res.json(status);
  };
}
