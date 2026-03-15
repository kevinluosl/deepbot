/**
 * 飞书连接器
 * 
 * 使用飞书官方 Node.js SDK 的 WebSocket 长连接接收消息
 * 
 * 参考：
 * - https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/server-side-sdk/nodejs-sdk/preparation-before-development
 * - https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/server-side-sdk/nodejs-sdk/handling-events
 */

import * as Lark from '@larksuiteoapi/node-sdk';
import * as fs from 'fs';
import * as path from 'path';
import type {
  Connector,
  FeishuConnectorConfig,
  FeishuIncomingMessage,
  HealthStatus,
} from '../../../types/connector';
import { getErrorMessage } from '../../../shared/utils/error-handler';
import { safeJsonParse } from '../../../shared/utils/json-utils';
import type { ConnectorManager } from '../connector-manager';
import { SystemConfigStore } from '../../database/system-config-store';
import { FeishuDocumentHandler } from './document-handler';

export class FeishuConnector implements Connector {
  readonly id = 'feishu' as const;
  readonly name = '飞书';
  readonly version = '1.0.0';
  
  private connectorConfig!: FeishuConnectorConfig;
  private client!: Lark.Client;
  private wsClient?: Lark.WSClient;
  private connectorManager: ConnectorManager;
  private isStarted: boolean = false;
  private documentHandler!: FeishuDocumentHandler;
  
  // 消息去重：缓存最近 1000 条已处理的消息 ID
  private processedMessages: Set<string> = new Set();
  private readonly MAX_PROCESSED_MESSAGES = 1000;
  
  // 基于内容的去重：缓存最近的消息内容和时间戳
  private recentMessages: Map<string, number> = new Map();
  private readonly MESSAGE_DEDUP_WINDOW = 5000; // 5秒内相同内容视为重复
  
  constructor(connectorManager: ConnectorManager) {
    this.connectorManager = connectorManager;
    console.log('[FeishuConnector] 初始化');
  }
  
  // ========== 配置管理 ==========
  config = {
    load: async (): Promise<FeishuConnectorConfig | null> => {
      console.log('[FeishuConnector] 加载配置');
      const store = SystemConfigStore.getInstance();
      const result = store.getConnectorConfig('feishu');
      
      if (!result) {
        console.log('[FeishuConnector] 未找到配置');
        return null;
      }
      
      console.log('[FeishuConnector] ✅ 配置已加载');
      // 将 enabled 字段合并到配置对象中
      return {
        ...result.config,
        enabled: result.enabled,
      } as FeishuConnectorConfig;
    },
    
    save: async (config: FeishuConnectorConfig): Promise<void> => {
      console.log('[FeishuConnector] 保存配置');
      const store = SystemConfigStore.getInstance();
      store.saveConnectorConfig('feishu', '飞书', config, false);
      console.log('[FeishuConnector] ✅ 配置已保存');
    },
    
    validate: (config: FeishuConnectorConfig): boolean => {
      return !!(
        config.appId &&
        config.appSecret &&
        config.botName
      );
    },
  };
  
  // ========== 生命周期 ==========
  
