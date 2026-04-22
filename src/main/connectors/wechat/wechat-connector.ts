/**
 * 微信连接器
 * 
 * 使用 @wechatbot/wechatbot SDK（iLink Bot 协议）连接微信
 * 通过 QR 码扫码登录，长轮询接收消息
 */

import * as path from 'path';
import * as fs from 'fs';
import type {
  Connector,
  WechatConnectorConfig,
  WechatIncomingMessage,
  HealthStatus,
} from '../../../types/connector';
import { getErrorMessage } from '../../../shared/utils/error-handler';
import { ensureDirectoryExists } from '../../../shared/utils/fs-utils';
import type { ConnectorManager } from '../connector-manager';
import { SystemConfigStore } from '../../database/system-config-store';
import { expandUserPath } from '../../../shared/utils/path-utils';

// 默认存储目录
const DEFAULT_STORAGE_DIR = '~/.deepbot/wechat';

export class WechatConnector implements Connector {
  readonly id: string;
  readonly name: string;
  readonly version = '1.0.0';

  private connectorConfig!: WechatConnectorConfig;
  private connectorManager: ConnectorManager;
  private isStarted: boolean = false;
  private bot: any = null; // WeChatBot 实例（动态导入 ESM）
  private storageDir: string = ''; // 凭证存储目录

  // 消息去重
  private processedMessages: Set<string> = new Set();
  private readonly MAX_PROCESSED_MESSAGES = 1000;

  constructor(connectorManager: ConnectorManager, instanceId?: string) {
    this.connectorManager = connectorManager;
    // 支持多实例：wechat-1, wechat-2 等
    this.id = instanceId || 'wechat';
    // 显示名称带编号
    const num = instanceId?.match(/wechat-(\d+)/)?.[1];
    this.name = num ? `微信 ${num}` : '微信';
  }

  // ========== 配置管理 ==========
  config = {
    load: async (): Promise<WechatConnectorConfig | null> => {
      const store = SystemConfigStore.getInstance();
      const result = store.getConnectorConfig(this.id);
      if (!result) return null;
      return { ...result.config, enabled: result.enabled } as WechatConnectorConfig;
    },

    save: async (config: WechatConnectorConfig): Promise<void> => {
      const store = SystemConfigStore.getInstance();
      store.saveConnectorConfig(this.id, this.name, config, false);
    },

    validate: (config: WechatConnectorConfig): boolean => {
      // 微信连接器不需要 appId/appSecret，只需要扫码登录
      return true;
    },
  };

  // ========== 生命周期 ==========

  async initialize(config: WechatConnectorConfig): Promise<void> {
    this.connectorConfig = config;

    // 每个实例使用独立的存储目录
    const baseDir = config.storageDir || DEFAULT_STORAGE_DIR;
    const num = this.id.replace('wechat-', '');
    const storageDir = expandUserPath(`${baseDir}-${num}`);
    this.storageDir = storageDir;
    ensureDirectoryExists(storageDir);

    // 动态导入 ESM 模块
    // eslint-disable-next-line no-eval
    const { WeChatBot } = await eval('import("@wechatbot/wechatbot")');

    this.bot = new WeChatBot({
      storage: 'file',
      storageDir,
      logLevel: 'info',
    });

    console.log('[WechatConnector] ✅ 初始化完成');
  }

  async start(): Promise<void> {
    if (!this.bot) throw new Error('微信连接器未初始化');
    if (this.isStarted) {
      console.log('[WechatConnector] 已在运行中');
      return;
    }

    console.log('[WechatConnector] 🔄 启动微信连接器...');

    // 登录（如果有存储的凭证会自动恢复，否则需要扫码）
    try {
      const creds = await this.bot.login({
        callbacks: {
          onQrUrl: (url: string) => {
            console.log('[WechatConnector] 📱 请扫描二维码登录微信:');
            console.log(url);
            // 通知前端显示二维码
            this.notifyQrCode(url);
          },
          onScanned: () => {
            console.log('[WechatConnector] ✅ 二维码已扫描，请在微信中确认');
          },
          onExpired: () => {
            console.log('[WechatConnector] ⚠️ 二维码已过期，正在刷新...');
          },
        },
      });

      console.log(`[WechatConnector] ✅ 登录成功: ${creds.accountId}`);
    } catch (error) {
      console.error('[WechatConnector] ❌ 登录失败:', getErrorMessage(error));
      throw error;
    }

    // 注册消息处理
    this.bot.onMessage(async (msg: any) => {
      await this.handleIncomingMessage(msg);
    });

    this.bot.on('session:expired', () => {
      console.warn('[WechatConnector] ⚠️ 会话过期，将自动重新登录');
    });

    this.bot.on('error', (err: any) => {
      console.error('[WechatConnector] ❌ 错误:', getErrorMessage(err));
    });

    // 启动消息轮询
    this.isStarted = true;
    // bot.start() 是阻塞的，放到后台运行
    this.bot.start().catch((error: any) => {
      console.error('[WechatConnector] ❌ 消息轮询异常退出:', getErrorMessage(error));
      this.isStarted = false;
    });

    console.log('[WechatConnector] ✅ 微信连接器已启动');
  }

