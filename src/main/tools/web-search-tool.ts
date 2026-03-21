/**
 * Web Search 工具
 * 
 * 使用 Qwen Web Search 能力进行网络搜索
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import https from 'node:https';
import { TIMEOUTS } from '../config/timeouts';
import { TOOL_NAMES } from './tool-names';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { safeJsonParse } from '../../shared/utils/json-utils';
import type { SystemConfigStore } from '../database/system-config-store';

// 创建禁用 SSL 验证的 Agent
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

/**
 * 获取工具配置（完全从数据库读取，不使用默认值）
 */
function getToolConfig(configStore: SystemConfigStore): {
  provider: string;
  apiKey: string;
  apiUrl: string;
  model: string;
} {
  const dbConfig = configStore.getWebSearchToolConfig();
  
  if (!dbConfig) {
    throw new Error('Web Search 工具未配置。请在系统设置 > 工具配置中配置 API Key 和地址');
  }
  
  if (!dbConfig.apiKey || !dbConfig.apiKey.trim()) {
    throw new Error('API Key 未配置。请在系统设置 > 工具配置中配置 API Key');
  }
  
  if (!dbConfig.apiUrl || !dbConfig.apiUrl.trim()) {
    throw new Error('API 地址未配置。请在系统设置 > 工具配置中配置 API 地址');
  }
  
  if (!dbConfig.model || !dbConfig.model.trim()) {
    throw new Error('模型未配置。请在系统设置 > 工具配置中选择模型');
  }
  
  return {
    provider: dbConfig.provider || 'qwen',
    apiKey: dbConfig.apiKey,
    apiUrl: dbConfig.apiUrl,
    model: dbConfig.model,
  };
}

/**
 * Web Search 参数
 */
const WebSearchSchema = Type.Object({
  query: Type.String({
    description: '搜索查询词（中文或英文）',
  }),
  enableSearch: Type.Optional(Type.Boolean({
    description: '是否启用网络搜索。默认 true',
  })),
});

/**
 * 查询文本长度限制（字符数）
 * 超过此限制会返回错误，避免 API 调用失败或超时
 */
const MAX_QUERY_LENGTH = 10000; // 约 10K 字符，对应约 3-4K tokens

/**
 * 调用 Qwen API 进行网络搜索
 */
