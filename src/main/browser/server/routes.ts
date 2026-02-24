/**
 * Browser Server 路由注册
 */

import type { Express } from 'express';
import type { BrowserServerState } from './types';
import {
  handleHealthCheck,
  handleGetStatus,
} from './handlers/status';
import {
  handleStartBrowser,
  handleStopBrowser,
} from './handlers/lifecycle';
import {
  handleGetTabs,
  handleOpenTab,
  handleCloseTab,
} from './handlers/tabs';
import {
  handleSnapshot,
  handleScreenshot,
  handleExportPdf,
  handleNavigate,
  handleAct,
  handleGetConsole,
} from './handlers/actions';

/**
 * 注册所有路由
 * 
 * @param app - Express 应用
 * @param state - Server 状态
 */
export function registerRoutes(app: Express, state: BrowserServerState | null): void {
  // ========== 健康检查 ==========
  app.get('/', handleHealthCheck);

  // ========== 状态管理 ==========
  app.get('/status', handleGetStatus(state));

  // ========== 生命周期管理 ==========
  app.post('/start', handleStartBrowser(state));
  app.post('/stop', handleStopBrowser(state));

  // ========== 标签页管理 ==========
  app.get('/tabs', handleGetTabs(state));
  app.post('/tabs/open', handleOpenTab(state));
  app.delete('/tabs/:targetId', handleCloseTab(state));

  // ========== 页面操作 ==========
  app.post('/snapshot', handleSnapshot(state));
  app.post('/screenshot', handleScreenshot(state));
  app.post('/pdf', handleExportPdf(state));
  app.post('/navigate', handleNavigate(state));
  app.post('/act', handleAct(state));
  app.post('/console', handleGetConsole(state));

  // ========== 404 处理 ==========
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}
