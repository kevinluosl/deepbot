// Run after `pnpm run build:main`: node --test scripts/test-web-search.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webSearchToolPlugin } = require('../dist-electron/main/tools/web-search-tool');
const { TIMEOUTS } = require('../dist-electron/main/config/timeouts');
const { SystemConfigStore } = require('../dist-electron/main/database/system-config-store');
const { Database } = require('../dist-electron/shared/utils/sqlite-adapter');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const query = 'Find the official public TypeScript dependency installation documentation';
const source = { title: 'TypeScript [installation]', url: 'https://www.typescriptlang.org/download/', excerpts: ['npm install --save-dev typescript'] };
const tool = (config) => webSearchToolPlugin.create({ configStore: { getWebSearchToolConfig: () => config } });
const search = (instance, args = {}, signal) => instance.execute('public-docs-search', { query, publicQuery: true, ...args }, signal);

function mockMcp(t, result, { sse = true, status = 200 } = {}) {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://mcp.parallel.ai/mcp?tools=web_search');
    assert.equal(options.headers['User-Agent'], 'DeepBot/0.9.0 (Parallel public-docs search)');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, 'error');
    const message = options.body ? JSON.parse(options.body) : null;
    requests.push({ method: options.method, message, headers: options.headers });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    if (message.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (message.method === 'tools/call' && status !== 200) return new Response('', { status });
    const body = { jsonrpc: '2.0', id: message.id, result: message.method === 'initialize' ? { protocolVersion: '2025-03-26' } : result };
    return new Response(sse ? `event: message\r\ndata: ${JSON.stringify(body)}\r\n\r\n` : JSON.stringify(body), {
      headers: { 'content-type': sse ? 'text/event-stream' : 'application/json', 'mcp-session-id': 'test-session' },
    });
  });
  return requests;
}

test('registered plugin dispatches an explicit public query, retains original source URLs and uses no API key', async t => {
  const requests = mockMcp(t, { content: [{ type: 'text', text: JSON.stringify({ results: [source] }) }] });
  const result = await search(tool({ provider: 'parallel', apiKey: 'unused-test-key' }));
  assert.equal(result.details.success, true);
  assert.equal(result.details.results[0].url, source.url);
  assert.equal(result.details.results[0].title, source.title);
  assert.ok(result.content[0].text.includes(`[TypeScript \\[installation\\]](<${source.url}>)`));
  assert.deepEqual(requests.map(r => r.message?.method || r.method), ['initialize', 'notifications/initialized', 'tools/call', 'DELETE']);
  assert.deepEqual(requests[2].message.params, { name: 'web_search', arguments: { objective: query, search_queries: [query] } });
  assert.equal(requests[2].headers['Mcp-Session-Id'], 'test-session');
});

test('JSON structured results filter unsafe URLs and domain mismatches, and obey the result limit', async t => {
  mockMcp(t, { structuredContent: { results: [
    { ...source, url: 'javascript:alert(1)' }, { ...source, url: 'https://user:secret@example.com/' },
    { ...source, url: 'https://example.com/' }, { ...source, url: 'https://badtypescriptlang.org/' },
    { ...source, url: 'https://old.typescriptlang.org/' }, source, source,
  ] } }, { sse: false });
  const result = await search(tool({ provider: 'parallel' }), { includeDomains: ['typescriptlang.org'], excludeDomains: ['old.typescriptlang.org'], maxResults: 1 });
  assert.equal(result.details.resultCount, 1);
  assert.equal(result.details.results[0].url, source.url);
});

test('empty results return the existing no-results message', async t => {
  mockMcp(t, { structuredContent: { results: [] } });
  const result = await search(tool({ provider: 'parallel' }));
  assert.equal(result.details.success, true);
  assert.equal(result.details.resultCount, 0);
  assert.equal(result.content[0].text, '未找到相关结果');
});

