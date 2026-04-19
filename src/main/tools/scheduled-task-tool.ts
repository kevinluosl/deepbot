/**
 * Scheduled Task Tool - 定时任务管理工具
 * 
 * 职责：
 * - 创建定时任务（Main Agent 提供解析后的参数）
 * - 列出定时任务
 * - 删除定时任务
 * - 暂停/恢复任务
 * - 手动触发任务
 * - 查看执行历史
 * 
 * 技术选型：
 * - SQLite: 存储任务数据
 * - cron: Cron 表达式解析
 * - Sub-Agent: 执行任务
 * 
 * @example
 * ```typescript
 * const tool = createScheduledTaskTool(gateway);
 * 
 * // 创建任务
 * await tool.execute('create', {
 *   name: '每日报告',
 *   description: '生成每日工作报告',
 *   schedule: { type: 'cron', cronExpr: '0 9 * * *' }
 * });
 * 
 * // 列出任务
 * await tool.execute('list', {});
 * ```
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { Type } from '@sinclair/typebox';
import { TaskStore } from '../scheduled-tasks/store';
import { TaskScheduler } from '../scheduled-tasks/scheduler';
import { TaskExecutor } from '../scheduled-tasks/executor';
import type { Gateway } from '../gateway';
import type { TaskSchedule, TaskCreateInput } from '../scheduled-tasks/types';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { TOOL_NAMES } from './tool-names';

// ==================== 全局实例 ====================

let scheduler: TaskScheduler | null = null;
let executor: TaskExecutor | null = null;
let gatewayInstance: Gateway | null = null;

// ==================== 配置 ====================

const MAX_TASKS = 10; // 最多允许创建 10 个定时任务

/**
 * 设置 Gateway 实例并启动调度器
 */
export function setGatewayInstance(gateway: Gateway): void {
  gatewayInstance = gateway;
  
  // 🔥 同时设置给 TaskExecutor
  const { setGatewayForExecutor } = require('../scheduled-tasks/executor');
  setGatewayForExecutor(gateway);
  
  // 🔥 异步启动调度器（避免阻塞 Gateway 初始化）
  // 延迟 2 秒，确保其他数据库初始化完成
  setTimeout(async () => {
    try {
      // 🔥 使用 retry 工具重试启动（最多 3 次）
      const { retry } = await import('../../shared/utils/async-utils');
      await retry(
        async () => {
          getScheduler();
        },
        {
          maxRetries: 3,
          delay: 1000,
          onRetry: (attempt, error) => {
            console.warn(`[Scheduled Task] ⚠️ 启动调度器失败 (尝试 ${attempt}/3):`, error instanceof Error ? error.message : error);
          }
        }
      );
    } catch (error) {
      // 🔥 最终失败后静默处理，不影响用户使用
      console.error('[Scheduled Task] ❌ 调度器启动失败（已达最大重试次数），定时任务功能将不可用');
    }
  }, 2000);
}

/**
 * 获取 Gateway 实例
 */
function getGatewayInstance(): Gateway {
  if (!gatewayInstance) {
    throw new Error('Gateway 实例未设置，请先调用 setGatewayInstance()');
  }
  return gatewayInstance;
}

/**
 * 获取或创建 TaskScheduler 实例
 */
function getScheduler(): TaskScheduler {
  if (!scheduler) {
    const taskStore = TaskStore.getInstance();
    const taskExecutor = getExecutor();
    scheduler = new TaskScheduler(taskStore, taskExecutor);
    scheduler.start(); // 启动调度器
  }
  return scheduler;
}

/**
 * 获取或创建 TaskExecutor 实例
 */
function getExecutor(): TaskExecutor {
  if (!executor) {
    executor = new TaskExecutor();
  }
  return executor;
}

// ==================== Tool 创建 ====================

/**
 * 创建 Scheduled Task Tool
 * 
 * @returns Scheduled Task Tool
 */
