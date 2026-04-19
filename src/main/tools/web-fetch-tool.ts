/**
 * Web Fetch 工具
 * 
 * 从 URL 获取网页内容并提取主要内容，转换为 Markdown 格式
 * 
 * 核心功能：
 * - 使用 Readability 算法提取主要内容
 * - HTML → Markdown 转换
 * - SSRF 防护（防止访问内网）
 * - 大小限制和超时控制
 * - HTML 清理（移除隐藏元素）
 * - 不可见字符过滤（防止 prompt injection）
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { httpGet } from '../../shared/utils/http-utils';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { TIMEOUTS } from '../config/timeouts';
import { TOOL_NAMES } from './tool-names';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';

/**
 * Web Fetch 模式
 */
const FETCH_MODES = ['full', 'truncated', 'selective'] as const;
type FetchMode = typeof FETCH_MODES[number];

/**
 * Web Fetch 参数 Schema
 */
const WebFetchSchema = Type.Object({
  url: Type.String({
    description: 'HTTP 或 HTTPS URL',
  }),
  
  mode: Type.Optional(Type.String({
    description: '获取模式：full（完整内容，最多10MB）、truncated（截断，前8KB）、selective（搜索特定内容）',
    default: 'truncated',
  })),
  
  searchPhrase: Type.Optional(Type.String({
    description: '搜索短语（仅在 selective 模式下需要）',
  })),
});

/**
 * 默认配置
 */
const DEFAULT_TRUNCATED_SIZE = 8 * 1024; // 8KB
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const READABILITY_MAX_HTML_CHARS = 1_000_000; // 1MB
const READABILITY_MAX_ESTIMATED_NESTING_DEPTH = 3_000;

/**
 * SSRF 防护：检查 URL 是否安全
 */
function checkUrlSafety(url: string): void {
  const parsed = new URL(url);
  
  // 只允许 HTTP 和 HTTPS
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('只支持 HTTP 和 HTTPS 协议');
  }
  
  // 禁止访问内网地址
  const hostname = parsed.hostname.toLowerCase();
  
  // 禁止 localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    throw new Error('禁止访问 localhost');
  }
  
  // 禁止内网 IP 段
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  
  if (match) {
    const [, a, b] = match.map(Number);
    
    // 10.0.0.0/8
    if (a === 10) {
      throw new Error('禁止访问内网地址');
    }
    
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) {
      throw new Error('禁止访问内网地址');
    }
    
    // 192.168.0.0/16
    if (a === 192 && b === 168) {
      throw new Error('禁止访问内网地址');
    }
    
    // 169.254.0.0/16 (链路本地地址)
    if (a === 169 && b === 254) {
      throw new Error('禁止访问内网地址');
    }
  }
}

/**
 * 动态加载 linkedom 和 Readability（单例模式）
 */
let readabilityDepsPromise:
  | Promise<{
      parseHTML: any;
      Readability: any;
    }>
  | undefined;

async function loadDependencies(): Promise<{
  parseHTML: any;
  Readability: any;
}> {
  if (!readabilityDepsPromise) {
    readabilityDepsPromise = Promise.all([
      // eslint-disable-next-line no-eval
      eval('import("linkedom")'),
      // eslint-disable-next-line no-eval
      eval('import("@mozilla/readability")'),
    ]).then(([linkedomModule, readabilityModule]) => ({
      parseHTML: linkedomModule.parseHTML,
      Readability: readabilityModule.Readability,
    }));
  }
  
  try {
    return await readabilityDepsPromise;
  } catch (error) {
    readabilityDepsPromise = undefined;
    throw new Error(`加载依赖失败: ${getErrorMessage(error)}`);
  }
}

/**
 * 提取可读内容（使用 Readability）
 */
