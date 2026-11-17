/**
 * 工具配置管理
 */

import type Database from '../../shared/utils/sqlite-adapter';
import type { ImageGenerationToolConfig, WebSearchToolConfig, MediaAnalysisToolConfig } from './config-types';

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
 * 获取 Web Search 工具配置
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
      provider: row.search_provider || 'tavily',
    };
  } catch (error) {
    console.error('[SystemConfigStore] 获取 Web Search 工具配置失败:', error);
    return null;
  }
}

/**
 * 保存 Web Search 工具配置
 */
export function saveWebSearchToolConfig(db: Database.Database, config: WebSearchToolConfig): void {
  // 仅更新 API Key 的旧调用方保留用户已选择的提供商。
  const provider = config.provider ?? getWebSearchToolConfig(db)?.provider ?? 'tavily';
  if (provider !== 'tavily' && provider !== 'parallel') {
    throw new Error('不支持的 Web Search 提供商');
  }
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tool_config_web_search 
    (id, api_key, search_provider)
    VALUES (1, ?, ?)
  `);

  stmt.run(config.apiKey || '', provider);

  console.info('[SystemConfigStore] ✅ Web Search 工具配置已保存');
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

// ========== 多媒体分析工具配置 ==========

/**
 * 获取多媒体分析工具配置
 */
export function getMediaAnalysisToolConfig(db: Database.Database): MediaAnalysisToolConfig | null {
  try {
    const stmt = db.prepare(`
      SELECT * FROM tool_config_media_analysis WHERE id = 1
    `);
    const row = stmt.get() as any;
    
    if (!row) return null;

    return {
      model: row.model,
    };
  } catch (error) {
    console.error('[SystemConfigStore] 获取多媒体分析工具配置失败:', error);
    return null;
  }
}

/**
 * 保存多媒体分析工具配置
 */
export function saveMediaAnalysisToolConfig(db: Database.Database, config: MediaAnalysisToolConfig): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tool_config_media_analysis 
    (id, model)
    VALUES (1, ?)
  `);

  stmt.run(config.model);

  console.info('[SystemConfigStore] ✅ 多媒体分析工具配置已保存:', { model: config.model });
}

/**
 * 删除多媒体分析工具配置
 */
export function deleteMediaAnalysisToolConfig(db: Database.Database): void {
  const stmt = db.prepare(`
    DELETE FROM tool_config_media_analysis WHERE id = 1
  `);
  stmt.run();
  console.info('[SystemConfigStore] ✅ 多媒体分析工具配置已删除');
}
