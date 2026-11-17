/** Anonymous Parallel Unified MCP adapter for explicit public documentation queries. */
import { APP_NAME, APP_VERSION } from '../../../shared/constants/version';
import { TIMEOUTS } from '../../config/timeouts';

const MCP_URL = 'https://mcp.parallel.ai/mcp?tools=web_search';
const PROTOCOL_VERSION = '2025-03-26';
const USER_AGENT = `${APP_NAME}/${APP_VERSION} (Parallel public-docs search)`;

interface SearchParams {
  query: string;
  maxResults?: number;
  searchDepth?: string;
  topic?: string;
  timeRange?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
}

interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

// Streamable HTTP permits JSON or SSE responses. Match only this request's reply.
function parseReply(body: string, contentType: string, id: number): any {
  const messages = contentType.includes('text/event-stream')
    ? body.replace(/\r\n/g, '\n').split('\n\n').flatMap((event) => {
      const data = event.split('\n').filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart()).join('\n');
      return data ? [JSON.parse(data)] : [];
    })
    : [JSON.parse(body)];
  const reply = messages.find(message => message?.id === id && message.jsonrpc === '2.0');
  if (!reply) throw new Error('Parallel MCP 未返回匹配的响应');
  if (reply.error) throw new Error(`Parallel MCP: ${reply.error.message || '请求失败'}`);
  return reply.result;
}

function normalizeResults(result: any, params: SearchParams): SearchResult[] {
  if (result?.isError) throw new Error('Parallel MCP 搜索失败，请稍后重试');
  let data = result?.structuredContent;
  if (!Array.isArray(data?.results)) {
    for (const block of result?.content ?? []) {
      if (block.type !== 'text') continue;
      try {
        const parsed = JSON.parse(block.text);
        if (Array.isArray(parsed?.results)) { data = parsed; break; }
      } catch { /* Other text blocks are not search data. */ }
    }
  }
  if (!Array.isArray(data?.results)) throw new Error('Parallel MCP 搜索响应格式不受支持');

  const matchesDomain = (hostname: string, domain: string) => {
    const normalized = domain.trim().toLowerCase();
    return normalized !== '' && (hostname === normalized || hostname.endsWith(`.${normalized}`));
  };
  const results: SearchResult[] = [];
  for (const row of data.results) {
    if (!row || typeof row.url !== 'string') continue;
    let url: URL;
    try { url = new URL(row.url); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
    if (params.includeDomains?.length && !params.includeDomains.some(d => matchesDomain(url.hostname, d))) continue;
    if (params.excludeDomains?.some(d => matchesDomain(url.hostname, d))) continue;
    const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : url.hostname;
    results.push({
      title,
      url: url.href,
      content: Array.isArray(row.excerpts) ? row.excerpts.filter((s: unknown) => typeof s === 'string').join('\n') : '',
      score: 0,
    });
  }
  return results.slice(0, Math.max(1, Math.min(Math.floor(params.maxResults ?? 10), 20)));
}

export async function performParallelSearch(params: SearchParams, signal?: AbortSignal): Promise<{
  answer?: string;
  results: SearchResult[];
  responseTime?: number;
}> {
  if ((params.searchDepth && params.searchDepth !== 'basic') ||
      (params.topic && params.topic !== 'general') || params.timeRange) {
    throw new Error('Parallel MCP 仅支持常规公开文档搜索；searchDepth=advanced、topic=news 和 timeRange 仅适用于 Tavily。');
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  // Bound the entire exchange, including response bodies, even when the agent passes a signal.
  const timer = setTimeout(cancel, TIMEOUTS.WEB_SEARCH_TIMEOUT);
  let sessionId: string | null = null;
  const headers = () => ({
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'User-Agent': USER_AGENT,
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
  });
  const post = async (message: object, id?: number) => {
    const response = await fetch(MCP_URL, {
      method: 'POST', headers: headers(), body: JSON.stringify(message), signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Parallel MCP HTTP ${response.status}`);
    if (id === 1) sessionId = response.headers.get('mcp-session-id');
    const body = await response.text();
    return id === undefined ? undefined : parseReply(body, response.headers.get('content-type') || '', id);
  };
  try {
    const initialized = await post({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'deepbot', version: APP_VERSION } },
    }, 1);
    if (initialized?.protocolVersion !== PROTOCOL_VERSION) throw new Error('Parallel MCP 协议版本不受支持');
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const result = await post({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'web_search', arguments: { objective: params.query, search_queries: [params.query] } },
    }, 2);
    return { results: normalizeResults(result, params) };
  } finally {
    // Session cleanup shares the same deadline and never replaces a search error.
    if (sessionId && !controller.signal.aborted) {
      try {
        await fetch(MCP_URL, { method: 'DELETE', headers: headers(), signal: controller.signal, redirect: 'error' });
      } catch { /* Best-effort cleanup. */ }
    }
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
