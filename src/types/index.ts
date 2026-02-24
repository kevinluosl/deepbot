/**
 * DeepBot 类型定义
 */

// 任务状态
export type TaskStatus = 
  | 'pending'    // 等待执行
  | 'running'    // 正在执行
  | 'completed'  // 已完成
  | 'failed'     // 失败
  | 'timeout';   // 超时

// 主任务
export interface MainTask {
  id: string;
  name: string;
  status: TaskStatus;
  startTime: Date;
  estimatedEndTime?: Date;
  subTasks: SubTask[];
}

// 子任务
export interface SubTask {
  id: string;
  description: string;
  status: TaskStatus;
  currentStep?: string;
  progress?: number; // 0-100
  startTime: Date;
  endTime?: Date;
  error?: string;
}

// 消息
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// 配置
export interface Config {
  qwen: {
    apiKey: string;
    model: string;
    baseURL: string;
  };
}
