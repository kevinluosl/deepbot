/**
 * AI 客户端工具
 * 
 * 提供统一的 AI API 调用接口
 * 使用 @mariozechner/pi-ai 包，支持多种模型
 */

import type { Model } from '@mariozechner/pi-ai';
import { getConfig } from '../config';

/**
 * AI 消息类型
 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * AI 调用选项
 */
export interface AICallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * AI 响应类型
 */
export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 创建 Model 实例
 * 
 * @param options - 调用选项
 * @returns Model 实例
 */
function createModel(options: AICallOptions = {}): Model<'openai-completions'> {
  let config;
  try {
    config = getConfig();
  } catch (error) {
    throw new Error('模型未配置，无法创建 Model 实例');
  }
  
  const {
    model = config.modelId,
    baseUrl = config.baseUrl,
  } = options;
  
  return {
    api: 'openai-completions',
    id: model,
    name: config.modelName,
    provider: config.providerName, // 始终使用配置中的 provider
    input: ['text'],
    reasoning: false,
    baseUrl: baseUrl,
    contextWindow: 8192,
    maxTokens: 8192,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  };
}

/**
 * 调用 AI 模型
 * 
 * @param messages - 消息列表
 * @param options - 调用选项
 * @returns AI 响应
 * 
 * @example
 * ```typescript
 * const response = await callAI([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * console.log(response.content);
 * ```
 */
export async function callAI(
  messages: AIMessage[],
  options: AICallOptions = {}
): Promise<AIResponse> {
  let config;
  
  try {
    config = getConfig();
    console.log('[AI Client] 获取到的配置:', {
      providerName: config.providerName,
      modelId: config.modelId,
      baseUrl: config.baseUrl,
      hasApiKey: !!config.apiKey,
    });
  } catch (error) {
    throw new Error('模型未配置，请在系统设置中配置 AI 模型后再使用');
  }
  
  const {
    temperature = 0.7,
    maxTokens,
    apiKey = config.apiKey,
  } = options;
  
  if (!apiKey) {
    throw new Error('AI API Key 未配置，请在系统设置中配置 AI 模型');
  }
  
  // 创建 Model
  const model = createModel(options);
  console.log('[AI Client] 创建的 Model 对象:', {
    api: model.api,
    id: model.id,
    provider: model.provider,
    baseUrl: model.baseUrl,
  });
  
  // 动态导入 pi-ai（ESM 模块）
  // eslint-disable-next-line no-eval
  const piAI = await eval('import("@mariozechner/pi-ai")');
  
  // 转换消息格式
  const formattedMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content,
    timestamp: Date.now(),
  }));
  
  // 构建 Context
  const context: any = {
    messages: formattedMessages,
  };
  
  // 构建 pi-ai options
  const piOptions: any = {
    temperature,
    apiKey: apiKey, // 直接传递 apiKey
  };
  
  if (maxTokens) {
    piOptions.maxTokens = maxTokens;
  }
  
  console.log('[AI Client] 调用参数:', {
    modelId: model.id,
    modelProvider: model.provider,
    messagesCount: formattedMessages.length,
    hasApiKey: !!piOptions.apiKey,
    apiKeyLength: piOptions.apiKey?.length,
    temperature: piOptions.temperature,
  });
  
  try {
    // 调用 pi-ai 的 complete 方法（非流式）
    // 签名: complete(model, context, options) => Promise<AssistantMessage>
    const result = await piAI.complete(model, context, piOptions);
    
    // 检查是否有错误（在记录日志之前）
    if (result.stopReason === 'error' && result.errorMessage) {
      console.error('[AI Client] ❌ AI 调用失败');
      console.error('[AI Client] 错误原因:', result.errorMessage);
      throw new Error(`AI API 错误: ${result.errorMessage}`);
    }
    
    console.log('[AI Client] ✅ AI 调用成功');
    console.log('[AI Client] 响应类型:', typeof result);
    console.log('[AI Client] 响应结构:', {
      role: result.role,
      contentLength: result.content?.length,
      stopReason: result.stopReason,
    });
    
    // 提取文本内容
    // AssistantMessage.content 是 (TextContent | ThinkingContent | ToolCall)[]
    let responseText = '';
    for (const item of result.content) {
      if (item.type === 'text') {
        responseText += item.text;
      } else if (item.type === 'thinking') {
        // 可选：是否包含思考内容
        // responseText += item.thinking;
      }
    }
    
    console.log('[AI Client] 提取的文本长度:', responseText.length);
    console.log('[AI Client] 文本内容:', responseText.substring(0, 100));
    
    if (!responseText || responseText.trim().length === 0) {
      throw new Error('AI 返回空响应');
    }
    
    // 返回响应
    return {
      content: responseText.trim(),
      usage: {
        promptTokens: result.usage.input,
        completionTokens: result.usage.output,
        totalTokens: result.usage.totalTokens,
      },
    };
  } catch (error) {
    console.error('AI API 调用失败:', error);
    
    // 提供更友好的错误提示
    let errorMessage = 'AI API 调用失败';
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'API Key 无效，请在系统设置中检查配置';
      } else if (error.message.includes('404') || error.message.includes('Not Found')) {
        errorMessage = '模型不存在，请在系统设置中检查模型 ID';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'API 请求超时，请检查网络连接';
      } else {
        errorMessage = `AI API 调用失败: ${error.message}`;
      }
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * 简化的单次对话调用
 * 
 * @param prompt - 用户提示词
 * @param options - 调用选项
 * @returns AI 响应内容
 * 
 * @example
 * ```typescript
 * const answer = await askAI('What is 2+2?');
 * console.log(answer); // "4"
 * ```
 */
export async function askAI(
  prompt: string,
  options: AICallOptions = {}
): Promise<string> {
  const response = await callAI([
    { role: 'user', content: prompt }
  ], options);
  
  return response.content;
}
