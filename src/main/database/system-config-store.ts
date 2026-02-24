/**
 * 系统配置存储
 * 
 * 使用 SQLite 持久化系统配置数据（环境状态、依赖检查等）
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync } from 'node:fs';

/**
 * 环境配置状态
 */
export interface EnvironmentConfig {
  id: string;
  name: string; // 'python' | 'nodejs'
  isInstalled: boolean;
  version?: string;
  path?: string;
  lastChecked: number;
  error?: string;
}

/**
 * 工作目录配置
 */
export interface WorkspaceSettings {
  workspaceDir: string;    // 默认工作目录（必须设置，所有操作限制在此目录及其子目录）
  scriptDir: string;       // Python 脚本目录（单一路径）
  skillDirs: string[];     // Skill 目录列表（支持多个路径）
  defaultSkillDir: string; // 默认 Skill 目录
  imageDir: string;        // 图片生成目录（单一路径）
  memoryDir: string;       // 记忆管理目录（单一路径）
}

/**
 * 模型配置
 */
export interface ModelConfig {
  providerId: string;      // 提供商 ID
  providerName: string;    // 提供商名称
  baseUrl: string;         // API 地址
  modelId: string;         // 模型 ID
  modelName: string;       // 模型名称
  apiKey: string;          // API Key（加密存储）
}

/**
 * 工具配置 - 图片生成工具
 */
export interface ImageGenerationToolConfig {
  model: string;           // 模型名称
  apiUrl: string;          // API 地址
  apiKey: string;          // API Key
}

/**
 * 工具配置 - Web Search 工具
 */
export interface WebSearchToolConfig {
  provider: string;        // 提供商 ID ('qwen' | 'gemini')
  model: string;           // 模型名称
  apiUrl: string;          // API 地址
  apiKey: string;          // API Key
}

/**
 * 系统配置存储类
 */
export class SystemConfigStore {
  private db: Database.Database;
  private static instance: SystemConfigStore | null = null;

  constructor(dbPath?: string) {
    // 默认数据库路径：~/.deepbot/system-config.db
    const defaultPath = join(homedir(), '.deepbot', 'system-config.db');
    const path = dbPath || defaultPath;

    // 确保目录存在
    const dir = join(homedir(), '.deepbot');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
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
  static getInstance(): SystemConfigStore {
    if (!SystemConfigStore.instance) {
      SystemConfigStore.instance = new SystemConfigStore();
    }
    return SystemConfigStore.instance;
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
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        api_key TEXT NOT NULL
      )
    `);

    // 工具配置表 - 图片生成工具
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_config_image_generation (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        model TEXT NOT NULL,
        api_url TEXT NOT NULL,
        api_key TEXT NOT NULL
      )
    `);

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

    // 🔥 数据库迁移：检查 tool_config_web_search 表是否有 provider 字段
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

