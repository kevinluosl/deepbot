/**
 * Skill Manager 搜索功能
 */

import type { SkillSearchResult } from './types';
import { getErrorMessage } from '../../../shared/utils/error-handler';
import { GITHUB_API_BASE, SKILL_TOPIC, AWESOME_SKILLS_README_URL } from './constants';
import { extractSkillName } from './utils';
import { askAI } from '../../utils/ai-client';

/**
 * 搜索 GitHub 上的 Skill 仓库
 */
export async function searchSkillsOnGitHub(query: string): Promise<SkillSearchResult[]> {
  try {
    const results: SkillSearchResult[] = [];
    
    // 1. 从 Awesome OpenClaw Skills README 搜索
    console.info(`[Skill Manager] 从 Awesome Skills 搜索: ${query}`);
    
    try {
      const awesomeResults = await searchInAwesomeSkills(query);
      results.push(...awesomeResults);
      console.info(`[Skill Manager] Awesome Skills 找到 ${awesomeResults.length} 个结果`);
    } catch (error) {
      console.warn('[Skill Manager] Awesome Skills 搜索失败:', error);
    }
    
    // 2. 搜索 GitHub（带 deepbot-skill topic）
    try {
      const searchQuery = `${query} topic:${SKILL_TOPIC}`;
      const url = `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc`;
      
      console.info(`[Skill Manager] 搜索 GitHub: ${searchQuery}`);
      
      const { httpGet } = await import('../../../shared/utils/http-utils');
      const response = await httpGet(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'DeepBot-Skill-Manager',
        },
      });
      
      if (!response.ok) {
        console.warn(`[Skill Manager] GitHub 搜索失败: ${response.status}`);
      } else {
        const data = response.data as any;
      
        const githubResults: SkillSearchResult[] = data.items.map((repo: any) => ({
          name: extractSkillName(repo.name),
          description: repo.description || '无描述',
          version: 'latest',
          author: repo.owner.login,
          repository: repo.html_url,
          stars: repo.stargazers_count,
          downloads: 0,
          tags: repo.topics || [],
          lastUpdated: new Date(repo.updated_at),
        }));
        
        results.push(...githubResults);
        console.info(`[Skill Manager] GitHub 找到 ${githubResults.length} 个结果`);
      }
    } catch (error) {
      console.warn('[Skill Manager] GitHub 搜索失败:', error);
    }
    
    // 3. 去重（按 name）
    const uniqueResults = Array.from(
      new Map(results.map(r => [r.name, r])).values()
    );
    
    console.info(`[Skill Manager] 总共找到 ${uniqueResults.length} 个 Skill`);
    
    return uniqueResults;
  } catch (error) {
    console.error('[Skill Manager] 搜索失败:', error);
    throw new Error(`搜索失败: ${getErrorMessage(error)}`);
  }
}

/**
 * 从 Awesome OpenClaw Skills README 搜索 Skills（使用 AI 语义搜索）
 */
