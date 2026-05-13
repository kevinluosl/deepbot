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
  work_prompt: string | null;   // 工作提示词（注入系统提示词）
  skill_whitelist: string | null; // Skill 白名单（JSON 数组）
  workspace_dirs: string | null;  // 自定义工作目录（JSON 数组，null=继承系统）
  reply_mode: string | null;      // 回复模式：'agent' | 'direct'（智能客服 Tab 用）
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
  workPrompt?: string | null;           // 工作提示词（注入系统提示词）
  skillWhitelist?: string[] | null;     // Skill 白名单（智能客服用）
  workspaceDirs?: string[] | null;     // 自定义工作目录（null=继承系统）
  replyMode?: 'agent' | 'direct';     // 回复模式（智能客服 Tab 用）
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

  // 兼容旧数据库：添加 work_prompt 列
  try {
    db.exec('ALTER TABLE agent_tabs ADD COLUMN work_prompt TEXT');
  } catch {
    // 列已存在，忽略
  }

  // 兼容旧数据库：添加 skill_whitelist 列
  try {
    db.exec('ALTER TABLE agent_tabs ADD COLUMN skill_whitelist TEXT');
  } catch {
    // 列已存在，忽略
  }

  // 兼容旧数据库：添加 workspace_dirs 列
  try {
    db.exec('ALTER TABLE agent_tabs ADD COLUMN workspace_dirs TEXT');
  } catch {
    // 列已存在，忽略
  }

  // 兼容旧数据库：添加 reply_mode 列（智能客服 Tab 回复模式）
  try {
    db.exec("ALTER TABLE agent_tabs ADD COLUMN reply_mode TEXT DEFAULT 'agent'");
  } catch {
    // 列已存在，忽略
  }

  // 兼容旧数据：将 wecom_kf 类型迁移为 connector
  try {
    const result = db.prepare("UPDATE agent_tabs SET type = 'connector' WHERE type = 'wecom_kf'").run();
    if (result.changes > 0) {
      console.log(`[TabConfig] 🔄 已将 ${result.changes} 个 wecom_kf Tab 迁移为 connector 类型`);
    }
  } catch {
    // 静默处理
  }

  // 兼容旧数据：将 connector_id 为 'wecom-kf' 的迁移为 'smart-kf'
  try {
    const result = db.prepare("UPDATE agent_tabs SET connector_id = 'smart-kf' WHERE connector_id = 'wecom-kf'").run();
    if (result.changes > 0) {
      console.log(`[TabConfig] 🔄 已将 ${result.changes} 个 wecom-kf Tab 迁移为 smart-kf`);
    }
  } catch {
    // 静默处理
  }

  // 兼容旧数据库：添加 image_tool_config 列（Tab 级别生图工具配置）
  try {
    db.exec('ALTER TABLE agent_tabs ADD COLUMN image_tool_config TEXT');
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
 * 更新 Tab 的工作提示词
 */
export function updateTabWorkPrompt(db: Database.Database, tabId: string, workPrompt: string | null): void {
  const stmt = db.prepare(`
    UPDATE agent_tabs 
    SET work_prompt = ?
    WHERE id = ?
  `);
  
  stmt.run(workPrompt, tabId);
  
  console.log(`[TabConfig] 📝 已更新 Tab 工作提示词: ${tabId} (${workPrompt ? workPrompt.length + '字符' : '清空'})`);
}

/**
 * 更新 Tab 的 Skill 白名单
 */
export function updateTabSkillWhitelist(db: Database.Database, tabId: string, whitelist: string[] | null): void {
  const stmt = db.prepare(`
    UPDATE agent_tabs 
    SET skill_whitelist = ?
    WHERE id = ?
  `);
  
  stmt.run(whitelist && whitelist.length > 0 ? JSON.stringify(whitelist) : null, tabId);
  
  console.log(`[TabConfig] 🔧 已更新 Tab Skill 白名单: ${tabId} (${whitelist ? whitelist.length + '个' : '清空'})`);
}

/**
 * 更新 Tab 的自定义工作目录
 */
export function updateTabWorkspaceDirs(db: Database.Database, tabId: string, dirs: string[] | null): void {
  const stmt = db.prepare(`
    UPDATE agent_tabs 
    SET workspace_dirs = ?
    WHERE id = ?
  `);
  
  stmt.run(dirs && dirs.length > 0 ? JSON.stringify(dirs) : null, tabId);
  
  console.log(`[TabConfig] 📂 已更新 Tab 工作目录: ${tabId} (${dirs ? dirs.join(', ') : '继承系统'})`);
}

/**
 * 更新 Tab 的回复模式（智能客服 Tab 用）
 */
export function updateTabReplyMode(db: Database.Database, tabId: string, replyMode: 'agent' | 'direct'): void {
  const stmt = db.prepare(`
    UPDATE agent_tabs 
    SET reply_mode = ?
    WHERE id = ?
  `);
  
  stmt.run(replyMode, tabId);
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
    workPrompt: row.work_prompt || undefined,
    skillWhitelist: row.skill_whitelist ? (() => { try { return JSON.parse(row.skill_whitelist); } catch { return undefined; } })() : undefined,
    workspaceDirs: row.workspace_dirs ? (() => { try { return JSON.parse(row.workspace_dirs); } catch { return undefined; } })() : undefined,
    replyMode: (row.reply_mode === 'agent' || row.reply_mode === 'direct') ? row.reply_mode : undefined,
  };
}