export function createScheduledTaskTool(): AgentTool {
  return {
    name: TOOL_NAMES.SCHEDULED_TASK,
    label: 'Scheduled Task',
    description: '定时任务管理工具，用于创建、管理和执行定时任务。支持三种调度类型：once（一次性）、interval（周期性）、cron（Cron表达式）。功能：create, list, delete, pause, resume, trigger, history。详细说明请参考 TOOLS.md',
    
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('create', { description: '创建新任务' }),
        Type.Literal('list', { description: '列出所有任务' }),
        Type.Literal('update', { description: '更新任务配置' }),
        Type.Literal('updateSchedule', { description: '更新任务调度' }),
        Type.Literal('delete', { description: '删除任务' }),
        Type.Literal('pause', { description: '暂停任务' }),
        Type.Literal('resume', { description: '恢复任务' }),
        Type.Literal('trigger', { description: '手动触发任务' }),
        Type.Literal('history', { description: '查看任务执行历史' }),
      ]),
      
      // create 操作参数
      name: Type.Optional(Type.String({ description: '任务名称（create 操作）' })),
      description: Type.Optional(Type.String({ description: '任务描述（create 操作）' })),
      schedule: Type.Optional(Type.Object({
        type: Type.Union([
          Type.Literal('once', { description: '一次性任务' }),
          Type.Literal('interval', { description: '间隔重复任务' }),
          Type.Literal('cron', { description: 'Cron 表达式任务' }),
        ]),
        executeAt: Type.Optional(Type.Number({ description: '执行时间戳（once 类型）' })),
        intervalMs: Type.Optional(Type.Number({ description: '间隔毫秒数（interval 类型）' })),
        startAt: Type.Optional(Type.Number({ description: '开始时间戳（interval 类型）' })),
        cronExpr: Type.Optional(Type.String({ description: 'Cron 表达式（cron 类型）' })),
        timezone: Type.Optional(Type.String({ description: '时区（cron 类型，默认 Asia/Shanghai）' })),
        maxRuns: Type.Optional(Type.Number({ description: '最大执行次数（可选，不设置则无限执行）' })),
      }, { description: '调度配置（create 操作）' })),
      
      // 其他操作参数
      taskId: Type.Optional(Type.String({ description: '任务 ID（delete/pause/resume/trigger/history/update/updateSchedule 操作）' })),
      scheduleText: Type.Optional(Type.String({ description: '调度方式的自然语言描述（updateSchedule 操作）' })),
      enabled: Type.Optional(Type.Boolean({ description: '是否只列出已启用的任务（list 操作）' })),
      limit: Type.Optional(Type.Number({ description: '历史记录数量限制（history 操作，默认 10）' })),
    }),
    
    execute: async (toolCallId, params, signal, onUpdate) => {
      try {
        const { action, name, description, schedule, taskId, enabled, limit } = params as any;
        
        const taskStore = TaskStore.getInstance();
        const taskScheduler = getScheduler();
        
        let result: any;
        
        switch (action) {
          case 'create': {
            // 创建任务
            if (!name || !description || !schedule) {
              throw new Error('缺少参数: name, description 或 schedule');
            }
            
            // 🔥 检查任务数量限制
            const existingTasks = taskStore.list();
            if (existingTasks.length >= MAX_TASKS) {
              throw new Error(`已达到定时任务数量上限（${MAX_TASKS}个）。请先删除一些任务后再创建新任务。`);
            }
            
            // 验证 schedule 参数
            validateSchedule(schedule);
            
            const input: TaskCreateInput = {
              name,
              description,
              schedule: schedule as TaskSchedule,
            };
            
            const task = taskStore.create(input);
            taskScheduler.addTask(task);
            
            result = {
              success: true,
              task: {
                id: task.id,
                name: task.name,
                description: task.description,
                schedule: task.schedule,
                enabled: task.enabled,
                createdAt: task.createdAt.getTime(),
                nextRunAt: task.nextRunAt?.getTime(),
              },
              message: `任务 "${name}" 创建成功（当前 ${existingTasks.length + 1}/${MAX_TASKS}）`,
            };
            
            break;
          }
          
          case 'list': {
            // 列出任务
            const filter = enabled !== undefined ? { enabled } : undefined;
            const tasks = taskStore.list(filter);
            
            result = {
              success: true,
              tasks: tasks.map(task => ({
                id: task.id,
                name: task.name,
                description: task.description,
                schedule: task.schedule,
                enabled: task.enabled,
                createdAt: task.createdAt.getTime(),
                lastRunAt: task.lastRunAt?.getTime(),
                nextRunAt: task.nextRunAt?.getTime(),
                runCount: task.runCount,
              })),
              count: tasks.length,
              message: tasks.length === 0 
                ? '当前没有任何任务' 
                : `共有 ${tasks.length} 个任务`,
            };
            
            break;
          }
          
          case 'delete': {
            // 删除任务
            if (!taskId) {
              throw new Error('缺少参数: taskId');
            }
            
            const task = taskStore.read(taskId);
            if (!task) {
              throw new Error(`任务不存在: ${taskId}`);
            }
            
            taskScheduler.deleteTask(taskId);
            
            // 关闭对应的任务 Tab（会同时销毁 AgentRuntime）
            try {
              const gateway = getGatewayInstance();
              const taskTabId = `task-tab-${taskId}`;
              const tab = gateway.getAllTabs().find(t => t.id === taskTabId);
              if (tab) {
                await gateway.closeTab(taskTabId);
              }
            } catch (error) {
              // 忽略关闭失败
            }
            
            result = {
              success: true,
              message: `任务 "${task.name}" 已删除`,
            };
            
            break;
          }
          
          case 'pause': {
            // 暂停任务
            if (!taskId) {
              throw new Error('缺少参数: taskId');
            }
            
            const task = taskStore.read(taskId);
            if (!task) {
              throw new Error(`任务不存在: ${taskId}`);
            }
            
            taskScheduler.pauseTask(taskId);
            
            // 重置对应任务 Tab 的 AgentRuntime（停止当前执行，但保留 Tab）
            try {
              const gateway = getGatewayInstance();
              const taskTabId = `task-tab-${taskId}`;
              const tab = gateway.getAllTabs().find(t => t.id === taskTabId);
              if (tab) {
                await gateway.resetSessionRuntime(taskTabId, {
                  reason: '暂停定时任务',
                  recreate: false,
                });
              }
            } catch (error) {
              // 忽略重置失败
            }
            
            result = {
              success: true,
              message: `任务 "${task.name}" 已暂停`,
            };
            
            break;
          }
          
          case 'resume': {
            // 恢复任务
            if (!taskId) {
              throw new Error('缺少参数: taskId');
            }
            
            const task = taskStore.read(taskId);
            if (!task) {
              throw new Error(`任务不存在: ${taskId}`);
            }
            
            taskScheduler.resumeTask(taskId);
            
            result = {
              success: true,
              message: `任务 "${task.name}" 已恢复`,
            };
            
            break;
          }
          
          case 'update': {
            // 更新任务内容
            if (!taskId) {
              throw new Error('缺少参数: taskId');
            }
            
            if (!description) {
              throw new Error('缺少参数: description');
            }
            
            const task = taskStore.read(taskId);
            if (!task) {
              throw new Error(`任务不存在: ${taskId}`);
            }
            
            // 更新任务描述
            taskStore.update(taskId, { description });
            
            result = {
              success: true,
              message: `任务 "${task.name}" 内容已更新`,
            };
            
            break;
          }
          
          case 'updateSchedule': {
            // 更新调度方式
            if (!taskId) {
              throw new Error('缺少参数: taskId');
            }
            
            const { scheduleText } = params as any;
            if (!scheduleText) {
              throw new Error('缺少参数: scheduleText');
            }
            
            const task = taskStore.read(taskId);
            if (!task) {
              throw new Error(`任务不存在: ${taskId}`);
            }
            
            // 解析自然语言调度描述
            const newSchedule = parseScheduleText(scheduleText);
            
            // 验证新的调度配置
            validateSchedule(newSchedule);
            
            // 更新任务调度配置
            taskStore.update(taskId, { schedule: newSchedule });
            
            // 重新计算下次执行时间
            const taskScheduler = getScheduler();
            const updatedTask = taskStore.read(taskId);
            if (updatedTask) {
              taskScheduler.addTask(updatedTask);
            }
            
            result = {
              success: true,
              message: `任务 "${task.name}" 调度方式已更新`,
            };
            
            break;
          }
          
          case 'trigger': {
            // 手动触发任务
            if (!taskId) {
              throw new Error('缺少参数: taskId');
            }
            
            const task = taskStore.read(taskId);
            if (!task) {
              throw new Error(`任务不存在: ${taskId}`);
            }
            
            // 异步触发任务（不等待完成）
            taskScheduler.triggerTask(taskId).catch(error => {
              console.error(`[Scheduled Task] 任务触发失败: ${task.name}`, error);
            });
            
            result = {
              success: true,
              message: `任务 "${task.name}" 已触发执行`,
            };
            
            break;
          }
          
          case 'history': {
            // 查看执行历史
            if (!taskId) {
              throw new Error('缺少参数: taskId');
            }
            
            const task = taskStore.read(taskId);
            if (!task) {
              throw new Error(`任务不存在: ${taskId}`);
            }
            
            const executions = taskStore.getExecutions(taskId, limit || 10);
            
            result = {
              success: true,
              task: {
                id: task.id,
                name: task.name,
                runCount: task.runCount,
              },
              executions: executions.map(exec => ({
                id: exec.id,
                startTime: exec.startTime.getTime(),
                endTime: exec.endTime.getTime(),
                duration: exec.duration,
                status: exec.status,
                result: exec.result,
                error: exec.error,
              })),
              count: executions.length,
              message: `任务 "${task.name}" 共有 ${executions.length} 条执行记录`,
            };
            
            break;
          }
          
          default:
            throw new Error(`未知操作: ${action}`);
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          details: result,
        };
      } catch (error) {
        console.error('[Scheduled Task] 执行失败:', error);
        
        return {
          content: [
            {
              type: 'text',
              text: `错误: ${getErrorMessage(error)}`,
            },
          ],
          details: { error: getErrorMessage(error) },
          isError: true,
        };
      }
    },
  };
}

