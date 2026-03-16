/**
 * 连接器处理器 - 负责连接器消息处理和响应发送
 */

import type { GatewayMessage } from '../../types/connector';
import type { ConnectorManager } from '../connectors/connector-manager';
import type { AgentTab } from '../../types/agent-tab';
import { getErrorMessage } from '../../shared/utils/error-handler';
import type { CreateTabOptions } from './types';

export class ConnectorHandler {
  constructor(private connectorManager: ConnectorManager) {}

  /**
   * 自动启动已启用的连接器
   */
  async autoStartConnectors(): Promise<void> {
    console.log('[ConnectorHandler] 🔄 自动启动已启用的连接器...');
    
    try {
      const { SystemConfigStore } = await import('../database/system-config-store');
      const store = SystemConfigStore.getInstance();
      
      // 获取所有连接器
      const allConnectors = this.connectorManager.getAllConnectors();
      
      for (const connector of allConnectors) {
        try {
          // 检查配置
          const configData = store.getConnectorConfig(connector.id);
          
          if (configData && configData.enabled) {
            console.log(`[ConnectorHandler] 🚀 启动: ${connector.id}`);
            await this.connectorManager.startConnector(connector.id as any);
          }
        } catch (error) {
          console.error(`[ConnectorHandler] ❌ 启动连接器失败: ${connector.id}`, error);
          // 继续启动其他连接器
        }
      }
      
      console.log('[ConnectorHandler] ✅ 连接器启动完成');
    } catch (error) {
      console.error('[ConnectorHandler] ❌ 自动启动连接器过程失败:', error);
    }
  }

  /**
   * 处理连接器消息
   */
  async handleConnectorMessage(
    message: GatewayMessage,
    findTabByConversationKey: (key: string) => AgentTab | null,
    createTab: (options: CreateTabOptions) => Promise<AgentTab>,
    handleSendMessage: (content: string, sessionId: string, displayContent?: string) => Promise<void>
  ): Promise<void> {
    console.log('[ConnectorHandler] 处理连接器消息:', {
      connectorId: message.source.connectorId,
      conversationId: message.source.conversationId,
      senderId: message.source.senderId,
      senderName: message.source.senderName,
    });
    
    try {
      // 1. 查找或创建 Tab
      const conversationKey = `${message.source.connectorId}_${message.source.conversationId}`;
      let tab = findTabByConversationKey(conversationKey);
      
      if (!tab) {
        // 创建新 Tab
        const title = message.source.connectorId || 'Unknown Connector';
        tab = await createTab({
          type: 'connector',
          title,
          conversationKey,
          connectorId: message.source.connectorId,
          conversationId: message.source.conversationId,
        });
        
        console.log('[ConnectorHandler] 创建连接器 Tab:', {
          tabId: tab.id,
          title,
          conversationKey,
        });
      }
      
      // 2. 发送消息给 Agent 处理
      const content = message.content.text || '';
      const senderName = message.source.senderName || '用户';
      
      const displayContent = content;
      const contentWithSource = `[来自: ${senderName}]\n${content}`;
      
      // 添加系统提示，告知这是外部通讯会话
      const systemHint = `\n\n[系统提示: 这是外部通讯会话。
你可以使用 connector_send_image 和 connector_send_file 工具发送图片和文件]`;
      
      const contentForAgent = contentWithSource + systemHint;
      
      await handleSendMessage(contentForAgent, tab.id, displayContent);
      
      console.log('[ConnectorHandler] ✅ 连接器消息已处理');
    } catch (error) {
      console.error('[ConnectorHandler] ❌ 处理连接器消息失败:', error);
      throw error;
    }
  }

  /**
   * 发送响应到连接器
   */
  async sendResponseToConnector(tabId: string, response: string, getTab: (tabId: string) => AgentTab | undefined): Promise<void> {
    const tab = getTab(tabId);
    if (!tab || tab.type !== 'connector') {
      console.log('[ConnectorHandler] Tab 不是连接器类型，跳过发送');
      return;
    }
    
    if (!tab.connectorId || !tab.conversationId) {
      console.error('[ConnectorHandler] Tab 缺少连接器信息');
      return;
    }
    
    console.log('[ConnectorHandler] 发送响应到连接器:', {
      tabId,
      connectorId: tab.connectorId,
      conversationId: tab.conversationId,
      responseLength: response.length,
    });
    
    try {
      await this.connectorManager.sendOutgoingMessage(
        tab.connectorId as any,
        tab.conversationId,
        response
      );
      
      console.log('[ConnectorHandler] ✅ 响应已发送到连接器');
    } catch (error) {
      console.error('[ConnectorHandler] ❌ 发送响应到连接器失败:', error);
      throw error;
    }
  }

  /**
   * 获取 ConnectorManager 实例
   */
  getConnectorManager(): ConnectorManager {
    return this.connectorManager;
  }
}