    // 名字配置表（智能体名字 + 用户称呼）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS name_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        agent_name TEXT NOT NULL DEFAULT 'matrix',
        user_name TEXT NOT NULL DEFAULT 'user'
      )
    `);

    console.info('[SystemConfigStore] ✅ 数据库表初始化完成');
  }

  /**
   * 保存环境配置
   */
  saveEnvironmentConfig(config: EnvironmentConfig): void {
    const stmt = this.db.prepare(`
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
  getEnvironmentConfig(name: string): EnvironmentConfig | null {
    const stmt = this.db.prepare(`
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
  getAllEnvironmentConfigs(): EnvironmentConfig[] {
    const stmt = this.db.prepare(`
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
  deleteEnvironmentConfig(name: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM environment_config WHERE name = ?
    `);
    stmt.run(name);
  }

  /**
   * 获取默认工作目录配置（绝对路径）
   */
  getDefaultWorkspaceSettings(): WorkspaceSettings {
    return {
      workspaceDir: homedir(), // 默认工作目录为用户主目录
      scriptDir: join(homedir(), '.deepbot', 'scripts'),
      skillDirs: [join(homedir(), '.deepbot', 'skills')],
      defaultSkillDir: join(homedir(), '.deepbot', 'skills'),
      imageDir: join(homedir(), '.deepbot', 'generated-images'),
      memoryDir: join(homedir(), '.deepbot', 'memory'),
    };
  }

  /**
   * 获取工作目录配置
   */
  getWorkspaceSettings(): WorkspaceSettings {
    const defaultSettings = this.getDefaultWorkspaceSettings();

    try {
      const workspaceDirRow = this.db.prepare('SELECT value FROM workspace_settings WHERE key = ?').get('workspaceDir') as any;
      const scriptDirRow = this.db.prepare('SELECT value FROM workspace_settings WHERE key = ?').get('scriptDir') as any;
      const skillDirsRow = this.db.prepare('SELECT value FROM workspace_settings WHERE key = ?').get('skillDirs') as any;
      const defaultSkillDirRow = this.db.prepare('SELECT value FROM workspace_settings WHERE key = ?').get('defaultSkillDir') as any;
      const imageDirRow = this.db.prepare('SELECT value FROM workspace_settings WHERE key = ?').get('imageDir') as any;
      const memoryDirRow = this.db.prepare('SELECT value FROM workspace_settings WHERE key = ?').get('memoryDir') as any;

      // 解析 skillDirs（JSON 数组）
      let skillDirs = defaultSettings.skillDirs;
      if (skillDirsRow?.value) {
        try {
          skillDirs = JSON.parse(skillDirsRow.value);
        } catch (error) {
          console.error('解析 skillDirs 失败:', error);
        }
      }

      return {
        workspaceDir: workspaceDirRow?.value || defaultSettings.workspaceDir,
        scriptDir: scriptDirRow?.value || defaultSettings.scriptDir,
        skillDirs,
        defaultSkillDir: defaultSkillDirRow?.value || defaultSettings.defaultSkillDir,
        imageDir: imageDirRow?.value || defaultSettings.imageDir,
        memoryDir: memoryDirRow?.value || defaultSettings.memoryDir,
      };
    } catch (error) {
      console.error('获取工作目录配置失败:', error);
      return defaultSettings;
    }
  }

  /**
   * 保存 Python 脚本目录配置
   */
  saveScriptDir(scriptDir: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_settings (key, value)
      VALUES (?, ?)
    `);
    stmt.run('scriptDir', scriptDir);
    console.info('[SystemConfigStore] ✅ Python 脚本目录已保存:', scriptDir);
  }

  /**
   * 保存 Skill 目录列表
   */
  saveSkillDirs(skillDirs: string[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_settings (key, value)
      VALUES (?, ?)
    `);
    stmt.run('skillDirs', JSON.stringify(skillDirs));
    console.info('[SystemConfigStore] ✅ Skill 目录列表已保存:', skillDirs);
  }

  /**
   * 保存默认 Skill 目录
   */
  saveDefaultSkillDir(defaultSkillDir: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_settings (key, value)
      VALUES (?, ?)
    `);
    stmt.run('defaultSkillDir', defaultSkillDir);
    console.info('[SystemConfigStore] ✅ 默认 Skill 目录已保存:', defaultSkillDir);
  }

  /**
   * 添加 Skill 目录
   */
  addSkillDir(newDir: string): WorkspaceSettings {
    const settings = this.getWorkspaceSettings();
    
    // 检查是否已存在
    if (settings.skillDirs.includes(newDir)) {
      throw new Error(`Skill 目录已存在: ${newDir}`);
    }
    
    // 添加新目录
    settings.skillDirs.push(newDir);
    this.saveSkillDirs(settings.skillDirs);
    
    return settings;
  }

  /**
   * 删除 Skill 目录
   */
  removeSkillDir(dirToRemove: string): WorkspaceSettings {
    const settings = this.getWorkspaceSettings();
    
    // 检查是否是默认目录
    if (dirToRemove === settings.defaultSkillDir) {
      throw new Error('不能删除默认 Skill 目录，请先设置其他目录为默认目录');
    }
    
    // 检查是否存在
    const index = settings.skillDirs.indexOf(dirToRemove);
    if (index === -1) {
      throw new Error(`Skill 目录不存在: ${dirToRemove}`);
    }
    
    // 删除目录
    settings.skillDirs.splice(index, 1);
    this.saveSkillDirs(settings.skillDirs);
    
    return settings;
  }

  /**
   * 设置默认 Skill 目录
   */
  setDefaultSkillDir(newDefaultDir: string): WorkspaceSettings {
    const settings = this.getWorkspaceSettings();
    
    // 检查是否在列表中
    if (!settings.skillDirs.includes(newDefaultDir)) {
      throw new Error(`Skill 目录不在列表中: ${newDefaultDir}`);
    }
    
    // 设置默认目录
    settings.defaultSkillDir = newDefaultDir;
    this.saveDefaultSkillDir(newDefaultDir);
    
    return settings;
  }

  /**
   * 保存图片生成目录配置
   */
  saveImageDir(imageDir: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_settings (key, value)
      VALUES (?, ?)
    `);
    stmt.run('imageDir', imageDir);
    console.info('[SystemConfigStore] ✅ 图片生成目录已保存:', imageDir);
  }

  /**
   * 保存记忆管理目录配置
   */
  saveMemoryDir(memoryDir: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_settings (key, value)
      VALUES (?, ?)
    `);
    stmt.run('memoryDir', memoryDir);
    console.info('[SystemConfigStore] ✅ 记忆管理目录已保存:', memoryDir);
  }

  /**
   * 保存工作目录配置（同时保存所有配置）
   */
  saveWorkspaceSettings(settings: WorkspaceSettings): void {
    this.saveWorkspaceDir(settings.workspaceDir);
    this.saveScriptDir(settings.scriptDir);
    this.saveSkillDirs(settings.skillDirs);
    this.saveDefaultSkillDir(settings.defaultSkillDir);
    this.saveImageDir(settings.imageDir);
    this.saveMemoryDir(settings.memoryDir);
  }

  /**
   * 保存默认工作目录
   */
  private saveWorkspaceDir(workspaceDir: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workspace_settings (key, value)
      VALUES (?, ?)
    `);
    stmt.run('workspaceDir', workspaceDir);
    console.info('[SystemConfigStore] ✅ 默认工作目录已保存:', workspaceDir);
  }

  /**
   * 获取模型配置
   */
  getModelConfig(): ModelConfig | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM model_config WHERE id = 1
      `);
      const row = stmt.get() as any;
      
      if (!row) return null;

      return {
        providerId: row.provider_id,
        providerName: row.provider_name,
        baseUrl: row.base_url,
        modelId: row.model_id,
        modelName: row.model_name,
        apiKey: row.api_key,
      };
    } catch (error) {
      console.error('[SystemConfigStore] 获取模型配置失败:', error);
      return null;
    }
  }

  /**
   * 保存模型配置
   */
  saveModelConfig(config: ModelConfig): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO model_config 
      (id, provider_id, provider_name, base_url, model_id, model_name, api_key)
      VALUES (1, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      config.providerId,
      config.providerName,
      config.baseUrl,
      config.modelId,
      config.modelName,
      config.apiKey
    );

    console.info('[SystemConfigStore] ✅ 模型配置已保存:', {
      provider: config.providerName,
      model: config.modelName,
    });
  }

  /**
   * 删除模型配置
   */
  deleteModelConfig(): void {
    const stmt = this.db.prepare(`
      DELETE FROM model_config WHERE id = 1
    `);
    stmt.run();
    console.info('[SystemConfigStore] ✅ 模型配置已删除');
  }

  /**
   * 获取图片生成工具配置
   */
  getImageGenerationToolConfig(): ImageGenerationToolConfig | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM tool_config_image_generation WHERE id = 1
      `);
      const row = stmt.get() as any;
      
      if (!row) return null;

      return {
        model: row.model,
        apiUrl: row.api_url,
        apiKey: row.api_key,
      };
    } catch (error) {
      console.error('[SystemConfigStore] 获取图片生成工具配置失败:', error);
      return null;
    }
  }

  /**
   * 保存图片生成工具配置
   */
  saveImageGenerationToolConfig(config: ImageGenerationToolConfig): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tool_config_image_generation 
      (id, model, api_url, api_key)
      VALUES (1, ?, ?, ?)
    `);

    stmt.run(
      config.model,
      config.apiUrl,
      config.apiKey
    );

    console.info('[SystemConfigStore] ✅ 图片生成工具配置已保存:', {
      model: config.model,
      apiUrl: config.apiUrl,
    });
  }

  /**
   * 删除图片生成工具配置
   */
  deleteImageGenerationToolConfig(): void {
    const stmt = this.db.prepare(`
      DELETE FROM tool_config_image_generation WHERE id = 1
    `);
    stmt.run();
    console.info('[SystemConfigStore] ✅ 图片生成工具配置已删除');
  }

  /**
   * 获取 Web Search 工具配置
   */
  getWebSearchToolConfig(): WebSearchToolConfig | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM tool_config_web_search WHERE id = 1
      `);
      const row = stmt.get() as any;
      
      if (!row) return null;

      return {
        provider: row.provider || 'qwen',
        model: row.model,
        apiUrl: row.api_url,
        apiKey: row.api_key,
      };
    } catch (error) {
      console.error('[SystemConfigStore] 获取 Web Search 工具配置失败:', error);
      return null;
    }
  }

  /**
   * 保存 Web Search 工具配置
   */
  saveWebSearchToolConfig(config: WebSearchToolConfig): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tool_config_web_search 
      (id, provider, model, api_url, api_key)
      VALUES (1, ?, ?, ?, ?)
    `);

    stmt.run(
      config.provider,
      config.model,
      config.apiUrl,
      config.apiKey
    );

    console.info('[SystemConfigStore] ✅ Web Search 工具配置已保存:', {
      provider: config.provider,
      model: config.model,
      apiUrl: config.apiUrl,
    });
  }

  /**
   * 删除 Web Search 工具配置
   */
  deleteWebSearchToolConfig(): void {
    const stmt = this.db.prepare(`
      DELETE FROM tool_config_web_search WHERE id = 1
    `);
    stmt.run();
    console.info('[SystemConfigStore] ✅ Web Search 工具配置已删除');
  }

  /**
   * 获取名字配置
   */
  getNameConfig(): { agentName: string; userName: string } {
    try {
      const stmt = this.db.prepare(`
        SELECT agent_name, user_name FROM name_config WHERE id = 1
      `);
      const row = stmt.get() as any;
      
      if (!row) {
        // 返回默认值
        return {
          agentName: 'matrix',
          userName: 'user',
        };
      }

      return {
        agentName: row.agent_name,
        userName: row.user_name,
      };
    } catch (error) {
      console.error('[SystemConfigStore] 获取名字配置失败:', error);
      return {
        agentName: 'matrix',
        userName: 'user',
      };
    }
  }

  /**
   * 保存智能体名字
   */
  saveAgentName(agentName: string): void {
    // 限制长度不超过 10 个字符
    const trimmedName = agentName.trim();
    if (trimmedName.length > 10) {
      throw new Error(`智能体名字过长（${trimmedName.length} 字符），最多 10 个字符`);
    }
    
    if (trimmedName.length === 0) {
      throw new Error('智能体名字不能为空');
    }
    
    // 先确保记录存在
    const existing = this.db.prepare('SELECT id FROM name_config WHERE id = 1').get();
    
    if (!existing) {
      // 插入默认记录
      this.db.prepare(`
        INSERT INTO name_config (id, agent_name, user_name)
        VALUES (1, ?, 'user')
      `).run(trimmedName);
    } else {
      // 更新
      this.db.prepare(`
        UPDATE name_config SET agent_name = ? WHERE id = 1
      `).run(trimmedName);
    }

    console.info('[SystemConfigStore] ✅ 智能体名字已保存:', trimmedName);
  }

  /**
   * 保存用户称呼
   */
  saveUserName(userName: string): void {
    // 限制长度不超过 10 个字符
    const trimmedName = userName.trim();
    if (trimmedName.length > 10) {
      throw new Error(`用户名字过长（${trimmedName.length} 字符），最多 10 个字符`);
    }
    
    if (trimmedName.length === 0) {
      throw new Error('用户名字不能为空');
    }
    
    // 先确保记录存在
    const existing = this.db.prepare('SELECT id FROM name_config WHERE id = 1').get();
    
    if (!existing) {
      // 插入默认记录
      this.db.prepare(`
        INSERT INTO name_config (id, agent_name, user_name)
        VALUES (1, 'matrix', ?)
      `).run(trimmedName);
    } else {
      // 更新
      this.db.prepare(`
        UPDATE name_config SET user_name = ? WHERE id = 1
      `).run(trimmedName);
    }

    console.info('[SystemConfigStore] ✅ 用户称呼已保存:', trimmedName);
  }

  /**
   * 保存名字配置（同时保存智能体名字和用户称呼）
   */
  saveNameConfig(agentName: string, userName: string): void {
    // 限制长度不超过 10 个字符
    const trimmedAgentName = agentName.trim();
    const trimmedUserName = userName.trim();
    
    if (trimmedAgentName.length > 10) {
      throw new Error(`智能体名字过长（${trimmedAgentName.length} 字符），最多 10 个字符`);
    }
    
    if (trimmedUserName.length > 10) {
      throw new Error(`用户名字过长（${trimmedUserName.length} 字符），最多 10 个字符`);
    }
    
    if (trimmedAgentName.length === 0) {
      throw new Error('智能体名字不能为空');
    }
    
    if (trimmedUserName.length === 0) {
      throw new Error('用户名字不能为空');
    }
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO name_config (id, agent_name, user_name)
      VALUES (1, ?, ?)
    `);
    stmt.run(trimmedAgentName, trimmedUserName);
    console.info('[SystemConfigStore] ✅ 名字配置已保存:', { agentName: trimmedAgentName, userName: trimmedUserName });
  }

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close();
  }
}