async function extractReadableContent(
  html: string,
  url: string,
  parseHTML: any,
  Readability: any
): Promise<{ title?: string; text: string }> {
  // 清理 HTML
  const cleanHtml = await sanitizeHtml(html, parseHTML);
  
  // 降级方案
  const fallback = (): { text: string; title?: string } => {
    const rendered = htmlToMarkdown(cleanHtml);
    return {
      text: stripInvisibleUnicode(rendered.text),
      title: rendered.title,
    };
  };
  
  // 检查 HTML 大小和嵌套深度
  if (
    cleanHtml.length > READABILITY_MAX_HTML_CHARS ||
    exceedsEstimatedHtmlNestingDepth(cleanHtml, READABILITY_MAX_ESTIMATED_NESTING_DEPTH)
  ) {
    console.warn('[WebFetch] HTML 过大或嵌套过深，使用降级方案');
    return fallback();
  }
  
  try {
    const { document } = parseHTML(cleanHtml);
    
    // 设置 baseURI（用于解析相对链接）
    try {
      document.baseURI = url;
    } catch {
      // Best-effort
    }
    
    const reader = new Readability(document, { charThreshold: 0 });
    const article = reader.parse();
    
    if (!article || !article.content) {
      console.warn('[WebFetch] Readability 未提取到内容，使用降级方案');
      return fallback();
    }
    
    console.log('[WebFetch] Readability 提取成功');
    console.log('  标题:', article.title || '(无标题)');
    
    // 将提取的 HTML 内容转换为 Markdown
    const rendered = htmlToMarkdown(article.content);
    const text = stripInvisibleUnicode(rendered.text);
    
    console.log('  内容长度:', text.length, '字符');
    
    return {
      title: article.title || rendered.title,
      text,
    };
  } catch (error) {
    console.error('[WebFetch] Readability 提取失败，使用降级方案:', error);
    return fallback();
  }
}

/**
 * HTML 转 Markdown
 */
function htmlToMarkdown(html: string): { text: string; title?: string } {
  // 提取标题
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? normalizeWhitespace(stripTags(titleMatch[1])) : undefined;
  
  // 移除 script、style、noscript 标签
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  
  // 转换链接 <a href="...">text</a> → [text](url)
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, body) => {
    const label = normalizeWhitespace(stripTags(body));
    if (!label) return href;
    return `[${label}](${href})`;
  });
  
  // 转换标题 <h1>text</h1> → # text
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, body) => {
    const prefix = '#'.repeat(Math.max(1, Math.min(6, parseInt(level, 10))));
    const label = normalizeWhitespace(stripTags(body));
    return `\n${prefix} ${label}\n`;
  });
  
  // 转换列表项 <li>text</li> → - text
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => {
    const label = normalizeWhitespace(stripTags(body));
    return label ? `\n- ${label}` : '';
  });
  
  // 转换换行和块级元素
  text = text
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|table|tr|ul|ol)>/gi, '\n');
  
  // 移除所有剩余的 HTML 标签
  text = stripTags(text);
  
  // 规范化空白
  text = normalizeWhitespace(text);
  
  return { text, title };
}

/**
 * 移除 HTML 标签并解码实体
 */
function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ''));
}

/**
 * 解码 HTML 实体
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/gi, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * 规范化空白字符
 */
function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * 移除不可见 Unicode 字符（防止 prompt injection 攻击）
 */
function stripInvisibleUnicode(text: string): string {
  // Zero-width and invisible Unicode characters
  const INVISIBLE_UNICODE_RE =
    /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF\u{E0000}-\u{E007F}]/gu;
  return text.replace(INVISIBLE_UNICODE_RE, '');
}

/**
 * 检查 HTML 是否超过估计的嵌套深度（防止栈溢出）
 */
