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
  
  /**
   * 下载飞书图片到本地临时目录
   * 注意：用户发送的图片需要使用 message-resource API，不能使用 image.get API
   */
  private async downloadImage(messageId: string, fileKey: string): Promise<{ path: string; name: string } | null> {
    try {
      console.log('[FeishuConnector] 开始下载图片:', { messageId, fileKey });
      
      // 1. 调用飞书 API 下载图片（使用获取消息中的资源文件接口）
      const response = await this.client.im.messageResource.get({
        path: {
          message_id: messageId,
          file_key: fileKey,
        },
        params: {
          type: 'image',
        },
      });
      
      console.log('[FeishuConnector] 图片下载响应:', response);
      
      // 2. 保存到临时目录
      const crypto = await import('crypto');
      const { SystemConfigStore } = await import('../../database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      // 创建临时目录（与上传图片使用相同的目录）
      const tempDir = path.join(settings.workspaceDir, '.deepbot', 'temp', 'uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // 生成唯一文件名（使用 file_key 的一部分作为文件名）
      const id = crypto.randomBytes(8).toString('hex');
      const fileName = `feishu_image_${id}.png`; // 飞书图片通常是 PNG 格式
      const filePath = path.join(tempDir, fileName);
      
      // 使用 SDK 的 writeFile 方法保存文件
      await response.writeFile(filePath);
      
      console.log('[FeishuConnector] ✅ 图片已保存:', filePath);
      
      return {
        path: filePath,
        name: fileName,
      };
    } catch (error) {
      console.error('[FeishuConnector] ❌ 下载图片失败:', error);
      return null;
    }
  }
  
  /**
   * 下载飞书文件到本地临时目录
   * 注意：用户发送的文件需要使用 message-resource API，不能使用 file.get API
   */
  private async downloadFile(messageId: string, fileKey: string, fileName: string): Promise<{ path: string; name: string } | null> {
    try {
      console.log('[FeishuConnector] 开始下载文件:', { messageId, fileKey, fileName });
      
      // 1. 调用飞书 API 下载文件（使用获取消息中的资源文件接口）
      const response = await this.client.im.messageResource.get({
        path: {
          message_id: messageId,
          file_key: fileKey,
        },
        params: {
          type: 'file',
        },
      });
      
      console.log('[FeishuConnector] 文件下载响应:', response);
      
      // 2. 保存到临时目录
      const crypto = await import('crypto');
      const { SystemConfigStore } = await import('../../database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      // 创建临时目录（与上传文件使用相同的目录）
      const tempDir = path.join(settings.workspaceDir, '.deepbot', 'temp', 'uploads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // 生成唯一文件名（保留原始扩展名）
      const id = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(fileName);
      const baseName = path.basename(fileName, ext);
      const uniqueFileName = `${baseName}_${id}${ext}`;
      const filePath = path.join(tempDir, uniqueFileName);
      
      // 使用 SDK 的 writeFile 方法保存文件
      await response.writeFile(filePath);
      
      console.log('[FeishuConnector] ✅ 文件已保存:', filePath);
      
      return {
        path: filePath,
        name: uniqueFileName,
      };
    } catch (error) {
      console.error('[FeishuConnector] ❌ 下载文件失败:', error);
      return null;
    }
  }
  
  /**
   * 立即回复表情，让用户知道已收到消息
   */
  private async replyWithReaction(messageId: string): Promise<void> {
    try {
      // 从预设表情中随机选择一个
      const emojis = ['OK', 'THUMBSUP', 'STRIVE', 'STRONG','Typing','HIGHFIVE'];
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      
      console.log('[FeishuConnector] 回复表情:', randomEmoji);
      
      await this.client.im.messageReaction.create({
        path: {
          message_id: messageId,
        },
        data: {
          reaction_type: {
            emoji_type: randomEmoji,
          },
        },
      });
      
      console.log('[FeishuConnector] ✅ 表情已回复');
    } catch (error) {
      // 表情回复失败不影响主流程
      console.error('[FeishuConnector] ⚠️ 回复表情失败:', error);
    }
  }
  
  private async handleIncomingMessage(event: any): Promise<void> {
    console.log('[FeishuConnector] 处理接收消息');
    console.log('[FeishuConnector] 🔍 原始事件结构:', JSON.stringify(event, null, 2));
    
    try {
      // 1. 立即回复表情，让用户知道已收到
      const messageId = event.message.message_id;
      this.replyWithReaction(messageId).catch(err => {
        console.error('[FeishuConnector] 表情回复异步失败:', err);
      });
      
      // 2. 解析飞书消息
      // 飞书事件结构：event.sender.sender_id 包含 open_id, user_id, union_id
      // 优先使用 user_id（企业内部用户），fallback 到 open_id（外部用户/机器人）
      const senderId = event.sender.sender_id.user_id || event.sender.sender_id.open_id;
      
      // 使用 ID 的后 8 位作为显示名
      const senderName = `用户_${senderId.slice(-8)}`;
      
      // 解析消息类型和内容
      const msgType = event.message.message_type || event.message.msg_type; // 飞书使用 message_type
      console.log('[FeishuConnector] 📋 消息类型 (message_type):', msgType);
      console.log('[FeishuConnector] 📋 消息内容 (content):', event.message.content);
      
      const messageContent = safeJsonParse(event.message.content, {}) as any;
      console.log('[FeishuConnector] 📋 解析后的内容:', messageContent);
      
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
          type: msgType === 'image' ? 'image' : msgType === 'file' ? 'file' : 'text',
          text: messageContent.text || '',
        },
        raw: event,
      };
      
      console.log('[FeishuConnector] 📨 收到消息:', {
        messageId: feishuMessage.messageId,
        sender: feishuMessage.sender.name,
        senderId: feishuMessage.sender.id,
        conversation: feishuMessage.conversation.id,
        conversationType: feishuMessage.conversation.type,
        msgType: msgType,
        contentType: feishuMessage.content.type,
        text: feishuMessage.content.text,
        messageContent: messageContent,
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
      
      // 4. 处理图片和文件消息
      if (msgType === 'image') {
        console.log('[FeishuConnector] 📷 检测到图片消息');
        console.log('[FeishuConnector] 图片消息内容:', messageContent);
        const imageKey = messageContent.image_key;
        console.log('[FeishuConnector] 图片 Key:', imageKey);
        
        if (imageKey) {
          console.log('[FeishuConnector] 开始下载图片...');
          const downloadedImage = await this.downloadImage(feishuMessage.messageId, imageKey);
          if (downloadedImage) {
            feishuMessage.content.text = `[收到图片: ${downloadedImage.name}]`;
            feishuMessage.content.imageKey = imageKey;
            feishuMessage.content.imagePath = downloadedImage.path;
            console.log('[FeishuConnector] ✅ 图片已下载:', {
              name: downloadedImage.name,
              path: downloadedImage.path,
            });
          } else {
            console.error('[FeishuConnector] ❌ downloadImage 返回 null');
            feishuMessage.content.text = '[图片下载失败: 返回空]';
          }
        } else {
          console.error('[FeishuConnector] ❌ 图片消息中没有 image_key');
          feishuMessage.content.text = '[图片消息格式错误: 缺少 image_key]';
        }
      } else if (msgType === 'file') {
        console.log('[FeishuConnector] 📎 检测到文件消息');
        console.log('[FeishuConnector] 文件消息内容:', messageContent);
        const fileKey = messageContent.file_key;
        const fileName = messageContent.file_name || '未知文件';
        console.log('[FeishuConnector] 文件 Key:', fileKey, '文件名:', fileName);
        
        if (fileKey) {
          console.log('[FeishuConnector] 开始下载文件...');
          const downloadedFile = await this.downloadFile(feishuMessage.messageId, fileKey, fileName);
          if (downloadedFile) {
            feishuMessage.content.text = `[收到文件: ${downloadedFile.name}]`;
            feishuMessage.content.fileKey = fileKey;
            feishuMessage.content.filePath = downloadedFile.path;
            feishuMessage.content.fileName = downloadedFile.name;
            console.log('[FeishuConnector] ✅ 文件已下载:', {
              name: downloadedFile.name,
              path: downloadedFile.path,
            });
          } else {
            console.error('[FeishuConnector] ❌ downloadFile 返回 null');
            feishuMessage.content.text = `[文件下载失败: ${fileName}]`;
          }
        } else {
          console.error('[FeishuConnector] ❌ 文件消息中没有 file_key');
          feishuMessage.content.text = `[文件消息格式错误: 缺少 file_key]`;
        }
      }
      
      console.log('[FeishuConnector] 📤 准备转发消息:', {
        messageId: feishuMessage.messageId,
        contentType: feishuMessage.content.type,
        text: feishuMessage.content.text,
        imagePath: feishuMessage.content.imagePath,
        filePath: feishuMessage.content.filePath,
      });
      
      // 5. 检测并读取飞书文档
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
      
      // 6. 检查是否是管理员指令（在安全检查之前处理，允许管理员执行 pairing approve）
      const commandHandled = await this.handleAdminCommand(feishuMessage);
      if (commandHandled) {
        return;
      }

      // 7. 安全检查
      if (!this.checkSecurity(feishuMessage)) {
        // 如果是 pairing 模式，发送配对码
        if (this.connectorConfig.dmPolicy === 'pairing' && feishuMessage.conversation.type === 'private') {
          const code = this.pairing!.generatePairingCode(feishuMessage.sender.id);

          // 检查是否被自动批准（首位用户）
          const store = SystemConfigStore.getInstance();
          const record = store.getPairingRecordByUser('feishu', feishuMessage.sender.id);
          if (record?.approved) {
            // 首位用户：自动批准并设为管理员，直接转发消息，附带系统上下文
            feishuMessage.systemContext = `[系统通知] 这是第一次有用户连接到 DeepBot。该用户已被自动设置为管理员。请在回复中告知用户：
1. 他已被自动设置为管理员
2. 作为管理员，他可以通过发送 "deepbot pairing approve feishu <配对码>" 来批准其他用户的配对请求
3. 也可以在 DeepBot 桌面端的"系统管理 → 飞书 → Pairing 管理"界面中管理用户权限`;
            await this.connectorManager.handleIncomingMessage('feishu', feishuMessage);
            return;
          }

          await this.outbound.sendMessage({
            conversationId: feishuMessage.conversation.id,
            content: `请使用配对码进行授权：${code}\n\n管理员可以使用以下命令批准：\ndeepbot pairing approve feishu ${code}`,
          });
        }
        
        return;
      }
      
      // 8. 转发到 Connector Manager
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
      replyToMessageId?: string;
    }): Promise<void> => {
      console.log('[FeishuConnector] 发送消息:', {
        conversationId: params.conversationId,
        contentLength: params.content.length,
        replyToMessageId: params.replyToMessageId,
      });
      
      try {
        // 如果有 replyToMessageId，使用 reply API
        if (params.replyToMessageId) {
          console.log('[FeishuConnector] 使用 reply API 回复消息');
          const res = await this.client.im.message.reply({
            path: {
              message_id: params.replyToMessageId,
            },
            data: {
              content: JSON.stringify({
                text: params.content,
              }),
              msg_type: 'text',
              reply_in_thread: false,  // 普通回复，不使用话题
            },
          });
          
          // 飞书 SDK 的响应格式检查
          if (res && typeof res === 'object' && 'code' in res) {
            if (res.code !== 0) {
              const errorMsg = (res as any).msg || (res as any).message || '未知错误';
              throw new Error(`回复消息失败: ${errorMsg}`);
            }
          }
          
          console.log('[FeishuConnector] ✅ 消息已通过 reply API 发送');
        } else {
          // 没有 replyToMessageId，使用普通 create API
          console.log('[FeishuConnector] 使用 create API 发送消息');
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
          if (res && typeof res === 'object' && 'code' in res) {
            if (res.code !== 0) {
              const errorMsg = (res as any).msg || (res as any).message || '未知错误';
              throw new Error(`发送消息失败: ${errorMsg}`);
            }
          }
          
          console.log('[FeishuConnector] ✅ 消息已通过 create API 发送');
        }
      } catch (error) {
        console.error('[FeishuConnector] ❌ 发送消息失败:', error);
        throw error;
      }
    },
    
    sendImage: async (params: {
      conversationId: string;
      imagePath: string;
      caption?: string;
      replyToMessageId?: string;
    }): Promise<void> => {
      console.log('[FeishuConnector] 发送图片:', {
        conversationId: params.conversationId,
        imagePath: params.imagePath,
        replyToMessageId: params.replyToMessageId,
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
        
        // 3. 发送图片消息（使用 reply API 或 create API）
        if (params.replyToMessageId) {
          console.log('[FeishuConnector] 使用 reply API 发送图片');
          const sendRes = await this.client.im.message.reply({
            path: {
              message_id: params.replyToMessageId,
            },
            data: {
              content: JSON.stringify({
                image_key: imageKey,
              }),
              msg_type: 'image',
              reply_in_thread: false,  // 普通回复，不使用话题
            },
          });
          
          if (sendRes && typeof sendRes === 'object' && 'code' in sendRes) {
            if (sendRes.code !== 0) {
              const errorMsg = (sendRes as any).msg || (sendRes as any).message || '未知错误';
              throw new Error(`回复图片消息失败: ${errorMsg}`);
            }
          }
        } else {
          console.log('[FeishuConnector] 使用 create API 发送图片');
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
        }
        
        // 4. 如果有说明文字，再发送一条文本消息
        if (params.caption) {
          await this.outbound.sendMessage({
            conversationId: params.conversationId,
            content: params.caption,
            replyToMessageId: params.replyToMessageId,
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
      replyToMessageId?: string;
    }): Promise<void> => {
      console.log('[FeishuConnector] 发送文件:', {
        conversationId: params.conversationId,
        filePath: params.filePath,
        replyToMessageId: params.replyToMessageId,
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
        
        // 3. 发送文件消息（使用 reply API 或 create API）
        if (params.replyToMessageId) {
          console.log('[FeishuConnector] 使用 reply API 发送文件');
          const sendRes = await this.client.im.message.reply({
            path: {
              message_id: params.replyToMessageId,
            },
            data: {
              content: JSON.stringify({
                file_key: fileKey,
              }),
              msg_type: 'file',
              reply_in_thread: false,  // 普通回复，不使用话题
            },
          });
          
          if (sendRes && typeof sendRes === 'object' && 'code' in sendRes) {
            if (sendRes.code !== 0) {
              const errorMsg = (sendRes as any).msg || (sendRes as any).message || '未知错误';
              throw new Error(`回复文件消息失败: ${errorMsg}`);
            }
          }
        } else {
          console.log('[FeishuConnector] 使用 create API 发送文件');
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
  
  /**
   * 处理管理员指令（在安全检查之前执行，允许管理员执行 pairing approve）
   * 支持指令：deepbot pairing approve feishu <code>
   * 权限验证：发送者必须在数据库中标记为 is_admin
   * @returns true 表示已处理该指令，调用方应直接 return
   */
  private async handleAdminCommand(message: FeishuIncomingMessage): Promise<boolean> {
    const text = (message.content.text || '').trim();

    // 匹配 pairing approve 指令，格式：deepbot pairing approve feishu <code>
    const approveMatch = text.match(/^deepbot\s+pairing\s+approve\s+feishu\s+(\S+)$/i);
    if (!approveMatch) {
      return false;
    }

    const code = approveMatch[1].toUpperCase();
    const senderId = message.sender.id;

    console.log('[FeishuConnector] 🔑 收到 pairing approve 指令:', { senderId, code });

    // 验证发送者是否是管理员（通过数据库中的 is_admin 标记）
    const store = SystemConfigStore.getInstance();
    const isAdmin = store.isAdminUser('feishu', senderId);
    if (!isAdmin) {
      await this.outbound.sendMessage({
        conversationId: message.conversation.id,
        content: '❌ 无权限：只有管理员才能执行此操作。',
      });
      return true;
    }

    // 执行 approve
    try {
      const record = store.getPairingRecordByCode(code);

      if (!record) {
        await this.outbound.sendMessage({
          conversationId: message.conversation.id,
          content: `❌ 配对码 ${code} 不存在或已过期。`,
        });
        return true;
      }

      if (record.approved) {
        await this.outbound.sendMessage({
          conversationId: message.conversation.id,
          content: `ℹ️ 配对码 ${code} 已经批准过了。`,
        });
        return true;
      }

      store.approvePairingRecord(code);
      console.log('[FeishuConnector] ✅ 配对已批准:', { code, userId: record.userId });
      await this.outbound.sendMessage({
        conversationId: message.conversation.id,
        content: `✅ 配对码 ${code} 已批准，用户现在可以使用 DeepBot 了。`,
      });
    } catch (error) {
      console.error('[FeishuConnector] ❌ 处理 pairing approve 失败:', getErrorMessage(error));
      await this.outbound.sendMessage({
        conversationId: message.conversation.id,
        content: `❌ 操作失败：${getErrorMessage(error)}`,
      });
    }

    return true;
  }

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
      
      const store = SystemConfigStore.getInstance();

      // 检查是否是第一个用户（数据库中还没有任何配对记录）
      const existingRecords = store.getAllPairingRecords('feishu');
      const isFirstUser = existingRecords.length === 0;

      // 存储到数据库
      store.savePairingRecord('feishu', userId, code);

      // 第一个用户自动批准并设为管理员
      if (isFirstUser) {
        store.approvePairingRecord(code);
        store.setAdminPairing('feishu', userId, true);
        console.log('[FeishuConnector] 👑 首位用户自动批准并设为管理员:', userId);
      } else {
        console.log('[FeishuConnector] 生成配对码:', { userId, code });
      }

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
