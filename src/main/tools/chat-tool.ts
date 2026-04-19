/**
 * Chat 工具（AI 对话工具）
 * 支持流式输出和长文本自动分段处理
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import type { Model } from '@mariozechner/pi-ai';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { TOOL_NAMES } from './tool-names';
import type { SystemConfigStore } from '../database/system-config-store';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';

const ChatToolSchema = Type.Object({
  prompt: Type.String({ description: '用户提示词或问题' }),
  content: Type.Optional(Type.String({ description: '需要处理的内容' })),
  systemPrompt: Type.Optional(Type.String({ description: '系统提示词' })),
  maxChunkSize: Type.Optional(Type.Number({ description: '分段大小，默认根据模型 contextWindow 动态计算' })),
});

const DEFAULT_CHUNK_OVERLAP = 200;

/**
 * 根据模型 contextWindow 动态计算分段大小
 * 预留 40% 输入空间，字符数按保守 1:2 估算（兼顾中英文）
 */
function calcMaxChunkSize(contextWindow: number): number {
  return Math.floor(contextWindow * 0.4) * 2;
}

function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
  if (text.length <= maxChunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;

    if (end < text.length) {
      // 尝试在句子边界处截断，避免切断语义
      const sentenceEnds = ['\n\n', '。', '！', '？', '.', '!', '?'];
      for (const sep of sentenceEnds) {
        const lastIndex = text.lastIndexOf(sep, end);
        if (lastIndex > start + maxChunkSize * 0.8) {
          end = lastIndex + sep.length;
          break;
        }
      }
    }

    chunks.push(text.slice(start, end));
    // 保留少量重叠，保持上下文连贯
    start = end - DEFAULT_CHUNK_OVERLAP;
    if (start < 0) start = end;
  }

  return chunks;
}

function createModel(configStore: SystemConfigStore): Model<'openai-completions'> {
  const modelConfig = configStore.getModelConfig();

  if (!modelConfig || !modelConfig.apiKey) {
    throw new Error('模型未配置。请在系统设置中配置 API Key');
  }

  // 与 agent-runtime 保持一致：从配置读取 contextWindow，maxTokens = contextWindow / 2
  const contextWindow = modelConfig.contextWindow || 32000;
  const maxTokens = Math.floor(contextWindow / 2);

  return {
    api: 'openai-completions',
    id: modelConfig.modelId,
    name: modelConfig.modelId,
    provider: modelConfig.providerName || 'openai',
    input: ['text'],
    reasoning: false,
    baseUrl: modelConfig.baseUrl,
    contextWindow,
    maxTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

async function callAIStream(params: {
  messages: Array<{ role: string; content: string }>;
  configStore: SystemConfigStore;
  signal?: AbortSignal;
  onUpdate?: (text: string) => void;
}): Promise<string> {
  const { messages, configStore, signal, onUpdate } = params;
  const modelConfig = configStore.getModelConfig();

  if (!modelConfig || !modelConfig.apiKey) {
    throw new Error('模型未配置');
  }

  if (signal?.aborted) {
    const err = new Error('AI 调用被取消');
    err.name = 'AbortError';
    throw err;
  }

  const model = createModel(configStore);
  // 动态导入 ESM 模块（使用 eval 绕过 TypeScript 编译器）
  // eslint-disable-next-line no-eval
  const piAI = await eval('import("@mariozechner/pi-ai")');

  const formattedMessages = messages.map(msg => ({
    role: msg.role as 'system' | 'user' | 'assistant',
    content: msg.content,
    timestamp: Date.now(),
  }));

  const context: any = { messages: formattedMessages };
  const piOptions: any = { temperature: 0.7, apiKey: modelConfig.apiKey };

  let fullResponse = '';

  try {
    const streamGenerator = piAI.streamSimple(model, context, piOptions);

    for await (const event of streamGenerator) {
      // 优先检查外部取消信号
      if (signal?.aborted) {
        const err = new Error('AI 调用被取消');
        err.name = 'AbortError';
        throw err;
      }

      if (event.type === 'error') {
        throw new Error(`AI API 错误: ${event.error?.errorMessage || '未知错误'}`);
      }

      if (event.type === 'text_delta' && event.delta) {
        fullResponse += event.delta;
        onUpdate?.(fullResponse);
      }

      if (event.type === 'done' && event.reason === 'error') {
        throw new Error(`AI API 错误: ${event.message?.content || '未知错误'}`);
      }
    }

    if (!fullResponse || fullResponse.trim().length === 0) {
      throw new Error('AI 返回空响应');
    }

    return fullResponse.trim();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        throw new Error('API Key 无效');
      } else if (error.message.includes('404') || error.message.includes('Not Found')) {
        throw new Error('模型不存在');
      } else if (error.message.includes('timeout')) {
        throw new Error('API 请求超时');
      }
    }
    throw error;
  }
}

