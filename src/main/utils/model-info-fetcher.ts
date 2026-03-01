/**
 * 模型信息获取工具
 * 
 * 通过模糊匹配推断模型的上下文窗口大小
 */

/**
 * 从模型 ID 推断上下文窗口大小（模糊匹配）
 * 
 * @param modelId - 模型 ID
 * @returns 上下文窗口大小（tokens），未知返回默认值 32000
 */
export function getContextWindowFromModelId(modelId: string): number {
  const lowerModelId = modelId.toLowerCase();
  
  // Claude 系列
  if (lowerModelId.includes('claude')) {
    return 200000;
  }
  
  // OpenAI GPT 系列
  if (lowerModelId.includes('gpt-4o')) {
    return 128000;
  }
  if (lowerModelId.includes('gpt-4')) {
    return 128000;
  }
  if (lowerModelId.includes('gpt-3.5') || lowerModelId.includes('gpt-35')) {
    return 16000;
  }
  if (lowerModelId.includes('gpt')) {
    return 128000; // GPT 系列默认值
  }
  
  // DeepSeek 系列
  if (lowerModelId.includes('deepseek')) {
    return 64000;
  }
  
  // Qwen (通义千问) 系列
  if (lowerModelId.includes('qwen3.5-plus')) {
    return 1000000; // Qwen 3.5 Plus 支持 1M 上下文
  }
  if (lowerModelId.includes('qwen-long')) {
    return 1000000;
  }
  if (lowerModelId.includes('qwen')) {
    return 32000; // Qwen 系列默认值
  }
  
  // MiniMax 系列
  if (lowerModelId.includes('minimax') || lowerModelId.includes('abab')) {
    return 245000; // MiniMax 默认值
  }
  
  // GLM (智谱) 系列
  if (lowerModelId.includes('glm')) {
    return 128000; // GLM 系列默认值
  }
  
  // 默认值（未知模型）
  return 32000;
}
