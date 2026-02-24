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
  messages: Message[];           // 消息历史
  isLoading: boolean;            // 是否正在加载
  createdAt: number;             // 创建时间
  lastActiveAt: number;          // 最后活跃时间
  isLocked?: boolean;            // 是否锁定（定时任务专属 Tab）
  taskId?: string;               // 关联的定时任务 ID（如果是任务 Tab）
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
