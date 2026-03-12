/**
 * 文本处理工具
 * 
 * 提供统一的文本处理函数
 */

/**
 * 移除文本中的 <think> 标签及其内容
 * 
 * 用于过滤 AI 模型返回的推理过程（如 MiniMax、DeepSeek 等模型）
 * 
 * @param text - 原始文本
 * @returns 移除 <think> 标签后的文本
 * 
 * @example
 * ```typescript
 * const text = "Hello <think>推理过程</think> World";
 * const result = stripThinkTags(text);
 * // result: "Hello  World"
 * ```
 */
export function stripThinkTags(text: string): string {
  if (!text) {
    return text;
  }
  
  // 移除完整的 <think>...</think> 块
  let filtered = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  
  // 移除未闭合的 thinking 开始部分（从 <think> 到文本结尾）
  filtered = filtered.replace(/<think>[\s\S]*$/g, '');
  
  // 移除未开始的 thinking 结束部分（从文本开始到 </think>）
  filtered = filtered.replace(/^[\s\S]*?<\/think>/g, '');
  
  return filtered.trim();
}
