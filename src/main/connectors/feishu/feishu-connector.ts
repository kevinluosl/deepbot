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
import { ensureDirectoryExists } from '../../../shared/utils/fs-utils';
import type { ConnectorManager } from '../connector-manager';
import { SystemConfigStore } from '../../database/system-config-store';
import { FeishuDocumentHandler } from './document-handler';
import { broadcastPendingCount } from '../../ipc/connector-handler';

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
  }
  
  // ========== 配置管理 ==========
  config = {
    load: async (): Promise<FeishuConnectorConfig | null> => {
      const store = SystemConfigStore.getInstance();
      const result = store.getConnectorConfig('feishu');
      
      if (!result) {
        return null;
      }
      
      // 将 enabled 字段合并到配置对象中
      return {
        ...result.config,
        enabled: result.enabled,
      } as FeishuConnectorConfig;
    },
    
    save: async (config: FeishuConnectorConfig): Promise<void> => {
      const store = SystemConfigStore.getInstance();
      store.saveConnectorConfig('feishu', '飞书', config, false);
    },
    
    validate: (config: FeishuConnectorConfig): boolean => {
      return !!(
        config.appId &&
        config.appSecret
      );
    },
  };
  
  // 机器人自身的 open_id（后台轮询获取）
  private botOpenId: string | undefined;
  // open_id 轮询定时器
  private botOpenIdRetryTimer?: ReturnType<typeof setTimeout>;

  // ========== 生命周期 ==========
  
  async initialize(config: FeishuConnectorConfig): Promise<void> {
    this.connectorConfig = config;
    
    // 初始化飞书 SDK Client
    this.client = new Lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
      loggerLevel: Lark.LoggerLevel.info,
    });
    
    // 初始化文档处理器
    this.documentHandler = new FeishuDocumentHandler(this.client);
  }
  
  async start(): Promise<void> {
    if (this.isStarted) {
      console.log('[FeishuConnector] ⚠️ 连接器已启动，跳过重复启动');
      return;
    }
    
    console.log('[FeishuConnector] 🚀 开始启动飞书连接器...');
    
    // 确保旧连接已关闭
    if (this.wsClient) {
      this.wsClient = undefined;
    }

    // 🔥 先设置 isStarted，否则 startBotOpenIdPolling 里的检查会失败
    console.log('[FeishuConnector] 📍 设置 isStarted = true');
    this.isStarted = true;

    // 后台异步获取机器人 open_id，不阻塞连接启动
    console.log('[FeishuConnector] 🔄 启动机器人 open_id 轮询...');
    this.startBotOpenIdPolling();
    
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
  }
  
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    // 停止 open_id 轮询
    if (this.botOpenIdRetryTimer) {
      clearTimeout(this.botOpenIdRetryTimer);
      this.botOpenIdRetryTimer = undefined;
    }
    this.botOpenId = undefined;
    
    // 关闭 WebSocket 连接
    if (this.wsClient) {
      try {
        this.wsClient.close({ force: true });
        this.wsClient = undefined;
      } catch (error) {
        console.error('[FeishuConnector] ❌ 关闭 WebSocket 失败:', error);
      }
    }
    
    this.isStarted = false;
  }

  /**
   * 后台轮询获取机器人 open_id
   * 每 5 秒重试一次，直到成功为止，不影响连接状态
   */
  private startBotOpenIdPolling(): void {
    console.log('[FeishuConnector] 📍 startBotOpenIdPolling 被调用，当前 isStarted:', this.isStarted);
    
    // 清除旧定时器（防止重复启动）
    if (this.botOpenIdRetryTimer) {
      clearTimeout(this.botOpenIdRetryTimer);
      this.botOpenIdRetryTimer = undefined;
    }

    const attempt = async (): Promise<void> => {
      // 连接器已停止则不再重试
      console.log('[FeishuConnector] 🔍 attempt() 开始执行，当前 isStarted:', this.isStarted);
      if (!this.isStarted) {
        console.log('[FeishuConnector] ⏹️ 连接器已停止，终止 open_id 轮询');
        return;
      }

      console.log('[FeishuConnector] 🔍 尝试获取机器人 open_id...');
      
      try {
        const tokenRes = await this.client.auth.tenantAccessToken.internal({
          data: {
            app_id: this.connectorConfig.appId,
            app_secret: this.connectorConfig.appSecret,
          },
        });
        const token = (tokenRes as any)?.tenant_access_token;
        if (!token) throw new Error('获取 tenant_access_token 失败');

        const botRes = await fetch('https://open.feishu.cn/open-apis/bot/v3/info', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const botData = await botRes.json() as any;
        const openId = botData?.bot?.open_id;

        if (openId) {
          this.botOpenId = openId;
          console.log('[FeishuConnector] 🤖 机器人 open_id 获取成功:', this.botOpenId);
          // 成功后不再重试
          return;
        }

        throw new Error('响应中没有 open_id');
      } catch (error) {
        console.warn('[FeishuConnector] ⚠️ 获取机器人 open_id 失败，5秒后重试:', getErrorMessage(error));
        // 5 秒后重试
        this.botOpenIdRetryTimer = setTimeout(() => attempt(), 5000);
      }
    };

    // 立即执行第一次
    attempt();
  }
  
  async healthCheck(): Promise<HealthStatus> {
    // 直接检查内部状态，不发 HTTP 请求，避免每次打开设置页都慢
    if (this.isStarted && this.wsClient) {
      return {
        status: 'healthy',
        message: '连接正常',
      };
    }

    return {
      status: 'unhealthy',
      message: this.wsClient ? '连接器未完全启动' : 'WebSocket 未连接',
    };
  }
  
  // ========== 消息处理 ==========
  
  /**
   * 获取临时上传目录路径，目录不存在时自动创建
   */
  private getTempUploadDir(): string {
    const store = SystemConfigStore.getInstance();
    const settings = store.getWorkspaceSettings();
    const tempDir = path.join(settings.workspaceDir, '.deepbot', 'temp', 'uploads');
    ensureDirectoryExists(tempDir);
    return tempDir;
  }

  /**
   * 下载飞书图片到本地临时目录
   * 注意：用户发送的图片需要使用 message-resource API，不能使用 image.get API
   */
  private async downloadImage(messageId: string, fileKey: string): Promise<{ path: string; name: string } | null> {
    try {
      const response = await this.client.im.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type: 'image' },
      });
      
      const crypto = await import('crypto');
      const id = crypto.randomBytes(8).toString('hex');
      const fileName = `feishu_image_${id}.png`;
      const filePath = path.join(this.getTempUploadDir(), fileName);
      
      await response.writeFile(filePath);
      
      return { path: filePath, name: fileName };
    } catch (error) {
      console.error('[FeishuConnector] ❌ 下载图片失败:', error);
      return null;
    }
  }
  
  /**
   * 下载飞书文件到本地临时目录
   * 使用纯英文文件名保存，避免中文文件名传给 AI 时被模型修改排版
   * originalName 保留原始文件名，用于展示给用户
   */
  private async downloadFile(messageId: string, fileKey: string, fileName: string): Promise<{ path: string; name: string; originalName: string } | null> {
    try {
      const response = await this.client.im.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type: 'file' },
      });
      
      const crypto = await import('crypto');
      const id = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(fileName);
      // 使用纯英文文件名，和图片处理方式一致
      const safeFileName = `feishu_file_${id}${ext}`;
      const filePath = path.join(this.getTempUploadDir(), safeFileName);
      
      await response.writeFile(filePath);
      
      return { path: filePath, name: safeFileName, originalName: fileName };
    } catch (error) {
      console.error('[FeishuConnector] ❌ 下载文件失败:', error);
      return null;
    }
  }
  
  /**
   * 通过飞书通讯录 API 获取用户真实名字
   * 使用 open_id 查询，支持企业内外部用户
   * 结果会缓存，避免重复请求
   */
  private userNameCache: Map<string, string> = new Map();

  private async fetchUserName(openId: string): Promise<string> {
    // 先查缓存
    const cached = this.userNameCache.get(openId);
    if (cached) {
      return cached;
    }

    try {
      const res = await this.client.contact.user.get({
        path: { user_id: openId },
        params: { user_id_type: 'open_id' },
      });

      const name = (res as any)?.data?.user?.name || (res as any)?.user?.name;
      if (name) {
        this.userNameCache.set(openId, name);
        return name;
      }
    } catch (error) {
      // 降级：使用 ID 后缀
    }

    // 降级：使用 ID 后缀
    const fallback = `用户_${openId.slice(-8)}`;
    return fallback;
  }

  /**
   * 立即回复表情，让用户知道已收到消息
   */
  private async replyWithReaction(messageId: string): Promise<void> {
    try {
      const emojis = ['OK', 'STRIVE','Typing','Get','OneSecond','OnIt','EatingFood'];
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      
      await this.client.im.messageReaction.create({
        path: { message_id: messageId },
        data: { reaction_type: { emoji_type: randomEmoji } },
      });
    } catch (error) {
      // 表情回复失败不影响主流程
      console.error('[FeishuConnector] ⚠️ 回复表情失败:', error);
    }
  }
  
  private async handleIncomingMessage(event: any): Promise<void> {
    try {
      // 1. 解析基础信息
      const senderId = event.sender.sender_id.user_id || event.sender.sender_id.open_id;
      const openId = event.sender.sender_id.open_id || senderId;
      const senderName = await this.fetchUserName(openId);
      
      const msgType = event.message.message_type || event.message.msg_type;
      const messageContent = safeJsonParse(event.message.content, {}) as any;
      
      // 提取消息文本：兼容 text 类型和 post 富文本类型
      let extractedText = '';
      if (msgType === 'post' && messageContent.content) {
        const lines: string[] = (messageContent.content as any[][]).map((line: any[]) =>
          line
            .filter((node: any) => node.tag === 'text' && node.text)
            .map((node: any) => node.text)
            .join('')
        );
        extractedText = lines.filter((l: string) => l.trim()).join('\n');
      } else {
        extractedText = messageContent.text || '';
      }

      // 2. 提取 mentions 信息（用于判断是否 @ 了机器人）
      const mentions = event.message.mentions || [];
      
      // 用机器人 open_id 精确匹配，获取不到则不处理群组消息
      const isBotMentioned = this.botOpenId
        ? mentions.some((mention: any) => mention.id?.open_id === this.botOpenId)
        : false;
      
      // 3. 群组消息：先判断是否 @ 了机器人，再回复表情
      // 🔥 特殊处理：图片和文件消息无法 @，因此不需要检查 mention
      // 🔥 特殊处理：系统指令（/new /stop /memory 等）无需 @，直接执行
      const isGroup = event.message.chat_type !== 'p2p';
      const isMediaMessage = msgType === 'image' || msgType === 'file';
      const isSystemCommand = /^\/\w+/.test(extractedText.trim());
      
      if (isGroup && !isBotMentioned && !isMediaMessage && !isSystemCommand) {
        // 未 @ 机器人且不是图片/文件/指令消息，直接忽略，不回复表情
        return;
      }
      
      // 4. 回复表情，让用户知道已收到
      const messageId = event.message.message_id;
      this.replyWithReaction(messageId).catch(err => {
        console.error('[FeishuConnector] 表情回复异步失败:', err);
      });

      // 图片/文件消息：立即发一条文字提示，告知正在保存
      if (isMediaMessage) {
        this.outbound.sendMessage({
          conversationId: event.message.chat_id,
          content: '正在接收文件，请稍后...',
          replyToMessageId: messageId,
        }).catch(err => {
          console.error('[FeishuConnector] 发送保存提示失败:', err);
        });
      }

      const feishuMessage: FeishuIncomingMessage = {
        messageId: event.message.message_id,
        timestamp: Date.now(),
        sender: {
          id: senderId,
          name: senderName,
        },
        conversation: {
          id: event.message.chat_id,
          type: event.message.chat_type === 'p2p' ? 'p2p' : 'group',  // 直接使用飞书原始值
        },
        content: {
          type: msgType === 'image' ? 'image' : msgType === 'file' ? 'file' : 'text',
          text: extractedText,
        },
        mentions: {
          isBotMentioned,
          mentionList: mentions,
        },
        raw: event,
      };

      // 输出收到的飞书消息原始信息（调试用，可按需开启）
      // console.log('[FeishuConnector] 📨 收到飞书消息原始数据:', JSON.stringify(event, null, 2));

      // 2. 消息去重检查（基于 message_id）
      if (this.processedMessages.has(feishuMessage.messageId)) {
        return;
      }
      
      // 3. 基于内容的去重检查（防止飞书重复推送相同内容但不同 message_id）
      const contentKey = `${feishuMessage.sender.id}:${feishuMessage.content.text}`;
      const now = Date.now();
      const lastTime = this.recentMessages.get(contentKey);
      
      if (lastTime && (now - lastTime) < this.MESSAGE_DEDUP_WINDOW) {
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
      
      // 清理过期的内容缓存
      for (const [key, timestamp] of this.recentMessages.entries()) {
        if (now - timestamp > this.MESSAGE_DEDUP_WINDOW) {
          this.recentMessages.delete(key);
        }
      }
      
      // 4. 处理图片和文件消息
      if (msgType === 'image') {
        const imageKey = messageContent.image_key;
        if (imageKey) {
          const downloadedImage = await this.downloadImage(feishuMessage.messageId, imageKey);
          if (downloadedImage) {
            feishuMessage.content.text = `[收到图片]`;
            feishuMessage.content.imageKey = imageKey;
            feishuMessage.content.imagePath = downloadedImage.path;
          } else {
            feishuMessage.content.text = '[图片下载失败: 返回空]';
          }
        } else {
          console.error('[FeishuConnector] ❌ 图片消息中没有 image_key');
          feishuMessage.content.text = '[图片消息格式错误: 缺少 image_key]';
        }
      } else if (msgType === 'file') {
        const fileKey = messageContent.file_key;
        const fileName = messageContent.file_name || '未知文件';
        if (fileKey) {
          const downloadedFile = await this.downloadFile(feishuMessage.messageId, fileKey, fileName);
          if (downloadedFile) {
            feishuMessage.content.text = `[收到文件]`;
            feishuMessage.content.fileKey = fileKey;
            feishuMessage.content.filePath = downloadedFile.path;
            feishuMessage.content.fileName = downloadedFile.name;
          } else {
            feishuMessage.content.text = `[文件下载失败: ${fileName}]`;
          }
        } else {
          console.error('[FeishuConnector] ❌ 文件消息中没有 file_key');
          feishuMessage.content.text = `[文件消息格式错误: 缺少 file_key]`;
        }
      }
      
      // 5. 检测并读取飞书文档
      const messageText = feishuMessage.content.text || '';
      const documentUrls = this.documentHandler.extractDocumentUrls(messageText);
      if (documentUrls.length > 0) {
        const documents = await this.documentHandler.readDocuments(documentUrls);
        if (documents.length > 0) {
          // 移除原始 URL，只保留文档内容
          let cleanedText = messageText;
          for (const url of documentUrls) {
            cleanedText = cleanedText.replace(url, '').trim();
          }
          const documentContent = this.documentHandler.formatDocumentContent(documents);
          feishuMessage.content.text = cleanedText + documentContent;
        }
      }
      
      // 6. 检查是否是管理员指令（在安全检查之前处理，允许管理员执行 pairing approve）
      const commandHandled = await this.handleAdminCommand(feishuMessage);
      if (commandHandled) {
        return;
      }

      // 7. 安全检查
      if (!this.checkSecurity(feishuMessage)) {
        // 私聊未配对：发送配对码
        if (feishuMessage.conversation.type === 'p2p') {
          const code = this.pairing!.generatePairingCode(feishuMessage.sender.id, feishuMessage.sender.name, openId);

          // 检查是否被自动批准（首位用户）
          const store = SystemConfigStore.getInstance();
          const record = store.getPairingRecordByUser('feishu', feishuMessage.sender.id);
          if (record?.approved) {
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
      /** 接收者 ID 类型，默认 chat_id，指定 open_id 时直接发给用户 */
      _receiveIdType?: 'chat_id' | 'open_id';
    }): Promise<void> => {
      const receiveIdType = params._receiveIdType ?? 'chat_id';
      
      try {
        // 如果有 replyToMessageId，使用 reply API（仅 chat_id 模式支持）
        if (params.replyToMessageId && receiveIdType === 'chat_id') {
          const res = await this.client.im.message.reply({
            path: {
              message_id: params.replyToMessageId,
            },
            data: {
              content: JSON.stringify({ text: params.content }),
              msg_type: 'text',
              reply_in_thread: false,
            },
          });
          
          if (res && typeof res === 'object' && 'code' in res) {
            if (res.code !== 0) {
              const errorMsg = (res as any).msg || (res as any).message || '未知错误';
              throw new Error(`回复消息失败: ${errorMsg}`);
            }
          }
        } else {
          // 使用 create API（支持 chat_id 和 open_id）
          const res = await this.client.im.message.create({
            params: {
              receive_id_type: receiveIdType,
            },
            data: {
              receive_id: params.conversationId,
              msg_type: 'text',
              content: JSON.stringify({ text: params.content }),
            },
          });
          
          if (res && typeof res === 'object' && 'code' in res) {
            if (res.code !== 0) {
              const errorMsg = (res as any).msg || (res as any).message || '未知错误';
              throw new Error(`发送消息失败: ${errorMsg}`);
            }
          }
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
      /** 接收者 ID 类型，默认 chat_id，指定 open_id 时直接发给用户 */
      _receiveIdType?: 'chat_id' | 'open_id';
    }): Promise<void> => {
      const receiveIdType = params._receiveIdType ?? 'chat_id';
      
      try {
        // 1. 读取图片文件
        const imageBuffer = fs.readFileSync(params.imagePath);
        
        // 2. 上传图片到飞书服务器
        const uploadRes = await this.client.im.image.create({
          data: {
            image_type: 'message',
            image: imageBuffer,
          },
        });
        
        if (!uploadRes) {
          throw new Error('上传图片无响应');
        }
        
        if ('code' in uploadRes && (uploadRes as any).code !== 0) {
          const errorMsg = (uploadRes as any)?.msg || (uploadRes as any)?.message || '上传图片失败';
          throw new Error(`上传失败 (code: ${(uploadRes as any).code}): ${errorMsg}`);
        }
        
        const imageKey = (uploadRes as any)?.data?.image_key || (uploadRes as any)?.image_key;
        if (!imageKey) {
          console.error('[FeishuConnector] ❌ 响应中未找到 image_key:', uploadRes);
          throw new Error('未获取到 image_key，响应格式可能不正确');
        }
        
        // 3. 发送图片消息
        if (params.replyToMessageId) {
          const sendRes = await this.client.im.message.reply({
            path: { message_id: params.replyToMessageId },
            data: {
              content: JSON.stringify({ image_key: imageKey }),
              msg_type: 'image',
              reply_in_thread: false,
            },
          });
          
          if (sendRes && typeof sendRes === 'object' && 'code' in sendRes) {
            if (sendRes.code !== 0) {
              const errorMsg = (sendRes as any).msg || (sendRes as any).message || '未知错误';
              throw new Error(`回复图片消息失败: ${errorMsg}`);
            }
          }
        } else {
          const sendRes = await this.client.im.message.create({
            params: { receive_id_type: receiveIdType },
            data: {
              receive_id: params.conversationId,
              msg_type: 'image',
              content: JSON.stringify({ image_key: imageKey }),
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
            _receiveIdType: receiveIdType,
          });
        }
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
      /** 接收者 ID 类型，默认 chat_id，指定 open_id 时直接发给用户 */
      _receiveIdType?: 'chat_id' | 'open_id';
    }): Promise<void> => {
      const receiveIdType = params._receiveIdType ?? 'chat_id';
      
      try {
        // 1. 读取文件
        const fileBuffer = fs.readFileSync(params.filePath);
        const fileName = params.fileName || path.basename(params.filePath);
        
        // 2. 上传文件到飞书服务器
        const uploadRes = await this.client.im.file.create({
          data: {
            file_type: 'stream',
            file_name: fileName,
            file: fileBuffer,
          },
        });
        
        if (!uploadRes) {
          throw new Error('上传文件无响应');
        }
        
        if ('code' in uploadRes && (uploadRes as any).code !== 0) {
          const errorMsg = (uploadRes as any)?.msg || (uploadRes as any)?.message || '上传文件失败';
          throw new Error(`上传失败 (code: ${(uploadRes as any).code}): ${errorMsg}`);
        }
        
        const fileKey = (uploadRes as any)?.data?.file_key || (uploadRes as any)?.file_key;
        if (!fileKey) {
          console.error('[FeishuConnector] ❌ 响应中未找到 file_key:', uploadRes);
          throw new Error('未获取到 file_key，响应格式可能不正确');
        }
        
        // 3. 发送文件消息
        if (params.replyToMessageId) {
          const sendRes = await this.client.im.message.reply({
            path: { message_id: params.replyToMessageId },
            data: {
              content: JSON.stringify({ file_key: fileKey }),
              msg_type: 'file',
              reply_in_thread: false,
            },
          });
          
          if (sendRes && typeof sendRes === 'object' && 'code' in sendRes) {
            if (sendRes.code !== 0) {
              const errorMsg = (sendRes as any).msg || (sendRes as any).message || '未知错误';
              throw new Error(`回复文件消息失败: ${errorMsg}`);
            }
          }
        } else {
          const sendRes = await this.client.im.message.create({
            params: { receive_id_type: receiveIdType },
            data: {
              receive_id: params.conversationId,
              msg_type: 'file',
              content: JSON.stringify({ file_key: fileKey }),
            },
          });
          
          if (sendRes && typeof sendRes === 'object' && 'code' in sendRes) {
            if (sendRes.code !== 0) {
              const errorMsg = (sendRes as any).msg || (sendRes as any).message || '未知错误';
              throw new Error(`发送文件消息失败: ${errorMsg}`);
            }
          }
        }
      } catch (error) {
        console.error('[FeishuConnector] ❌ 发送文件失败:', error);
        throw error;
      }
    },
  };
  
  /**
   * 配对批准后发送欢迎消息给用户
   * 使用 open_id 直发，避免依赖 chat_id
   */
  onPairingApproved(userId: string, openId?: string): void {
    const target = openId || userId;
    const receiveIdType = openId ? 'open_id' : 'chat_id';
    this.outbound.sendMessage({
      conversationId: target,
      content: '✅ 授权完成，你可以开始和 DeepBot 对话了。\n\n发送「你能做什么」获取使用帮助。',
      _receiveIdType: receiveIdType,
    }).catch(() => {});
  }

  /**
   * 获取飞书群组名称
   * 调用 im.v1.chat.get API，失败时返回 null
   */
  async getChatName(chatId: string): Promise<string | null> {
    try {
      const res = await this.client.im.v1.chat.get({
        path: { chat_id: chatId },
        params: { user_id_type: 'open_id' },
      });
      const name = (res as any)?.data?.name || (res as any)?.name;
      return name || null;
    } catch (error) {
      console.warn('[FeishuConnector] ⚠️ 获取群名称失败:', getErrorMessage(error));
      return null;
    }
  }

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
      await this.outbound.sendMessage({
        conversationId: message.conversation.id,
        content: `✅ 配对码 ${code} 已批准，用户现在可以使用 DeepBot 了。`,
      });
      // 给被批准用户发送欢迎消息
      this.connectorManager.notifyPairingApproved('feishu', record.userId, record.openId);
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
    // 私聊：检查是否已配对
    if (message.conversation.type === 'p2p') {
      return this.pairing!.verifyPairingCode(message.sender.id);
    }
    
    // 群组：检查是否 @ 了机器人（图片/文件消息无法 @，直接放行；系统指令无需 @）
    const isMediaMessage = message.content.type === 'image' || message.content.type === 'file';
    const isSystemCommand = /^\/\w+/.test((message.content.text || '').trim());
    if (!isMediaMessage && !isSystemCommand && !message.mentions?.isBotMentioned) {
      return false;
    }
    
    return true;
  }
  
  // ========== Pairing 机制 ==========
  
  pairing = {
    generatePairingCode: (userId: string, userName?: string, openId?: string): string => {
      // 生成 6 位配对码
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const store = SystemConfigStore.getInstance();

      // 检查是否是第一个用户（数据库中还没有任何配对记录）
      const existingRecords = store.getAllPairingRecords('feishu');
      const isFirstUser = existingRecords.length === 0;

      // 存储到数据库（同时保存用户名字和 open_id）
      store.savePairingRecord('feishu', userId, code, userName, openId);

      // 第一个用户自动批准并设为管理员
      if (isFirstUser) {
        store.approvePairingRecord(code);
        store.setAdminPairing('feishu', userId, true);
        // 发送欢迎消息
        this.connectorManager.notifyPairingApproved('feishu', userId, openId);
      } else {
        // 非首个用户，推送待授权数量更新
        broadcastPendingCount();
      }

      return code;
    },
    
    verifyPairingCode: (userId: string): boolean => {
      const store = SystemConfigStore.getInstance();
      const record = store.getPairingRecordByUser('feishu', userId);
      
      if (!record) {
        return false;
      }
      
      return record.approved;
    },
    
    approvePairing: async (code: string): Promise<void> => {
      const store = SystemConfigStore.getInstance();
      store.approvePairingRecord(code);
    },
  };
  
}
