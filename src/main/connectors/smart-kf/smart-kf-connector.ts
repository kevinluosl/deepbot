/**
 * 智能客服连接器
 * 
 * 通过 WebSocket 连接 wechat-service 接收智能客服消息
 * 支持认证、心跳、自动重连、媒体文件下载
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  Connector,
  SmartKfConnectorConfig,
  SmartKfIncomingMessage,
  HealthStatus,
} from '../../../types/connector';
import { getErrorMessage } from '../../../shared/utils/error-handler';
import { ensureDirectoryExists } from '../../../shared/utils/fs-utils';
import type { ConnectorManager } from '../connector-manager';
import { SystemConfigStore } from '../../database/system-config-store';

export class SmartKfConnector implements Connector {
  readonly id = 'smart-kf' as const;
  readonly name = '智能客服';
  readonly version = '1.0.0';

  private connectorConfig!: SmartKfConnectorConfig;
  private connectorManager: ConnectorManager;
  private isStarted: boolean = false;
  private ws: any = null; // WebSocket 实例（动态导入）
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // 消息去重
  private processedMessages: Set<string> = new Set();
  private readonly MAX_PROCESSED_MESSAGES = 1000;

  constructor(connectorManager: ConnectorManager) {
    this.connectorManager = connectorManager;
  }

  // ========== 配置管理 ==========
  config = {
    load: async (): Promise<SmartKfConnectorConfig | null> => {
      const store = SystemConfigStore.getInstance();
      const result = store.getConnectorConfig(this.id);
      if (!result) return null;
      return { ...result.config, enabled: result.enabled } as SmartKfConnectorConfig;
    },

    save: async (config: SmartKfConnectorConfig): Promise<void> => {
      const store = SystemConfigStore.getInstance();
      store.saveConnectorConfig(this.id, this.name, config, false);
    },

    validate: (config: SmartKfConnectorConfig): boolean => {
      return !!(config.wsUrl && config.wsKey);
    },
  };

  // ========== 生命周期 ==========

  async initialize(config: SmartKfConnectorConfig): Promise<void> {
    this.connectorConfig = config;
    console.log('[SmartKfConnector] ✅ 初始化完成');
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      console.log('[SmartKfConnector] 已在运行中');
      return;
    }

    console.log('[SmartKfConnector] 🔄 启动智能客服连接器...');
    this.isStarted = true;
    await this.connect();
    console.log('[SmartKfConnector] ✅ 智能客服连接器已启动');
  }

  async stop(): Promise<void> {
    this.isStarted = false;
    this.clearTimers();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // 静默处理
      }
      this.ws = null;
    }

    console.log('[SmartKfConnector] ✅ 智能客服连接器已停止');
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.isStarted || !this.ws) {
      return { status: 'unhealthy', message: '智能客服连接器未运行' };
    }

    // WebSocket readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    if (this.ws.readyState !== 1) {
      return { status: 'unhealthy', message: 'WebSocket 未连接' };
    }

    return { status: 'healthy', message: '智能客服连接器运行正常' };
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

      // 从 conversationId 中解析 external_userid 和 open_kfid
      // conversationId 格式: {external_userid}||{open_kfid}
      const parts = params.conversationId.split('||');
      const externalUserId = parts[0];
      const openKfId = parts[1] || '';

      await this.sendAndWaitResponse({
        type: 'send_message',
        touser: externalUserId,
        open_kfid: openKfId,
        content: params.content,
        msgid: params.replyToMessageId,
      });
    },

    sendImage: async (params: {
      conversationId: string;
      imagePath: string;
      caption?: string;
    }): Promise<void> => {
      if (!this.ws || this.ws.readyState !== 1) {
        throw new Error('WebSocket 未连接');
      }

      const parts = params.conversationId.split('||');
      const externalUserId = parts[0];
      const openKfId = parts[1] || '';

      // 1. 获取 access_token
      const accessToken = await this.getAccessToken();

      // 2. 上传临时素材获取 media_id
      const mediaId = await this.uploadMedia(accessToken, params.imagePath, 'image');

      // 3. 发送图片消息并等待确认
      await this.sendAndWaitResponse({
        type: 'send_image',
        touser: externalUserId,
        open_kfid: openKfId,
        media_id: mediaId,
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

      const parts = params.conversationId.split('||');
      const externalUserId = parts[0];
      const openKfId = parts[1] || '';

      // 1. 获取 access_token
      const accessToken = await this.getAccessToken();

      // 2. 上传临时素材获取 media_id
      const mediaId = await this.uploadMedia(accessToken, params.filePath, 'file');

      // 3. 发送文件消息并等待确认
      await this.sendAndWaitResponse({
        type: 'send_file',
        touser: externalUserId,
        open_kfid: openKfId,
        media_id: mediaId,
      });
    },
  };

  // ========== 内部方法 ==========

  /**
   * 连接 WebSocket
   */
  private async connect(): Promise<void> {
    if (!this.isStarted) return;

    console.log('[SmartKfConnector] 🔌 正在连接 WebSocket...');

    try {
      // 动态导入 ws 模块
      const WebSocket = require('ws');
      this.ws = new WebSocket(this.connectorConfig.wsUrl);

      this.ws.on('open', () => {
        console.log('[SmartKfConnector] ✅ WebSocket 连接成功');

        // 发送认证
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = Math.random().toString(36).substr(2, 8);

        this.ws.send(JSON.stringify({
          type: 'auth',
          key: this.connectorConfig.wsKey,
          timestamp,
          nonce,
        }));
      });

      this.ws.on('message', (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWsMessage(message);
        } catch (err) {
          console.error('[SmartKfConnector] ❌ 消息解析失败:', getErrorMessage(err));
        }
      });

      this.ws.on('close', () => {
        console.log('[SmartKfConnector] 🔌 WebSocket 连接已关闭');
        this.clearTimers();

        // 自动重连
        if (this.isStarted) {
          this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      });

      this.ws.on('error', (err: any) => {
        console.error('[SmartKfConnector] ❌ WebSocket 错误:', getErrorMessage(err));
      });
    } catch (error) {
      console.error('[SmartKfConnector] ❌ 连接失败:', getErrorMessage(error));
      // 自动重连
      if (this.isStarted) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    }
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleWsMessage(message: any): void {
    const { type } = message;

    switch (type) {
      case 'auth_success':
        console.log('[SmartKfConnector] ✅ 认证成功，Client ID:', message.clientId);
        this.startHeartbeat();
        break;

      case 'auth_failed':
        console.error('[SmartKfConnector] ❌ 认证失败:', message.error);
        this.ws?.close();
        break;

      case 'pong':
        // 心跳响应，静默处理
        break;

      case 'new_messages':
        if (message.messages && Array.isArray(message.messages)) {
          for (const m of message.messages) {
            this.handleIncomingMessage(m).catch((error) => {
              console.error('[SmartKfConnector] ❌ 处理消息失败:', getErrorMessage(error));
            });
          }
        }
        break;

      case 'message_sent':
        console.log('[SmartKfConnector] ✅ 消息发送成功:', message.content?.substring(0, 50));
        break;

      case 'error':
        console.error('[SmartKfConnector] ❌ 服务端错误:', message.error);
        break;

      default:
        console.log('[SmartKfConnector] 📨 收到未知消息类型:', type);
    }
  }

  /**
   * 处理收到的智能客服消息
   */
  private async handleIncomingMessage(msg: any): Promise<void> {
    try {
      const msgId = msg.msgid || `${msg.external_userid}-${msg.send_time}`;

      // 消息去重
      if (this.processedMessages.has(msgId)) return;
      this.processedMessages.add(msgId);
      if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
        const first = this.processedMessages.values().next().value;
        if (first) this.processedMessages.delete(first);
      }

      // 处理事件类型消息（如用户进入会话等）
      if (msg.msgtype === 'event') {
        console.log('[SmartKfConnector] 📌 收到事件消息:', msg.event?.event_type);
        // 检查是否有 welcome_code，有则自动发送欢迎语
        const welcomeCode = msg.event?.welcome_code;
        const openKfId = msg.event?.open_kfid || msg.open_kfid || '';
        if (welcomeCode && openKfId) {
          this.handleWelcomeEvent(welcomeCode, openKfId).catch((err) => {
            console.error('[SmartKfConnector] ❌ 发送欢迎语失败:', getErrorMessage(err));
          });
        }
        return;
      }

      // 提取消息文本和媒体信息
      let text = '';
      let contentType: 'text' | 'image' | 'file' | 'voice' | 'video' = 'text';
      let imagePath: string | undefined;
      let filePath: string | undefined;
      let fileName: string | undefined;

      if (msg.msgtype === 'text') {
        text = msg.text?.content || '';
      } else if (msg.msgtype === 'image') {
        contentType = 'image';
        text = '[图片]';
      } else if (msg.msgtype === 'voice') {
        // 语音消息：直接回复客户请发送文字，不经过 AI
        const externalUserId = msg.external_userid || '';
        const openKfId = msg.open_kfid || '';
        const conversationId = `${externalUserId}||${openKfId}`;
        try {
          await this.outbound.sendMessage({
            conversationId,
            content: '暂不支持语音消息，请发送文字消息，谢谢 😊',
          });
        } catch (err) {
          console.error('[SmartKfConnector] ❌ 回复语音提示失败:', getErrorMessage(err));
        }
        return;
      } else if (msg.msgtype === 'video') {
        contentType = 'video';
        text = '[视频]';
      } else if (msg.msgtype === 'file') {
        contentType = 'file';
        text = '[文件]';
      } else if (msg.msgtype === 'miniprogram') {
        text = msg.miniprogram?.title || '[小程序]';
      } else if (msg.msgtype === 'link') {
        text = msg.link?.title || '[链接]';
      } else if (msg.msgtype === 'location') {
        text = `[位置: ${msg.location?.name || ''} ${msg.location?.address || ''}]`;
      } else {
        text = `[${msg.msgtype || '未知类型'}]`;
      }

      // 跳过空消息
      if (!text) return;

      // 下载媒体文件（如果有 media_url）
      if (msg.media_url && ['image', 'voice', 'video', 'file'].includes(msg.msgtype)) {
        try {
          const downloaded = await this.downloadMedia(msg.media_url, msg.msgtype, msgId);
          if (downloaded) {
            if (msg.msgtype === 'image') {
              imagePath = downloaded.path;
            } else {
              filePath = downloaded.path;
              fileName = downloaded.name;
            }
          }
        } catch (error) {
          console.warn('[SmartKfConnector] ⚠️ 下载媒体失败:', getErrorMessage(error));
        }
      }

      const nickname = msg.nickname || '未知用户';
      const kfName = msg.kf_name || msg.open_kfid || '未知客服';
      const externalUserId = msg.external_userid || '';
      const openKfId = msg.open_kfid || '';

      const conversationId = `${externalUserId}||${openKfId}`;

      const parsedMessage: SmartKfIncomingMessage = {
        messageId: msgId,
        timestamp: (msg.send_time || Math.floor(Date.now() / 1000)) * 1000,
        sender: {
          id: externalUserId,
          name: nickname,
        },
        conversation: {
          id: conversationId,
          type: 'p2p',
        },
        content: {
          type: contentType,
          text,
          imagePath,
          filePath,
          fileName,
        },
        raw: msg,
      };

      // 转发到 ConnectorManager
      await this.connectorManager.handleIncomingMessage(this.id, parsedMessage);
    } catch (error) {
      console.error('[SmartKfConnector] ❌ 处理消息失败:', getErrorMessage(error));
    }
  }

  /**
   * 下载媒体文件到本地临时目录
   */
  private async downloadMedia(mediaUrl: string, msgType: string, msgId: string): Promise<{ path: string; name: string } | null> {
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // 根据消息类型推断扩展名
    const contentTypeHeader = response.headers.get('content-type') || '';
    let ext = '.bin';
    if (msgType === 'image') {
      ext = contentTypeHeader.includes('png') ? '.png' : '.jpg';
    } else if (msgType === 'voice') {
      ext = contentTypeHeader.includes('silk') ? '.silk' : '.amr';
    } else if (msgType === 'video') {
      ext = '.mp4';
    } else if (msgType === 'file') {
      // 尝试从 Content-Disposition 获取文件名
      const disposition = response.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^";\s]+)"?/);
      if (filenameMatch) {
        const originalName = filenameMatch[1];
        const dotIdx = originalName.lastIndexOf('.');
        if (dotIdx > 0) ext = originalName.substring(dotIdx);
      }
    }

    const savedName = `smart-kf-${msgId.substring(0, 16)}${ext}`;
    const tempDir = this.getTempDir();
    const savedPath = path.join(tempDir, savedName);
    fs.writeFileSync(savedPath, buffer);

    console.log(`[SmartKfConnector] 📥 媒体文件已下载: ${savedPath} (${buffer.length} bytes)`);
    return { path: savedPath, name: savedName };
  }

  /**
   * 获取临时文件目录
   */
  private getTempDir(): string {
    const store = SystemConfigStore.getInstance();
    const settings = store.getWorkspaceSettings();
    const tempDir = path.join(settings.workspaceDir, '.deepbot', 'temp', 'uploads');
    ensureDirectoryExists(tempDir);
    return tempDir;
  }

  /**
   * 处理欢迎语事件：从配置中读取欢迎语并发送
   */
  private async handleWelcomeEvent(welcomeCode: string, openKfId: string): Promise<void> {
    // 从数据库读取该客服的欢迎语配置
    const store = SystemConfigStore.getInstance();
    const welcomeText = store.getAppSetting(`smart_kf_welcome_${openKfId}`);

    if (!welcomeText) {
      console.log('[SmartKfConnector] 📌 该客服未配置欢迎语，跳过:', openKfId);
      return;
    }

    console.log('[SmartKfConnector] 📨 发送欢迎语:', { openKfId, welcomeCode: welcomeCode.substring(0, 16) + '...' });

    // 通过 WebSocket 通知服务端调用 send_msg_on_event 接口
    const result = await this.sendWelcomeMessage(welcomeCode, welcomeText);
    if (result.success) {
      console.log('[SmartKfConnector] ✅ 欢迎语已发送');
    } else {
      console.error('[SmartKfConnector] ❌ 欢迎语发送失败:', result.error);
    }
  }

  /**
   * 获取客服账号链接
   */
  async getKfUrl(openKfId: string, scene?: string): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!this.ws || this.ws.readyState !== 1) {
      return { success: false, error: 'WebSocket 未连接' };
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.ws?.removeListener('message', handler);
        resolve({ success: false, error: '获取客服链接超时' });
      }, 10000);

      const handler = (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.request_id && msg.request_id !== requestId) return;
          if (msg.type === 'kf_url') {
            clearTimeout(timeout);
            this.ws?.removeListener('message', handler);
            resolve({ success: true, url: msg.url || '' });
          } else if (msg.type === 'error') {
            clearTimeout(timeout);
            this.ws?.removeListener('message', handler);
            resolve({ success: false, error: msg.error || '服务端返回错误' });
          }
        } catch {
          // 非相关消息，忽略
        }
      };

      this.ws.on('message', handler);
      const payload: any = { type: 'get_kf_url', open_kfid: openKfId, request_id: requestId };
      if (scene) payload.scene = scene;
      this.ws.send(JSON.stringify(payload));
    });
  }

  /**
   * 获取客服账号列表
   */
  async getKfList(): Promise<{ success: boolean; accountList?: Array<{ open_kfid: string; name: string; avatar: string }>; error?: string }> {
    if (!this.ws || this.ws.readyState !== 1) {
      return { success: false, error: 'WebSocket 未连接' };
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.ws?.removeListener('message', handler);
        resolve({ success: false, error: '获取客服列表超时' });
      }, 10000);

      const handler = (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'kf_list') {
            clearTimeout(timeout);
            this.ws?.removeListener('message', handler);
            resolve({
              success: true,
              accountList: msg.account_list || [],
            });
          }
        } catch {
          // 非相关消息，忽略
        }
      };

      this.ws.on('message', handler);
      this.ws.send(JSON.stringify({ type: 'get_kf_list' }));
    });
  }

  /**
   * 发送事件响应消息（欢迎语）
   * 
   * 服务端接口格式：
   * { type: "send_welcome", code: "xxx", content: "欢迎语文本", request_id: "req_xxx" }
   */
  async sendWelcomeMessage(code: string, content: string): Promise<{ success: boolean; error?: string }> {
    if (!this.ws || this.ws.readyState !== 1) {
      return { success: false, error: 'WebSocket 未连接' };
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.ws?.removeListener('message', handler);
        // 超时视为成功（兼容旧版服务端）
        resolve({ success: true });
      }, 15000);

      const handler = (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          // 匹配 request_id
          if (msg.request_id && msg.request_id !== requestId) return;
          if (msg.type === 'welcome_sent' || msg.type === 'welcome_error') {
            clearTimeout(timeout);
            this.ws?.removeListener('message', handler);
            if (msg.type === 'welcome_error') {
              resolve({ success: false, error: msg.error || '发送欢迎语失败' });
            } else {
              resolve({ success: true });
            }
          }
        } catch {
          // 非相关消息，忽略
        }
      };

      this.ws.on('message', handler);
      this.ws.send(JSON.stringify({
        type: 'send_welcome',
        code,
        content,
        request_id: requestId,
      }));
    });
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
    console.log('[SmartKfConnector] ✅ 心跳已启动（30秒间隔）');
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 清除所有定时器
   */
  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 发送 WebSocket 消息并等待服务端确认（message_sent 或 send_error）
   * 通过 request_id 关联请求和响应，支持并发发送
   */
  private sendAndWaitResponse(payload: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) {
        reject(new Error('WebSocket 未连接'));
        return;
      }

      // 生成唯一请求 ID
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const timeout = setTimeout(() => {
        this.ws?.removeListener('message', handler);
        // 超时不报错，视为成功（兼容旧版服务端不返回确认的情况）
        resolve();
      }, 15000);

      const handler = (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          // 只处理匹配当前 request_id 的响应
          if (msg.request_id && msg.request_id !== requestId) return;
          
          if (msg.type === 'message_sent') {
            clearTimeout(timeout);
            this.ws?.removeListener('message', handler);
            resolve();
          } else if (msg.type === 'send_error') {
            clearTimeout(timeout);
            this.ws?.removeListener('message', handler);
            reject(new Error(msg.error || '发送失败'));
          }
        } catch {
          // 非相关消息，忽略
        }
      };

      this.ws.on('message', handler);
      this.ws.send(JSON.stringify({ ...payload, request_id: requestId }));
    });
  }

  /**
   * 通过 WebSocket 获取 access_token
   */
  private getAccessToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) {
        reject(new Error('WebSocket 未连接'));
        return;
      }

      const timeout = setTimeout(() => {
        this.ws?.removeListener('message', handler);
        reject(new Error('获取 access_token 超时'));
      }, 10000);

      const handler = (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'token') {
            clearTimeout(timeout);
            this.ws?.removeListener('message', handler);
            if (msg.access_token) {
              resolve(msg.access_token);
            } else {
              reject(new Error('access_token 为空'));
            }
          }
        } catch {
          // 非 token 消息，忽略
        }
      };

      this.ws.on('message', handler);
      this.ws.send(JSON.stringify({ type: 'get_token' }));
    });
  }

  /**
   * 上传临时素材到企微，获取 media_id
   * 
   * @param accessToken - 企微 access_token
   * @param filePath - 本地文件路径
   * @param mediaType - 素材类型：'image' | 'file' | 'voice'
   */
  private async uploadMedia(accessToken: string, filePath: string, mediaType: 'image' | 'file' | 'voice'): Promise<string> {
    const expandedPath = filePath.startsWith('~') 
      ? filePath.replace('~', process.env.HOME || '') 
      : filePath;
    
    if (!fs.existsSync(expandedPath)) {
      throw new Error(`文件不存在: ${expandedPath}`);
    }

    const fileBuffer = fs.readFileSync(expandedPath);
    const fileName = path.basename(expandedPath);

    // 构建 multipart/form-data
    const boundary = `----WebKitFormBoundary${Date.now().toString(36)}`;
    const contentType = mediaType === 'image' ? 'image/png' : 'application/octet-stream';

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media"; filename="${fileName}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);

    // 调用企微上传临时素材 API
    const url = `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${accessToken}&type=${mediaType}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`上传素材失败: HTTP ${response.status}`);
    }

    const result = await response.json() as any;
    if (result.errcode && result.errcode !== 0) {
      throw new Error(`上传素材失败: ${result.errmsg} (errcode: ${result.errcode})`);
    }

    if (!result.media_id) {
      throw new Error('上传素材响应中缺少 media_id');
    }

    console.log(`[SmartKfConnector] ✅ 素材上传成功: ${mediaType}, media_id: ${result.media_id}`);
    return result.media_id;
  }
}