/**
 * 验证调度配置
 */
function validateSchedule(schedule: any): void {
  if (!schedule.type) {
    throw new Error('schedule.type 是必需的');
  }
  
  const MIN_INTERVAL_MS = 10000; // 最短间隔 10 秒
  
  switch (schedule.type) {
    case 'once':
      if (!schedule.executeAt) {
        throw new Error('once 类型需要 executeAt 参数');
      }
      break;
    
    case 'interval':
      if (!schedule.intervalMs) {
        throw new Error('interval 类型需要 intervalMs 参数');
      }
      
      // 🔥 限制最短间隔为 10 秒
      if (schedule.intervalMs < MIN_INTERVAL_MS) {
        schedule.intervalMs = MIN_INTERVAL_MS;
      }
      break;
    
    case 'cron':
      if (!schedule.cronExpr) {
        throw new Error('cron 类型需要 cronExpr 参数');
      }
      // 简单验证 cron 表达式格式
      const parts = schedule.cronExpr.split(' ');
      if (parts.length < 5 || parts.length > 6) {
        throw new Error('无效的 cron 表达式格式');
      }
      break;
    
    default:
      throw new Error(`未知的调度类型: ${schedule.type}`);
  }
}

/**
 * 解析自然语言调度描述
 * 
 * 支持的格式：
 * - "每隔10秒执行一次"
 * - "每隔5分钟执行一次，最多100次"
 * - "每隔5分钟执行一次，最多执行100次"
 * - "每天早上9点"
 * - "Cron表达式：0 9 * * *"
 */