function exceedsEstimatedHtmlNestingDepth(html: string, maxDepth: number): boolean {
  // 简单启发式检查，避免在病态 HTML 上运行 Readability+DOM 解析
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);

  let depth = 0;
  const len = html.length;
  
  for (let i = 0; i < len; i++) {
    if (html.charCodeAt(i) !== 60) continue; // '<'
    
    const next = html.charCodeAt(i + 1);
    if (next === 33 || next === 63) continue; // <! ...> or <? ...>

    let j = i + 1;
    let closing = false;
    
    if (html.charCodeAt(j) === 47) { // '/'
      closing = true;
      j += 1;
    }

    // 跳过空白
    while (j < len && html.charCodeAt(j) <= 32) {
      j += 1;
    }

    // 提取标签名
    const nameStart = j;
    while (j < len) {
      const c = html.charCodeAt(j);
      const isNameChar =
        (c >= 65 && c <= 90) || // A-Z
        (c >= 97 && c <= 122) || // a-z
        (c >= 48 && c <= 57) || // 0-9
        c === 58 || // :
        c === 45; // -
      if (!isNameChar) break;
      j += 1;
    }

    const tagName = html.slice(nameStart, j).toLowerCase();
    if (!tagName) continue;

    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (voidTags.has(tagName)) continue;

    // 检查自闭合标签 "/>"
    let selfClosing = false;
    for (let k = j; k < len && k < j + 200; k++) {
      const c = html.charCodeAt(k);
      if (c === 62) { // '>'
        if (html.charCodeAt(k - 1) === 47) { // '/'
          selfClosing = true;
        }
        break;
      }
    }
    if (selfClosing) continue;

    depth += 1;
    if (depth > maxDepth) {
      return true;
    }
  }
  
  return false;
}

/**
 * 清理 HTML（移除隐藏元素、注释等）
 */
async function sanitizeHtml(html: string, parseHTML: any): Promise<string> {
  // 移除 HTML 注释
  let sanitized = html.replace(/<!--[\s\S]*?-->/g, '');

  try {
    const { document } = parseHTML(sanitized);

    // 移除隐藏元素（从底部向上遍历，避免重复遍历已删除的子树）
    const all = Array.from(document.querySelectorAll('*'));
    for (let i = all.length - 1; i >= 0; i--) {
      const el = all[i] as any;
      if (shouldRemoveElement(el)) {
        el.parentNode?.removeChild(el);
      }
    }

    return document.toString();
  } catch {
    return sanitized;
  }
}

/**
 * 判断元素是否应该被移除
 */
function shouldRemoveElement(element: any): boolean {
  const tagName = element.tagName?.toLowerCase() || '';

  // 始终移除的标签
  if (['meta', 'template', 'svg', 'canvas', 'iframe', 'object', 'embed'].includes(tagName)) {
    return true;
  }

  // input type=hidden
  if (tagName === 'input' && element.getAttribute('type')?.toLowerCase() === 'hidden') {
    return true;
  }

  // aria-hidden=true
  if (element.getAttribute('aria-hidden') === 'true') {
    return true;
  }

  // hidden 属性
  if (element.hasAttribute('hidden')) {
    return true;
  }

  // 基于 class 的隐藏
  const className = element.getAttribute('class') || '';
  if (hasHiddenClass(className)) {
    return true;
  }

  // 基于 style 的隐藏
  const style = element.getAttribute('style') || '';
  if (style && isStyleHidden(style)) {
    return true;
  }

  return false;
}

/**
 * 检查 class 是否包含隐藏类名
 */
function hasHiddenClass(className: string): boolean {
  const HIDDEN_CLASS_NAMES = new Set([
    'sr-only',
    'visually-hidden',
    'd-none',
    'hidden',
    'invisible',
    'screen-reader-only',
    'offscreen',
  ]);
  
  const classes = className.toLowerCase().split(/\s+/);
  return classes.some((cls) => HIDDEN_CLASS_NAMES.has(cls));
}

/**
 * 检查 style 是否包含隐藏样式
 */
