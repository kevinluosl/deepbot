/**
 * Agent Tab 类型定义
 */

import type { Message } from './message';

/**
 * Agent Tab 数据结构
 */
export interface AgentTab {
  id: string;                    // Tab ID（唯一标识）
  title: string;                 // Tab 标题
  type?: 'normal' | 'connector' | 'scheduled_task'; // Tab 类型
  messages: Message[];           // 消息历史
  isLoading: boolean;            // 是否正在加载
  createdAt: number;             // 创建时间
  lastActiveAt: number;          // 最后活跃时间
  isLocked?: boolean;            // 是否锁定（定时任务专属 Tab）
  taskId?: string;               // 关联的定时任务 ID（如果是任务 Tab）
  connectorId?: string;          // 连接器 ID（如果是连接器 Tab）
  conversationId?: string;       // 外部会话 ID（如果是连接器 Tab）
  conversationKey?: string;      // 会话唯一标识（用于查找 Tab）
  
  // 🔥 新增：Tab 独立配置
  memoryFile?: string | null;    // Memory 文件路径（NULL 表示使用默认）
  agentName?: string | null;     // Agent 名字（NULL 表示继承主 Agent）
  isPersistent?: boolean;        // 是否持久化（手动创建的 Tab 为 true）
}

/**
 * 创建 Tab 请求
 */
export interface CreateTabRequest {
  title?: string;                // 可选标题（默认为 "Agent {n}"）
}

/**
 * 创建 Tab 响应
 */
export interface CreateTabResponse {
  success: boolean;
  tab?: AgentTab;
  error?: string;
}

/**
 * 关闭 Tab 请求
 */
export interface CloseTabRequest {
  tabId: string;
}

/**
 * 关闭 Tab 响应
 */
export interface CloseTabResponse {
  success: boolean;
  error?: string;
}

/**
 * 获取所有 Tab 响应
 */
export interface GetTabsResponse {
  success: boolean;
  tabs?: AgentTab[];
  error?: string;
}
