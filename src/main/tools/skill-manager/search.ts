/**
 * Skill Manager 搜索功能
 * 使用 ClawHub API 搜索 Skills
 */

import type { SkillSearchResult } from './types';
import { getErrorMessage } from '../../../shared/utils/error-handler';
import { CLAWHUB_SEARCH_API } from './constants';

/**
 * ClawHub API 搜索结果条目
 */
interface ClawHubSearchItem {
  slug: string;
  displayName: string;
  summary: string;
  score: number;
  version: string | null;
  updatedAt: number;
  // 详情页可能包含的额外字段
  stars?: number;
  downloads?: number;
  owner?: string;
}

/**
 * 从 ClawHub API 搜索 Skills
 */
export async function searchSkillsOnGitHub(query: string): Promise<SkillSearchResult[]> {
  console.info(`[Skill Manager] 从 ClawHub 搜索: ${query}`);

  try {
    const { httpGet } = await import('../../../shared/utils/http-utils');
    const url = `${CLAWHUB_SEARCH_API}?q=${encodeURIComponent(query)}`;

    const response = await httpGet<{ results: ClawHubSearchItem[] }>(url, {
      headers: { 'User-Agent': 'DeepBot-Skill-Manager' },
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`ClawHub API 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = response.data;
    if (!data?.results || !Array.isArray(data.results)) {
      throw new Error('ClawHub API 返回格式异常');
    }

    const results: SkillSearchResult[] = data.results.map((item) => ({
      name: item.slug,
      displayName: item.displayName,
      description: item.summary,
      version: item.version ?? 'latest',
      author: item.owner ?? '',
      stars: item.stars ?? 0,
      downloads: item.downloads ?? 0,
      tags: [],
      lastUpdated: new Date(item.updatedAt),
      repository: `https://clawhub.ai/skills/${item.slug}`,
    }));

    console.info(`[Skill Manager] ✅ 找到 ${results.length} 个 Skill`);
    return results;
  } catch (error) {
    const msg = getErrorMessage(error);
    console.error(`[Skill Manager] ❌ 搜索失败: ${msg}`);

    if (
      msg.includes('ENOTFOUND') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('fetch failed')
    ) {
      throw new Error('⚠️ 无法连接到 ClawHub\n\n可能的原因：\n• 网络连接问题\n• 防火墙阻止了连接\n\n请检查网络连接后重试。');
    }

    throw error;
  }
}
