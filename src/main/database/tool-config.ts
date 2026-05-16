/**
 * 工具配置管理
 */

import type Database from '../../shared/utils/sqlite-adapter';
import type { ImageGenerationToolConfig, WebSearchToolConfig } from './config-types';

// ========== 图片生成工具配置 ==========

/**
 * 获取图片生成工具配置
 */
export function getImageGenerationToolConfig(db: Database.Database): ImageGenerationToolConfig | null {
  try {
    const stmt = db.prepare(`
      SELECT * FROM tool_config_image_generation WHERE id = 1
    `);
    const row = stmt.get() as any;
    
    if (!row) return null;

    return {
      provider: row.provider,
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
export function saveImageGenerationToolConfig(db: Database.Database, config: ImageGenerationToolConfig): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tool_config_image_generation 
    (id, provider, model, api_url, api_key)
    VALUES (1, ?, ?, ?, ?)
  `);

  stmt.run(
    config.provider || 'gemini',
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
export function deleteImageGenerationToolConfig(db: Database.Database): void {
  const stmt = db.prepare(`
    DELETE FROM tool_config_image_generation WHERE id = 1
  `);
  stmt.run();
  console.info('[SystemConfigStore] ✅ 图片生成工具配置已删除');
}

// ========== Web Search 工具配置 ==========

/**
 * 获取 Web Search 工具配置（Tavily Search API）
 */
export function getWebSearchToolConfig(db: Database.Database): WebSearchToolConfig | null {
  try {
    const stmt = db.prepare(`
      SELECT * FROM tool_config_web_search WHERE id = 1
    `);
    const row = stmt.get() as any;
    
    if (!row) return null;

    return {
      apiKey: row.api_key,
    };
  } catch (error) {
    console.error('[SystemConfigStore] 获取 Web Search 工具配置失败:', error);
    return null;
  }
}

/**
 * 保存 Web Search 工具配置（Tavily Search API）
 */
export function saveWebSearchToolConfig(db: Database.Database, config: WebSearchToolConfig): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tool_config_web_search 
    (id, api_key)
    VALUES (1, ?)
  `);

  stmt.run(config.apiKey);

  console.info('[SystemConfigStore] ✅ Web Search 工具配置已保存（Tavily）');
}

/**
 * 删除 Web Search 工具配置
 */
export function deleteWebSearchToolConfig(db: Database.Database): void {
  const stmt = db.prepare(`
    DELETE FROM tool_config_web_search WHERE id = 1
  `);
  stmt.run();
  console.info('[SystemConfigStore] ✅ Web Search 工具配置已删除');
}
