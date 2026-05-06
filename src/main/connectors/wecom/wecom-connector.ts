/**
 * 企业微信智能机器人连接器
 * 
 * 通过 WebSocket 长连接接入企业微信智能机器人
 * 连接地址：wss://openws.work.weixin.qq.com
 * 认证方式：BotID + Secret（aibot_subscribe）
 * 支持：接收消息、回复消息、发送图片/文件（分片上传）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  Connector,
  ConnectorConfig,
  HealthStatus,
} from '../../../types/connector';
import { getErrorMessage } from '../../../shared/utils/error-handler';
import { ensureDirectoryExists } from '../../../shared/utils/fs-utils';
import type { ConnectorManager } from '../connector-manager';
import { SystemConfigStore } from '../../database/system-config-store';
import { createLogger } from '../../../shared/utils/logger';

const logger = createLogger('WecomConnector');

const WECOM_WS_URL = 'wss://openws.work.weixin.qq.com';

export interface WecomConnectorConfig extends ConnectorConfig {
  botId: string;
  secret: string;
  botName: string; // 机器人名称（必填），用于 Tab 标题显示，不超过10个字
  enabled: boolean;
}

export class WecomConnector implements Connector {
  readonly id: string;
  readonly name: string;
  readonly version = '1.0.0';

  private connectorManager: ConnectorManager;
  private connectorConfig!: WecomConnectorConfig;
  private isStarted: boolean = false;
  private isSubscribed: boolean = false;
  private ws: any = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // 消息去重
  private processedMessages: Set<string> = new Set();
  private readonly MAX_PROCESSED_MESSAGES = 1000;

  // 请求响应关联
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }> = new Map();

  constructor(connectorManager: ConnectorManager, instanceId?: string) {
    this.connectorManager = connectorManager;
    // 支持多实例：wecom-1, wecom-2 等
    this.id = instanceId || 'wecom';
    const num = instanceId?.match(/wecom-(\d+)/)?.[1];
    this.name = num ? `企业微信 ${num}` : '企业微信';
  }

  // ========== 配置管理 ==========
  config = {
    load: async (): Promise<WecomConnectorConfig | null> => {
      const store = SystemConfigStore.getInstance();
      const result = store.getConnectorConfig(this.id);
      if (!result) return null;
      return { ...result.config, enabled: result.enabled } as WecomConnectorConfig;
    },

    save: async (config: ConnectorConfig): Promise<void> => {
      const store = SystemConfigStore.getInstance();
      store.saveConnectorConfig(this.id, this.name, config, config.enabled || false);
    },

    validate: (config: ConnectorConfig): boolean => {
      const c = config as WecomConnectorConfig;
      return !!(c.botId && c.secret && c.botName);
    },
  };

  // ========== 生命周期 ==========

  async initialize(config: ConnectorConfig): Promise<void> {
    this.connectorConfig = config as WecomConnectorConfig;
  }

  /**
   * 获取配置的机器人名称
   */
  getBotName(): string {
    return this.connectorConfig?.botName || '';
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.isStarted = false;
    this.isSubscribed = false;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    logger.info('企业微信连接器已停止');
  }

  async healthCheck(): Promise<HealthStatus> {
    // 刚启动时 WebSocket 可能还在连接中，等待一小段时间
    if (this.isStarted && (!this.ws || this.ws.readyState !== 1)) {
      // 最多等待 5 秒，每 200ms 检查一次
      for (let i = 0; i < 25; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (this.ws && this.ws.readyState === 1 && this.isSubscribed) break;
      }
    }
    if (!this.ws || this.ws.readyState !== 1) {
      return { status: 'unhealthy', message: 'WebSocket 未连接' };
    }
    if (!this.isSubscribed) {
      return { status: 'unhealthy', message: '订阅未完成' };
    }
    return { status: 'healthy', message: '企业微信连接器运行正常' };
  }

  // ========== 消息发送 ==========

  outbound = {
    sendMessage: async (params: {
      conversationId: string;
      content: string;
      replyToMessageId?: string;
    }): Promise<void> => {
      if (!this.ws || this.ws.readyState !== 1) {
        throw new Error('WebSocket 未连接');
      }

      // 如果有 replyToMessageId，说明是回复消息回调
      if (params.replyToMessageId) {
        await this.sendRequest('aibot_respond_msg', {
          msgtype: 'markdown',
          markdown: { content: params.content },
        }, params.replyToMessageId);
      } else {
        // 主动推送消息
        // conversationId 格式: {chattype}:{chatid}  (single:userid 或 group:chatid)
        const [chatType, chatid] = this.parseConversationId(params.conversationId);
        await this.sendRequest('aibot_send_msg', {
          chatid,
          chat_type: chatType === 'group' ? 2 : 1,
          msgtype: 'markdown',
          markdown: { content: params.content },
        });
      }
    },

    sendImage: async (params: {
      conversationId: string;
      imagePath: string;
      caption?: string;
    }): Promise<void> => {
      if (!this.ws || this.ws.readyState !== 1) {
        throw new Error('WebSocket 未连接');
      }

      // 上传图片获取 media_id
      const mediaId = await this.uploadMedia(params.imagePath, 'image');

      // 主动推送图片
      const [chatType, chatid] = this.parseConversationId(params.conversationId);
      await this.sendRequest('aibot_send_msg', {
        chatid,
        chat_type: chatType === 'group' ? 2 : 1,
        msgtype: 'image',
        image: { media_id: mediaId },
      });
    },

    sendFile: async (params: {
      conversationId: string;
      filePath: string;
      fileName?: string;
    }): Promise<void> => {
      if (!this.ws || this.ws.readyState !== 1) {
        throw new Error('WebSocket 未连接');
      }

      // 上传文件获取 media_id
      const mediaId = await this.uploadMedia(params.filePath, 'file');

      // 主动推送文件
      const [chatType, chatid] = this.parseConversationId(params.conversationId);
      await this.sendRequest('aibot_send_msg', {
        chatid,
        chat_type: chatType === 'group' ? 2 : 1,
        msgtype: 'file',
        file: { media_id: mediaId },
      });
    },
  };

  // ========== 内部方法 ==========

  private parseConversationId(conversationId: string): [string, string] {
    // 格式: single:userid 或 group:chatid
    const idx = conversationId.indexOf(':');
    if (idx > 0) {
      return [conversationId.substring(0, idx), conversationId.substring(idx + 1)];
    }
    return ['single', conversationId];
  }

  private async connect(): Promise<void> {
    if (!this.isStarted) return;

    logger.info('正在连接企业微信 WebSocket...');

    try {
      const WebSocket = require('ws');
      this.ws = new WebSocket(WECOM_WS_URL);

      this.ws.on('open', () => {
        logger.info('WebSocket 连接成功，发送订阅请求...');
        this.subscribe();
      });

      this.ws.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWsMessage(message);
        } catch (err) {
          logger.error('解析 WebSocket 消息失败:', getErrorMessage(err));
        }
      });

      this.ws.on('close', () => {
        logger.info('WebSocket 连接已关闭');
        this.isSubscribed = false;
        this.stopHeartbeat();
        if (this.isStarted) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: any) => {
        logger.error('WebSocket 错误:', getErrorMessage(error));
      });
    } catch (error) {
      logger.error('连接失败:', getErrorMessage(error));
      if (this.isStarted) {
        this.scheduleReconnect();
      }
    }
  }

  private subscribe(): void {
    const reqId = this.generateReqId();
    this.ws.send(JSON.stringify({
      cmd: 'aibot_subscribe',
      headers: { req_id: reqId },
      body: {
        bot_id: this.connectorConfig.botId,
        secret: this.connectorConfig.secret,
      },
    }));
  }

  private handleWsMessage(message: any): void {
    const { cmd, headers, errcode, body } = message;
    const reqId = headers?.req_id;

    // 处理请求响应（通过 req_id 关联）
    if (reqId && this.pendingRequests.has(reqId)) {
      const pending = this.pendingRequests.get(reqId)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(reqId);
      if (errcode && errcode !== 0) {
        pending.reject(new Error(message.errmsg || `错误码: ${errcode}`));
      } else {
        pending.resolve(body || message);
      }
      return;
    }

    // 订阅响应（只处理一次，后续的 pong 等响应忽略）
    if (errcode !== undefined && !cmd) {
      if (!this.isSubscribed && errcode === 0) {
        this.isSubscribed = true;
        logger.info('订阅成功');
        this.startHeartbeat();
      } else if (errcode !== 0) {
        logger.error('订阅失败:', message.errmsg);
        this.ws?.close();
      }
      // errcode === 0 但已订阅 → 是心跳 pong，静默忽略
      return;
    }

    // 处理服务端推送
    switch (cmd) {
      case 'aibot_msg_callback':
        this.handleIncomingMessage(body, reqId);
        break;

      case 'aibot_event_callback':
        this.handleEvent(body, reqId);
        break;

      default:
        if (cmd) {
          logger.info('收到未处理的命令:', cmd);
        }
    }
  }

  private async handleIncomingMessage(body: any, reqId: string): Promise<void> {
    try {
      const msgId = body.msgid;
      if (!msgId) return;

      // 消息去重
      if (this.processedMessages.has(msgId)) return;
      this.processedMessages.add(msgId);
      if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
        const first = this.processedMessages.values().next().value;
        if (first) this.processedMessages.delete(first);
      }

      const chatType = body.chattype || 'single'; // single 或 group
      const chatid = body.chatid || body.from?.userid || '';
      const userid = body.from?.userid || '';
      const msgtype = body.msgtype || 'text';

      // 构建 conversationId: {chattype}:{chatid 或 userid}
      const conversationId = chatType === 'group'
        ? `group:${chatid}`
        : `single:${userid}`;

      let text = '';
      let imagePath: string | undefined;
      let filePath: string | undefined;
      let contentType: 'text' | 'image' | 'file' | 'voice' | 'video' = 'text';

      if (msgtype === 'text') {
        text = body.text?.content || '';
        // 群聊中去掉 @机器人 的前缀
        if (chatType === 'group') {
          text = text.replace(/@\S+\s*/, '').trim();
        }
      } else if (msgtype === 'mixed') {
        // 图文混排：提取文本部分
        const items = body.mixed?.msg_item || [];
        const textParts: string[] = [];
        for (const item of items) {
          if (item.type === 'text') {
            textParts.push(item.content || '');
          }
        }
        text = textParts.join('\n').replace(/@\S+\s*/, '').trim() || '[图文混排消息]';
      } else if (msgtype === 'image') {
        // 图片消息：下载解密
        const url = body.image?.url;
        const aeskey = body.image?.aeskey;
        if (url) {
          imagePath = await this.downloadAndDecryptMedia(url, aeskey, 'image', msgId);
          text = `[图片消息]`;
          contentType = 'image';
        }
      } else if (msgtype === 'file') {
        const url = body.file?.url;
        const aeskey = body.file?.aeskey;
        if (url) {
          filePath = await this.downloadAndDecryptMedia(url, aeskey, 'file', msgId);
          text = `[文件消息]`;
          contentType = 'file';
        }
      } else if (msgtype === 'voice') {
        // 语音消息：转文本
        text = body.voice?.content || '[语音消息]';
        contentType = 'voice';
      } else if (msgtype === 'video') {
        const url = body.video?.url;
        const aeskey = body.video?.aeskey;
        if (url) {
          filePath = await this.downloadAndDecryptMedia(url, aeskey, 'video', msgId);
          text = `[视频消息]`;
          contentType = 'video';
        }
      } else {
        text = `[${msgtype} 消息]`;
      }

      // 转发到 ConnectorManager
      await this.connectorManager.handleIncomingMessage(this.id, {
        messageId: reqId, // 使用 reqId 作为 messageId，回复时需要透传
        timestamp: Date.now(),
        sender: {
          id: userid,
          name: userid, // 企微长连接不返回昵称，用 userid
        },
        conversation: {
          id: conversationId,
          type: chatType === 'group' ? 'group' : 'p2p',
        },
        content: {
          type: contentType,
          text,
          imagePath,
          filePath,
        },
        raw: { ...body, _reqId: reqId }, // 保存 reqId 用于回复
      });
    } catch (error) {
      logger.error('处理消息失败:', getErrorMessage(error));
    }
  }

  private handleEvent(body: any, _reqId: string): void {
    const eventType = body.event?.eventtype;
    if (eventType === 'disconnected_event') {
      logger.info('收到连接断开事件（被新连接踢掉）');
    } else if (eventType === 'enter_chat') {
      // 进入会话事件，不回复欢迎语
      logger.info('用户进入会话:', body.from?.userid);
    }
  }

  /**
   * 发送请求并等待响应
   */
  private sendRequest(cmd: string, body: any, reqId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) {
        reject(new Error('WebSocket 未连接'));
        return;
      }

      const actualReqId = reqId || this.generateReqId();

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(actualReqId);
        reject(new Error(`请求超时: ${cmd}`));
      }, 30000);

      this.pendingRequests.set(actualReqId, { resolve, reject, timeout });

      this.ws.send(JSON.stringify({
        cmd,
        headers: { req_id: actualReqId },
        body,
      }));
    });
  }

  /**
   * 分片上传临时素材
   */
  private async uploadMedia(filePath: string, type: 'image' | 'file' | 'voice' | 'video'): Promise<string> {
    const expandedPath = filePath.startsWith('~')
      ? filePath.replace('~', process.env.HOME || '')
      : filePath;

    if (!fs.existsSync(expandedPath)) {
      throw new Error(`文件不存在: ${expandedPath}`);
    }

    const fileBuffer = fs.readFileSync(expandedPath);
    const filename = path.basename(expandedPath);
    const totalSize = fileBuffer.length;
    const CHUNK_SIZE = 512 * 1024; // 512KB
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

    // 1. 初始化上传
    const initResult = await this.sendRequest('aibot_upload_media_init', {
      type,
      filename,
      total_size: totalSize,
      total_chunks: totalChunks,
      md5,
    });

    const uploadId = initResult?.upload_id;
    if (!uploadId) {
      throw new Error('上传初始化失败：未获取到 upload_id');
    }

    // 2. 分片上传
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunk = fileBuffer.slice(start, end);
      const base64Data = chunk.toString('base64');

      await this.sendRequest('aibot_upload_media_chunk', {
        upload_id: uploadId,
        chunk_index: i,
        base64_data: base64Data,
      });
    }

    // 3. 完成上传
    const finishResult = await this.sendRequest('aibot_upload_media_finish', {
      upload_id: uploadId,
    });

    const mediaId = finishResult?.media_id;
    if (!mediaId) {
      throw new Error('上传完成但未获取到 media_id');
    }

    logger.info('素材上传成功:', { type, filename, mediaId });
    return mediaId;
  }

  /**
   * 下载并解密多媒体文件
   */
  private async downloadAndDecryptMedia(url: string, aeskey: string | undefined, type: string, msgId: string): Promise<string> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载失败: HTTP ${response.status}`);
      }

      let buffer = Buffer.from(await response.arrayBuffer());

      // 如果有 aeskey，需要解密
      if (aeskey) {
        const key = Buffer.from(aeskey, 'base64');
        const actualKey = key.length >= 32 ? key.slice(0, 32) : Buffer.concat([key, Buffer.alloc(32 - key.length)]);
        const iv = actualKey.slice(0, 16);
        // 关闭 auto padding，手动处理（兼容企微非标准 padding）
        const decipher = crypto.createDecipheriv('aes-256-cbc', actualKey, iv);
        decipher.setAutoPadding(false);
        const decrypted = Buffer.concat([decipher.update(buffer), decipher.final()]);
        // 手动去除 PKCS7 padding
        const padLen = decrypted[decrypted.length - 1];
        if (padLen > 0 && padLen <= 16) {
          buffer = decrypted.slice(0, decrypted.length - padLen);
        } else {
          buffer = decrypted;
        }
      }

      // 保存文件
      const ext = type === 'image' ? '.png' : type === 'video' ? '.mp4' : '.bin';
      const fileName = `wecom-${msgId.substring(0, 12)}${ext}`;
      const tempDir = this.getTempDir();
      const savedPath = path.join(tempDir, fileName);
      fs.writeFileSync(savedPath, buffer);

      return savedPath;
    } catch (error) {
      logger.error('下载媒体文件失败:', getErrorMessage(error));
      throw error;
    }
  }

  private getTempDir(): string {
    const store = SystemConfigStore.getInstance();
    const settings = store.getWorkspaceSettings();
    const tempDir = path.join(settings.workspaceDir, '.deepbot', 'temp', 'uploads');
    ensureDirectoryExists(tempDir);
    return tempDir;
  }

  private generateReqId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    logger.info('5 秒后重连...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({
          cmd: 'ping',
          headers: { req_id: this.generateReqId() },
        }));
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // 清理所有待处理请求
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('连接器已停止'));
    }
    this.pendingRequests.clear();
  }
}
