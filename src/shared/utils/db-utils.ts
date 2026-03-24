/**
 * 数据库工具函数
 * 
 * 提供通用的数据库操作辅助函数，减少重复代码
 */

import type Database from './sqlite-adapter';

/**
 * 从键值对表中批量获取配置
 * 
 * @param db 数据库实例
 * @param tableName 表名
 * @param keys 要获取的键列表
 * @returns 键值对对象
 * 
 * @example
 * const values = getKeyValueBatch(db, 'workspace_settings', ['workspaceDir', 'scriptDir']);
 * // { workspaceDir: '/path/to/workspace', scriptDir: '/path/to/scripts' }
 */
export function getKeyValueBatch(
  db: Database.Database,
  tableName: string,
  keys: string[]
): Record<string, string | null> {
  const stmt = db.prepare(`SELECT value FROM ${tableName} WHERE key = ?`);
  
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    const row = stmt.get(key) as any;
    result[key] = row?.value || null;
  }
  
  return result;
}

/**
 * 保存键值对到数据库
 * 
 * @param db 数据库实例
 * @param tableName 表名
 * @param key 键
 * @param value 值
 * 
 * @example
 * setKeyValue(db, 'workspace_settings', 'workspaceDir', '/path/to/workspace');
 */
export function setKeyValue(
  db: Database.Database,
  tableName: string,
  key: string,
  value: string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${tableName} (key, value)
    VALUES (?, ?)
  `);
  stmt.run(key, value);
}

/**
 * 批量保存键值对到数据库
 * 
 * @param db 数据库实例
 * @param tableName 表名
 * @param entries 键值对数组
 * 
 * @example
 * setKeyValueBatch(db, 'workspace_settings', [
 *   ['workspaceDir', '/path/to/workspace'],
 *   ['scriptDir', '/path/to/scripts']
 * ]);
 */
export function setKeyValueBatch(
  db: Database.Database,
  tableName: string,
  entries: Array<[string, string]>
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ${tableName} (key, value)
    VALUES (?, ?)
  `);
  
  const transaction = db.transaction(() => {
    for (const [key, value] of entries) {
      stmt.run(key, value);
    }
  });
  
  transaction();
}

/**
 * 从数据库获取单条记录
 * 
 * @param db 数据库实例
 * @param tableName 表名
 * @param condition WHERE 条件（不含 WHERE 关键字）
 * @param params 参数
 * @returns 查询结果或 null
 * 
 * @example
 * const config = getSingleRecord(db, 'model_config', 'id = ?', [1]);
 */
export function getSingleRecord<T = any>(
  db: Database.Database,
  tableName: string,
  condition: string,
  params: any[] = []
): T | null {
  const stmt = db.prepare(`SELECT * FROM ${tableName} WHERE ${condition}`);
  const row = stmt.get(...params) as any;
  return row || null;
}

/**
 * 删除记录
 * 
 * @param db 数据库实例
 * @param tableName 表名
 * @param condition WHERE 条件（不含 WHERE 关键字）
 * @param params 参数
 * @returns 删除的行数
 * 
 * @example
 * deleteRecord(db, 'tasks', 'id = ?', [taskId]);
 */
export function deleteRecord(
  db: Database.Database,
  tableName: string,
  condition: string,
  params: any[] = []
): number {
  const stmt = db.prepare(`DELETE FROM ${tableName} WHERE ${condition}`);
  const result = stmt.run(...params);
  return result.changes;
}
