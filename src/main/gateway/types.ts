/**
 * Gateway 模块类型定义
 */

import type { AgentTab } from '../../types/agent-tab';
import type { Message } from '../../types/message';

// Runtime 重置选项
export interface ResetRuntimeOptions {
  reason?: string;
  recreate?: boolean;
}

// Tab 创建选项
export interface CreateTabOptions {
  type: 'default' | 'task' | 'connector';
  title: string;
  taskId?: string;
  conversationKey?: string;
  connectorId?: string;
  conversationId?: string;
}

// 消息队列项
export interface MessageQueueItem {
  content: string;
  displayContent?: string;
}

// 系统命令处理结果
export interface SystemCommandResult {
  success: boolean;
  message?: string;
  data?: any;
}

// Tab 通知数据
export interface TabNotificationData {
  tab: AgentTab;
  action: 'created' | 'updated' | 'closed';
}

// 欢迎消息检查结果
export interface WelcomeMessageCheck {
  shouldSend: boolean;
  reason: string;
}