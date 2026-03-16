/**
 * 消息类型定义
 */

export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 工具执行步骤状态
 */
export type ExecutionStepStatus = 'running' | 'success' | 'error';

/**
 * 工具执行步骤
 */
export interface ExecutionStep {
  id: string;
  toolName: string;
  toolLabel?: string;
  params?: any;
  result?: string;
  error?: string;
  status: ExecutionStepStatus;
  timestamp: number;
  duration?: number; // 执行时长（毫秒）
}

/**
 * 上传的图片信息
 */
export interface UploadedImage {
  id: string;
  path: string; // 临时文件路径
  name: string; // 原始文件名
  size: number; // 文件大小（字节）
  dataUrl: string; // base64 数据 URL（用于显示缩略图）
}

/**
 * 上传的文件信息
 */
export interface UploadedFile {
  id: string;
  path: string; // 临时文件路径
  name: string; // 原始文件名
  size: number; // 文件大小（字节）
  type: string; // MIME 类型
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  // Sub Agent 结果报告标记
  isSubAgentResult?: boolean; // 标记这是主 Agent 对 Sub Agent 结果的报告
  subAgentTask?: string; // Sub Agent 的任务描述
  // 执行步骤（工具调用记录）
  executionSteps?: ExecutionStep[];
  // 上传的图片（用户消息）
  uploadedImages?: UploadedImage[];
  // 上传的文件（用户消息）
  uploadedFiles?: UploadedFile[];
  // 总执行时间（毫秒）- Agent 消息专用
  totalDuration?: number;
  // 发送时间（毫秒时间戳）
  // - 用户消息：自己的发送时间
  // - Agent 消息：对应的用户消息的发送时间
  sentAt?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

