/**
 * 系统配置存储（重构版）
 * 
 * 使用 SQLite 持久化系统配置数据
 * 
 * 架构：
 * - 主类负责数据库初始化和单例管理
 * - 各个配置模块负责具体的 CRUD 操作
 */

import Database from '../../shared/utils/sqlite-adapter';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ensureDirectoryExists } from '../../shared/utils/fs-utils';
import { isDockerMode, getDbDir } from '../../shared/utils/docker-utils';

// 导入类型定义
import type {
  EnvironmentConfig,
  WorkspaceSettings,
  ModelConfig,
  ImageGenerationToolConfig,
  WebSearchToolConfig,
} from './config-types';

// 导入各个配置模块
import * as EnvironmentConfigModule from './environment-config';
import * as WorkspaceConfigModule from './workspace-config';
import * as ModelConfigModule from './model-config';
import * as ToolConfigModule from './tool-config';
import * as NameConfigModule from './name-config';
import * as ConnectorConfigModule from './connector-config';

/**
 * 系统配置存储类
 */
export class SystemConfigStore {
  private db: Database.Database;
  private static instance: SystemConfigStore | null = null;

  constructor(dbPath?: string) {
    // Docker 模式：优先读 DB_DIR 环境变量（本地调试用），fallback 到 /data/db（生产容器）
    // 普通模式：默认 ~/.deepbot/system-config.db
    const dbDir = getDbDir();
    const defaultPath = isDockerMode()
      ? join(dbDir, 'system-config.db')
      : join(homedir(), '.deepbot', 'system-config.db');
    const path = dbPath || defaultPath;

    // 确保目录存在
    const dir = isDockerMode() ? dbDir : join(homedir(), '.deepbot');
    ensureDirectoryExists(dir);

    // 打开数据库
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');

    // 初始化表
    this.initTables();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): SystemConfigStore {
    if (!SystemConfigStore.instance) {
      SystemConfigStore.instance = new SystemConfigStore();
    }
    return SystemConfigStore.instance;
  }

