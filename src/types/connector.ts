/**
 * 连接器系统类型定义
 */

// ========== 连接器基础类型 ==========

/**
 * 连接器 ID
 */
export type ConnectorId = 'feishu' | 'dingtalk' | 'wechat' | 'slack';

/**
 * 连接器配置
 */
export interface ConnectorConfig {
  enabled: boolean;           // 是否启用
  [key: string]: any;         // 其他配置项
}

/**
 * 健康状态
 */
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  message: string;
}

// ========== Gateway 消息格式 ==========

/**
 * Gateway 消息（连接器发送给 Gateway 的消息）
 */
export interface GatewayMessage {
  // 消息元数据
  tabId: string;              // Tab ID（由 Gateway 分配）
  messageId: string;          // 消息 ID
  timestamp: number;          // 时间戳
  replyToMessageId?: string;  // 要回复的消息 ID（用于飞书 reply API）
  
  // 来源信息
  source: {
    type: 'ui' | 'connector' | 'scheduled_task';  // 消息来源
    connectorId?: ConnectorId;  // 连接器 ID
    conversationId?: string;    // 外部会话 ID
    senderId?: string;          // 发送者 ID
    senderName?: string;        // 发送者名称
    chatType?: 'group' | 'p2p'; // 聊天类型（飞书专用：group=群组，p2p=私聊）
  };
  
  // 消息内容
  content: {
    type: 'text' | 'image' | 'file';
    text?: string;            // 文本内容
    fileUrl?: string;         // 文件 URL
    fileName?: string;        // 文件名（英文安全文件名，传给 AI 使用）
    // 图片相关
    imageKey?: string;        // 飞书图片 Key
    imagePath?: string;       // 本地图片路径
    // 文件相关
    fileKey?: string;         // 飞书文件 Key
    filePath?: string;        // 本地文件路径
  };
  
  // 原始数据（用于调试）
  raw?: any;

  // 系统上下文（连接器注入给 agent 的额外提示，如首次登录提示等）
  systemContext?: string;
}

// ========== 连接器接口 ==========

/**
 * 连接器接口（简化版的 Channel Plugin）
 */
export interface Connector {
  // ========== 基本信息 ==========
  readonly id: ConnectorId;
  readonly name: string;
  readonly version: string;
  
  // ========== 配置管理 ==========
  config: {
    load(): Promise<ConnectorConfig | null>;
    save(config: ConnectorConfig): Promise<void>;
    validate(config: ConnectorConfig): boolean;
  };
  
  // ========== 生命周期 ==========
  initialize(config: ConnectorConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  
  // ========== 消息处理 ==========
  outbound: {
    sendMessage(params: {
      conversationId: string;
      content: string;
      replyTo?: string;
      replyToMessageId?: string;  // 飞书 reply API 需要的 message_id
    }): Promise<void>;
    
    sendImage?(params: {
      conversationId: string;
      imagePath: string;
      caption?: string;
      replyToMessageId?: string;  // 飞书 reply API 需要的 message_id
    }): Promise<void>;
    
    sendFile?(params: {
      conversationId: string;
      filePath: string;
      fileName?: string;
      replyToMessageId?: string;  // 飞书 reply API 需要的 message_id
    }): Promise<void>;
  };
  
  // ========== 安全控制 ==========
  security?: {
    verifySignature?(request: {
      headers: Record<string, string>;
      body: string;
    }): Promise<boolean>;
  };
  
  // ========== Pairing 机制 ==========
  pairing?: {
    generatePairingCode(userId: string): string;
    verifyPairingCode(userId: string): boolean;
    approvePairing(code: string): Promise<void>;
  };

  /**
   * 配对批准后的回调，由 ConnectorManager 统一调用
   * 连接器可实现此方法向用户发送欢迎消息等
   */
  onPairingApproved?(userId: string, openId?: string): void;
}

// ========== 飞书特定类型 ==========

/**
 * 飞书连接器配置
 */
export interface FeishuConnectorConfig extends ConnectorConfig {
  appId: string;              // 应用 ID（cli_xxx）
  appSecret: string;          // 应用密钥
}

/**
 * 飞书消息（内部格式）
 */
export interface FeishuIncomingMessage {
  messageId: string;
  timestamp: number;
  sender: {
    id: string;
    name: string;
    avatar?: string;
  };
  conversation: {
    id: string;
    type: 'p2p' | 'group';  // 使用飞书原始值：p2p=私聊，group=群组
    name?: string;
  };
  mentions?: {
    isBotMentioned: boolean;
    mentionList: any[];
  };
  content: {
    type: 'text' | 'image' | 'file';
    text: string;
    fileUrl?: string;
    fileName?: string;
    // 图片相关
    imageKey?: string;        // 飞书图片 Key
    imagePath?: string;       // 本地图片路径
    // 文件相关
    fileKey?: string;         // 飞书文件 Key
    filePath?: string;        // 本地文件路径
  };
  // 系统上下文（注入给 agent 的额外提示）
  systemContext?: string;
  raw: any;
}

/**
 * Pairing 记录
 */
export interface PairingRecord {
  connectorId: ConnectorId;
  userId: string;
  code: string;
  approved: boolean;
  createdAt: number;
  approvedAt?: number;
}
