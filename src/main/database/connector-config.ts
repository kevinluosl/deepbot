/**
 * 连接器配置管理
 */

import type Database from '../../shared/utils/sqlite-adapter';
import { safeJsonParse, safeJsonStringify } from '../../shared/utils/json-utils';

// ========== 连接器配置管理 ==========

/**
 * 保存连接器配置
 */
export function saveConnectorConfig(
  db: Database.Database,
  connectorId: string,
  connectorName: string,
  config: any,
  enabled: boolean = false
): void {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO connector_config 
    (connector_id, connector_name, enabled, config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM connector_config WHERE connector_id = ?), ?), ?)
  `);

  stmt.run(
    connectorId,
    connectorName,
    enabled ? 1 : 0,
    safeJsonStringify(config),
    connectorId,
    now,
    now
  );

  console.info('[SystemConfigStore] ✅ 连接器配置已保存:', { connectorId, connectorName, enabled });
}

/**
 * 获取连接器配置
 */
export function getConnectorConfig(db: Database.Database, connectorId: string): { config: any; enabled: boolean } | null {
  try {
    const stmt = db.prepare(`
      SELECT config_json, enabled FROM connector_config WHERE connector_id = ?
    `);
    const row = stmt.get(connectorId) as any;
    
    if (!row) return null;

    return {
      config: safeJsonParse(row.config_json, {}),
      enabled: row.enabled === 1,
    };
  } catch (error) {
    console.error('[SystemConfigStore] 获取连接器配置失败:', error);
    return null;
  }
}

/**
 * 获取所有连接器配置
 */
export function getAllConnectorConfigs(db: Database.Database): Array<{
  connectorId: string;
  connectorName: string;
  config: any;
  enabled: boolean;
}> {
  try {
    const stmt = db.prepare(`
      SELECT connector_id, connector_name, config_json, enabled FROM connector_config
    `);
    const rows = stmt.all() as any[];
    
    return rows.map((row) => ({
      connectorId: row.connector_id,
      connectorName: row.connector_name,
      config: safeJsonParse(row.config_json, {}),
      enabled: row.enabled === 1,
    }));
  } catch (error) {
    console.error('[SystemConfigStore] 获取所有连接器配置失败:', error);
    return [];
  }
}

/**
 * 启用/禁用连接器
 */
export function setConnectorEnabled(db: Database.Database, connectorId: string, enabled: boolean): void {
  const stmt = db.prepare(`
    UPDATE connector_config SET enabled = ?, updated_at = ? WHERE connector_id = ?
  `);
  stmt.run(enabled ? 1 : 0, Date.now(), connectorId);
  console.info('[SystemConfigStore] ✅ 连接器状态已更新:', { connectorId, enabled });
}

/**
 * 删除连接器配置
 */
export function deleteConnectorConfig(db: Database.Database, connectorId: string): void {
  const stmt = db.prepare(`
    DELETE FROM connector_config WHERE connector_id = ?
  `);
  stmt.run(connectorId);
  console.info('[SystemConfigStore] ✅ 连接器配置已删除:', connectorId);
}

// ========== Pairing 记录管理 ==========

/**
 * 保存 Pairing 记录
 */
export function savePairingRecord(
  db: Database.Database,
  connectorId: string,
  userId: string,
  pairingCode: string,
  userName?: string,
  openId?: string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO connector_pairing 
    (connector_id, user_id, pairing_code, approved, created_at, user_name, open_id)
    VALUES (?, ?, ?, 0, ?, ?, ?)
  `);

  stmt.run(connectorId, userId, pairingCode, Date.now(), userName ?? null, openId ?? null);
  console.info('[SystemConfigStore] ✅ Pairing 记录已保存:', { connectorId, userId, pairingCode, userName, openId });
}

/**
 * 获取 Pairing 记录（通过配对码）
 */