for (const [label, result, options] of [
  ['HTTP unavailable', {}, { status: 503 }],
  ['MCP tool error', { isError: true, content: [] }],
  ['malformed results', { content: [{ type: 'text', text: 'not JSON' }] }],
]) test(label + ' uses the normal tool error path without fallback', async t => {
  mockMcp(t, result, options);
  const reply = await search(tool({ provider: 'parallel', apiKey: 'unused-test-key' }));
  assert.equal(reply.isError, true);
  assert.equal(reply.details.success, false);
});

test('Parallel requires public-query authorization and rejects unsupported Tavily controls before any HTTP request', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected HTTP request'); });
  for (const args of [{ publicQuery: false }, { publicQuery: undefined }, { timeRange: 'day' }, { topic: 'news' }, { searchDepth: 'advanced' }]) {
    assert.equal((await search(tool({ provider: 'parallel' }), args)).isError, true);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('omitted provider and opt-out both retain Tavily dispatch; missing key never contacts Parallel', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url);
    assert.equal(url, 'https://api.tavily.com/search');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    return Response.json({ results: [{ ...source, content: source.excerpts[0], score: 0.9 }] });
  });
  for (const provider of [undefined, 'tavily']) {
    assert.equal((await search(tool({ provider, apiKey: 'test-key' }))).details.success, true);
  }
  assert.equal((await search(tool({ apiKey: '' }))).isError, true);
  assert.equal(requests.length, 2);
});

test('cancellation before a request and while fetching use the normal error path', async t => {
  const controller = new AbortController();
  controller.abort();
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected request'); });
  assert.equal((await search(tool({ provider: 'parallel' }), {}, controller.signal)).isError, true);
  assert.equal(fetch.mock.callCount(), 0);
  t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  }));
  const active = new AbortController();
  const pending = search(tool({ provider: 'parallel' }), {}, active.signal);
  active.abort();
  assert.equal((await pending).isError, true);
});

test('the whole exchange times out even with an agent signal and a stalled response body', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async (_url, options) => ({
    ok: true, headers: new Headers({ 'content-type': 'application/json' }),
    text: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    }),
  }));
  const pending = search(tool({ provider: 'parallel' }), {}, new AbortController().signal);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(TIMEOUTS.WEB_SEARCH_TIMEOUT);
  assert.equal((await pending).isError, true);
});

test('fresh, current Tavily and legacy databases preserve defaults, keys, provider choice and restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deepbot-search-'));
  try {
    for (const schema of ['fresh', 'current', 'legacy']) {
      const path = join(dir, schema + '.db');
      if (schema !== 'fresh') {
        const db = new Database(path);
        db.exec(`CREATE TABLE tool_config_web_search (id INTEGER PRIMARY KEY, api_key TEXT${schema === 'legacy' ? ', provider TEXT, model TEXT, api_url TEXT' : ''})`);
        db.exec("INSERT INTO tool_config_web_search (id, api_key) VALUES (1, 'saved-test-key')");
        db.close();
      }
      let store = new SystemConfigStore(path);
      assert.equal(store.getWebSearchToolConfig()?.provider ?? 'tavily', 'tavily');
      if (schema !== 'fresh') assert.equal(store.getWebSearchToolConfig().apiKey, 'saved-test-key');
      store.saveWebSearchToolConfig({ provider: 'parallel', apiKey: 'saved-test-key' });
      store.getDb().close();
      store = new SystemConfigStore(path);
      assert.equal(store.getWebSearchToolConfig().provider, 'parallel');
      store.saveWebSearchToolConfig({ apiKey: 'updated-test-key' });
      assert.equal(store.getWebSearchToolConfig().provider, 'parallel');
      store.saveWebSearchToolConfig({ provider: 'tavily', apiKey: 'updated-test-key' });
      assert.equal(store.getWebSearchToolConfig().provider, 'tavily');
      assert.throws(() => store.saveWebSearchToolConfig({ provider: 'unknown', apiKey: '' }));
      store.getDb().close();
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
