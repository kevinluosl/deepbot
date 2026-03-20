/**
 * 连接器 IPC 处理器
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../types/ipc';
import type {
  GetAllConnectorsResponse,
  GetConnectorConfigRequest,
  GetConnectorConfigResponse,
  SaveConnectorConfigRequest,
  SaveConnectorConfigResponse,
  StartConnectorRequest,
  StartConnectorResponse,
  StopConnectorRequest,
  StopConnectorResponse,
  HealthCheckConnectorRequest,
  HealthCheckConnectorResponse,
  GetPairingRecordsRequest,
  GetPairingRecordsResponse,
  ApprovePairingRequest,
  ApprovePairingResponse,
  SetAdminPairingRequest,
  SetAdminPairingResponse,
  DeletePairingRequest,
  DeletePairingResponse,
} from '../../types/ipc';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { registerIpcHandler } from '../../shared/utils/ipc-utils';
import { SystemConfigStore } from '../database/system-config-store';
import type { Gateway } from '../gateway';

let gateway: Gateway | null = null;

/**
 * 设置 Gateway 实例
 */
export function setGatewayForConnectorHandler(gatewayInstance: Gateway): void {
  gateway = gatewayInstance;
}

/**
 * 推送待授权用户数量到渲染进程（导出供其他模块使用）
 */
export function broadcastPendingCount(): void {
  try {
    const store = SystemConfigStore.getInstance();
    const records = store.getAllPairingRecords();
    const pendingCount = records.filter(r => !r.approved).length;
    
    // 推送给所有窗口
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.CONNECTOR_PENDING_COUNT_UPDATED, { pendingCount });
      }
    });
  } catch (error) {
    console.error('[IPC] 推送待授权数量失败:', error);
  }
}

/**
 * 注册连接器相关的 IPC 处理器
 */
