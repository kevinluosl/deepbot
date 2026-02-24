/**
 * 定时任务类型定义
 */

/**
 * 调度配置
 */
export interface TaskSchedule {
  type: 'once' | 'interval' | 'cron';
  
  // once: 一次性任务
  executeAt?: number;           // 执行时间戳
  
  // interval: 周期性任务
  intervalMs?: number;          // 间隔毫秒数
  startAt?: number;             // 开始时间戳
  
  // cron: Cron 表达式
  cronExpr?: string;            // Cron 表达式
  timezone?: string;            // 时区
  
  // 通用：执行次数限制
  maxRuns?: number;             // 最大执行次数（可选，不设置则无限执行）
}

/**
 * 定时任务
 */
export interface ScheduledTask {
  id: string;                   // 任务 ID
  name: string;                 // 任务名称
  description: string;          // 任务描述（自然语言）
  schedule: TaskSchedule;       // 调度配置
  enabled: boolean;             // 是否启用
  createdAt: Date;             // 创建时间
  updatedAt: Date;             // 更新时间
  lastRunAt?: Date;            // 上次执行时间
  nextRunAt?: Date;            // 下次执行时间
  runCount: number;            // 执行次数
}

/**
 * 任务执行记录
 */
export interface TaskExecution {
  id: string;                   // 记录 ID
  taskId: string;               // 任务 ID
  taskName: string;             // 任务名称
  startTime: Date;              // 开始时间
  endTime: Date;                // 结束时间
  duration: number;             // 执行时长（毫秒）
  status: 'success' | 'failed'; // 执行状态
  result?: string;              // 执行结果
  error?: string;               // 错误信息
}

/**
 * 任务过滤器
 */
export interface TaskFilter {
  enabled?: boolean;            // 是否启用
  scheduleType?: 'once' | 'interval' | 'cron'; // 调度类型
}

/**
 * 任务创建输入
 */
export interface TaskCreateInput {
  name: string;
  description: string;
  schedule: TaskSchedule;
}

/**
 * 任务更新输入
 */
export interface TaskUpdateInput {
  name?: string;
  description?: string;
  schedule?: TaskSchedule;
  enabled?: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  runCount?: number;
}
