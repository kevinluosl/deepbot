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
    return 1000000;
  }

  // OpenAI GPT 系列
  if (lowerModelId.includes('gpt-5.4')) {
    return 1050000;
  }
  if (lowerModelId.includes('gpt-5') && lowerModelId.includes('codex')) {
    return 400000;
  }
  if (lowerModelId.includes('gpt-4o-mini')) {
    return 128000;
  }
  if (lowerModelId.includes('gpt')) {
    return 120000;
  }

  // DeepSeek 系列
  if (lowerModelId.includes('deepseek')) {
    return 164000;
  }

  // Qwen (通义千问) 系列
  if (lowerModelId.includes('qwen3.5-plus') || lowerModelId.includes('qwen-long')) {
    return 1000000;
  }
  if (lowerModelId.includes('qwen')) {
    return 256000;
  }

  // MiniMax 系列
  if (lowerModelId.includes('minimax') || lowerModelId.includes('abab')) {
    return 205000;
  }

  // GLM (智谱) 系列
  if (lowerModelId.includes('glm')) {
    return 203000;
  }

  // Moonshot / Kimi 系列
  if (lowerModelId.includes('kimi') || lowerModelId.includes('moonshot')) {
    return 262000;
  }

  // Gemini 系列
  if (lowerModelId.includes('gemini')) {
    return 1000000;
  }

  // 小米 MiMo 系列
  if (lowerModelId.includes('mimo-v2-pro')) {
    return 1000000;
  }
  if (lowerModelId.includes('mimo')) {
    return 262000;
  }
  
  // StepFun 阶跃星辰系列
  if (lowerModelId.includes('step')) {
    return 262000;
  }

  // 默认值（未知模型）
  return 160000;
}
