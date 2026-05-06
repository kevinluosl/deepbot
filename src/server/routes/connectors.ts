/**
 * 连接器管理 API 路由
 */

import { Router, RequestHandler } from 'express';
import type { GatewayAdapter } from '../gateway-adapter';
import { getErrorMessage } from '../../shared/utils/error-handler';

export function createConnectorsRouter(gatewayAdapter: GatewayAdapter): Router {
  const router = Router();
  
  /**
   * GET /api/connectors
   * 获取所有连接器列表
   */
  const getAllConnectors: RequestHandler = async (req, res) => {
    try {
      const result = await gatewayAdapter.connectorGetAll();
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  /**
   * GET /api/connectors/:connectorId/config
   * 获取连接器配置
   */
  const getConnectorConfig: RequestHandler = async (req, res) => {
    try {
      const connectorId = Array.isArray(req.params.connectorId) 
        ? req.params.connectorId[0] 
        : req.params.connectorId;
      const result = await gatewayAdapter.connectorGetConfig(connectorId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  /**
   * POST /api/connectors/:connectorId/config
   * 保存连接器配置
   */
  const saveConnectorConfig: RequestHandler = async (req, res) => {
    try {
      const connectorId = Array.isArray(req.params.connectorId) 
        ? req.params.connectorId[0] 
        : req.params.connectorId;
      const config = req.body;
      const result = await gatewayAdapter.connectorSaveConfig(connectorId, config);
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  /**
   * POST /api/connectors/:connectorId/start
   * 启动连接器
   */
  const startConnector: RequestHandler = async (req, res) => {
    try {
      const connectorId = Array.isArray(req.params.connectorId) 
        ? req.params.connectorId[0] 
        : req.params.connectorId;
      const result = await gatewayAdapter.connectorStart(connectorId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  /**
   * POST /api/connectors/:connectorId/stop
   * 停止连接器
   */
  const stopConnector: RequestHandler = async (req, res) => {
    try {
      const connectorId = Array.isArray(req.params.connectorId) 
        ? req.params.connectorId[0] 
        : req.params.connectorId;
      const result = await gatewayAdapter.connectorStop(connectorId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  /**
   * GET /api/connectors/:connectorId/health
   * 连接器健康检查
   */
  const healthCheck: RequestHandler = async (req, res) => {
    try {
      const connectorId = Array.isArray(req.params.connectorId) 
        ? req.params.connectorId[0] 
        : req.params.connectorId;
      const result = await gatewayAdapter.connectorHealthCheck(connectorId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  /**
   * POST /api/connectors/pairing/approve
   * 批准配对
   */
  const approvePairing: RequestHandler = async (req, res) => {
    try {
      const { pairingCode } = req.body;
      const result = await gatewayAdapter.connectorApprovePairing(pairingCode);
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  /**
   * POST /api/connectors/:connectorId/pairing/:userId/admin
   * 设置管理员
   */
  const setAdminPairing: RequestHandler = async (req, res) => {
    try {
      const connectorId = Array.isArray(req.params.connectorId) 
        ? req.params.connectorId[0] 
        : req.params.connectorId;
      const userId = Array.isArray(req.params.userId) 
        ? req.params.userId[0] 
        : req.params.userId;
      const { isAdmin } = req.body;
      const result = await gatewayAdapter.connectorSetAdminPairing(connectorId, userId, isAdmin);
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  /**
   * DELETE /api/connectors/:connectorId/pairing/:userId
   * 删除配对
   */
  const deletePairing: RequestHandler = async (req, res) => {
    try {
      const connectorId = Array.isArray(req.params.connectorId) 
        ? req.params.connectorId[0] 
        : req.params.connectorId;
      const userId = Array.isArray(req.params.userId) 
        ? req.params.userId[0] 
        : req.params.userId;
      const result = await gatewayAdapter.connectorDeletePairing(connectorId, userId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  /**
   * GET /api/connectors/pairing
   * 获取所有配对记录
   */
  const getPairingRecords: RequestHandler = async (req, res) => {
    try {
      const result = await gatewayAdapter.connectorGetPairingRecords();
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: getErrorMessage(error) 
      });
    }
  };
  
  router.get('/', getAllConnectors);
  
  // 智能客服专用路由（必须在 /:connectorId 通配符之前注册）
  const getKfList: RequestHandler = async (req, res) => {
    try {
      const result = await gatewayAdapter.connectorGetKfList();
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  const getKfUrl: RequestHandler = async (req, res) => {
    try {
      const openKfId = req.query.openKfId as string;
      const scene = req.query.scene as string | undefined;
      if (!openKfId) { res.status(400).json({ success: false, error: '缺少 openKfId' }); return; }
      const result = await gatewayAdapter.connectorGetKfUrl(openKfId, scene);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  const saveKfWelcome: RequestHandler = async (req, res) => {
    try {
      const { openKfId, welcome } = req.body;
      if (!openKfId) { res.status(400).json({ success: false, error: '缺少 openKfId' }); return; }
      const result = await gatewayAdapter.connectorSaveKfWelcome(openKfId, welcome || '');
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  const getKfWelcome: RequestHandler = async (req, res) => {
    try {
      const openKfId = req.query.openKfId as string;
      if (!openKfId) { res.status(400).json({ success: false, error: '缺少 openKfId' }); return; }
      const result = await gatewayAdapter.connectorGetKfWelcome(openKfId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  // 通用：保存连接器工作提示词（同步到所有 Tab）
  const saveWorkPrompt: RequestHandler = async (req, res) => {
    try {
      const { settingKey, workPrompt, connectorId } = req.body;
      if (!settingKey || !connectorId) { res.status(400).json({ success: false, error: '缺少 settingKey 或 connectorId' }); return; }
      const result = await gatewayAdapter.connectorSaveKfWorkPrompt(settingKey, workPrompt || '', connectorId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  router.get('/smart-kf/kf-list', getKfList);
  router.get('/smart-kf/kf-url', getKfUrl);
  router.post('/smart-kf/kf-welcome', saveKfWelcome);
  router.get('/smart-kf/kf-welcome', getKfWelcome);
  router.post('/work-prompt', saveWorkPrompt);

  router.get('/:connectorId/config', getConnectorConfig);
  router.post('/:connectorId/config', saveConnectorConfig);
  router.post('/:connectorId/start', startConnector);
  router.post('/:connectorId/stop', stopConnector);
  router.get('/:connectorId/health', healthCheck);
  router.post('/pairing/approve', approvePairing);
  router.post('/:connectorId/pairing/:userId/admin', setAdminPairing);
  router.delete('/:connectorId/pairing/:userId', deletePairing);
  router.get('/pairing', getPairingRecords);

  // 微信多实例管理
  const createWechat: RequestHandler = async (req, res) => {
    try {
      const result = await gatewayAdapter.connectorCreateWechat();
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  const removeWechat: RequestHandler = async (req, res) => {
    try {
      const connectorId = Array.isArray(req.params.connectorId)
        ? req.params.connectorId[0]
        : req.params.connectorId;
      const result = await gatewayAdapter.connectorRemoveWechat(connectorId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  router.post('/wechat/create', createWechat);
  router.delete('/:connectorId', removeWechat);

  // 企业微信多实例管理
  const createWecom: RequestHandler = async (req, res) => {
    try {
      const { getGatewayInstance } = await import('../../main/gateway');
      const gw = getGatewayInstance();
      if (!gw) throw new Error('Gateway 未初始化');
      const connectorManager = gw.getConnectorManager();
      const connectorId = connectorManager.createWecomInstance();
      res.json({ success: true, connectorId });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  const removeWecom: RequestHandler = async (req, res) => {
    try {
      const connectorId = Array.isArray(req.params.connectorId)
        ? req.params.connectorId[0]
        : req.params.connectorId;
      const { getGatewayInstance } = await import('../../main/gateway');
      const gw = getGatewayInstance();
      if (!gw) throw new Error('Gateway 未初始化');
      const connectorManager = gw.getConnectorManager();
      await connectorManager.removeWecomInstance(connectorId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  router.post('/wecom/create', createWecom);
  router.delete('/wecom/:connectorId', removeWecom);

  // 人工直接回复
  const directReply: RequestHandler = async (req, res) => {
    try {
      const { tabId, content } = req.body;
      if (!tabId || !content) {
        res.status(400).json({ success: false, error: '缺少 tabId 或 content' });
        return;
      }
      const { getGatewayInstance } = await import('../../main/gateway');
      const gw = getGatewayInstance();
      if (!gw) throw new Error('Gateway 未初始化');
      await gw.sendManualReply(tabId, content);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };

  router.post('/direct-reply', directReply);
  
  return router;
}
