/**
 * Web Search 工具
 *
 * 使用 Tavily Search API 进行网络搜索
 * 注册免费 API Key：https://tavily.com
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { TIMEOUTS } from '../config/timeouts';
import { TOOL_NAMES } from './tool-names';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { httpPost } from '../../shared/utils/http-utils';
import type { SystemConfigStore } from '../database/system-config-store';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * 获取 Tavily API Key（从数据库读取）
 */
function getApiKey(configStore: SystemConfigStore): string {
  const dbConfig = configStore.getWebSearchToolConfig();

  if (!dbConfig || !dbConfig.apiKey || !dbConfig.apiKey.trim()) {
    throw new Error(
      'Tavily API Key 未配置。请在系统设置 > 工具配置 > Web Search 中填写 API Key。\n' +
      '免费注册地址：https://tavily.com'
    );
  }

  return dbConfig.apiKey.trim();
}

/**
 * Web Search 参数
 */
const WebSearchSchema = Type.Object({
  query: Type.String({
    description: '搜索查询词（中文或英文）',
  }),
  maxResults: Type.Optional(Type.Number({
    description: '返回结果数量（1-20，默认 10）',
    minimum: 1,
    maximum: 20,
  })),
  searchDepth: Type.Optional(Type.String({
    description: '搜索深度：basic（默认）或 advanced',
  })),
  topic: Type.Optional(Type.String({
    description: '搜索主题：general（默认）或 news',
  })),
  timeRange: Type.Optional(Type.String({
    description: '时间范围：day、week、month、year',
  })),
  includeDomains: Type.Optional(Type.Array(Type.String(), {
    description: '只搜索这些域名（如 ["docs.python.org"]）',
  })),
  excludeDomains: Type.Optional(Type.Array(Type.String(), {
    description: '排除这些域名',
  })),
});

/**
 * 调用 Tavily Search API
 */
async function performTavilySearch(params: {
  query: string;
  maxResults?: number;
  searchDepth?: string;
  topic?: string;
  timeRange?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  apiKey: string;
  signal?: AbortSignal;
}): Promise<{
  answer?: string;
  results: Array<{ title: string; url: string; content: string; score: number }>;
  responseTime?: number;
}> {
  const {
    query,
    maxResults = 10,
    searchDepth = 'basic',
    topic = 'general',
    timeRange,
    includeDomains,
    excludeDomains,
    apiKey,
    signal,
  } = params;

  // 检查是否已被取消
  if (signal?.aborted) {
    const err = new Error('网络搜索操作被取消');
    err.name = 'AbortError';
    throw err;
  }

  const body: Record<string, unknown> = {
    query,
    max_results: Math.max(1, Math.min(maxResults, 20)),
    search_depth: searchDepth,
    topic,
    include_answer: true,
  };

  if (timeRange) body.time_range = timeRange;
  if (includeDomains && includeDomains.length > 0) body.include_domains = includeDomains;
  if (excludeDomains && excludeDomains.length > 0) body.exclude_domains = excludeDomains;

  console.log('[Web Search] 调用 Tavily API...');
  console.log(`   查询: ${query}`);
  console.log(`   深度: ${searchDepth}，主题: ${topic}，最大结果: ${maxResults}`);

  const response = await httpPost<any>(TAVILY_API_URL, body, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    timeout: TIMEOUTS.WEB_SEARCH_TIMEOUT,
    signal,
  });

  if (!response.ok) {
    const errDetail = response.error || `HTTP ${response.status}`;
    throw new Error(`Tavily API 错误 (${response.status}): ${errDetail}`);
  }

  const data = response.data;

  return {
    answer: data?.answer,
    results: (data?.results ?? []).map((r: any) => ({
      title: String(r.title ?? '').trim(),
      url: String(r.url ?? '').trim(),
      content: String(r.content ?? '').trim(),
      score: r.score ?? 0,
    })),
    responseTime: data?.response_time,
  };
}

/**
 * 创建 Web Search 工具（Tavily）
 */
export function createWebSearchTool(configStore: SystemConfigStore): AgentTool {
  return {
    name: TOOL_NAMES.WEB_SEARCH,
    label: 'Web Search',
    description:
      '网络搜索工具（Tavily Search API）。适用于需要实时信息、新闻、天气、股票等场景。',
    parameters: WebSearchSchema,
    execute: async (_toolCallId: string, args: unknown, signal?: AbortSignal) => {
      try {
        if (signal?.aborted) {
          const err = new Error('网络搜索操作被取消');
          err.name = 'AbortError';
          throw err;
        }

        const params = args as {
          query: string;
          maxResults?: number;
          searchDepth?: string;
          topic?: string;
          timeRange?: string;
          includeDomains?: string[];
          excludeDomains?: string[];
        };

        if (!params.query || !params.query.trim()) {
          throw new Error('搜索查询词不能为空');
        }

        const apiKey = getApiKey(configStore);

        const { answer, results, responseTime } = await performTavilySearch({
          ...params,
          apiKey,
          signal,
        });

        console.log(`[Web Search] ✅ 搜索成功，返回 ${results.length} 条结果`);

        // 构建格式化结果（Markdown）
        let resultText = '';

        if (answer) {
          resultText += `**搜索摘要**\n\n${answer}\n\n`;
        }

        if (results.length > 0) {
          resultText += `**搜索结果（${results.length} 条）**\n\n`;
          for (const [index, r] of results.entries()) {
            const relevance = r.score ? ` (相关度: ${(r.score * 100).toFixed(0)}%)` : '';
            resultText += `${index + 1}. **[${r.title}](${r.url})**${relevance}\n`;
            if (r.content) {
              const snippet = r.content.length > 300 ? r.content.slice(0, 300) + '...' : r.content;
              resultText += `   ${snippet}\n`;
            }
            resultText += '\n';
          }
        }

        if (responseTime) {
          resultText += `\n*响应时间: ${responseTime}s*`;
        }

        return {
          type: 'tool-result',
          details: {
            success: true,
            query: params.query,
            answer,
            results,
            resultCount: results.length,
            toolName: TOOL_NAMES.WEB_SEARCH,
          },
          content: [
            {
              type: 'text',
              text: resultText || '未找到相关结果',
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
              text: JSON.stringify(
                {
                  success: false,
                  error: errorMessage,
                  message: '搜索失败，请检查 API Key 和网络连接',
                },
                null,
                2
              ),
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

// ── ToolPlugin 接口 ──────────────────────────────────────────────────────────

export const webSearchToolPlugin: ToolPlugin = {
  metadata: {
    id: 'web-search',
    name: 'Web 搜索',
    version: '2.0.0',
    description: '使用 Tavily Search API 进行网络搜索',
    author: 'DeepBot',
    category: 'network',
    tags: ['web', 'search', 'internet', 'tavily'],
    requiresConfig: true,
  },
  create: (options: ToolCreateOptions) => {
    if (!options.configStore) throw new Error('webSearchToolPlugin 需要 configStore');
    return createWebSearchTool(options.configStore);
  },
};
