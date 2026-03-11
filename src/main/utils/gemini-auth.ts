/**
 * Gemini 认证工具
 * 
 * 简化版本，只支持 API Key 认证
 */

/**
 * 解析 Gemini API Key 并返回适当的认证头
 * 
 * @param apiKey - Google AI Studio API Key
 * @returns 认证头对象
 */
export function parseGeminiAuth(apiKey: string): { headers: Record<string, string> } {
  return {
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
  };
}