async function performQwenWebSearch(params: {
  query: string;
  enableSearch?: boolean;
  apiKey: string;
  apiUrl: string;
  model: string;
  signal?: AbortSignal;
}): Promise<{ answer: string; sources: Array<{ title: string; url: string }> }> {
  const { query, enableSearch = true, apiKey, apiUrl, model, signal } = params;

  // 检查是否已被取消
  if (signal?.aborted) {
    const err = new Error('网络搜索操作被取消');
    err.name = 'AbortError';
    throw err;
  }

  // 构建请求体
  const requestBody = {
    model,
    messages: [
      {
        role: 'user',
        content: query,
      },
    ],
    enable_search: enableSearch,
  };

  console.log('[Web Search] 调用 Qwen API...');
  console.log(`   模型: ${model}`);
  console.log(`   查询: ${query}`);
  console.log(`   启用搜索: ${enableSearch}`);

  // 调用 API
  const url = `${apiUrl}/chat/completions`;
  
  console.log('[Web Search] 发送请求到:', url);
  
  const response = await new Promise<any>((resolve, reject) => {
    // 检查是否已被取消
    if (signal?.aborted) {
      const err = new Error('网络搜索操作被取消');
      err.name = 'AbortError';
      reject(err);
      return;
    }

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      agent: httpsAgent,
      timeout: TIMEOUTS.WEB_SEARCH_TIMEOUT,
    };

    const req = https.request(options, (res) => {
      console.log('[Web Search] 收到响应，状态码:', res.statusCode);
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('[Web Search] 响应接收完成');
        resolve({
          ok: res.statusCode === 200,
          status: res.statusCode,
          text: async () => data,
          json: async () => safeJsonParse(data, {}),
        });
      });
    });

    req.on('error', (err) => {
      console.error('[Web Search] 请求错误:', err);
      reject(err);
    });
    
    req.on('timeout', () => {
      console.error('[Web Search] 请求超时');
      req.destroy();
      reject(new Error('请求超时（30秒）'));
    });
    
    // 监听 AbortSignal
    if (signal) {
      const onAbort = () => {
        console.log('[Web Search] ⏹️ 收到停止信号，中止请求');
        req.destroy();
        const err = new Error('网络搜索操作被取消');
        err.name = 'AbortError';
        reject(err);
      };
      
      signal.addEventListener('abort', onAbort, { once: true });
      
      // 清理监听器
      req.on('close', () => {
        signal.removeEventListener('abort', onAbort);
      });
    }
    
    req.write(JSON.stringify(requestBody));
    req.end();
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen API 错误 (${response.status}): ${errorText}`);
  }

  const result: any = await response.json();
  
  // 提取回答和来源
  if (!result.choices || result.choices.length === 0) {
    throw new Error('API 返回空结果');
  }

  const choice = result.choices[0];
  const answer = choice.message?.content || '';
  
  // 检查是否有有效回答
  if (!answer || answer.trim().length === 0) {
    throw new Error('API 返回空回答，可能是输入文本过长或 API 限制');
  }
  
  // 提取搜索来源（如果有）
  const sources: Array<{ title: string; url: string }> = [];
  if (choice.message?.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.function?.name === 'web_search' && toolCall.function?.arguments) {
        const args = safeJsonParse<any>(toolCall.function.arguments, {});
        if (args.results && Array.isArray(args.results)) {
          for (const item of args.results) {
            if (item.title && item.url) {
              sources.push({
                title: item.title,
                url: item.url,
              });
            }
          }
        }
      }
    }
  }

  return {
    answer,
    sources,
  };
}

/**
 * 调用 Gemini API 进行网络搜索（使用 Grounding with Google Search）
 */
async function performGeminiWebSearch(params: {
  query: string;
  apiKey: string;
  apiUrl: string;
  model: string;
  signal?: AbortSignal;
}): Promise<{ answer: string; sources: Array<{ title: string; url: string }> }> {
  const { query, apiKey, apiUrl, model, signal } = params;

  // 检查是否已被取消
  if (signal?.aborted) {
    const err = new Error('网络搜索操作被取消');
    err.name = 'AbortError';
    throw err;
  }

  // 构建请求体（使用 google_search 工具）
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: query,
          },
        ],
      },
    ],
    tools: [
      {
        google_search: {},
      },
    ],
  };

  console.log('[Web Search] 调用 Gemini API...');
  console.log(`   模型: ${model}`);
  console.log(`   查询: ${query}`);

  // 调用 API
  const url = `${apiUrl}/models/${model}:generateContent`;
  
  console.log('[Web Search] 发送请求到:', url);
  
  const response = await new Promise<any>((resolve, reject) => {
    // 检查是否已被取消
    if (signal?.aborted) {
      const err = new Error('网络搜索操作被取消');
      err.name = 'AbortError';
      reject(err);
      return;
    }

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search + `?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      agent: httpsAgent,
      timeout: TIMEOUTS.WEB_SEARCH_TIMEOUT,
    };

    const req = https.request(options, (res) => {
      console.log('[Web Search] 收到响应，状态码:', res.statusCode);
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('[Web Search] 响应接收完成');
        resolve({
          ok: res.statusCode === 200,
          status: res.statusCode,
          text: async () => data,
          json: async () => safeJsonParse(data, {}),
        });
      });
    });

    req.on('error', (err) => {
      console.error('[Web Search] 请求错误:', err);
      reject(err);
    });
    
    req.on('timeout', () => {
      console.error('[Web Search] 请求超时');
      req.destroy();
      reject(new Error('请求超时（30秒）'));
    });
    
    // 监听 AbortSignal
    if (signal) {
      const onAbort = () => {
        console.log('[Web Search] ⏹️ 收到停止信号，中止请求');
        req.destroy();
        const err = new Error('网络搜索操作被取消');
        err.name = 'AbortError';
        reject(err);
      };
      
      signal.addEventListener('abort', onAbort, { once: true });
      
      // 清理监听器
      req.on('close', () => {
        signal.removeEventListener('abort', onAbort);
      });
    }
    
    req.write(JSON.stringify(requestBody));
    req.end();
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 错误 (${response.status}): ${errorText}`);
  }

  const result: any = await response.json();
  
  // 提取回答和来源
  if (!result.candidates || result.candidates.length === 0) {
    throw new Error('API 返回空结果');
  }

  const candidate = result.candidates[0];
  const content = candidate.content;
  
  // 提取文本回答
  let answer = '';
  if (content?.parts) {
    for (const part of content.parts) {
      if (part.text) {
        answer += part.text;
      }
    }
  }
  
  // 检查是否有有效回答
  if (!answer || answer.trim().length === 0) {
    throw new Error('API 返回空回答，可能是输入文本过长或 API 限制');
  }
  
  // 提取搜索来源（从 groundingMetadata）
  const sources: Array<{ title: string; url: string }> = [];
  if (candidate.groundingMetadata?.groundingChunks) {
    for (const chunk of candidate.groundingMetadata.groundingChunks) {
      if (chunk.web?.title && chunk.web?.uri) {
        sources.push({
          title: chunk.web.title,
          url: chunk.web.uri,
        });
      }
    }
  }

  return {
    answer,
    sources,
  };
}

/**
 * 创建 Web Search 工具
 */
export function createWebSearchTool(configStore: SystemConfigStore): AgentTool {
  return {
    name: TOOL_NAMES.WEB_SEARCH,
    label: 'Web Search',
    description: '网络搜索工具。系统内置 Qwen（enable_search）和 Gemini（Grounding with Google Search）两个提供商，可在工具配置中切换；如需调用其他搜索提供商接口，可通过安装 Skill 扩展。适用于需要实时信息、新闻、天气、股票等场景。',
    parameters: WebSearchSchema,
    execute: async (_toolCallId: string, args: unknown, signal?: AbortSignal) => {
      try {
        // 检查是否已被取消（执行前）
        if (signal?.aborted) {
          const err = new Error('网络搜索操作被取消');
          err.name = 'AbortError';
          throw err;
        }

        const params = args as {
          query: string;
          enableSearch?: boolean;
        };

        if (!params.query || !params.query.trim()) {
          throw new Error('搜索查询词不能为空');
        }

        // 检查查询文本长度
        if (params.query.length > MAX_QUERY_LENGTH) {
          throw new Error(
            `查询文本过长（${params.query.length} 字符），超过限制（${MAX_QUERY_LENGTH} 字符）。` +
            `建议：1) 缩短查询文本；2) 分段处理；3) 使用摘要后再查询。`
          );
        }

        // 获取工具配置
        const toolConfig = getToolConfig(configStore);

        console.log('[Web Search] 开始搜索...');
        console.log(`   提供商: ${toolConfig.provider}`);
        console.log(`   查询: ${params.query}`);

        // 根据提供商选择不同的 API 调用方式
        let answer: string;
        let sources: Array<{ title: string; url: string }>;

        if (toolConfig.provider === 'gemini') {
          // 使用 Gemini API（Grounding with Google Search）
          const result = await performGeminiWebSearch({
            query: params.query,
            apiKey: toolConfig.apiKey,
            apiUrl: toolConfig.apiUrl,
            model: toolConfig.model,
            signal,
          });
          answer = result.answer;
          sources = result.sources;
        } else {
          // 使用 Qwen API（enable_search）
          const result = await performQwenWebSearch({
            query: params.query,
            enableSearch: params.enableSearch,
            apiKey: toolConfig.apiKey,
            apiUrl: toolConfig.apiUrl,
            model: toolConfig.model,
            signal,
          });
          answer = result.answer;
          sources = result.sources;
        }

        console.log('[Web Search] ✅ 搜索成功');
        console.log(`   来源数量: ${sources.length}`);

        // 构建格式化的结果（使用 Markdown）
        let resultText = `**搜索结果**\n\n${answer}`;
        
        if (sources.length > 0) {
          resultText += '\n\n**参考来源**\n\n';
          sources.forEach((source, index) => {
            resultText += `${index + 1}. [${source.title}](${source.url})\n`;
          });
        }

        return {
          type: 'tool-result',
          details: {
            success: true,
            provider: toolConfig.provider,
            query: params.query,
            answer,
            sources,
            sourceCount: sources.length,
            toolName: TOOL_NAMES.WEB_SEARCH,
          },
          content: [
            {
              type: 'text',
              text: resultText,
            },
          ],
        };
      } catch (error) {
        console.error('[Web Search] ❌ 搜索失败:', error);
        const errorMessage = getErrorMessage(error);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: errorMessage,
                message: '搜索失败，请检查参数和网络连接',
              }, null, 2),
            },
          ],
          details: {
            success: false,
            error: errorMessage,
          },
          isError: true,
        };
      }
    },
  };
}