  async initialize(config: FeishuConnectorConfig): Promise<void> {
    console.log('[FeishuConnector] 初始化连接器');
    this.connectorConfig = config;
    
    // 初始化飞书 SDK Client
    this.client = new Lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      loggerLevel: Lark.LoggerLevel.info,
    });
    
    // 初始化文档处理器
    this.documentHandler = new FeishuDocumentHandler(this.client);
    
    console.log('[FeishuConnector] ✅ 初始化完成');
  }
  
  async start(): Promise<void> {
    if (this.isStarted) {
      console.log('[FeishuConnector] 连接器已启动');
      return;
    }
    
    console.log('[FeishuConnector] 启动连接器...');
    
    // 确保旧连接已关闭
    if (this.wsClient) {
      console.log('[FeishuConnector] ⚠️ 检测到旧的 WebSocket 连接，先关闭');
      this.wsClient = undefined;
    }
    
    // 初始化 WebSocket 客户端
    this.wsClient = new Lark.WSClient({
      appId: this.connectorConfig.appId,
      appSecret: this.connectorConfig.appSecret,
      loggerLevel: Lark.LoggerLevel.info,
    });
    
    // 创建事件分发器
    const eventDispatcher = new Lark.EventDispatcher({}).register({
      // 监听接收消息事件
      'im.message.receive_v1': async (data) => {
        // 先快速返回响应，避免飞书重推事件
        // 然后异步处理消息
        setImmediate(() => {
          this.handleIncomingMessage(data).catch((error) => {
            console.error('[FeishuConnector] ❌ 异步处理消息失败:', error);
          });
        });
        
        // 立即返回成功响应
        return { code: 0 };
      },
    });
    
    // 启动长连接
    this.wsClient.start({ eventDispatcher });
    
    this.isStarted = true;
    console.log('[FeishuConnector] ✅ 连接器已启动');
  }
  
  async stop(): Promise<void> {
    if (!this.isStarted) {
      console.log('[FeishuConnector] 连接器未启动');
      return;
    }
    
    console.log('[FeishuConnector] 停止连接器...');
    
    // 关闭 WebSocket 连接
    if (this.wsClient) {
      try {
        console.log('[FeishuConnector] 关闭 WebSocket 连接');
        // 🔥 使用 close() 方法正确关闭 WebSocket 连接
        this.wsClient.close({ force: true });
        this.wsClient = undefined;
      } catch (error) {
        console.error('[FeishuConnector] 关闭 WebSocket 失败:', error);
      }
    }
    
    this.isStarted = false;
    console.log('[FeishuConnector] ✅ 连接器已停止');
  }
  
  async healthCheck(): Promise<HealthStatus> {
    // 检查 WebSocket 连接状态
    if (!this.wsClient) {
      return {
        status: 'unhealthy',
        message: 'WebSocket 未连接',
      };
    }
    
    // 尝试调用 API 检查连接
    try {
      // 调用一个简单的 API 来验证连接
      await this.client.auth.tenantAccessToken.internal({
        data: {
          app_id: this.connectorConfig.appId,
          app_secret: this.connectorConfig.appSecret,
        },
      });
      
      return {
        status: 'healthy',
        message: '连接正常',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `认证失败: ${getErrorMessage(error)}`,
      };
    }
  }
  
  // ========== 消息处理 ==========
  
  private async handleIncomingMessage(event: any): Promise<void> {
    console.log('[FeishuConnector] 处理接收消息');
    
    try {
      // 1. 解析飞书消息
      // 飞书事件结构：event.sender.sender_id 包含 open_id, user_id, union_id
      const senderId = event.sender.sender_id.user_id || event.sender.sender_id.open_id;
      
      // 使用 ID 的后 8 位作为显示名
      const senderName = `用户_${senderId.slice(-8)}`;
      
      const feishuMessage: FeishuIncomingMessage = {
        messageId: event.message.message_id,
        timestamp: Date.now(),
        sender: {
          id: senderId,
          name: senderName,
        },
        conversation: {
          id: event.message.chat_id,
          type: event.message.chat_type === 'p2p' ? 'private' : 'group',
        },
        content: {
          type: 'text',
          text: safeJsonParse(event.message.content, { text: '' }).text || '',
        },
        raw: event,
      };
      
      console.log('[FeishuConnector] 消息详情:', {
        messageId: feishuMessage.messageId,
        sender: feishuMessage.sender.name,
        senderId: feishuMessage.sender.id,
        conversation: feishuMessage.conversation.id,
        type: feishuMessage.conversation.type,
        text: feishuMessage.content.text,
      });
      
      // 2. 消息去重检查（基于 message_id）
      if (this.processedMessages.has(feishuMessage.messageId)) {
        console.log('[FeishuConnector] ⚠️ 消息已处理（message_id 重复），跳过:', feishuMessage.messageId);
        return;
      }
      
      // 3. 基于内容的去重检查（防止飞书重复推送相同内容但不同 message_id）
      const contentKey = `${feishuMessage.sender.id}:${feishuMessage.content.text}`;
      const now = Date.now();
      const lastTime = this.recentMessages.get(contentKey);
      
      if (lastTime && (now - lastTime) < this.MESSAGE_DEDUP_WINDOW) {
        console.log('[FeishuConnector] ⚠️ 消息内容重复（5秒内），跳过:', {
          sender: feishuMessage.sender.id,
          text: feishuMessage.content.text,
          timeSinceLastMessage: now - lastTime,
        });
        return;
      }
      
      // 更新去重缓存
      this.processedMessages.add(feishuMessage.messageId);
      this.recentMessages.set(contentKey, now);
      
      // 限制 message_id 缓存大小
      if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
        const firstItem = this.processedMessages.values().next().value;
        if (firstItem) {
          this.processedMessages.delete(firstItem);
        }
      }
      
      // 清理过期的内容缓存（超过去重窗口的）
      for (const [key, timestamp] of this.recentMessages.entries()) {
        if (now - timestamp > this.MESSAGE_DEDUP_WINDOW) {
          this.recentMessages.delete(key);
        }
      }
      
      // 4. 检测并读取飞书文档
      const messageText = feishuMessage.content.text || '';
      const documentUrls = this.documentHandler.extractDocumentUrls(messageText);
      if (documentUrls.length > 0) {
        console.log('[FeishuConnector] 🔍 检测到飞书文档链接:', documentUrls);
        
        // 读取文档内容
        const documents = await this.documentHandler.readDocuments(documentUrls);
        if (documents.length > 0) {
          console.log('[FeishuConnector] ✅ 成功读取文档数量:', documents.length);
          documents.forEach((doc, index) => {
            console.log(`[FeishuConnector] 文档 ${index + 1}:`, {
              title: doc.title,
              contentLength: doc.content.length,
              url: doc.url,
            });
          });
          
          // 移除原始 URL，只保留文档内容
          let cleanedText = messageText;
          for (const url of documentUrls) {
            cleanedText = cleanedText.replace(url, '').trim();
          }
          
          // 将文档内容附加到消息中
          const documentContent = this.documentHandler.formatDocumentContent(documents);
          feishuMessage.content.text = cleanedText + documentContent;
          
          console.log('[FeishuConnector] ✅ 已移除原始 URL，消息总长度:', feishuMessage.content.text.length);
        } else {
          console.warn('[FeishuConnector] ⚠️ 未能读取任何文档内容，可能是权限不足或文档不存在');
          console.warn('[FeishuConnector] 💡 请确保在飞书开放平台配置了以下权限:');
          console.warn('[FeishuConnector]    - docx:document:readonly (读取云文档内容)');
          console.warn('[FeishuConnector]    - drive:drive:readonly (访问云空间文件)');
        }
      } else {
        console.log('[FeishuConnector] 消息中未检测到飞书文档链接');
      }
      
      // 5. 安全检查
      if (!this.checkSecurity(feishuMessage)) {
        console.log('[FeishuConnector] 安全检查未通过，忽略消息');
        
        // 如果是 pairing 模式，发送配对码
        if (this.connectorConfig.dmPolicy === 'pairing' && feishuMessage.conversation.type === 'private') {
          const code = this.pairing!.generatePairingCode(feishuMessage.sender.id);
          await this.outbound.sendMessage({
            conversationId: feishuMessage.conversation.id,
            content: `请使用配对码进行授权：${code}\n\n管理员可以使用以下命令批准：\ndeepbot pairing approve feishu ${code}`,
          });
        }
        
        return;
      }
      
      // 6. 转发到 Connector Manager
      await this.connectorManager.handleIncomingMessage('feishu', feishuMessage);
      
      console.log('[FeishuConnector] ✅ 消息已转发');
    } catch (error) {
      console.error('[FeishuConnector] ❌ 处理消息失败:', error);
    }
  }
  
  // ========== 消息发送 ==========
  
  outbound = {
    sendMessage: async (params: {
      conversationId: string;
      content: string;
      replyTo?: string;
    }): Promise<void> => {
      console.log('[FeishuConnector] 发送消息:', {
        conversationId: params.conversationId,
        contentLength: params.content.length,
      });
      
      try {
        // 使用 SDK 发送消息
        const res = await this.client.im.message.create({
          params: {
            receive_id_type: 'chat_id',
          },
          data: {
            receive_id: params.conversationId,
            msg_type: 'text',
            content: JSON.stringify({
              text: params.content,
            }),
          },
        });
        
        // 飞书 SDK 的响应格式检查
        // 正常响应: { code: 0, msg: "success", data: {...} }
        // 错误响应: { code: 非0, msg: "错误信息" }
        if (res && typeof res === 'object' && 'code' in res) {
          if (res.code !== 0) {
            const errorMsg = (res as any).msg || (res as any).message || '未知错误';
            throw new Error(`发送消息失败: ${errorMsg}`);
          }
        }
        
        console.log('[FeishuConnector] ✅ 消息已发送');
      } catch (error) {
        console.error('[FeishuConnector] ❌ 发送消息失败:', error);
        throw error;
      }
    },
    
    sendImage: async (params: {
      conversationId: string;
      imagePath: string;
      caption?: string;
    }): Promise<void> => {
      console.log('[FeishuConnector] 发送图片:', {
        conversationId: params.conversationId,
        imagePath: params.imagePath,
      });
      
      try {
        // 1. 读取图片文件
        const imageBuffer = fs.readFileSync(params.imagePath);
        const fileName = path.basename(params.imagePath);
        
        console.log('[FeishuConnector] 图片文件信息:', {
          fileName,
          size: imageBuffer.length,
          exists: fs.existsSync(params.imagePath),
        });
        
        // 2. 上传图片到飞书服务器
        console.log('[FeishuConnector] 开始上传图片...');
        const uploadRes = await this.client.im.image.create({
          data: {
            image_type: 'message',
            image: imageBuffer,
          },
        });
        
        console.log('[FeishuConnector] 上传响应:', JSON.stringify(uploadRes, null, 2));
        
        // 飞书 SDK 返回类型检查
        // 注意：飞书 SDK 可能返回不同的响应格式
        if (!uploadRes) {
          throw new Error('上传图片无响应');
        }
        
        // 检查是否有错误码
        if ('code' in uploadRes && (uploadRes as any).code !== 0) {
          const errorMsg = (uploadRes as any)?.msg || (uploadRes as any)?.message || '上传图片失败';
          throw new Error(`上传失败 (code: ${(uploadRes as any).code}): ${errorMsg}`);
        }
        
        // 尝试从不同的响应格式中获取 image_key
        const imageKey = (uploadRes as any)?.data?.image_key || (uploadRes as any)?.image_key;
        if (!imageKey) {
          console.error('[FeishuConnector] ❌ 响应中未找到 image_key:', uploadRes);
          throw new Error('未获取到 image_key，响应格式可能不正确');
        }
        
        console.log('[FeishuConnector] ✅ 图片已上传，image_key:', imageKey);
        
        // 3. 发送图片消息
        const sendRes = await this.client.im.message.create({
          params: {
            receive_id_type: 'chat_id',
          },
          data: {
            receive_id: params.conversationId,
            msg_type: 'image',
            content: JSON.stringify({
              image_key: imageKey,
            }),
          },
        });
        
        if (sendRes && typeof sendRes === 'object' && 'code' in sendRes) {
          if (sendRes.code !== 0) {
            const errorMsg = (sendRes as any).msg || (sendRes as any).message || '未知错误';
            throw new Error(`发送图片消息失败: ${errorMsg}`);
          }
        }
        
        // 4. 如果有说明文字，再发送一条文本消息
        if (params.caption) {
          await this.outbound.sendMessage({
            conversationId: params.conversationId,
            content: params.caption,
          });
        }
        
        console.log('[FeishuConnector] ✅ 图片消息已发送');
      } catch (error) {
        console.error('[FeishuConnector] ❌ 发送图片失败:', error);
        throw error;
      }
    },
    
    sendFile: async (params: {
      conversationId: string;
      filePath: string;
      fileName?: string;
    }): Promise<void> => {
      console.log('[FeishuConnector] 发送文件:', {
        conversationId: params.conversationId,
        filePath: params.filePath,
      });
      
      try {
        // 1. 读取文件
        const fileBuffer = fs.readFileSync(params.filePath);
        const fileName = params.fileName || path.basename(params.filePath);
        
        console.log('[FeishuConnector] 文件信息:', {
          fileName,
          size: fileBuffer.length,
          exists: fs.existsSync(params.filePath),
        });
        
        // 2. 上传文件到飞书服务器
        console.log('[FeishuConnector] 开始上传文件...');
        const uploadRes = await this.client.im.file.create({
          data: {
            file_type: 'stream',
            file_name: fileName,
            file: fileBuffer,
          },
        });
        
        console.log('[FeishuConnector] 上传响应:', JSON.stringify(uploadRes, null, 2));
        
        // 飞书 SDK 返回类型检查
        if (!uploadRes) {
          throw new Error('上传文件无响应');
        }
        
        // 检查是否有错误码
        if ('code' in uploadRes && (uploadRes as any).code !== 0) {
          const errorMsg = (uploadRes as any)?.msg || (uploadRes as any)?.message || '上传文件失败';
          throw new Error(`上传失败 (code: ${(uploadRes as any).code}): ${errorMsg}`);
        }
        
        // 尝试从不同的响应格式中获取 file_key
        const fileKey = (uploadRes as any)?.data?.file_key || (uploadRes as any)?.file_key;
        if (!fileKey) {
          console.error('[FeishuConnector] ❌ 响应中未找到 file_key:', uploadRes);
          throw new Error('未获取到 file_key，响应格式可能不正确');
        }
        
        console.log('[FeishuConnector] ✅ 文件已上传，file_key:', fileKey);
        
        // 3. 发送文件消息
        const sendRes = await this.client.im.message.create({
          params: {
            receive_id_type: 'chat_id',
          },
          data: {
            receive_id: params.conversationId,
            msg_type: 'file',
            content: JSON.stringify({
              file_key: fileKey,
            }),
          },
        });
        
        if (sendRes && typeof sendRes === 'object' && 'code' in sendRes) {
          if (sendRes.code !== 0) {
            const errorMsg = (sendRes as any).msg || (sendRes as any).message || '未知错误';
            throw new Error(`发送文件消息失败: ${errorMsg}`);
          }
        }
        
        console.log('[FeishuConnector] ✅ 文件消息已发送');
      } catch (error) {
        console.error('[FeishuConnector] ❌ 发送文件失败:', error);
        throw error;
      }
    },
  };
  
  // ========== 安全控制 ==========
  
  security = {
    dmPolicy: 'pairing' as const,
    groupPolicy: 'open' as const,
    requireMention: true,
  };
  
  private checkSecurity(message: FeishuIncomingMessage): boolean {
    // 1. 检查 DM 策略
    if (message.conversation.type === 'private') {
      if (this.connectorConfig.dmPolicy === 'pairing') {
        // 检查是否已配对
        return this.pairing!.verifyPairingCode(message.sender.id);
      }
      if (this.connectorConfig.dmPolicy === 'allowlist') {
        // 检查白名单
        return this.connectorConfig.allowFrom?.includes(message.sender.id) ?? false;
      }
    }
    
    // 2. 检查群组策略
    if (message.conversation.type === 'group') {
      if (this.connectorConfig.groupPolicy === 'disabled') {
        return false;
      }
      if (this.connectorConfig.groupPolicy === 'allowlist') {
        return this.connectorConfig.groupAllowFrom?.includes(message.conversation.id) ?? false;
      }
      // TODO: 检查是否需要 @提及
      if (this.connectorConfig.requireMention) {
        // 暂时允许所有群消息（后续实现 @提及检测）
        return true;
      }
    }
    
    return true;
  }
  
  // ========== Pairing 机制 ==========
  
  pairing = {
    generatePairingCode: (userId: string): string => {
      // 生成 6 位配对码
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // 存储到数据库
      const store = SystemConfigStore.getInstance();
      store.savePairingRecord('feishu', userId, code);
      
      console.log('[FeishuConnector] 生成配对码:', { userId, code });
      return code;
    },
    
    verifyPairingCode: (userId: string): boolean => {
      // 从数据库验证
      const store = SystemConfigStore.getInstance();
      const record = store.getPairingRecordByUser('feishu', userId);
      
      if (!record) {
        console.log('[FeishuConnector] 未找到 Pairing 记录:', userId);
        return false;
      }
      
      const approved = record.approved;
      console.log('[FeishuConnector] 验证配对码:', { userId, approved });
      return approved;
    },
    
    approvePairing: async (code: string): Promise<void> => {
      // 批准配对
      const store = SystemConfigStore.getInstance();
      store.approvePairingRecord(code);
      console.log('[FeishuConnector] ✅ 配对已批准:', code);
    },
  };
  
}
