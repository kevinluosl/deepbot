/**
 * 环境配置管理
 */

import type Database from '../../shared/utils/sqlite-adapter';
import type { EnvironmentConfig } from './config-types';

/**
 * 保存环境配置
 */
export function saveEnvironmentConfig(db: Database.Database, config: EnvironmentConfig): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO environment_config 
    (id, name, is_installed, version, path, last_checked, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    config.id,
    config.name,
    config.isInstalled ? 1 : 0,
    config.version || null,
    config.path || null,
    config.lastChecked,
    config.error || null
  );
}

/**
 * 获取环境配置
 */
export function getEnvironmentConfig(db: Database.Database, name: string): EnvironmentConfig | null {
  const stmt = db.prepare(`
    SELECT * FROM environment_config WHERE name = ?
  `);

  const row = stmt.get(name) as any;
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    isInstalled: row.is_installed === 1,
    version: row.version,
    path: row.path,
    lastChecked: row.last_checked,
    error: row.error,
  };
}

/**
 * 获取所有环境配置
 */
export function getAllEnvironmentConfigs(db: Database.Database): EnvironmentConfig[] {
  const stmt = db.prepare(`
    SELECT * FROM environment_config ORDER BY name
  `);

  const rows = stmt.all() as any[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isInstalled: row.is_installed === 1,
    version: row.version,
    path: row.path,
    lastChecked: row.last_checked,
    error: row.error,
  }));
}

/**
 * 删除环境配置
 */
export function deleteEnvironmentConfig(db: Database.Database, name: string): void {
  const stmt = db.prepare(`
    DELETE FROM environment_config WHERE name = ?
  `);
  stmt.run(name);
}
