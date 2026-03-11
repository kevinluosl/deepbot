/**
 * AI 客户端工具
 * 
 * 提供统一的 AI API 调用接口
 * 使用 @mariozechner/pi-ai 包，支持多种模型
 * 
 * 优化特性：
 * - 连接池：复用 Model 实例和 HTTP 连接
 * - 单例模式：缓存 pi-ai 模块导入
 * - HTTP Keep-Alive：保持连接复用
 * - 预热连接：启动时建立连接
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
  signal?: AbortSignal;
  useFastModel?: boolean;  // 是否使用快速模型（modelId2）
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

// ==================== 连接池和缓存 ====================

/**
 * 缓存的 pi-ai 模块（单例模式）
 */
let cachedPiAI: any = null;

/**
 * 缓存的 Model 实例（连接池）
 */
let cachedModel: Model<'openai-completions' | 'google-generative-ai'> | null = null;

/**
 * 上次使用的配置 Key（用于检测配置变更）
 */
let lastConfigKey: string = '';

/**
 * 连接是否已预热
 */
let isWarmedUp: boolean = false;

/**
 * 生成配置 Key（用于检测配置变更）
 */
function generateConfigKey(config: any, options: AICallOptions): string {
  const model = options.model || config.modelId;
  const baseUrl = options.baseUrl || config.baseUrl;
  const apiKey = options.apiKey || config.apiKey;
  
  // 使用 API Key 的前 8 位 + 后 4 位作为标识（避免泄露完整 Key）
  const keyHash = apiKey 
    ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
    : 'no-key';
  
  return `${keyHash}-${model}-${baseUrl}`;
}

/**
 * 清除缓存（配置变更时调用）
 */
export function clearAICache(): void {
  console.log('[AI Client] 🔄 清除 AI 连接缓存');
  cachedModel = null;
  lastConfigKey = '';
  isWarmedUp = false;
}

/**
 * 创建 Model 实例
 * 
 * @param options - 调用选项
 * @returns Model 实例
 */
function createModel(options: AICallOptions = {}): Model<'openai-completions' | 'google-generative-ai'> {
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
  
  // 根据 API 类型创建不同的模型
  if (config.apiType === 'google-generative-ai') {
    return {
      api: 'google-generative-ai',
      id: model,
      name: config.modelName,
      provider: config.providerName,
      input: ['text', 'image'],
      reasoning: false,
      baseUrl: baseUrl,
      contextWindow: 32768,
      maxTokens: 8192,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
    } as Model<'google-generative-ai'>;
  }
  
  // 默认：OpenAI 兼容模式
  return {
    api: 'openai-completions',
    id: model,
    name: config.modelName,
    provider: config.providerName,
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
  } as Model<'openai-completions'>;
}

/**
 * 获取或创建 Model 实例（连接池）
 * 
 * @param options - 调用选项
 * @returns Model 实例
 */
function getOrCreateModel(options: AICallOptions = {}): Model<'openai-completions' | 'google-generative-ai'> {
  let config;
  try {
    config = getConfig();
  } catch (error) {
    throw new Error('模型未配置，无法创建 Model 实例');
  }

  // 如果请求使用快速模型且配置了 modelId2，使用 modelId2
  let modelId = options.model || config.modelId;
  if (options.useFastModel && config.modelId2) {
    modelId = config.modelId2;
  }

  // 生成配置 Key（包含 useFastModel 标志和 apiType）
  const configKey = generateConfigKey(config, { ...options, model: modelId }) + `-${config.apiType}`;

  // 如果配置未变且有缓存，直接返回
  if (cachedModel && lastConfigKey === configKey) {
    console.log('[AI Client] ♻️ 复用缓存的 Model 实例');
    return cachedModel;
  }

  // 配置变更或首次创建，创建新 Model
  cachedModel = createModel({ ...options, model: modelId });
  lastConfigKey = configKey;

  return cachedModel;
}

