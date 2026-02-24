/**
 * Skill Manager 数据库操作
 */

import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { SKILLS_DB_PATH } from './constants';

/**
 * 初始化 Skill 数据库
 */
export function initDatabase(): Database.Database {
  // 确保目录存在
  const dbDir = path.dirname(SKILLS_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // 打开数据库
  const db = new Database(SKILLS_DB_PATH);
  
  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      version TEXT NOT NULL,
      enabled BOOLEAN DEFAULT 1,
      installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used DATETIME,
      usage_count INTEGER DEFAULT 0,
      repository TEXT,
      metadata TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
    CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
  `);
  
  return db;
}