export function registerConnectorHandlers(): void {
  // 获取所有连接器
  registerIpcHandler<void, GetAllConnectorsResponse>(
    IPC_CHANNELS.CONNECTOR_GET_ALL,
    async (): Promise<GetAllConnectorsResponse> => {
      try {
        console.log('[IPC] 获取所有连接器');
        
        if (!gateway) {
          throw new Error('Gateway 未初始化');
        }
        
        const connectorManager = gateway.getConnectorManager();
        const allConnectors = connectorManager.getAllConnectors();
        const store = SystemConfigStore.getInstance();
        
        const connectors = allConnectors.map((connector) => {
          const configData = store.getConnectorConfig(connector.id);
          return {
            id: connector.id,
            name: connector.name,
            version: connector.version,
            enabled: configData?.enabled ?? false,
            hasConfig: configData !== null,
          };
        });
        
        return {
          success: true,
          connectors,
        };
      } catch (error) {
        console.error('[IPC] 获取所有连接器失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );
  
  // 获取连接器配置
  registerIpcHandler<GetConnectorConfigRequest, GetConnectorConfigResponse>(
    IPC_CHANNELS.CONNECTOR_GET_CONFIG,
    async (_event, request): Promise<GetConnectorConfigResponse> => {
      try {
        console.log('[IPC] 获取连接器配置:', request.connectorId);
        
        const store = SystemConfigStore.getInstance();
        const result = store.getConnectorConfig(request.connectorId);
        
        if (!result) {
          return {
            success: true,
            config: null,
            enabled: false,
          };
        }
        
        return {
          success: true,
          config: result.config,
          enabled: result.enabled,
        };
      } catch (error) {
        console.error('[IPC] 获取连接器配置失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );
  
  // 保存连接器配置
  registerIpcHandler<SaveConnectorConfigRequest, SaveConnectorConfigResponse>(
    IPC_CHANNELS.CONNECTOR_SAVE_CONFIG,
    async (_event, request): Promise<SaveConnectorConfigResponse> => {
      try {
        console.log('[IPC] 保存连接器配置:', request.connectorId);
        
        if (!gateway) {
          throw new Error('Gateway 未初始化');
        }
        
        const connectorManager = gateway.getConnectorManager();
        const connector = connectorManager.getConnector(request.connectorId as any);
        
        if (!connector) {
          throw new Error(`连接器不存在: ${request.connectorId}`);
        }
        
        // 验证配置
        if (!connector.config.validate(request.config)) {
          throw new Error('配置验证失败');
        }
        
        // 🔥 保存配置前，如果连接器正在运行，先停止它
        const store = SystemConfigStore.getInstance();
        const currentConfig = store.getConnectorConfig(request.connectorId);
        if (currentConfig?.enabled) {
          console.log('[IPC] 连接器正在运行，先停止以应用新配置');
          await connectorManager.stopConnector(request.connectorId as any);
          store.setConnectorEnabled(request.connectorId, false);
        }
        
        // 保存到数据库
        store.saveConnectorConfig(
          request.connectorId,
          connector.name,
          request.config,
          request.enabled ?? false
        );
        
        // 如果启用，更新 ConnectorManager 的状态
        if (request.enabled) {
          store.setConnectorEnabled(request.connectorId, true);
        }
        
        console.log('[IPC] ✅ 连接器配置已保存');
        
        return {
          success: true,
        };
      } catch (error) {
        console.error('[IPC] 保存连接器配置失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );
  
  // 启动连接器
  registerIpcHandler<StartConnectorRequest, StartConnectorResponse>(
    IPC_CHANNELS.CONNECTOR_START,
    async (_event, request): Promise<StartConnectorResponse> => {
      try {
        console.log('[IPC] 启动连接器:', request.connectorId);
        
        if (!gateway) {
          throw new Error('Gateway 未初始化');
        }
        
        // 先更新数据库状态（必须在 startConnector 之前）
        const store = SystemConfigStore.getInstance();
        store.setConnectorEnabled(request.connectorId, true);
        
        // 然后启动连接器
        const connectorManager = gateway.getConnectorManager();
        await connectorManager.startConnector(request.connectorId as any);
        
        console.log('[IPC] ✅ 连接器已启动');
        
        return {
          success: true,
        };
      } catch (error) {
        console.error('[IPC] 启动连接器失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );
  
  // 停止连接器
  registerIpcHandler<StopConnectorRequest, StopConnectorResponse>(
    IPC_CHANNELS.CONNECTOR_STOP,
    async (_event, request): Promise<StopConnectorResponse> => {
      try {
        console.log('[IPC] 停止连接器:', request.connectorId);
        
        if (!gateway) {
          throw new Error('Gateway 未初始化');
        }
        
        const connectorManager = gateway.getConnectorManager();
        await connectorManager.stopConnector(request.connectorId as any);
        
        // 更新数据库状态
        const store = SystemConfigStore.getInstance();
        store.setConnectorEnabled(request.connectorId, false);
        
        console.log('[IPC] ✅ 连接器已停止');
        
        return {
          success: true,
        };
      } catch (error) {
        console.error('[IPC] 停止连接器失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );
  
  // 健康检查
  registerIpcHandler<HealthCheckConnectorRequest, HealthCheckConnectorResponse>(
    IPC_CHANNELS.CONNECTOR_HEALTH_CHECK,
    async (_event, request): Promise<HealthCheckConnectorResponse> => {
      try {
        console.log('[IPC] 连接器健康检查:', request.connectorId);
        
        if (!gateway) {
          throw new Error('Gateway 未初始化');
        }
        
        const connectorManager = gateway.getConnectorManager();
        const connector = connectorManager.getConnector(request.connectorId as any);
        
        if (!connector) {
          throw new Error(`连接器不存在: ${request.connectorId}`);
        }
        
        const health = await connector.healthCheck();
        
        return {
          success: true,
          status: health.status,
          message: health.message,
        };
      } catch (error) {
        console.error('[IPC] 连接器健康检查失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );
  
  // 获取 Pairing 记录
  registerIpcHandler<GetPairingRecordsRequest, GetPairingRecordsResponse>(
    IPC_CHANNELS.CONNECTOR_GET_PAIRING_RECORDS,
    async (_event, request): Promise<GetPairingRecordsResponse> => {
      try {
        console.log('[IPC] 获取 Pairing 记录:', request.connectorId);
        
        const store = SystemConfigStore.getInstance();
        const records = store.getAllPairingRecords(request.connectorId);
        
        return {
          success: true,
          records,
        };
      } catch (error) {
        console.error('[IPC] 获取 Pairing 记录失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );
  
  // 批准 Pairing
  registerIpcHandler<ApprovePairingRequest, ApprovePairingResponse>(
    IPC_CHANNELS.CONNECTOR_APPROVE_PAIRING,
    async (_event, request): Promise<ApprovePairingResponse> => {
      try {
        console.log('[IPC] 批准 Pairing:', request.pairingCode);
        
        const store = SystemConfigStore.getInstance();
        
        // 批准前先查出用户信息（含 openId）
        const record = store.getPairingRecordByCode(request.pairingCode);
        store.approvePairingRecord(request.pairingCode);
        
        // 通知连接器向用户发送欢迎消息
        if (record && gateway) {
          gateway.getConnectorManager().notifyPairingApproved(
            record.connectorId as any,
            record.userId,
            record.openId,
          );
        }
        
        // 推送待授权数量更新
        broadcastPendingCount();
        
        return {
          success: true,
        };
      } catch (error) {
        console.error('[IPC] 批准 Pairing 失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );
  
  // 设置/取消管理员
  registerIpcHandler<SetAdminPairingRequest, SetAdminPairingResponse>(
    IPC_CHANNELS.CONNECTOR_SET_ADMIN_PAIRING,
    async (_event, request): Promise<SetAdminPairingResponse> => {
      try {
        const store = SystemConfigStore.getInstance();
        store.setAdminPairing(request.connectorId, request.userId, request.isAdmin);
        return { success: true };
      } catch (error) {
        console.error('[IPC] 设置管理员失败:', error);
        return { success: false, error: getErrorMessage(error) };
      }
    }
  );

  // 删除 Pairing 记录
  registerIpcHandler<DeletePairingRequest, DeletePairingResponse>(
    IPC_CHANNELS.CONNECTOR_DELETE_PAIRING,
    async (_event, request): Promise<DeletePairingResponse> => {
      try {
        console.log('[IPC] 删除 Pairing 记录:', request.connectorId, request.userId);
        
        const store = SystemConfigStore.getInstance();
        store.deletePairingRecord(request.connectorId, request.userId);
        
        console.log('[IPC] ✅ Pairing 记录已删除');
        
        // 推送待授权数量更新
        broadcastPendingCount();
        
        return {
          success: true,
        };
      } catch (error) {
        console.error('[IPC] 删除 Pairing 记录失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );
}
