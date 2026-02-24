/**
 * 任务调度器
 * 
 * 负责定时检查和触发任务
 */

import type { ScheduledTask, TaskSchedule } from './types';
import type { TaskStore } from './store';
import type { TaskExecutor } from './executor';
import { CronJob } from 'cron';

export class TaskScheduler {
  private store: TaskStore;
  private executor: TaskExecutor;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private checkInterval = 1000; // 每秒检查一次
  private readonly MIN_INTERVAL_MS = 10000; // 最短间隔 10 秒
  private executingTasks: Set<string> = new Set(); // 正在执行的任务 ID

  constructor(store: TaskStore, executor: TaskExecutor) {
    this.store = store;
    this.executor = executor;
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.running) {
      console.warn('[TaskScheduler] 调度器已在运行');
      return;
    }

    this.running = true;
    console.log('[TaskScheduler] 启动调度器');

    // 计算所有任务的下次执行时间
    this.recalculateAllTasks();

    // 启动定时检查
    this.timer = setInterval(() => {
      void this.checkAndExecute();
    }, this.checkInterval);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    console.log('[TaskScheduler] 停止调度器');

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 添加任务
   */
  addTask(task: ScheduledTask): void {
    // 计算下次执行时间
    const nextRunAt = this.calculateNextRun(task.schedule);
    if (nextRunAt) {
      this.store.update(task.id, { nextRunAt });
    }

    console.log(`[TaskScheduler] 添加任务: ${task.name} (${task.id})`);
  }

  /**
   * 删除任务
   */
  deleteTask(taskId: string): void {
    this.store.delete(taskId);
    console.log(`[TaskScheduler] 删除任务: ${taskId}`);
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId: string): void {
    this.store.update(taskId, { enabled: false });
    console.log(`[TaskScheduler] 暂停任务: ${taskId}`);
  }

