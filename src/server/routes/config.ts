/**
 * 配置管理 API 路由
 */

import { Router, Response, RequestHandler } from 'express';
import type { AuthRequest } from '../types';
import type { GatewayAdapter } from '../gateway-adapter';
import { getErrorMessage } from '../../shared/utils/error-handler';

export function createConfigRouter(gatewayAdapter: GatewayAdapter): Router {
  const router = Router();
  
  /**
   * GET /api/config
   * 获取系统配置
   */
  const getConfig: RequestHandler = async (req, res) => {
    try {
      const config = await gatewayAdapter.getConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };
  
  /**
   * PUT /api/config
   * 更新系统配置
   */
  const updateConfig: RequestHandler = async (req, res) => {
    try {
      const updates = req.body;
      await gatewayAdapter.updateConfig(updates);
      res.json({ success: true, message: '配置已更新' });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };
  
  router.get('/', getConfig);
  router.put('/', updateConfig);

  // 应用设置（通用 key-value）
  router.post('/app-setting', (async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ success: false, error: 'key is required' });
      const { SystemConfigStore } = await import('../../main/database/system-config-store');
      SystemConfigStore.getInstance().setAppSetting(key, value);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  }) as RequestHandler);

  router.get('/app-setting', (async (req, res) => {
    try {
      const key = req.query.key as string;
      if (!key) return res.status(400).json({ success: false, value: null });
      const { SystemConfigStore } = await import('../../main/database/system-config-store');
      const value = SystemConfigStore.getInstance().getAppSetting(key);
      res.json({ success: true, value });
    } catch (error) {
      res.json({ success: false, value: null });
    }
  }) as RequestHandler);
  
  return router;
}
