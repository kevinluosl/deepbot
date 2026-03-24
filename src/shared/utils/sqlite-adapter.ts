/**
 * SQLite 适配层
 * 
 * 使用 Node.js 内置的 node:sqlite 模块（Node.js 22.5+）
 * 提供与 better-sqlite3 兼容的 API
 */

// @ts-ignore - node:sqlite 在 Node.js 22.5+ 可用，但类型定义可能不完整
import { DatabaseSync } from 'node:sqlite';

/**
 * 数据库类（兼容 better-sqlite3 API）
 */
export class Database {
  private db: DatabaseSync;

  constructor(path: string) {
    // @ts-ignore
    this.db = new DatabaseSync(path);
  }

  /**
   * 执行 SQL 语句（无返回值）
   */
  exec(sql: string): this {
    this.db.exec(sql);
    return this;
  }

  /**
   * 设置 pragma（兼容 better-sqlite3）
   * node:sqlite 没有直接的 pragma 方法，通过 SQL 执行
   */
  pragma(pragma: string): any {
    const result = this.db.prepare(`PRAGMA ${pragma}`).all();
    return result.length === 1 ? result[0] : result;
  }

  /**
   * 准备 SQL 语句
   */
  prepare(sql: string): Statement {
    return new Statement(this.db.prepare(sql));
  }

  /**
   * 创建事务（兼容 better-sqlite3）
   * node:sqlite 没有事务包装器，手动实现
   */
  transaction(fn: (...args: any[]) => any): (...args: any[]) => any {
    return (...args: any[]) => {
      this.exec('BEGIN');
      try {
        const result = fn(...args);
        this.exec('COMMIT');
        return result;
      } catch (error) {
        this.exec('ROLLBACK');
        throw error;
      }
    };
  }

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Statement 类（兼容 better-sqlite3 API）
 * node:sqlite 的 Statement API 基本一致，这里做简单包装
 */
class Statement {
  constructor(private stmt: any) {}

  get(...params: any[]): any {
    return this.stmt.get(...params);
  }

  all(...params: any[]): any[] {
    return this.stmt.all(...params);
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    return this.stmt.run(...params);
  }
}

/**
 * Database 命名空间（兼容 better-sqlite3 类型）
 */
export namespace Database {
  export type Database = InstanceType<typeof Database>;
  export type Statement = InstanceType<typeof Statement>;
  export type RunResult = { changes: number; lastInsertRowid: number | bigint };
}

export default Database;