function parseScheduleText(text: string): TaskSchedule {
  const lowerText = text.toLowerCase().trim();
  
  // 提取最大执行次数（支持"最多30次"和"最多执行30次"）
  let maxRuns: number | undefined;
  const maxRunsMatch = text.match(/最多(?:执行)?(\d+)次/);
  if (maxRunsMatch) {
    maxRuns = parseInt(maxRunsMatch[1], 10);
  }
  
  // 匹配 Cron 表达式
  const cronMatch = text.match(/cron[表达式]?[：:]\s*(.+?)(?:，|$)/i);
  if (cronMatch) {
    return {
      type: 'cron',
      cronExpr: cronMatch[1].trim(),
      timezone: 'Asia/Shanghai',
      maxRuns,
    };
  }
  
  // 匹配"每隔X秒/分钟/小时"
  const intervalMatch = text.match(/每隔?(\d+)(秒|分钟|小时)/);
  if (intervalMatch) {
    const value = parseInt(intervalMatch[1], 10);
    const unit = intervalMatch[2];
    
    let intervalMs: number;
    if (unit === '秒') {
      intervalMs = value * 1000;
    } else if (unit === '分钟') {
      intervalMs = value * 60 * 1000;
    } else { // 小时
      intervalMs = value * 60 * 60 * 1000;
    }
    
    return {
      type: 'interval',
      intervalMs,
      maxRuns,
    };
  }
  
  // 匹配"每天X点"或"每天早上/下午/晚上X点"
  const dailyMatch = text.match(/每天(?:早上|上午|下午|晚上)?(\d+)点/);
  if (dailyMatch) {
    let hour = parseInt(dailyMatch[1], 10);
    
    // 处理早上/下午/晚上
    if (text.includes('下午') && hour < 12) {
      hour += 12;
    } else if (text.includes('晚上') && hour < 12) {
      hour += 12;
    }
    
    return {
      type: 'cron',
      cronExpr: `0 ${hour} * * *`,
      timezone: 'Asia/Shanghai',
      maxRuns,
    };
  }
  
  // 如果无法解析，抛出错误
  throw new Error(`无法解析调度描述："${text}"。支持的格式：每隔10秒、每天早上9点、Cron表达式：0 9 * * *`);
}

/**
 * 停止调度器（用于应用关闭时）
 */
export function stopScheduler(): void {
  if (scheduler) {
    scheduler.stop();
  }
  
  // TaskStore 使用单例模式，不需要手动关闭
  // 数据库连接会在应用退出时自动关闭
}


// ── ToolPlugin 接口 ──────────────────────────────────────────────────────────

export const scheduledTaskToolPlugin: ToolPlugin = {
  metadata: {
    id: 'scheduled-task',
    name: '定时任务',
    version: '1.0.0',
    description: '定时任务管理工具，支持一次性、周期性和 Cron 表达式调度',
    author: 'DeepBot',
    category: 'system',
    tags: ['scheduled', 'task', 'cron', 'timer'],
  },
  create: (_options: ToolCreateOptions) => createScheduledTaskTool(),
};
