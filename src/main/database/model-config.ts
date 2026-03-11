/**
 * 模型配置管理
 */

import type Database from 'better-sqlite3';
import type { ModelConfig } from './config-types';

/**
 * 获取模型配置
 */
export function getModelConfig(db: Database.Database): ModelConfig | null {
  try {
    const stmt = db.prepare(`
      SELECT * FROM model_config WHERE id = 1
    `);
    const row = stmt.get() as any;
    
    if (!row) return null;

    return {
      providerType: row.provider_type || 'qwen',
      providerId: row.provider_id,
      providerName: row.provider_name,
      baseUrl: row.base_url,
      modelId: row.model_id,
      modelName: row.model_name,
      apiType: row.api_type || 'openai-completions', // 默认 OpenAI 兼容
      modelId2: row.model_id_2 || undefined, // 快速模型（选填）
      apiKey: row.api_key,
      contextWindow: row.context_window,
      lastFetched: row.last_fetched,
    };
  } catch (error) {
    console.error('[SystemConfigStore] 获取模型配置失败:', error);
    return null;
  }
}

/**
 * 保存模型配置
 */
export function saveModelConfig(db: Database.Database, config: ModelConfig): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO model_config 
    (id, provider_type, provider_id, provider_name, base_url, model_id, model_name, api_type, model_id_2, api_key, context_window, last_fetched)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    config.providerType,
    config.providerId,
    config.providerName,
    config.baseUrl,
    config.modelId,
    config.modelName,
    config.apiType || 'openai-completions', // 默认 OpenAI 兼容
    config.modelId2 || null, // 快速模型（选填）
    config.apiKey,
    config.contextWindow || null,
    config.lastFetched || null
  );
  
  // 强制同步到磁盘（WAL 模式下确保立即写入）
  db.pragma('wal_checkpoint(PASSIVE)');

  console.info('[SystemConfigStore] ✅ 模型配置已保存并同步到磁盘:', {
    providerType: config.providerType,
    provider: config.providerName,
    model: config.modelName,
    modelId2: config.modelId2 || '(未设置)',
    contextWindow: config.contextWindow,
  });
}

/**
 * 更新模型的上下文窗口大小
 */
export function updateModelContextWindow(db: Database.Database, contextWindow: number): void {
  const stmt = db.prepare(`
    UPDATE model_config SET context_window = ?, last_fetched = ? WHERE id = 1
  `);
  stmt.run(contextWindow, Date.now());
  
  // 强制同步到磁盘
  db.pragma('wal_checkpoint(PASSIVE)');
  
  console.info('[SystemConfigStore] ✅ 模型上下文窗口已更新:', contextWindow);
}

/**
 * 删除模型配置
 */
export function deleteModelConfig(db: Database.Database): void {
  const stmt = db.prepare(`
    DELETE FROM model_config WHERE id = 1
  `);
  stmt.run();
  console.info('[SystemConfigStore] ✅ 模型配置已删除');
}