/**
 * 调用 AI 模型（优化版：连接池 + 缓存）
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
  } catch (error) {
    const errorMsg = '模型未配置，请在系统设置中配置 AI 模型后再使用';
    console.error('[AI Client] ❌', errorMsg);
    throw new Error(errorMsg);
  }

  const {
    temperature = 0.7,
    maxTokens,
    apiKey = config.apiKey,
    signal,
  } = options;

  // 检查是否已被取消
  if (signal?.aborted) {
    const err = new Error('AI 调用被取消');
    err.name = 'AbortError';
    throw err;
  }

  if (!apiKey) {
    throw new Error('AI API Key 未配置，请在系统设置中配置 AI 模型');
  }

  // 使用连接池获取 Model（复用实例）
  const model = getOrCreateModel(options);

  // 使用单例模式获取 pi-ai 模块（避免重复导入）
  if (!cachedPiAI) {
    // eslint-disable-next-line no-eval
    cachedPiAI = await eval('import("@mariozechner/pi-ai")');
  }

  const piAI = cachedPiAI;

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

  // 构建 pi-ai options（启用 Keep-Alive）
  const piOptions: any = {
    temperature,
    apiKey: apiKey,
    keepAlive: true,
    timeout: 30000,
  };

  // 如果是 Google Generative AI，添加特殊的认证处理
  if (model.api === 'google-generative-ai') {
    const { parseGeminiAuth } = await import('./gemini-auth');
    const authHeaders = parseGeminiAuth(apiKey);
    piOptions.headers = authHeaders.headers;
  }

  if (maxTokens) {
    piOptions.maxTokens = maxTokens;
  }

  try {
    // 创建一个可以被 signal 中止的 Promise
    const completePromise = piAI.complete(model, context, piOptions);

    // 如果有 signal，使用 Promise.race 来实现中止
    let result;
    if (signal) {
      const abortPromise = new Promise((_, reject) => {
        if (signal.aborted) {
          const err = new Error('AI 调用被取消');
          err.name = 'AbortError';
          reject(err);
          return;
        }

        const onAbort = () => {
          const err = new Error('AI 调用被取消');
          err.name = 'AbortError';
          reject(err);
        };

        signal.addEventListener('abort', onAbort, { once: true });
      });

      result = await Promise.race([completePromise, abortPromise]);
    } else {
      result = await completePromise;
    }

    // 检查是否有错误
    if (result.stopReason === 'error' && result.errorMessage) {
      throw new Error(`AI API 错误: ${result.errorMessage}`);
    }

    // 提取文本内容
    let responseText = '';
    for (const item of result.content) {
      if (item.type === 'text') {
        // 对于 Gemini，优先使用 textSignature 中的内容
        if (item.textSignature && (!item.text || item.text.trim().length === 0)) {
          try {
            // 尝试 Base64 解码
            const decoded = Buffer.from(item.textSignature, 'base64').toString('utf-8');
            responseText += decoded;
          } catch (decodeError) {
            responseText += item.textSignature;
          }
        } else {
          responseText += item.text;
        }
      }
    }

    // 如果仍然为空，尝试从 pi-ai 的 text 属性获取
    if (!responseText || responseText.trim().length === 0) {
      if (result.text && typeof result.text === 'string') {
        responseText = result.text;
      }
    }

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
    console.error('[AI Client] ❌ AI API 调用失败:', error);

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

// ==================== 连接预热 ====================

/**
 * 预热 AI 连接
 * 
 * 在应用启动时调用，提前建立连接，减少首次调用延迟
 * 
 * @returns 预热是否成功
 */
export async function warmupAIConnection(): Promise<boolean> {
  if (isWarmedUp) {
    console.log('[AI Client] ✅ AI 连接已预热，跳过');
    return true;
  }

  try {
    console.log('[AI Client] 🔥 开始预热 AI 连接...');

    const startTime = Date.now();

    // 发送一个极简请求来建立连接（使用快速模型）
    await callAI([
      { role: 'user', content: 'Hi' }
    ], {
      temperature: 0,
      maxTokens: 10,
      useFastModel: true,
    });

    const duration = Date.now() - startTime;

    isWarmedUp = true;
    console.log(`[AI Client] ✅ AI 连接预热完成 (耗时: ${duration}ms)`);

    return true;
  } catch (error) {
    // 预热失败不影响后续使用，只记录警告
    console.error('[AI Client] ❌ AI 连接预热失败:', error instanceof Error ? error.message : '未知错误');
    return false;
  }
}

/**
 * 检查连接是否已预热
 * 
 * @returns 是否已预热
 */
export function isAIConnectionWarmedUp(): boolean {
  return isWarmedUp;
}
