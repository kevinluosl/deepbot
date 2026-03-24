/**
 * 定时任务存储
 * 
 * 使用 SQLite 持久化任务数据
 */

import Database from '../../shared/utils/sqlite-adapter';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';
import { ensureDirectoryExists } from '../../shared/utils/fs-utils';
import { generateTaskId } from '../../shared/utils/id-generator';
import { safeJsonParse } from '../../shared/utils/json-utils';
import { isDockerMode, getDbDir } from '../../shared/utils/docker-utils';
import type {
  ScheduledTask,
  TaskExecution,
  TaskFilter,
  TaskCreateInput,
  TaskUpdateInput,
} from './types';

export class TaskStore {
  private db: Database.Database;
  private static instance: TaskStore | null = null;

  private constructor(dbPath?: string) {
    // Docker 模式：使用 DB_DIR 环境变量，fallback 到 /data/db
    // 普通模式：默认 ~/.deepbot/scheduled-tasks.db
    const dbDir = getDbDir();
    const defaultPath = isDockerMode()
      ? join(dbDir, 'scheduled-tasks.db')
      : join(homedir(), '.deepbot', 'scheduled-tasks.db');
    const path = dbPath || defaultPath;

    // 确保目录存在
    const dir = isDockerMode() ? dbDir : join(homedir(), '.deepbot');
    ensureDirectoryExists(dir);

    // 🔥 检查并清理孤立的 WAL 锁文件
    // 如果主数据库文件不存在，但 WAL 锁文件存在，则删除锁文件
    if (!existsSync(path)) {
      const shmPath = `${path}-shm`;
      const walPath = `${path}-wal`;
      
      if (existsSync(shmPath)) {
        console.warn('[TaskStore] 检测到孤立的 -shm 文件，正在清理...');
        try {
          require('node:fs').unlinkSync(shmPath);
          console.info('[TaskStore] ✅ 已清理 -shm 文件');
        } catch (error) {
          console.error('[TaskStore] ❌ 清理 -shm 文件失败:', error);
        }
      }
      
      if (existsSync(walPath)) {
        console.warn('[TaskStore] 检测到孤立的 -wal 文件，正在清理...');
        try {
          require('node:fs').unlinkSync(walPath);
          console.info('[TaskStore] ✅ 已清理 -wal 文件');
        } catch (error) {
          console.error('[TaskStore] ❌ 清理 -wal 文件失败:', error);
        }
      }
    }

    // 打开数据库
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');

    // 初始化表
    this.initTables();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): TaskStore {
    if (!TaskStore.instance) {
      TaskStore.instance = new TaskStore();
    }
    return TaskStore.instance;
  }

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    // 任务表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        schedule_type TEXT NOT NULL,
        schedule_data TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_run_at INTEGER,
        next_run_at INTEGER,
        run_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    // 执行记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        task_name TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        status TEXT NOT NULL,
        result TEXT,
        error TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_enabled ON tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run_at);
      CREATE INDEX IF NOT EXISTS idx_executions_task_id ON executions(task_id);
    `);
  }

  /**
   * 创建任务
   */
  create(input: TaskCreateInput): ScheduledTask {
    const id = generateTaskId();
    const now = Date.now();

    const task: ScheduledTask = {
      id,
      name: input.name,
      description: input.description,
      schedule: input.schedule,
      enabled: true,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      runCount: 0,
    };

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, name, description, schedule_type, schedule_data,
        enabled, created_at, updated_at, run_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.name,
      task.description,
      task.schedule.type,
      JSON.stringify(task.schedule),
      task.enabled ? 1 : 0,
      now,
      now,
      task.runCount
    );

    return task;
  }

  /**
   * 读取任务
   */
  read(taskId: string): ScheduledTask | null {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `);

    const row = stmt.get(taskId) as any;
    if (!row) {
      return null;
    }

    return this.rowToTask(row);
  }

  /**
   * 更新任务
   */
  update(taskId: string, updates: TaskUpdateInput): ScheduledTask {
    const task = this.read(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // 合并更新
    const updated: ScheduledTask = {
      ...task,
      ...updates,
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      UPDATE tasks SET
        name = ?,
        description = ?,
        schedule_type = ?,
        schedule_data = ?,
        enabled = ?,
        updated_at = ?,
        last_run_at = ?,
        next_run_at = ?,
        run_count = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.name,
      updated.description,
      updated.schedule.type,
      JSON.stringify(updated.schedule),
      updated.enabled ? 1 : 0,
      updated.updatedAt.getTime(),
      updated.lastRunAt?.getTime() || null,
      updated.nextRunAt?.getTime() || null,
      updated.runCount,
      taskId
    );

    return updated;
  }

  /**
   * 删除任务
   */
  delete(taskId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM tasks WHERE id = ?
    `);

    stmt.run(taskId);
  }

  /**
   * 列出任务
   */
  list(filter?: TaskFilter): ScheduledTask[] {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (filter?.enabled !== undefined) {
      sql += ' AND enabled = ?';
      params.push(filter.enabled ? 1 : 0);
    }

    if (filter?.scheduleType) {
      sql += ' AND schedule_type = ?';
      params.push(filter.scheduleType);
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.rowToTask(row));
  }

  /**
   * 获取启用的任务
   */
  getEnabledTasks(): ScheduledTask[] {
    return this.list({ enabled: true });
  }

  /**
   * 添加执行记录
   */
  addExecution(execution: TaskExecution): void {
    const stmt = this.db.prepare(`
      INSERT INTO executions (
        id, task_id, task_name, start_time, end_time,
        duration, status, result, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      execution.id,
      execution.taskId,
      execution.taskName,
      execution.startTime.getTime(),
      execution.endTime.getTime(),
      execution.duration,
      execution.status,
      execution.result || null,
      execution.error || null
    );
  }

  /**
   * 获取执行历史
   */
  getExecutions(taskId: string, limit: number = 10): TaskExecution[] {
    const stmt = this.db.prepare(`
      SELECT * FROM executions
      WHERE task_id = ?
      ORDER BY start_time DESC
      LIMIT ?
    `);

    const rows = stmt.all(taskId, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      taskName: row.task_name,
      startTime: new Date(row.start_time),
      endTime: new Date(row.end_time),
      duration: row.duration,
      status: row.status,
      result: row.result,
      error: row.error,
    }));
  }

  /**
   * 清理旧的执行记录
   */
  cleanupOldExecutions(daysToKeep: number = 30): number {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    const stmt = this.db.prepare(`
      DELETE FROM executions WHERE start_time < ?
    `);

    const result = stmt.run(cutoffTime);
    return result.changes;
  }

  /**
   * 将数据库行转换为任务对象
   */
  private rowToTask(row: any): ScheduledTask {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      schedule: safeJsonParse<any>(row.schedule_data, { type: 'once', datetime: new Date().toISOString() }),
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : undefined,
      nextRunAt: row.next_run_at ? new Date(row.next_run_at) : undefined,
      runCount: row.run_count,
    };
  }

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close();
  }
}