function isStyleHidden(style: string): boolean {
  const HIDDEN_STYLE_PATTERNS: Array<[string, RegExp]> = [
    ['display', /^\s*none\s*$/i],
    ['visibility', /^\s*hidden\s*$/i],
    ['opacity', /^\s*0\s*$/],
    ['font-size', /^\s*0(px|em|rem|pt|%)?\s*$/i],
    ['text-indent', /^\s*-\d{4,}px\s*$/],
    ['color', /^\s*transparent\s*$/i],
    ['color', /^\s*rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)\s*$/i],
    ['color', /^\s*hsla\s*\(\s*[\d.]+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*0(?:\.0+)?\s*\)\s*$/i],
  ];

  for (const [prop, pattern] of HIDDEN_STYLE_PATTERNS) {
    const escapedProp = prop.replace(/-/g, '\\-');
    const match = style.match(new RegExp(`(?:^|;)\\s*${escapedProp}\\s*:\\s*([^;]+)`, 'i'));
    if (match && pattern.test(match[1])) {
      return true;
    }
  }

  // clip-path 检查
  const clipPath = style.match(/(?:^|;)\s*clip-path\s*:\s*([^;]+)/i);
  if (clipPath && !/^\s*none\s*$/i.test(clipPath[1])) {
    if (/inset\s*\(\s*(?:0*\.\d+|[1-9]\d*(?:\.\d+)?)%/i.test(clipPath[1])) {
      return true;
    }
  }

  // transform: scale(0)
  const transform = style.match(/(?:^|;)\s*transform\s*:\s*([^;]+)/i);
  if (transform) {
    if (/scale\s*\(\s*0\s*\)/i.test(transform[1])) {
      return true;
    }
    if (/translateX\s*\(\s*-\d{4,}px\s*\)/i.test(transform[1])) {
      return true;
    }
    if (/translateY\s*\(\s*-\d{4,}px\s*\)/i.test(transform[1])) {
      return true;
    }
  }

  // width:0 + height:0 + overflow:hidden
  const width = style.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
  const height = style.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i);
  const overflow = style.match(/(?:^|;)\s*overflow\s*:\s*([^;]+)/i);
  if (
    width &&
    /^\s*0(px)?\s*$/i.test(width[1]) &&
    height &&
    /^\s*0(px)?\s*$/i.test(height[1]) &&
    overflow &&
    /^\s*hidden\s*$/i.test(overflow[1])
  ) {
    return true;
  }

  // 屏幕外定位
  const left = style.match(/(?:^|;)\s*left\s*:\s*([^;]+)/i);
  const top = style.match(/(?:^|;)\s*top\s*:\s*([^;]+)/i);
  if (left && /^\s*-\d{4,}px\s*$/i.test(left[1])) {
    return true;
  }
  if (top && /^\s*-\d{4,}px\s*$/i.test(top[1])) {
    return true;
  }

  return false;
}

/**
 * 截断文本
 */
function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  
  return {
    text: text.slice(0, maxChars) + '\n\n[内容已截断...]',
    truncated: true,
  };
}

/**
 * 搜索文本中的短语
 */
function searchInText(text: string, searchPhrase: string): string[] {
  const lines = text.split('\n');
  const results: string[] = [];
  const searchLower = searchPhrase.toLowerCase();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes(searchLower)) {
      // 包含前后各 2 行上下文
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 3);
      const context = lines.slice(start, end).join('\n');
      results.push(context);
    }
  }
  
  return results;
}

/**
 * 创建 Web Fetch 工具
 */
