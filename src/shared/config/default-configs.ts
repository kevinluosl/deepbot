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
  deepbot: {
    name: 'DeepBot',
    baseUrl: 'https://www.im-director.com/api/llm-v1',
    defaultModelId: 'minimax-m2.5',
    defaultModelId2: 'minimax-m2.5',  // 快速模型
    apiType: 'openai-completions',
  },
  qwen: {
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModelId: 'qwen3.6-plus',
    defaultModelId2: 'qwen-plus',  // 快速模型
    apiType: 'openai-completions',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModelId: 'deepseek-chat',
    defaultModelId2: 'deepseek-chat',  // 快速模型（与主模型相同）
    apiType: 'openai-completions',
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModelId: 'gemini-3-pro-preview',
    defaultModelId2: 'gemini-3-flash-preview',  // 快速模型
    apiType: 'google-generative-ai',
  },
  minimax: {
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    defaultModelId: 'MiniMax-M2.5',
    defaultModelId2: 'MiniMax-M2.5-highspeed',  // 快速模型
    apiType: 'openai-completions',
  },
  custom: {
    name: '自定义',
    baseUrl: '',
    defaultModelId: '',
    defaultModelId2: '',  // 快速模型
    apiType: 'openai-completions',
  },
} as const;



/**
 * 图片生成提供商预设配置
 */
export const IMAGE_GENERATION_PROVIDER_PRESETS = {
  deepbot: {
    name: 'DeepBot（Nano banana 2）',
    baseUrl: 'https://www.im-director.com/api/gemini-v1',
    defaultModelId: 'gemini-3.1-flash-image-preview',
  },
  'deepbot-gpt': {
    name: 'DeepBot（GPT Image 2）',
    baseUrl: 'https://www.im-director.com/api/gpt-v1',
    defaultModelId: 'openai/gpt-image-2',
  },
  qwen: {
    name: 'Qwen Image',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    defaultModelId: 'qwen-image-2.0-pro',
  },
} as const;

/**
 * Web 搜索提供商预设配置
 */
export const WEB_SEARCH_PROVIDER_PRESETS = {
  deepbot: {
    name: 'DeepBot',
    baseUrl: 'https://www.im-director.com/api/gemini-v1',
    defaultModelId: 'gemini-3-flash-preview',
  },
  qwen: {
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModelId: 'qwen3.6-plus',
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
  modelId2: PROVIDER_PRESETS.qwen.defaultModelId2,  // 快速模型默认值
  apiType: PROVIDER_PRESETS.qwen.apiType,
  apiKey: '',
};

/**
 * 默认图片生成工具配置
 */
export const DEFAULT_IMAGE_GENERATION_CONFIG = {
  provider: 'deepbot' as const,
  model: IMAGE_GENERATION_PROVIDER_PRESETS.deepbot.defaultModelId,
  apiUrl: IMAGE_GENERATION_PROVIDER_PRESETS.deepbot.baseUrl,
  apiKey: '',
};

/**
 * 默认 Web 搜索工具配置
 */
export const DEFAULT_WEB_SEARCH_CONFIG = {
  provider: 'deepbot' as const,
  model: WEB_SEARCH_PROVIDER_PRESETS.deepbot.defaultModelId,
  apiUrl: WEB_SEARCH_PROVIDER_PRESETS.deepbot.baseUrl,
  apiKey: '',
};
