/**
 * 图片用量统计模块
 * 
 * 功能：
 * - 记录每日图片生成用量（按提供商累加）
 * - 查询指定日期范围的图片用量
 */

import type Database from '../../shared/utils/sqlite-adapter';

/**
 * 获取当前日期字符串（YYYY-MM-DD）
 */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 记录图片用量（累加到当天快照）
 */
export function recordImageUsage(
  db: Database.Database,
  provider: string,
  count: number = 1
): void {
  const date = getTodayDate();
  
  db.prepare(`
    INSERT INTO image_usage_daily (date, provider, count)
    VALUES (?, ?, ?)
    ON CONFLICT(date, provider) DO UPDATE SET
      count = count + excluded.count
  `).run(date, provider, count);
}

/**
 * 图片用量查询结果
 */
export interface ImageUsageRecord {
  date: string;
  provider: string;
  count: number;
}

/**
 * 查询指定日期范围的图片用量
 */
export function getImageUsage(
  db: Database.Database,
  startDate: string,
  endDate: string
): ImageUsageRecord[] {
  const rows = db.prepare(`
    SELECT date, provider, count
    FROM image_usage_daily
    WHERE date >= ? AND date <= ?
    ORDER BY date DESC, provider ASC
  `).all(startDate, endDate) as any[];
  
  return rows.map(row => ({
    date: row.date,
    provider: row.provider,
    count: row.count,
  }));
}
