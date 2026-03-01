/**
 * 配置管理
 */

import { SystemConfigStore } from './database/system-config-store';

export interface DeepBotConfig {
  // API Key
  apiKey: string;
  
  // Base URL（OpenAI 兼容端点）
  baseUrl: string;
  
  // 模型 ID
  modelId: string;
  
  // 模型名称（用于显示）
  modelName: string;
  
  // 提供商名称（用于 pi-agent-core）
  providerName: string;
}

/**
 * 获取配置
 * 
 * 优先级：
 * 1. 数据库配置
 * 2. 环境变量
 * 3. 抛出错误（需要用户配置）
 */
export function getConfig(): DeepBotConfig {
  // 尝试从数据库读取配置
  try {
    const store = SystemConfigStore.getInstance();
    const modelConfig = store.getModelConfig();
    
    if (modelConfig && modelConfig.apiKey && modelConfig.baseUrl && modelConfig.modelId) {
      return {
        apiKey: modelConfig.apiKey,
        baseUrl: modelConfig.baseUrl,
        modelId: modelConfig.modelId,
        modelName: modelConfig.modelName,
        providerName: modelConfig.providerId,
      };
    }
  } catch (error) {
    console.warn('[Config] ❌ 从数据库读取配置失败:', error);
  }
  
  // 从环境变量读取配置
  const apiKey = process.env.AI_API_KEY || process.env.QWEN_API_KEY || '';
  const baseUrl = process.env.AI_BASE_URL || '';
  const modelId = process.env.AI_MODEL_ID || '';
  const modelName = process.env.AI_MODEL_NAME || '';
  const providerName = process.env.AI_PROVIDER_NAME || '';
  
  // 如果没有配置，抛出错误
  if (!apiKey || !baseUrl || !modelId) {
    console.error('[Config] ❌ 模型未配置');
    throw new Error('模型未配置，请在系统设置中配置 AI 模型');
  }
  
  return {
    apiKey,
    baseUrl,
    modelId,
    modelName,
    providerName,
  };
}

/**
 * 检查配置是否存在
 */
export function hasConfig(): boolean {
  try {
    // 检查数据库配置
    const store = SystemConfigStore.getInstance();
    const modelConfig = store.getModelConfig();
    
    if (modelConfig && modelConfig.apiKey) {
      return true;
    }
  } catch (error) {
    console.warn('[Config] 检查数据库配置失败:', error);
  }
  
  // 检查环境变量
  const apiKey = process.env.AI_API_KEY || process.env.QWEN_API_KEY || '';
  const baseUrl = process.env.AI_BASE_URL || '';
  const modelId = process.env.AI_MODEL_ID || '';
  
  return !!(apiKey && baseUrl && modelId);
}
