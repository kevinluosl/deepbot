/**
 * 任务计划相关类型定义
 */

export interface TaskStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'error';
  retryCount: number;
  maxRetries: number;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface TaskPlan {
  id: string;
  description: string;
  steps: TaskStep[];
  currentStepIndex: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
}