export function createChatTool(configStore: SystemConfigStore): AgentTool {
  return {
    name: TOOL_NAMES.CHAT,
    label: 'AI Chat',
    description: '调用 AI 模型进行对话、翻译、总结、改写等任务。支持长文本自动分段处理和流式输出',
    parameters: ChatToolSchema,

    execute: async (
      _toolCallId: string,
      args: any,
      signal?: AbortSignal,
      onUpdate?: (result: AgentToolResult<any>) => void
    ): Promise<AgentToolResult<any>> => {
      try {
        const params = args as {
          prompt: string;
          content?: string;
          systemPrompt?: string;
          maxChunkSize?: number;
        };

        if (!params.prompt?.trim()) {
          throw new Error('缺少参数: prompt');
        }

        const modelConfig = configStore.getModelConfig();
        const contextWindow = modelConfig?.contextWindow || 32000;
        const maxChunkSize = params.maxChunkSize || calcMaxChunkSize(contextWindow);

        // 将 content 分段（无 content 时视为单段空字符串，统一走同一路径）
        const rawContent = params.content || '';
        const chunks = rawContent ? splitTextIntoChunks(rawContent, maxChunkSize) : [''];

        console.log(`[Chat Tool] 🚀 开始处理，共 ${chunks.length} 段`);

        const results: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
          if (signal?.aborted) {
            const err = new Error('Chat 操作被取消');
            err.name = 'AbortError';
            throw err;
          }

          console.log(`[Chat Tool] 处理第 ${i + 1}/${chunks.length} 段...`);

          const messages: Array<{ role: string; content: string }> = [];

          if (params.systemPrompt) {
            messages.push({ role: 'system', content: params.systemPrompt });
          }

          // 单段（无 content 或只有一段）直接拼接，多段加分段提示
          const userContent = chunks.length === 1
            ? (rawContent ? `${params.prompt}\n\n${chunks[i]}` : params.prompt)
            : `${params.prompt}\n\n[这是第 ${i + 1}/${chunks.length} 部分，请处理这部分内容，保持格式和风格一致]\n\n${chunks[i]}`;

          messages.push({ role: 'user', content: userContent });

          // 为每段创建独立 AbortController，避免上一段 stream 结束后污染外部 signal
          const chunkController = new AbortController();
          // 用 AbortSignal.any 联动外部取消（Node 20+ 支持）
          const chunkSignal = (AbortSignal as any).any
            ? (AbortSignal as any).any([chunkController.signal, ...(signal ? [signal] : [])])
            : chunkController.signal;
          if (signal && !(AbortSignal as any).any) {
            signal.addEventListener('abort', () => chunkController.abort(), { once: true });
          }

          const chunkAnswer = await callAIStream({
            messages,
            configStore,
            signal: chunkSignal,
            onUpdate: (text) => {
              const tempResults = [...results, text];
              onUpdate?.({
                content: [{ type: 'text', text: tempResults.join('\n\n') }],
                details: {
                  success: true,
                  chunks: chunks.length,
                  currentChunk: i + 1,
                  totalLength: tempResults.join('\n\n').length,
                  streaming: true,
                },
              });
            },
          });

          results.push(chunkAnswer);
        }

        const fullResult = results.join('\n\n');
        console.log('[Chat Tool] ✅ 全部完成');

        return {
          content: [{ type: 'text', text: fullResult }],
          details: { success: true, chunks: chunks.length, totalLength: fullResult.length, streaming: false },
        };
      } catch (error) {
        console.error('[Chat Tool] ❌ 失败:', error);
        return {
          content: [{ type: 'text', text: `❌ Chat 失败: ${getErrorMessage(error)}` }],
          details: { success: false, error: getErrorMessage(error) },
        };
      }
    },
  };
}


// ── ToolPlugin 接口 ──────────────────────────────────────────────────────────

export const chatToolPlugin: ToolPlugin = {
  metadata: {
    id: 'chat',
    name: 'AI 对话',
    version: '1.0.0',
    description: '调用 AI 模型进行对话，支持流式输出和长文本分段',
    author: 'DeepBot',
    category: 'ai',
    tags: ['chat', 'ai', 'conversation'],
    requiresConfig: true,
  },
  create: (options: ToolCreateOptions) => {
    if (!options.configStore) throw new Error('chatToolPlugin 需要 configStore');
    return createChatTool(options.configStore);
  },
};