export function getPairingRecordByCode(
  db: Database.Database,
  pairingCode: string
): { connectorId: string; userId: string; approved: boolean; openId?: string } | null {
  try {
    const stmt = db.prepare(`
      SELECT connector_id, user_id, approved, open_id FROM connector_pairing WHERE pairing_code = ?
    `);
    const row = stmt.get(pairingCode) as any;
    
    if (!row) return null;

    return {
      connectorId: row.connector_id,
      userId: row.user_id,
      approved: row.approved === 1,
      openId: row.open_id ?? undefined,
    };
  } catch (error) {
    console.error('[SystemConfigStore] 获取 Pairing 记录失败:', error);
    return null;
  }
}

/**
 * 获取 Pairing 记录（通过用户 ID）
 */
export function getPairingRecordByUser(
  db: Database.Database,
  connectorId: string,
  userId: string
): { pairingCode: string; approved: boolean } | null {
  try {
    const stmt = db.prepare(`
      SELECT pairing_code, approved FROM connector_pairing 
      WHERE connector_id = ? AND user_id = ?
    `);
    const row = stmt.get(connectorId, userId) as any;
    
    if (!row) return null;

    return {
      pairingCode: row.pairing_code,
      approved: row.approved === 1,
    };
  } catch (error) {
    console.error('[SystemConfigStore] 获取 Pairing 记录失败:', error);
    return null;
  }
}

/**
 * 批准 Pairing 记录
 */
export function approvePairingRecord(db: Database.Database, pairingCode: string): void {
  const stmt = db.prepare(`
    UPDATE connector_pairing SET approved = 1, approved_at = ? WHERE pairing_code = ?
  `);
  stmt.run(Date.now(), pairingCode);
  console.info('[SystemConfigStore] ✅ Pairing 记录已批准:', pairingCode);
}

/**
 * 设置/取消管理员
 */
export function setAdminPairing(db: Database.Database, connectorId: string, userId: string, isAdmin: boolean): void {
  const stmt = db.prepare(`
    UPDATE connector_pairing SET is_admin = ? WHERE connector_id = ? AND user_id = ?
  `);
  stmt.run(isAdmin ? 1 : 0, connectorId, userId);
}

/**
 * 检查用户是否是管理员
 */
export function isAdminUser(db: Database.Database, connectorId: string, userId: string): boolean {
  try {
    const stmt = db.prepare(`
      SELECT is_admin FROM connector_pairing WHERE connector_id = ? AND user_id = ?
    `);
    const row = stmt.get(connectorId, userId) as any;
    return row?.is_admin === 1;
  } catch (error) {
    return false;
  }
}

/**
 * 删除 Pairing 记录
 */
export function deletePairingRecord(db: Database.Database, connectorId: string, userId: string): void {
  const stmt = db.prepare(`
    DELETE FROM connector_pairing WHERE connector_id = ? AND user_id = ?
  `);
  stmt.run(connectorId, userId);
  console.info('[SystemConfigStore] ✅ Pairing 记录已删除:', { connectorId, userId });
}

/**
 * 获取所有 Pairing 记录（用于管理界面）
 */
export function getAllPairingRecords(db: Database.Database, connectorId?: string): Array<{
  connectorId: string;
  userId: string;
  openId?: string;
  userName?: string;
  pairingCode: string;
  approved: boolean;
  isAdmin: boolean;
  createdAt: number;
  approvedAt?: number;
}> {
  try {
    let stmt;
    let rows;
    
    if (connectorId) {
      stmt = db.prepare(`
        SELECT * FROM connector_pairing WHERE connector_id = ? ORDER BY created_at DESC
      `);
      rows = stmt.all(connectorId) as any[];
    } else {
      stmt = db.prepare(`
        SELECT * FROM connector_pairing ORDER BY created_at DESC
      `);
      rows = stmt.all() as any[];
    }
    
    return rows.map((row) => ({
      connectorId: row.connector_id,
      userId: row.user_id,
      openId: row.open_id ?? undefined,
      userName: row.user_name ?? undefined,
      pairingCode: row.pairing_code,
      approved: row.approved === 1,
      isAdmin: row.is_admin === 1,
      createdAt: row.created_at,
      approvedAt: row.approved_at,
    }));
  } catch (error) {
    console.error('[SystemConfigStore] 获取所有 Pairing 记录失败:', error);
    return [];
  }
}
