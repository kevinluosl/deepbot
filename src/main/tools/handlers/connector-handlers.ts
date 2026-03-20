/**
 * 连接器管理相关的处理函数
 * 处理飞书连接器配置、启用/禁用、配对管理等功能
 */

import * as formatters from '../api-tool.formatters';
import {
  ToolResult,
  checkAbortSignal,
  getSystemConfigStore,
  createSuccessResponse,
  createErrorResponse,
  getGatewayInstance,
} from './handler-utils';
import { broadcastPendingCount } from '../../ipc/connector-handler';
import { createLogger } from '../../../shared/utils/logger';

// ==================== 日志记录器 ====================

const logger = createLogger('Connector-Handlers');

// ==================== 飞书连接器配置 ====================

/**
 * 设置飞书连接器配置
 */
export async function handleSetFeishuConnectorConfig(
  params: {
    appId: string;
    appSecret: string;
    enabled?: boolean;
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('设置飞书连接器配置');
    
    checkAbortSignal(signal, '设置配置');
    
    const store = await getSystemConfigStore();
    
    // 构建配置对象
    const config = {
      appId: params.appId,
      appSecret: params.appSecret,
    };
    
    const enabled = params.enabled !== undefined ? params.enabled : false;
    
    // 保存配置
    store.saveConnectorConfig('feishu', '飞书', config, enabled);
    
    return createSuccessResponse(
      formatters.formatSetFeishuConnectorConfigResult(params, enabled),
      { config, enabled }
    );
  } catch (error) {
    return createErrorResponse(error, '设置飞书连接器配置');
  }
}

/**
 * 启用/禁用连接器
 */
export async function handleSetConnectorEnabled(
  params: {
    connectorId: 'feishu';
    enabled: boolean;
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('设置连接器状态:', params.connectorId, params.enabled ? '启用' : '禁用');
    
    checkAbortSignal(signal, '设置连接器状态');
    
    const store = await getSystemConfigStore();
    
    // 检查连接器是否已配置
    const connectorConfig = store.getConnectorConfig(params.connectorId);
    if (!connectorConfig) {
      throw new Error(`连接器 ${params.connectorId} 尚未配置，请先配置后再启用`);
    }
    
    // 更新启用状态
    store.setConnectorEnabled(params.connectorId, params.enabled);
    
    // 获取 Gateway 实例
    const gateway = await getGatewayInstance();
    
    if (!gateway) {
      logger.warn('Gateway 未初始化，连接器将在下次启动时生效');
    } else {
      try {
        const connectorManager = gateway.getConnectorManager();
        
        if (params.enabled) {
          logger.info('启动连接器:', params.connectorId);
          await connectorManager.startConnector(params.connectorId as any);
          logger.info('连接器已启动:', params.connectorId);
        } else {
          logger.info('停止连接器:', params.connectorId);
          await connectorManager.stopConnector(params.connectorId as any);
          logger.info('连接器已停止:', params.connectorId);
        }
      } catch (operationError) {
        logger.error(`${params.enabled ? '启动' : '停止'}连接器失败:`, operationError);
        if (params.enabled) {
          logger.warn('连接器状态已更新，但启动失败。请重启应用或手动启动连接器');
        }
      }
    }
    
    return createSuccessResponse(
      formatters.formatSetConnectorEnabledResult(params),
      { connectorId: params.connectorId, enabled: params.enabled }
    );
  } catch (error) {
    return createErrorResponse(error, '设置连接器状态');
  }
}

// ==================== 配对管理 ====================

/**
 * 获取配对记录
 */
export async function handleGetPairingRecords(
  params: {
    connectorId?: 'feishu';
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('获取配对记录:', params.connectorId || '所有连接器');
    
    checkAbortSignal(signal, '获取配对记录');
    
    const store = await getSystemConfigStore();
    
    // 获取配对记录
    const records = store.getAllPairingRecords(params.connectorId);
    
    // 添加 connectorName 并转换时间格式
    const connectorNames: Record<string, string> = {
      feishu: '飞书',
      wechat: '微信',
    };
    
    const formattedRecords = records.map(record => ({
      connectorId: record.connectorId,
      connectorName: connectorNames[record.connectorId] || record.connectorId,
      userId: record.userId,
      openId: record.openId,
      userName: record.userName,
      isAdmin: record.isAdmin,
      pairingCode: record.pairingCode,
      approved: record.approved,
      createdAt: new Date(record.createdAt).toISOString(),
      approvedAt: record.approvedAt ? new Date(record.approvedAt).toISOString() : undefined,
    }));
    
    // 统计待审核数量
    const pendingCount = formattedRecords.filter(r => !r.approved).length;
    const approvedCount = formattedRecords.filter(r => r.approved).length;
    
    return createSuccessResponse(
      formatters.formatGetPairingRecordsResult(formattedRecords, pendingCount, approvedCount),
      { records: formattedRecords, pendingCount, approvedCount }
    );
  } catch (error) {
    return createErrorResponse(error, '获取配对记录');
  }
}

/**
 * 审核配对请求
 */
export async function handleApprovePairing(
  params: {
    pairingCode: string;
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('审核配对请求:', params.pairingCode);
    
    checkAbortSignal(signal, '审核配对');
    
    const store = await getSystemConfigStore();
    
    // 检查配对码是否存在
    const record = store.getPairingRecordByCode(params.pairingCode);
    if (!record) {
      throw new Error(`配对码 ${params.pairingCode} 不存在或已过期`);
    }
    
    if (record.approved) {
      throw new Error(`配对码 ${params.pairingCode} 已经审核通过，无需重复审核`);
    }
    
    // 批准配对
    store.approvePairingRecord(params.pairingCode);
    
    // 通知连接器向用户发送欢迎消息
    try {
      const gateway = await getGatewayInstance();
      gateway?.getConnectorManager().notifyPairingApproved(
        record.connectorId as any,
        record.userId,
        record.openId,
      );
    } catch (err) {
      logger.error('发送欢迎消息失败:', err);
    }

    // 推送待授权数量更新
    broadcastPendingCount();

    return createSuccessResponse(
      formatters.formatApprovePairingResult(params.pairingCode, record),
      { pairingCode: params.pairingCode, connectorId: record.connectorId, userId: record.userId }
    );
  } catch (error) {
    return createErrorResponse(error, '审核配对');
  }
}

/**
 * 拒绝配对请求
 */
export async function handleRejectPairing(
  params: {
    connectorId: 'feishu';
    userId: string;
  },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('拒绝配对请求:', params.connectorId, params.userId);
    
    checkAbortSignal(signal, '拒绝配对');
    
    const store = await getSystemConfigStore();
    
    // 检查配对记录是否存在
    const record = store.getPairingRecordByUser(params.connectorId, params.userId);
    if (!record) {
      throw new Error(`用户 ${params.userId} 在 ${params.connectorId} 连接器中没有配对记录`);
    }
    
    // 删除配对记录（拒绝）
    store.deletePairingRecord(params.connectorId, params.userId);

    // 推送待授权数量更新
    broadcastPendingCount();

    return createSuccessResponse(
      formatters.formatRejectPairingResult(params.connectorId, params.userId),
      { connectorId: params.connectorId, userId: params.userId }
    );
  } catch (error) {
    return createErrorResponse(error, '拒绝配对');
  }
}