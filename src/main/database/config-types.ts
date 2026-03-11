/**
 * 系统配置类型定义
 */

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
  sessionDir: string;      // Session 目录（单一路径）
}

/**
 * 模型配置
 */
export interface ModelConfig {
  providerType: 'qwen' | 'deepseek' | 'gemini' | 'custom'; // 提供商类型（用于 UI 下拉选择）
  providerId: string;      // 提供商 ID
  providerName: string;    // 提供商名称
  baseUrl: string;         // API 地址
  modelId: string;         // 模型 ID（主模型）
  modelName: string;       // 模型名称
  apiType: string;         // API 类型（'openai-completions' | 'google-generative-ai'）
  modelId2?: string;       // 模型 ID 2（快速模型，选填，用于轻量级任务）
  apiKey: string;          // API Key（加密存储）
  contextWindow?: number;  // 上下文窗口大小（tokens）
  lastFetched?: number;    // 最后获取时间（时间戳）
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
