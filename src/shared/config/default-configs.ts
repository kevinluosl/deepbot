/**
 * 默认配置常量
 * 
 * 统一管理系统的默认配置值，避免硬编码
 * 前端和后端都应该从这里导入配置
 */

/**
 * 提供商预设配置
 */
export const PROVIDER_PRESETS = {
  qwen: {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModelId: 'qwen3.5-plus',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModelId: 'deepseek-chat',
  },
  custom: {
    name: '自定义',
    baseUrl: '',
    defaultModelId: '',
  },
} as const;



/**
 * Web 搜索提供商预设配置
 */
export const WEB_SEARCH_PROVIDER_PRESETS = {
  qwen: {
    name: '通义千问 (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModelId: 'qwen3.5-plus',
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://www.im-director.com/api/gemini-proxy',
    defaultModelId: 'gemini-3-flash-preview',
  },
  custom: {
    name: '自定义',
    baseUrl: '',
    defaultModelId: '',
  },
} as const;

/**
 * 默认模型配置
 */
export const DEFAULT_MODEL_CONFIG = {
  providerType: 'qwen' as const,
  providerId: 'qwen',
  providerName: PROVIDER_PRESETS.qwen.name,
  baseUrl: PROVIDER_PRESETS.qwen.baseUrl,
  modelId: PROVIDER_PRESETS.qwen.defaultModelId,
  modelName: PROVIDER_PRESETS.qwen.defaultModelId,
  apiKey: '',
};

/**
 * 默认图片生成工具配置
 */
export const DEFAULT_IMAGE_GENERATION_CONFIG = {
  model: 'gemini-3-pro-image-preview',
  apiUrl: 'https://www.im-director.com/api/gemini-proxy',
  apiKey: '',
};

/**
 * 默认 Web 搜索工具配置
 */
export const DEFAULT_WEB_SEARCH_CONFIG = {
  provider: 'qwen' as const,
  model: WEB_SEARCH_PROVIDER_PRESETS.qwen.defaultModelId,
  apiUrl: WEB_SEARCH_PROVIDER_PRESETS.qwen.baseUrl,
  apiKey: '',
};