  /**
   * 恢复任务
   */
  resumeTask(taskId: string): void {
    const task = this.store.read(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // 重新计算下次执行时间（不考虑上次执行时间，从现在开始）
    const nextRunAt = this.calculateNextRun(task.schedule);

    // 🔥 重置执行计数
    this.store.update(taskId, {
      enabled: true,
      nextRunAt: nextRunAt || undefined,
      runCount: 0,
    });

    console.log(`[TaskScheduler] 恢复任务: ${taskId}（已重置计数）`);
  }

  /**
   * 手动触发任务
   */
  async triggerTask(taskId: string): Promise<void> {
    const task = this.store.read(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    console.log(`[TaskScheduler] 手动触发任务: ${task.name}`);
    await this.executeTask(task);
  }

  /**
   * 检查并执行到期任务
   */
  private async checkAndExecute(): Promise<void> {
    if (!this.running) {
      return;
    }

    const now = new Date();
    const tasks = this.store.getEnabledTasks();

    for (const task of tasks) {
      // 🔥 跳过正在执行的任务
      if (this.executingTasks.has(task.id)) {
        continue;
      }

      if (task.nextRunAt && task.nextRunAt <= now) {
        console.log(`[TaskScheduler] 任务到期，开始执行: ${task.name}`);
        // 🔥 标记为执行中（不等待执行完成，立即继续检查其他任务）
        void this.executeTask(task);
      }
    }
  }

  /**
   * 执行任务
   */
  private async executeTask(task: ScheduledTask): Promise<void> {
    // 🔥 标记为执行中
    this.executingTasks.add(task.id);
    
    try {
      // 🔥 执行前再次确认任务是否存在且启用
      const currentTask = this.store.read(task.id);
      if (!currentTask) {
        console.log(`[TaskScheduler] 任务已被删除，跳过执行: ${task.name}`);
        return;
      }
      if (!currentTask.enabled) {
        console.log(`[TaskScheduler] 任务已被禁用，跳过执行: ${task.name}`);
        return;
      }

      // 执行任务
      const execution = await this.executor.execute(currentTask);

      // 🔥 执行完成后再次确认任务是否还存在（可能在执行过程中被删除）
      const taskAfterExecution = this.store.read(task.id);
      if (!taskAfterExecution) {
        console.log(`[TaskScheduler] 任务在执行过程中被删除: ${task.name}`);
        // 仍然保存执行记录
        this.store.addExecution(execution);
        return;
      }

      // 保存执行记录
      this.store.addExecution(execution);

      // 🔥 更新任务状态前，再次确认任务是否还存在
      // （Sub-Agent 可能在后台执行过程中删除了任务）
      const taskBeforeUpdate = this.store.read(task.id);
      if (!taskBeforeUpdate) {
        console.log(`[TaskScheduler] 任务在执行后被删除，跳过状态更新: ${task.name}`);
        return;
      }

      // 更新执行次数
      const newRunCount = taskAfterExecution.runCount + 1;
      
      // 🔥 检查是否达到最大执行次数
      const maxRuns = taskAfterExecution.schedule.maxRuns;
      if (maxRuns && newRunCount >= maxRuns) {
        console.log(`[TaskScheduler] 任务已达到最大执行次数 (${newRunCount}/${maxRuns})，自动停止: ${task.name}`);
        
        // 更新最后执行时间和次数，然后禁用任务
        this.store.update(task.id, {
          lastRunAt: execution.startTime,
          nextRunAt: undefined,
          runCount: newRunCount,
          enabled: false,
        });
        
        return;
      }

      // 🔥 执行完成后，重新计算下次执行时间（从当前时间开始计算）
      // 这样可以确保：上次执行完成 → 等待间隔时间 → 下次执行
      const nextRunAt = this.calculateNextRun(taskAfterExecution.schedule, new Date());
      
      // 更新最后执行时间、次数和下次执行时间
      this.store.update(task.id, {
        lastRunAt: execution.startTime,
        nextRunAt: nextRunAt || undefined,
        runCount: newRunCount,
      });
      
      console.log(`[TaskScheduler] 任务执行完成，下次执行时间: ${nextRunAt?.toISOString() || '无'}`);

      // 如果是一次性任务且已执行，禁用任务
      if (taskAfterExecution.schedule.type === 'once') {
        this.store.update(task.id, { enabled: false });
        console.log(`[TaskScheduler] 一次性任务已完成: ${task.name}`);
      }

      console.log(`[TaskScheduler] 任务执行完成: ${task.name} (${execution.status})`);
    } catch (error) {
      console.error(`[TaskScheduler] 任务执行失败: ${task.name}`, error);
    } finally {
      // 🔥 移除执行中标记
      this.executingTasks.delete(task.id);
    }
  }

  /**
   * 计算下次执行时间
   */
  private calculateNextRun(
    schedule: TaskSchedule,
    lastRun?: Date
  ): Date | null {
    const now = new Date();

    switch (schedule.type) {
      case 'once': {
        // 一次性任务
        const executeTime = new Date(schedule.executeAt!);
        return executeTime > now ? executeTime : null;
      }

      case 'interval': {
        // 周期性任务
        let intervalMs = schedule.intervalMs!;
        
        // 🔥 确保间隔不小于最小值
        if (intervalMs < this.MIN_INTERVAL_MS) {
          console.warn(`[TaskScheduler] 间隔时间 ${intervalMs}ms 小于最小值 ${this.MIN_INTERVAL_MS}ms，已自动调整`);
          intervalMs = this.MIN_INTERVAL_MS;
        }
        
        if (!lastRun) {
          // 🔥 首次执行：按照间隔时间延迟执行（不立即执行）
          if (schedule.startAt) {
            return new Date(schedule.startAt);
          } else {
            // 首次执行时间 = 当前时间 + 间隔时间
            return new Date(now.getTime() + intervalMs);
          }
        } else {
          // 下次执行 = 上次执行 + 间隔
          return new Date(lastRun.getTime() + intervalMs);
        }
      }

      case 'cron': {
        // Cron 表达式
        try {
          const cronJob = new CronJob(
            schedule.cronExpr!,
            () => {},
            null,
            false,
            schedule.timezone || 'Asia/Shanghai'
          );
          return cronJob.nextDate().toJSDate();
        } catch (error) {
          console.error('[TaskScheduler] Invalid cron expression:', schedule.cronExpr, error);
          return null;
        }
      }

      default:
        return null;
    }
  }

  /**
   * 重新计算所有任务的下次执行时间
   */
  private recalculateAllTasks(): void {
    const tasks = this.store.getEnabledTasks();
    let count = 0;

    for (const task of tasks) {
      const nextRunAt = this.calculateNextRun(task.schedule, task.lastRunAt);
      if (nextRunAt) {
        this.store.update(task.id, { nextRunAt });
        count++;
      }
    }

    console.log(`[TaskScheduler] 重新计算了 ${count} 个任务的执行时间`);
  }
}
