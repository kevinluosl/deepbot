/**
 * 通知系统类型定义
 * 
 * 用于解耦 AgentRuntime 和 Gateway 之间的循环依赖
 */

/**
 * Sub Agent 执行步骤
 */
export interface SubAgentStep {
  stepNumber: number;
  toolName: string;
  toolParams?: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  endedAt?: number;
  result?: string;
  error?: string;
  description?: string; // 人类可读的步骤描述
}

/**
 * Sub Agent 通知类型
 */
export interface SubAgentNotification {
  type: 'subagent-completion' | 'subagent-status-update' | 'subagent-step-update';
  subAgentId: string;
  task: string; // 完整的任务描述（包含内部指令）
  taskLabel?: string; // 用户友好的任务标签（用于前台显示）
  status: 'completed' | 'failed' | 'pending' | 'running' | 'timeout';
  error?: string;
  timestamp: number;
  progress?: number;
  currentStep?: string;
  steps?: SubAgentStep[]; // 执行步骤列表
  currentStepNumber?: number; // 当前步骤编号
  finalResponse?: string; // Sub Agent 的最终响应（包含提取的信息）
}

/**
 * 通知发送器接口
 * 
 * AgentRuntime 依赖此接口发送通知，而不是直接依赖 Gateway
 */
export interface INotificationSender {
  /**
   * 发送 Sub Agent 完成通知
   * 
   * @param notification - 通知内容
   */
  sendSubAgentNotification(notification: SubAgentNotification): void;
}