async function searchInAwesomeSkills(query: string): Promise<SkillSearchResult[]> {
  console.info(`[Skill Manager] 获取 Awesome Skills README: ${AWESOME_SKILLS_README_URL}`);
  
  try {
    // 1. 获取 README.md 内容
    const { httpGet } = await import('../../../shared/utils/http-utils');
    const response = await httpGet(AWESOME_SKILLS_README_URL);
    
    if (!response.ok) {
      console.warn(`[Skill Manager] 获取 README 失败: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const readme = response.data as string;
    console.info(`[Skill Manager] README 大小: ${readme.length} 字符`);
    
    // 2. 解析所有 Skills
    const skillRegex = /- \[([^\]]+)\]\((https:\/\/github\.com\/[^)]+\/SKILL\.md)\)\s*-\s*(.+)/g;
    
    const allSkills: Array<{ name: string; description: string; url: string; author: string }> = [];
    let match;
    
    while ((match = skillRegex.exec(readme)) !== null) {
      const [, name, url, description] = match;
      
      // 提取仓库信息
      const repoMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/main\/skills\/([^/]+)\/([^/]+)/);
      if (!repoMatch) continue;
      
      const [, , , author, skillName] = repoMatch;
      
      allSkills.push({
        name: skillName,
        description: description.trim(),
        url: url.replace('/SKILL.md', ''),
        author,
      });
    }
    
    console.info(`[Skill Manager] 解析到 ${allSkills.length} 个 Skills`);
    
    if (allSkills.length === 0) {
      return [];
    }
    
    // 3. 使用 AI 进行语义搜索
    console.info(`[Skill Manager] 使用 AI 进行语义搜索: "${query}"`);
    
    const matchedSkills = await semanticSearchWithAI(query, allSkills);
    
    console.info(`[Skill Manager] AI 匹配到 ${matchedSkills.length} 个 Skills`);
    
    return matchedSkills;
  } catch (error) {
    console.error('[Skill Manager] 解析 Awesome Skills 失败:', error);
    if (error instanceof Error) {
      console.error(`[Skill Manager] 错误详情: ${error.message}`);
    }
    return [];
  }
}

/**
 * 使用 AI 进行语义搜索
 */
async function semanticSearchWithAI(
  query: string,
  skills: Array<{ name: string; description: string; url: string; author: string }>
): Promise<SkillSearchResult[]> {
  try {
    // 构造 Prompt
    const skillList = skills.map((s, i) => `${i + 1}. ${s.name}: ${s.description}`).join('\n');
    
    const prompt = `你是一个 Skill 搜索助手。用户正在搜索: "${query}"

可用的 Skills:
${skillList}

请分析用户的查询意图，返回最相关的 3-5 个 Skills。

要求：
1. 理解用户的真实需求（如"下载视频"应该匹配"video-transcript-downloader"）
2. 按相关性排序（最相关的放前面）
3. 只返回 JSON 数组，格式：[1, 3, 5]（数字是 Skill 的序号）
4. 如果没有相关的 Skill，返回空数组 []

只返回 JSON，不要其他文字。`;
    
    console.info('[Skill Manager] 调用 AI 进行匹配...');
    
    // 使用公共 AI 客户端
    const responseText = await askAI(prompt, { temperature: 0.1 });
    console.info(`[Skill Manager] AI 响应: ${responseText}`);
    
    // 解析 AI 返回的索引
    const { safeJsonParse } = await import('../../../shared/utils/json-utils');
    const indices = safeJsonParse<number[]>(responseText.trim(), []);
    
    // 转换为 SkillSearchResult
    const results: SkillSearchResult[] = indices
      .filter(i => i >= 1 && i <= skills.length)
      .map(i => {
        const skill = skills[i - 1];
        return {
          name: skill.name,
          description: skill.description,
          version: 'latest',
          author: skill.author,
          repository: skill.url,
          stars: 0,
          downloads: 0,
          tags: [],
          lastUpdated: new Date(),
        };
      });
    
    return results;
  } catch (error) {
    console.error('[Skill Manager] AI 搜索失败，回退到关键词搜索:', error);
    return fallbackKeywordSearch(query, skills);
  }
}

/**
 * 回退到关键词搜索
 */
function fallbackKeywordSearch(
  query: string,
  skills: Array<{ name: string; description: string; url: string; author: string }>
): SkillSearchResult[] {
  const queryLower = query.toLowerCase();
  
  const matchedSkills = skills
    .filter(skill => {
      const nameMatch = skill.name.toLowerCase().includes(queryLower);
      const descMatch = skill.description.toLowerCase().includes(queryLower);
      return nameMatch || descMatch;
    })
    .map(skill => ({
      name: skill.name,
      description: skill.description,
      version: 'latest',
      author: skill.author,
      repository: skill.url,
      stars: 0,
      downloads: 0,
      tags: [],
      lastUpdated: new Date(),
    }));
  
  return matchedSkills;
}