  async stop(clearCredentials = true): Promise<void> {
    if (this.bot && this.isStarted) {
      this.bot.stop();
      this.isStarted = false;
      console.log('[WechatConnector] ✅ 微信连接器已停止');
    }

    // 仅在用户主动停止时清除凭证缓存
    if (clearCredentials && this.storageDir) {
      try {
        const files = fs.readdirSync(this.storageDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.storageDir, file));
        }
        console.log(`[WechatConnector] 🗑️ 已清除凭证缓存: ${this.storageDir}`);
      } catch (error) {
        console.warn('[WechatConnector] ⚠️ 清除凭证缓存失败:', getErrorMessage(error));
      }
    }

    this.bot = null;
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.bot || !this.isStarted) {
      return { status: 'unhealthy', message: '微信连接器未运行' };
    }
    if (!this.bot.isRunning) {
      return { status: 'unhealthy', message: '消息轮询未运行' };
    }
    return { status: 'healthy', message: '微信连接器运行正常' };
  }

  // ========== 消息处理 ==========

  outbound = {
    sendMessage: async (params: {
      conversationId: string;
      content: string;
      replyToMessageId?: string;
    }): Promise<void> => {
      if (!this.bot) throw new Error('微信连接器未初始化');
      await this.bot.send(params.conversationId, params.content);
    },

    sendImage: async (params: {
      conversationId: string;
      imagePath: string;
      caption?: string;
    }): Promise<void> => {
      if (!this.bot) throw new Error('微信连接器未初始化');
      const imageBuffer = fs.readFileSync(expandUserPath(params.imagePath));
      await this.bot.send(params.conversationId, {
        image: imageBuffer,
        caption: params.caption,
      });
    },

    sendFile: async (params: {
      conversationId: string;
      filePath: string;
      fileName?: string;
    }): Promise<void> => {
      if (!this.bot) throw new Error('微信连接器未初始化');
      const expandedPath = expandUserPath(params.filePath);
      const fileBuffer = fs.readFileSync(expandedPath);
      const fileName = params.fileName || path.basename(expandedPath);
      await this.bot.send(params.conversationId, {
        file: fileBuffer,
        fileName,
      });
    },
  };

  // ========== 内部方法 ==========

  /**
   * 处理收到的微信消息
   */
  private async handleIncomingMessage(msg: any): Promise<void> {
    try {
      // 消息去重
      const msgId = msg.raw?.msg?.client_id || `${msg.userId}-${msg.timestamp?.getTime()}`;
      if (this.processedMessages.has(msgId)) return;
      this.processedMessages.add(msgId);
      if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
        const first = this.processedMessages.values().next().value;
        if (first) this.processedMessages.delete(first);
      }

      // 下载媒体文件（如果有）
      let imagePath: string | undefined;
      let filePath: string | undefined;
      let fileName: string | undefined;

      if (msg.type === 'image' || msg.type === 'file' || msg.type === 'voice' || msg.type === 'video') {
        try {
          const downloaded = await this.bot.download(msg);
          if (downloaded) {
            const tempDir = this.getTempDir();
            
            // 根据类型和文件名推断扩展名
            let ext = '.bin';
            if (downloaded.fileName) {
              // 文件类型：使用原始文件名的扩展名
              const dotIdx = downloaded.fileName.lastIndexOf('.');
              if (dotIdx > 0) ext = downloaded.fileName.substring(dotIdx);
            } else if (downloaded.type === 'image') {
              ext = '.jpg';
            } else if (downloaded.type === 'video') {
              ext = '.mp4';
            } else if (downloaded.type === 'voice') {
              ext = downloaded.format === 'wav' ? '.wav' : '.silk';
            }
            
            const savedName = downloaded.fileName || `wechat-${Date.now()}${ext}`;
            const savedPath = path.join(tempDir, savedName);
            fs.writeFileSync(savedPath, downloaded.data);

            if (msg.type === 'image') {
              imagePath = savedPath;
            } else {
              filePath = savedPath;
              fileName = savedName;
            }
          }
        } catch (error) {
          console.warn('[WechatConnector] ⚠️ 下载媒体失败:', getErrorMessage(error));
        }
      }

      // 构建内部消息格式
      const parsedMessage: WechatIncomingMessage = {
        messageId: msgId,
        timestamp: msg.timestamp?.getTime() || Date.now(),
        sender: {
          id: msg.userId,
          name: msg.userId, // iLink Bot 不提供用户名，用 userId 代替
        },
        conversation: {
          id: msg.userId, // 私聊场景，会话 ID = 用户 ID
          type: 'p2p',
        },
        content: {
          type: msg.type || 'text',
          text: msg.text || '',
          imagePath,
          filePath,
          fileName,
        },
        raw: msg.raw,
      };

      // 跳过空消息
      if (!parsedMessage.content.text && !imagePath && !filePath) {
        return;
      }

      // 转发到 ConnectorManager
      await this.connectorManager.handleIncomingMessage(this.id, parsedMessage);
    } catch (error) {
      console.error('[WechatConnector] ❌ 处理消息失败:', getErrorMessage(error));
    }
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
   * 通知前端显示二维码
   */
  private notifyQrCode(url: string): void {
    try {
      this.connectorManager.broadcastWechatQrCode(url, this.id);
    } catch {
      // 静默处理
    }
  }
}