  /**
   * 获取数据库实例（供内部模块使用）
   */
  getDb(): Database.Database {
    return this.db;
  }

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    // 环境配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS environment_config (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_installed INTEGER NOT NULL DEFAULT 0,
        version TEXT,
        path TEXT,
        last_checked INTEGER NOT NULL,
        error TEXT
      )
    `);

    // 工作目录配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // 模型配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider_type TEXT NOT NULL DEFAULT 'qwen',
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        model_id_2 TEXT,
        api_key TEXT NOT NULL,
        context_window INTEGER,
        last_fetched INTEGER
      )
    `);
    
    // 🔥 数据库迁移：添加 model_id_2 字段（如果不存在）
    try {
      // 检查字段是否存在
      const tableInfo = this.db.prepare("PRAGMA table_info(model_config)").all() as any[];
      const hasModelId2 = tableInfo.some((col: any) => col.name === 'model_id_2');
      
      if (!hasModelId2) {
        console.log('[SystemConfigStore] 🔄 迁移数据库：添加 model_id_2 字段');
        this.db.exec(`ALTER TABLE model_config ADD COLUMN model_id_2 TEXT`);
        console.log('[SystemConfigStore] ✅ model_id_2 字段已添加');
      }
    } catch (error) {
      console.error('[SystemConfigStore] ❌ 数据库迁移失败:', error);
    }

    // 工具配置表 - 图片生成工具
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_config_image_generation (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        model TEXT NOT NULL,
        api_url TEXT NOT NULL,
        api_key TEXT NOT NULL
      )
    `);

    // 兼容升级：为图片生成工具配置表添加 provider 字段
    try {
      this.db.exec(`ALTER TABLE tool_config_image_generation ADD COLUMN provider TEXT NOT NULL DEFAULT 'gemini'`);
    } catch (_e) {
      // 字段已存在，忽略
    }

    // 工具配置表 - Web Search 工具
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_config_web_search (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL DEFAULT 'qwen',
        model TEXT NOT NULL,
        api_url TEXT NOT NULL,
        api_key TEXT NOT NULL
      )
    `);

    // 名字配置表（智能体名字 + 用户称呼）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS name_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        agent_name TEXT NOT NULL DEFAULT 'matrix',
        user_name TEXT NOT NULL DEFAULT 'user'
      )
    `);

    // 工具禁用配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_disabled (
        tool_name TEXT PRIMARY KEY
      )
    `);

    // 连接器配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connector_config (
        connector_id TEXT PRIMARY KEY,
        connector_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        config_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 连接器 Pairing 记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connector_pairing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connector_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        pairing_code TEXT NOT NULL UNIQUE,
        approved INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        approved_at INTEGER,
        UNIQUE(connector_id, user_id)
      )
    `);
    
    // Agent Tab 配置表
    const { initTabConfigTable } = require('./tab-config');
    initTabConfigTable(this.db);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_connector_pairing_code 
      ON connector_pairing(pairing_code)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_connector_pairing_user 
      ON connector_pairing(connector_id, user_id)
    `);

    // 数据库迁移
    this.runMigrations();

    console.info('[SystemConfigStore] ✅ 数据库表初始化完成');
  }

  /**
   * 运行数据库迁移
   */
  private runMigrations(): void {
    // 迁移：添加 provider 字段到 tool_config_web_search 表
    try {
      const tableInfo = this.db.prepare("PRAGMA table_info(tool_config_web_search)").all() as any[];
      const hasProviderColumn = tableInfo.some((col: any) => col.name === 'provider');
      
      if (!hasProviderColumn) {
        console.log('[SystemConfigStore] 🔄 迁移数据库：添加 provider 字段到 tool_config_web_search 表');
        this.db.exec(`
          ALTER TABLE tool_config_web_search ADD COLUMN provider TEXT NOT NULL DEFAULT 'qwen'
        `);
        console.log('[SystemConfigStore] ✅ 数据库迁移完成');
      }
    } catch (error) {
      console.warn('[SystemConfigStore] ⚠️ 数据库迁移检查失败（表可能不存在）:', error);
    }

    // 迁移：添加 provider_type, context_window, last_fetched, api_type 字段到 model_config 表
    try {
      const tableInfo = this.db.prepare("PRAGMA table_info(model_config)").all() as any[];
      const hasProviderTypeColumn = tableInfo.some((col: any) => col.name === 'provider_type');
      const hasContextWindowColumn = tableInfo.some((col: any) => col.name === 'context_window');
      const hasLastFetchedColumn = tableInfo.some((col: any) => col.name === 'last_fetched');
      const hasApiTypeColumn = tableInfo.some((col: any) => col.name === 'api_type');
      
      if (!hasProviderTypeColumn) {
        console.log('[SystemConfigStore] 🔄 迁移数据库：添加 provider_type 字段到 model_config 表');
        this.db.exec(`
          ALTER TABLE model_config ADD COLUMN provider_type TEXT NOT NULL DEFAULT 'qwen'
        `);
      }
      
      if (!hasContextWindowColumn) {
        console.log('[SystemConfigStore] 🔄 迁移数据库：添加 context_window 字段到 model_config 表');
        this.db.exec(`
          ALTER TABLE model_config ADD COLUMN context_window INTEGER
        `);
      }
      
      if (!hasLastFetchedColumn) {
        console.log('[SystemConfigStore] 🔄 迁移数据库：添加 last_fetched 字段到 model_config 表');
        this.db.exec(`
          ALTER TABLE model_config ADD COLUMN last_fetched INTEGER
        `);
      }
      
      if (!hasApiTypeColumn) {
        console.log('[SystemConfigStore] 🔄 迁移数据库：添加 api_type 字段到 model_config 表');
        this.db.exec(`
          ALTER TABLE model_config ADD COLUMN api_type TEXT NOT NULL DEFAULT 'openai-completions'
        `);
      }
      
      if (!hasProviderTypeColumn || !hasContextWindowColumn || !hasLastFetchedColumn || !hasApiTypeColumn) {
        console.log('[SystemConfigStore] ✅ 数据库迁移完成');
      }
    } catch (error) {
      console.warn('[SystemConfigStore] ⚠️ 数据库迁移检查失败（表可能不存在）:', error);
    }
    // 迁移：添加 is_admin 字段到 connector_pairing 表
    try {
      const pairingTableInfo = this.db.prepare("PRAGMA table_info(connector_pairing)").all() as any[];
      const hasIsAdminColumn = pairingTableInfo.some((col: any) => col.name === 'is_admin');
      if (!hasIsAdminColumn) {
        console.log('[SystemConfigStore] 🔄 迁移数据库：添加 is_admin 字段到 connector_pairing 表');
        this.db.exec(`ALTER TABLE connector_pairing ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
        console.log('[SystemConfigStore] ✅ connector_pairing is_admin 迁移完成');
      }
      // 迁移：添加 user_name 字段
      const hasUserNameColumn = pairingTableInfo.some((col: any) => col.name === 'user_name');
      if (!hasUserNameColumn) {
        console.log('[SystemConfigStore] 🔄 迁移数据库：添加 user_name 字段到 connector_pairing 表');
        this.db.exec(`ALTER TABLE connector_pairing ADD COLUMN user_name TEXT`);
        console.log('[SystemConfigStore] ✅ connector_pairing user_name 迁移完成');
      }
      // 迁移：添加 open_id 字段
      const hasOpenIdColumn = pairingTableInfo.some((col: any) => col.name === 'open_id');
      if (!hasOpenIdColumn) {
        console.log('[SystemConfigStore] 🔄 迁移数据库：添加 open_id 字段到 connector_pairing 表');
        this.db.exec(`ALTER TABLE connector_pairing ADD COLUMN open_id TEXT`);
        console.log('[SystemConfigStore] ✅ connector_pairing open_id 迁移完成');
      }
    } catch (error) {
      console.warn('[SystemConfigStore] ⚠️ connector_pairing 迁移检查失败:', error);
    }
  }

  // ========== 环境配置 ==========

  saveEnvironmentConfig(config: EnvironmentConfig): void {
    return EnvironmentConfigModule.saveEnvironmentConfig(this.db, config);
  }

  getEnvironmentConfig(name: string): EnvironmentConfig | null {
    return EnvironmentConfigModule.getEnvironmentConfig(this.db, name);
  }

  getAllEnvironmentConfigs(): EnvironmentConfig[] {
    return EnvironmentConfigModule.getAllEnvironmentConfigs(this.db);
  }

  deleteEnvironmentConfig(name: string): void {
    return EnvironmentConfigModule.deleteEnvironmentConfig(this.db, name);
  }

  // ========== 工作目录配置 ==========

  getDefaultWorkspaceSettings(): WorkspaceSettings {
    return WorkspaceConfigModule.getDefaultWorkspaceSettings();
  }

  getWorkspaceSettings(): WorkspaceSettings {
    return WorkspaceConfigModule.getWorkspaceSettings(this.db);
  }

  saveWorkspaceSettings(settings: WorkspaceSettings): void {
    return WorkspaceConfigModule.saveWorkspaceSettings(this.db, settings);
  }

  saveScriptDir(scriptDir: string): void {
    return WorkspaceConfigModule.saveScriptDir(this.db, scriptDir);
  }

  saveSkillDirs(skillDirs: string[]): void {
    return WorkspaceConfigModule.saveSkillDirs(this.db, skillDirs);
  }

  saveDefaultSkillDir(defaultSkillDir: string): void {
    return WorkspaceConfigModule.saveDefaultSkillDir(this.db, defaultSkillDir);
  }

  saveImageDir(imageDir: string): void {
    return WorkspaceConfigModule.saveImageDir(this.db, imageDir);
  }

  saveMemoryDir(memoryDir: string): void {
    return WorkspaceConfigModule.saveMemoryDir(this.db, memoryDir);
  }

  addSkillDir(newDir: string): WorkspaceSettings {
    return WorkspaceConfigModule.addSkillDir(this.db, newDir);
  }

  removeSkillDir(dirToRemove: string): WorkspaceSettings {
    return WorkspaceConfigModule.removeSkillDir(this.db, dirToRemove);
  }

  setDefaultSkillDir(newDefaultDir: string): WorkspaceSettings {
    return WorkspaceConfigModule.setDefaultSkillDir(this.db, newDefaultDir);
  }

  addWorkspaceDir(newDir: string): WorkspaceSettings {
    return WorkspaceConfigModule.addWorkspaceDir(this.db, newDir);
  }

  removeWorkspaceDir(dirToRemove: string): WorkspaceSettings {
    return WorkspaceConfigModule.removeWorkspaceDir(this.db, dirToRemove);
  }

  saveWorkspaceDirs(workspaceDirs: string[]): void {
    return WorkspaceConfigModule.saveWorkspaceDirs(this.db, workspaceDirs);
  }

  // ========== 模型配置 ==========

  getModelConfig(): ModelConfig | null {
    return ModelConfigModule.getModelConfig(this.db);
  }

  saveModelConfig(config: ModelConfig): void {
    return ModelConfigModule.saveModelConfig(this.db, config);
  }

  updateModelContextWindow(contextWindow: number): void {
    return ModelConfigModule.updateModelContextWindow(this.db, contextWindow);
  }

  deleteModelConfig(): void {
    return ModelConfigModule.deleteModelConfig(this.db);
  }

  // ========== 工具配置 ==========

  getImageGenerationToolConfig(): ImageGenerationToolConfig | null {
    return ToolConfigModule.getImageGenerationToolConfig(this.db);
  }

  saveImageGenerationToolConfig(config: ImageGenerationToolConfig): void {
    return ToolConfigModule.saveImageGenerationToolConfig(this.db, config);
  }

  deleteImageGenerationToolConfig(): void {
    return ToolConfigModule.deleteImageGenerationToolConfig(this.db);
  }

  getWebSearchToolConfig(): WebSearchToolConfig | null {
    return ToolConfigModule.getWebSearchToolConfig(this.db);
  }

  saveWebSearchToolConfig(config: WebSearchToolConfig): void {
    return ToolConfigModule.saveWebSearchToolConfig(this.db, config);
  }

  deleteWebSearchToolConfig(): void {
    return ToolConfigModule.deleteWebSearchToolConfig(this.db);
  }

  // ========== 名字配置 ==========

  getNameConfig(): { agentName: string; userName: string } {
    return NameConfigModule.getNameConfig(this.db);
  }

  saveAgentName(agentName: string): void {
    return NameConfigModule.saveAgentName(this.db, agentName);
  }

  saveUserName(userName: string): void {
    return NameConfigModule.saveUserName(this.db, userName);
  }

  saveNameConfig(agentName: string, userName: string): void {
    return NameConfigModule.saveNameConfig(this.db, agentName, userName);
  }

  // ========== 连接器配置 ==========

  saveConnectorConfig(connectorId: string, connectorName: string, config: any, enabled: boolean = false): void {
    return ConnectorConfigModule.saveConnectorConfig(this.db, connectorId, connectorName, config, enabled);
  }

  getConnectorConfig(connectorId: string): { config: any; enabled: boolean } | null {
    return ConnectorConfigModule.getConnectorConfig(this.db, connectorId);
  }

  getAllConnectorConfigs(): Array<{ connectorId: string; connectorName: string; config: any; enabled: boolean }> {
    return ConnectorConfigModule.getAllConnectorConfigs(this.db);
  }

  setConnectorEnabled(connectorId: string, enabled: boolean): void {
    return ConnectorConfigModule.setConnectorEnabled(this.db, connectorId, enabled);
  }

  deleteConnectorConfig(connectorId: string): void {
    return ConnectorConfigModule.deleteConnectorConfig(this.db, connectorId);
  }

  // ========== Tab 配置 ==========

  saveTabConfig(tabId: string, config: { memoryFile?: string; agentName?: string; isPersistent?: boolean }): void {
    const TabConfigModule = require('./tab-config');
    return TabConfigModule.saveTabConfig(this.db, tabId, config);
  }

  getTabConfig(tabId: string): { memoryFile?: string; agentName?: string; isPersistent?: boolean } | null {
    const TabConfigModule = require('./tab-config');
    return TabConfigModule.getTabConfig(this.db, tabId);
  }

  updateTabAgentName(tabId: string, agentName: string | null): void {
    const TabConfigModule = require('./tab-config');
    return TabConfigModule.updateTabAgentName(this.db, tabId, agentName);
  }

  deleteTabConfig(tabId: string): void {
    const TabConfigModule = require('./tab-config');
    return TabConfigModule.deleteTabConfig(this.db, tabId);
  }

  deleteNonPersistentTabs(): void {
    const TabConfigModule = require('./tab-config');
    return TabConfigModule.deleteNonPersistentTabs(this.db);
  }

  getAllPersistentTabs(): Array<{ id: string; memoryFile?: string; agentName?: string }> {
    const TabConfigModule = require('./tab-config');
    return TabConfigModule.getAllPersistentTabs(this.db);
  }

  // ========== Pairing 记录管理 ==========

  savePairingRecord(connectorId: string, userId: string, pairingCode: string, userName?: string, openId?: string): void {
    return ConnectorConfigModule.savePairingRecord(this.db, connectorId, userId, pairingCode, userName, openId);
  }

  getPairingRecordByCode(pairingCode: string): { connectorId: string; userId: string; approved: boolean; openId?: string } | null {
    return ConnectorConfigModule.getPairingRecordByCode(this.db, pairingCode);
  }

  getPairingRecordByUser(connectorId: string, userId: string): { pairingCode: string; approved: boolean } | null {
    return ConnectorConfigModule.getPairingRecordByUser(this.db, connectorId, userId);
  }

  approvePairingRecord(pairingCode: string): void {
    return ConnectorConfigModule.approvePairingRecord(this.db, pairingCode);
  }

  setAdminPairing(connectorId: string, userId: string, isAdmin: boolean): void {
    return ConnectorConfigModule.setAdminPairing(this.db, connectorId, userId, isAdmin);
  }

  isAdminUser(connectorId: string, userId: string): boolean {
    return ConnectorConfigModule.isAdminUser(this.db, connectorId, userId);
  }

  deletePairingRecord(connectorId: string, userId: string): void {
    return ConnectorConfigModule.deletePairingRecord(this.db, connectorId, userId);
  }

  getAllPairingRecords(connectorId?: string): Array<{
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
    return ConnectorConfigModule.getAllPairingRecords(this.db, connectorId);
  }

  // ========== 工具禁用管理 ==========

  /** 获取所有被禁用的工具名称列表 */
  getDisabledTools(): string[] {
    const rows = this.db.prepare('SELECT tool_name FROM tool_disabled').all() as { tool_name: string }[];
    return rows.map(r => r.tool_name);
  }

  /** 设置工具的禁用状态 */
  setToolDisabled(toolName: string, disabled: boolean): void {
    if (disabled) {
      this.db.prepare('INSERT OR IGNORE INTO tool_disabled (tool_name) VALUES (?)').run(toolName);
    } else {
      this.db.prepare('DELETE FROM tool_disabled WHERE tool_name = ?').run(toolName);
    }
  }

  // ========== 应用设置（通用 key-value） ==========

  /**
   * 获取应用设置
   */
  getAppSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM workspace_settings WHERE key = ?').get(`app:${key}`) as any;
    return row?.value ?? null;
  }

  /**
   * 保存应用设置
   */
  setAppSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO workspace_settings (key, value) VALUES (?, ?)').run(`app:${key}`, value);
  }

  // ========== 数据库管理 ==========

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close();
  }
}

// 导出类型
export type {
  EnvironmentConfig,
  WorkspaceSettings,
  ModelConfig,
  ImageGenerationToolConfig,
  WebSearchToolConfig,
};
