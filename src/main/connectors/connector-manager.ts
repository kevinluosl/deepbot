/**
 * Connector Manager - 连接器管理器
 * 
 * 职责：
 * - 管理所有 Connector 实例
 * - 启动/停止 Connector
 * - 配置管理
 * - 处理外部消息并转发到 Gateway
 */

import type { Gateway } from '../gateway';
import type {
  Connector,
  ConnectorId,
  ConnectorConfig,
  GatewayMessage,
  ConnectorIncomingMessage,
} from '../../types/connector';
import { getErrorMessage } from '../../shared/utils/error-handler';

export class ConnectorManager {
  private connectors: Map<ConnectorId, Connector> = new Map();
  private gateway: Gateway;
  
  constructor(gateway: Gateway) {
    this.gateway = gateway;
    console.log('[ConnectorManager] 初始化');
  }
  
  /**
   * 注册连接器
   * 
   * @param connector - 连接器实例
   */
  registerConnector(connector: Connector): void {
    this.connectors.set(connector.id, connector);
    console.log(`[ConnectorManager] 注册连接器: ${connector.id} (${connector.name})`);
  }
  
  /**
   * 启动连接器
   * 
   * @param connectorId - 连接器 ID
   */
  async startConnector(connectorId: ConnectorId): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`连接器不存在: ${connectorId}`);
    }
    
    console.log(`[ConnectorManager] 启动连接器: ${connectorId}`);
    
    try {
      // 加载配置
      const config = await connector.config.load();
      if (!config) {
        throw new Error('配置不存在');
      }
      
      if (!config.enabled) {
        console.log(`[ConnectorManager] 连接器未启用: ${connectorId}`);
        return;
      }
      
      // 验证配置
      if (!connector.config.validate(config)) {
        throw new Error('配置无效');
      }
      
      // 初始化
      await connector.initialize(config);
      
      // 启动
      await connector.start();
      
      console.log(`[ConnectorManager] ✅ 连接器已启动: ${connectorId}`);
    } catch (error) {
      console.error(`[ConnectorManager] ❌ 启动连接器失败: ${connectorId}`, error);
      throw error;
    }
  }
  
  /**
   * 停止连接器
   * 
   * @param connectorId - 连接器 ID
   */
  async stopConnector(connectorId: ConnectorId): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`连接器不存在: ${connectorId}`);
    }
    
    console.log(`[ConnectorManager] 停止连接器: ${connectorId}`);
    
    try {
      await connector.stop();
      console.log(`[ConnectorManager] ✅ 连接器已停止: ${connectorId}`);
    } catch (error) {
      console.error(`[ConnectorManager] ❌ 停止连接器失败: ${connectorId}`, error);
      throw error;
    }
  }
  
  /**
   * 获取连接器
   * 
   * @param connectorId - 连接器 ID
   * @returns 连接器实例
   */
  getConnector(connectorId: ConnectorId): Connector | null {
    return this.connectors.get(connectorId) || null;
  }
  
  /**
   * 获取所有连接器
   * 
   * @returns 连接器列表
   */
  getAllConnectors(): Connector[] {
    return Array.from(this.connectors.values());
  }
  
  /**
   * 处理外部消息（由 Connector 调用）
   * 
   * @param connectorId - 连接器 ID
   * @param parsedMessage - 解析后的消息
   */
  async handleIncomingMessage(
    connectorId: ConnectorId,
    parsedMessage: ConnectorIncomingMessage
  ): Promise<void> {
    console.log(`[ConnectorManager] 收到外部消息: ${connectorId}`, {
      messageId: parsedMessage.messageId,
      sender: parsedMessage.sender.name,
      conversation: parsedMessage.conversation.id,
    });
    
    try {
      // 转换为 Gateway 格式
      const gatewayMessage: GatewayMessage = {
        tabId: '', // 由 Gateway 分配
        messageId: parsedMessage.messageId,
        timestamp: parsedMessage.timestamp,
        replyToMessageId: parsedMessage.messageId,  // 保存原始消息 ID，用于回复
        source: {
          type: 'connector',
          connectorId,
          conversationId: parsedMessage.conversation.id,
          senderId: parsedMessage.sender.id,
          senderName: parsedMessage.sender.name,
          chatType: parsedMessage.conversation.type,  // 直接使用，已经是 'p2p' 或 'group'
        },
        content: parsedMessage.content,
        systemContext: parsedMessage.systemContext,
        raw: parsedMessage.raw,
      };
      
      // 转发到 Gateway
      await this.gateway.handleConnectorMessage(gatewayMessage);
      
      console.log(`[ConnectorManager] ✅ 消息已转发到 Gateway`);
    } catch (error) {
      console.error(`[ConnectorManager] ❌ 处理消息失败:`, error);
      throw error;
    }
  }
  
  /**
   * 发送消息到外部（由 Gateway 调用）
   * 
   * @param connectorId - 连接器 ID
   * @param conversationId - 会话 ID
   * @param content - 消息内容
   * @param replyToMessageId - 要回复的消息 ID（可选，用于飞书 reply API）
   */
  async sendOutgoingMessage(
    connectorId: ConnectorId,
    conversationId: string,
    content: string,
    replyToMessageId?: string
  ): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`连接器不存在: ${connectorId}`);
    }
    
    console.log(`[ConnectorManager] 发送消息到外部: ${connectorId}`, {
      conversationId,
      contentLength: content.length,
      replyToMessageId,
    });
    
    try {
      await connector.outbound.sendMessage({
        conversationId,
        content,
        replyToMessageId,
      });
      
      console.log(`[ConnectorManager] ✅ 消息已发送`);
    } catch (error) {
      console.error(`[ConnectorManager] ❌ 发送消息失败:`, error);
      throw error;
    }
  }
  
  /**
   * 发送图片到外部（由 Gateway 或 Tool 调用）
   * 
   * @param connectorId - 连接器 ID
   * @param conversationId - 会话 ID
   * @param imagePath - 图片路径
   * @param caption - 图片说明（可选）
   */
  async sendImage(
    connectorId: ConnectorId,
    conversationId: string,
    imagePath: string,
    caption?: string
  ): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`连接器不存在: ${connectorId}`);
    }
    
    if (!connector.outbound.sendImage) {
      throw new Error(`连接器 ${connectorId} 不支持发送图片`);
    }
    
    console.log(`[ConnectorManager] 发送图片到外部: ${connectorId}`, {
      conversationId,
      imagePath,
    });
    
    try {
      await connector.outbound.sendImage({
        conversationId,
        imagePath,
        caption,
      });
      
      console.log(`[ConnectorManager] ✅ 图片已发送`);
    } catch (error) {
      console.error(`[ConnectorManager] ❌ 发送图片失败:`, error);
      throw error;
    }
  }
  
  /**
   * 发送文件到外部（由 Gateway 或 Tool 调用）
   * 
   * @param connectorId - 连接器 ID
   * @param conversationId - 会话 ID
   * @param filePath - 文件路径
   * @param fileName - 文件名（可选）
   */
  async sendFile(
    connectorId: ConnectorId,
    conversationId: string,
    filePath: string,
    fileName?: string
  ): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`连接器不存在: ${connectorId}`);
    }
    
    if (!connector.outbound.sendFile) {
      throw new Error(`连接器 ${connectorId} 不支持发送文件`);
    }
    
    console.log(`[ConnectorManager] 发送文件到外部: ${connectorId}`, {
      conversationId,
      filePath,
    });
    
    try {
      await connector.outbound.sendFile({
        conversationId,
        filePath,
        fileName,
      });
      
      console.log(`[ConnectorManager] ✅ 文件已发送`);
    } catch (error) {
      console.error(`[ConnectorManager] ❌ 发送文件失败:`, error);
      throw error;
    }
  }
  
  /**
   * 通知连接器某个用户的配对已被批准
   * 统一入口，避免各调用方重复实现相同逻辑
   *
   * @param connectorId - 连接器 ID
   * @param userId - 用户 ID
   * @param openId - 用户 open_id（可选）
   */
  notifyPairingApproved(connectorId: ConnectorId, userId: string, openId?: string): void {
    const connector = this.connectors.get(connectorId);
    if (connector?.onPairingApproved) {
      try {
        connector.onPairingApproved(userId, openId);
      } catch (error) {
        console.error(`[ConnectorManager] ❌ 通知配对批准失败: ${connectorId}`, error);
      }
    }
  }

  /**
   * 推送待授权用户数量到前端
   * 
   * 通过 Gateway 的主窗口发送 IPC 消息，兼容 Electron 和 Docker 模式：
   * - Electron 模式：BrowserWindow.webContents.send() → 前端直接收到
   * - Docker 模式：VirtualWebContents.send() → GatewayAdapter → WebSocket 广播
   */
  broadcastPendingCount(): void {
    try {
      const { SystemConfigStore } = require('../database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const records = store.getAllPairingRecords();
      const pendingCount = records.filter((r: any) => !r.approved).length;
      
      const mainWindow = this.gateway.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('connector:pending-count-updated', { pendingCount });
      }
    } catch (error) {
      console.error('[ConnectorManager] 推送待授权数量失败:', error);
    }
  }

  /**
   * 推送微信二维码到前端
   */
  broadcastWechatQrCode(url: string, connectorId?: string): void {
    try {
      const mainWindow = this.gateway.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('wechat:qr-code', { url, connectorId: connectorId || 'wechat-1' });
      }
    } catch (error) {
      console.error('[ConnectorManager] 推送微信二维码失败:', error);
    }
  }

  /**
   * 健康检查
   *
   * @param connectorId - 连接器 ID
   * @returns 健康状态
   */
  async healthCheck(connectorId: ConnectorId): Promise<any> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      return {
        status: 'unhealthy',
        message: '连接器不存在',
      };
    }
    
    try {
      return await connector.healthCheck();
    } catch (error) {
      return {
        status: 'unhealthy',
        message: getErrorMessage(error),
      };
    }
  }
  
  /**
   * 创建新的微信连接器实例
   * 
   * @returns 新实例的 connectorId
   */
  createWechatInstance(): string {
    // 找到下一个可用编号
    let nextNum = 1;
    while (this.connectors.has(`wechat-${nextNum}`)) {
      nextNum++;
    }
    const instanceId = `wechat-${nextNum}`;

    const { WechatConnector } = require('./wechat/wechat-connector');
    const connector = new WechatConnector(this, instanceId);
    this.registerConnector(connector);

    console.log(`[ConnectorManager] ✅ 创建微信实例: ${instanceId}`);
    return instanceId;
  }

  /**
   * 删除微信连接器实例
   * 
   * @param connectorId - 连接器实例 ID（如 wechat-1）
   */
  async removeWechatInstance(connectorId: string): Promise<void> {
    if (!connectorId.startsWith('wechat')) {
      throw new Error('只能删除微信连接器实例');
    }

    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`连接器实例不存在: ${connectorId}`);
    }

    // 先停止
    try {
      await connector.stop();
    } catch {
      // 忽略停止错误
    }

    // 从 Map 中移除
    this.connectors.delete(connectorId);

    // 删除数据库配置
    const { SystemConfigStore } = require('../database/system-config-store');
    const store = SystemConfigStore.getInstance();
    store.deleteConnectorConfig(connectorId);

    console.log(`[ConnectorManager] ✅ 已删除微信实例: ${connectorId}`);
  }

  /**
   * 销毁所有连接器
   */
  async destroy(): Promise<void> {
    console.log('[ConnectorManager] 销毁所有连接器...');
    
    for (const [connectorId, connector] of this.connectors.entries()) {
      try {
        // 应用退出时不清除凭证缓存（下次启动可自动恢复登录）
        if (typeof (connector as any).stop === 'function') {
          await (connector as any).stop(false);
        }
        console.log(`[ConnectorManager] 已停止连接器: ${connectorId}`);
      } catch (error) {
        console.error(`[ConnectorManager] 停止连接器失败: ${connectorId}`, error);
      }
    }
    
    this.connectors.clear();
    console.log('[ConnectorManager] ✅ 所有连接器已销毁');
  }
}