export function createWebFetchTool(): AgentTool {
  return {
    name: TOOL_NAMES.WEB_FETCH,
    label: 'Web 内容获取',
    description: '从 URL 获取网页内容并提取主要内容，转换为 Markdown 格式。适合轻量级页面访问，无需浏览器自动化',
    parameters: WebFetchSchema,
    
    execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
      try {
        const params = args as {
          url: string;
          mode?: string;
          searchPhrase?: string;
        };
        
        console.log('[WebFetch] 获取网页内容:', params.url);
        
        // 验证参数
        if (!params.url || !params.url.trim()) {
          throw new Error('缺少参数: url');
        }
        
        const mode = (params.mode || 'truncated') as FetchMode;
        
        if (mode === 'selective' && !params.searchPhrase) {
          throw new Error('selective 模式需要提供 searchPhrase 参数');
        }
        
        // SSRF 防护
        checkUrlSafety(params.url);
        
        // 检查是否被取消
        if (signal?.aborted) {
          const err = new Error('Web Fetch 操作被取消');
          err.name = 'AbortError';
          throw err;
        }
        
        // 动态加载依赖
        console.log('[WebFetch] 加载依赖...');
        const { parseHTML, Readability } = await loadDependencies();
        
        // 发送 HTTP 请求
        console.log('[WebFetch] 发送 HTTP 请求...');
        const response = await httpGet(params.url, {
          timeout: TIMEOUTS.HTTP_REQUEST_TIMEOUT,
          signal,
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        if (!response.data) {
          throw new Error('响应内容为空');
        }
        
        const html = response.data as string;
        
        console.log('[WebFetch] 响应大小:', html.length, '字节');
        
        // 检查是否被取消
        if (signal?.aborted) {
          const err = new Error('Web Fetch 操作被取消');
          err.name = 'AbortError';
          throw err;
        }
        
        // 提取可读内容
        console.log('[WebFetch] 提取可读内容...');
        const readable = await extractReadableContent(html, params.url, parseHTML, Readability);
        
        // 转换为 Markdown
        console.log('[WebFetch] 处理内容...');
        const markdown = readable.text;
        
        // 根据模式处理内容
        let finalText: string;
        let truncated = false;
        
        switch (mode) {
          case 'full':
            // 完整内容（最多 10MB）
            const fullResult = truncateText(markdown, DEFAULT_MAX_SIZE);
            finalText = fullResult.text;
            truncated = fullResult.truncated;
            break;
            
          case 'truncated':
            // 截断（前 8KB）
            const truncatedResult = truncateText(markdown, DEFAULT_TRUNCATED_SIZE);
            finalText = truncatedResult.text;
            truncated = truncatedResult.truncated;
            break;
            
          case 'selective':
            // 搜索特定内容
            const searchResults = searchInText(markdown, params.searchPhrase!);
            if (searchResults.length === 0) {
              finalText = `未找到包含 "${params.searchPhrase}" 的内容`;
            } else {
              finalText = `找到 ${searchResults.length} 处匹配：\n\n${searchResults.join('\n\n---\n\n')}`;
            }
            break;
            
          default:
            throw new Error(`不支持的模式: ${mode}`);
        }
        
        console.log('[WebFetch] ✅ 内容提取成功');
        console.log('  标题:', readable.title || '(无标题)');
        console.log('  模式:', mode);
        console.log('  大小:', finalText.length, '字符');
        console.log('  截断:', truncated);
        
        // 构建结果消息
        let resultMessage = `✅ 网页内容获取成功\n\n`;
        
        if (readable.title) {
          resultMessage += `标题: ${readable.title}\n`;
        }
        
        resultMessage += `URL: ${params.url}\n`;
        resultMessage += `模式: ${mode}\n`;
        resultMessage += `大小: ${finalText.length} 字符\n`;
        
        if (truncated) {
          resultMessage += `⚠️ 内容已截断\n`;
        }
        
        resultMessage += `\n---\n\n${finalText}`;
        
        return {
          content: [
            {
              type: 'text',
              text: resultMessage,
            },
          ],
          details: {
            success: true,
            url: params.url,
            title: readable.title,
            mode,
            length: finalText.length,
            truncated,
          },
        };
      } catch (error) {
        console.error('[WebFetch] ❌ 获取失败:', error);
        
        return {
          content: [
            {
              type: 'text',
              text: `❌ 网页内容获取失败: ${getErrorMessage(error)}`,
            },
          ],
          details: {
            success: false,
            error: getErrorMessage(error),
          },
          isError: true,
        };
      }
    },
  };
}


// ── ToolPlugin 接口 ──────────────────────────────────────────────────────────

export const webFetchToolPlugin: ToolPlugin = {
  metadata: {
    id: 'web-fetch',
    name: 'Web 内容获取',
    version: '1.0.0',
    description: '从 URL 获取网页内容并提取主要内容，转换为 Markdown 格式',
    author: 'DeepBot',
    category: 'network',
    tags: ['web', 'fetch', 'url', 'readability'],
  },
  create: (_options: ToolCreateOptions) => createWebFetchTool(),
};
