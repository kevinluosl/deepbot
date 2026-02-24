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
 * 调用 Qwen API 进行网络搜索
 */
async function performQwenWebSearch(params: {
  query: string;
  enableSearch?: boolean;
  apiKey: string;
  apiUrl: string;
  model: string;
}): Promise<{ answer: string; sources: Array<{ title: string; url: string }> }> {
  const { query, enableSearch = true, apiKey, apiUrl, model } = params;

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
          json: async () => JSON.parse(data),
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
  
  // 提取搜索来源（如果有）
  const sources: Array<{ title: string; url: string }> = [];
  if (choice.message?.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.function?.name === 'web_search' && toolCall.function?.arguments) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
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
        } catch (error) {
          console.warn('[Web Search] 解析搜索来源失败:', error);
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
}): Promise<{ answer: string; sources: Array<{ title: string; url: string }> }> {
  const { query, apiKey, apiUrl, model } = params;

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
          json: async () => JSON.parse(data),
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
    description: '使用 Qwen 或 Gemini 进行网络搜索，获取最新的网络信息。适用于需要实时信息、新闻、天气、股票等场景。',
    parameters: WebSearchSchema,
    execute: async (_toolCallId: string, args: unknown) => {
      try {
        const params = args as {
          query: string;
          enableSearch?: boolean;
        };

        if (!params.query || !params.query.trim()) {
          throw new Error('搜索查询词不能为空');
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
