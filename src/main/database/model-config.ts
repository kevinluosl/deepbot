/**
 * 模型配置管理
 */

import type Database from '../../shared/utils/sqlite-adapter';
import type { ModelConfig } from './config-types';

// 内存缓存，避免每次调用都重复查数据库和打印日志
let cachedConfig: ModelConfig | null | undefined = undefined;

/**
 * 清除缓存（保存/删除配置后调用）
 */
export function clearModelConfigCache(): void {
  cachedConfig = undefined;
}

/**
 * 从环境变量构建模型配置（fallback）
 * 
 * 优先级：数据库配置（UI 设置）> 环境变量
 * 仅在数据库中没有配置时使用
 */
function getModelConfigFromEnv(): ModelConfig | null {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const modelId = process.env.AI_MODEL_ID;

  // 三个核心字段都必须有才能构建有效配置
  if (!apiKey || !baseUrl || !modelId) return null;

  const apiType = process.env.AI_API_TYPE || 'openai-completions';
  const modelId2 = process.env.AI_MODEL_ID_2 || undefined;
  const providerName = process.env.AI_PROVIDER_NAME || '自定义';

  // 根据 apiType 推断 providerType
  const providerType = apiType === 'google-generative-ai' ? 'gemini' : 'custom';

  console.info('[ModelConfig] 使用环境变量中的模型配置（数据库中无配置）');

  return {
    providerType,
    providerId: providerType,
    providerName,
    baseUrl,
    modelId,
    modelId2,
    apiType,
    apiKey,
    fromEnv: true, // 标记来源，前端用于显示提示
  };
}

/**
 * 获取模型配置
 * 
 * 优先级：数据库配置 > 环境变量配置
 * 结果会缓存在内存中，避免重复查询
 */
export function getModelConfig(db: Database.Database): ModelConfig | null {
  // 命中缓存直接返回（undefined 表示未初始化，null 表示确实没有配置）
  if (cachedConfig !== undefined) return cachedConfig;

  try {
    const stmt = db.prepare(`
      SELECT * FROM model_config WHERE id = 1
    `);
    const row = stmt.get() as any;
    
    // 数据库有配置，直接返回（前端配置优先）
    if (row) {
      cachedConfig = {
        providerType: row.provider_type || 'qwen',
        providerId: row.provider_id,
        providerName: row.provider_name,
        baseUrl: row.base_url,
        modelId: row.model_id,
        apiType: row.api_type || 'openai-completions',
        modelId2: row.model_id_2 || undefined,
        apiKey: row.api_key,
        contextWindow: row.context_window,
        lastFetched: row.last_fetched,
        fromEnv: false,
      };
      return cachedConfig;
    }

    // 数据库无配置，尝试从环境变量读取（只打印一次日志）
    cachedConfig = getModelConfigFromEnv();
    return cachedConfig;
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
    config.modelId, // 使用 modelId 作为 model_name
    config.apiType || 'openai-completions', // 默认 OpenAI 兼容
    config.modelId2 || null, // 快速模型（选填）
    config.apiKey,
    config.contextWindow || null,
    config.lastFetched || null
  );
  
  // 强制同步到磁盘（WAL 模式下确保立即写入）
  db.pragma('wal_checkpoint(PASSIVE)');

  // 清除缓存，下次读取时重新从数据库加载
  clearModelConfigCache();

  console.info('[SystemConfigStore] ✅ 模型配置已保存并同步到磁盘:', {
    providerType: config.providerType,
    provider: config.providerName,
    model: config.modelId, // 使用 modelId
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
  clearModelConfigCache();
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
  clearModelConfigCache();
  console.info('[SystemConfigStore] ✅ 模型配置已删除');
}
