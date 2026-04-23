/**
 * Tab 配置管理
 * 
 * 管理 Agent Tab 的持久化配置
 */

import type Database from '../../shared/utils/sqlite-adapter';

/**
 * Tab 配置数据结构（数据库）
 */
export interface TabConfigRow {
  id: string;
  title: string;
  type: 'manual' | 'task' | 'connector';
  memory_file: string | null;
  agent_name: string | null;
  is_persistent: number;
  created_at: number;
  last_active_at: number;
  task_id: string | null;
  connector_id: string | null;
  conversation_id: string | null;
  model_config: string | null;  // JSON 格式的模型覆盖配置
}

/**
 * Tab 配置（应用层）
 */
export interface TabConfig {
  id: string;
  title: string;
  type: 'manual' | 'task' | 'connector';
  memoryFile: string | null;
  agentName: string | null;
  isPersistent: boolean;
  createdAt: number;
  lastActiveAt: number;
  taskId?: string;
  connectorId?: string;
  conversationId?: string;
  modelConfig?: TabModelConfig | null;  // Tab 独立模型配置（覆盖全局）
}

/**
 * Tab 独立模型配置（只存覆盖的部分）
 */
export interface TabModelConfig {
  providerId?: string;
  providerName?: string;
  baseUrl?: string;
  modelId?: string;
  apiKey?: string;
  apiType?: string;
  modelId2?: string;
  contextWindow?: number;
}

/**
 * 初始化 Tab 配置表
 */
export function initTabConfigTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tabs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('manual', 'task', 'connector')),
      memory_file TEXT,
      agent_name TEXT,
      is_persistent INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      task_id TEXT,
      connector_id TEXT,
      conversation_id TEXT,
      model_config TEXT
    )
  `);
  
  // 兼容旧数据库：添加 model_config 列
  try {
    db.exec('ALTER TABLE agent_tabs ADD COLUMN model_config TEXT');
  } catch {
    // 列已存在，忽略
  }
  
  console.log('[TabConfig] ✅ agent_tabs 表已初始化');
}

/**
 * 保存 Tab 配置
 */
export function saveTabConfig(db: Database.Database, config: TabConfig): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO agent_tabs (
      id, title, type, memory_file, agent_name,
      is_persistent, created_at, last_active_at,
      task_id, connector_id, conversation_id, model_config
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    config.id,
    config.title,
    config.type,
    config.memoryFile,
    config.agentName,
    config.isPersistent ? 1 : 0,
    config.createdAt,
    config.lastActiveAt,
    config.taskId || null,
    config.connectorId || null,
    config.conversationId || null,
    config.modelConfig ? JSON.stringify(config.modelConfig) : null
  );
  
  console.log(`[TabConfig] 💾 已保存 Tab 配置: ${config.id} (${config.title})`);
}

/**
 * 获取 Tab 配置
 */
export function getTabConfig(db: Database.Database, tabId: string): TabConfig | null {
  const stmt = db.prepare(`
    SELECT * FROM agent_tabs WHERE id = ?
  `);
  
  const row = stmt.get(tabId) as TabConfigRow | undefined;
  
  if (!row) {
    return null;
  }
  
  return rowToConfig(row);
}

/**
 * 获取所有持久化的 Tab 配置
 */
export function getAllPersistentTabs(db: Database.Database): TabConfig[] {
  const stmt = db.prepare(`
    SELECT * FROM agent_tabs 
    WHERE is_persistent = 1
    ORDER BY last_active_at DESC
  `);
  
  const rows = stmt.all() as TabConfigRow[];
  
  return rows.map(rowToConfig);
}

/**
 * 更新 Tab 最后活跃时间
 */
export function updateTabLastActive(db: Database.Database, tabId: string): void {
  const stmt = db.prepare(`
    UPDATE agent_tabs 
    SET last_active_at = ?
    WHERE id = ?
  `);
  
  stmt.run(Date.now(), tabId);
}

/**
 * 更新 Tab 标题
 */
export function updateTabTitle(db: Database.Database, tabId: string, title: string): void {
  const stmt = db.prepare(`
    UPDATE agent_tabs 
    SET title = ?
    WHERE id = ?
  `);
  
  stmt.run(title, tabId);
  
  console.log(`[TabConfig] 📝 已更新 Tab 标题: ${tabId} -> ${title}`);
}

/**
 * 更新 Tab Agent 名字
 */
export function updateTabAgentName(
  db: Database.Database, 
  tabId: string, 
  agentName: string | null
): void {
  const stmt = db.prepare(`
    UPDATE agent_tabs 
    SET agent_name = ?
    WHERE id = ?
  `);
  
  stmt.run(agentName, tabId);
  
  console.log(`[TabConfig] 👤 已更新 Tab Agent 名字: ${tabId} -> ${agentName || '(继承主 Agent)'}`);
}

/**
 * 更新 Tab 的模型配置
 */
export function updateTabModelConfig(db: Database.Database, tabId: string, modelConfig: TabModelConfig | null): void {
  const stmt = db.prepare(`
    UPDATE agent_tabs 
    SET model_config = ?
    WHERE id = ?
  `);
  
  stmt.run(modelConfig ? JSON.stringify(modelConfig) : null, tabId);
  
  console.log(`[TabConfig] 🤖 已更新 Tab 模型配置: ${tabId}`);
}

/**
 * 更新 Tab 的 memory 文件
 */
export function updateTabMemoryFile(db: Database.Database, tabId: string, memoryFile: string): void {
  const stmt = db.prepare(`
    UPDATE agent_tabs 
    SET memory_file = ?
    WHERE id = ?
  `);
  
  stmt.run(memoryFile, tabId);
  
  console.log(`[TabConfig] 🧠 已更新 Tab memory 文件: ${tabId} -> ${memoryFile}`);
}

/**
 * 删除 Tab 配置
 */
export function deleteTabConfig(db: Database.Database, tabId: string): void {
  const stmt = db.prepare(`
    DELETE FROM agent_tabs WHERE id = ?
  `);
  
  stmt.run(tabId);
  
  console.log(`[TabConfig] 🗑️ 已删除 Tab 配置: ${tabId}`);
}

/**
 * 删除所有非持久化的 Tab
 */
export function deleteNonPersistentTabs(db: Database.Database): void {
  const stmt = db.prepare(`
    DELETE FROM agent_tabs WHERE is_persistent = 0
  `);
  
  const result = stmt.run();
  
  console.log(`[TabConfig] 🧹 已清理 ${result.changes} 个非持久化 Tab`);
}

/**
 * 将数据库行转换为配置对象
 */
function rowToConfig(row: TabConfigRow): TabConfig {
  let modelConfig: TabModelConfig | null = null;
  if (row.model_config) {
    try { modelConfig = JSON.parse(row.model_config); } catch { /* 忽略 */ }
  }
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    memoryFile: row.memory_file,
    agentName: row.agent_name,
    isPersistent: row.is_persistent === 1,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    taskId: row.task_id || undefined,
    connectorId: row.connector_id || undefined,
    conversationId: row.conversation_id || undefined,
    modelConfig,
  };
}
