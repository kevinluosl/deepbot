/**
 * Playwright 会话管理
 * 
 * 职责：
 * - 启动和停止浏览器
 * - 管理浏览器连接
 * - 管理页面（Page）
 * - 收集控制台日志和错误
 * 
 * 
 * 简化版本（MVP）：
 * - 只支持本地浏览器启动（不支持远程连接）
 * - 简化的页面状态管理
 * - 基础的日志收集
 */

import type {
  Browser,
  BrowserContext,
  ConsoleMessage,
  Page,
  Request,
  Response,
} from 'playwright-core';
import { chromium } from 'playwright-core';
import { resolveBrowserConfig } from './config';
import type { RoleRefMap } from './pw-role-snapshot';
import { TIMEOUTS } from '../config/timeouts';

/**
 * 控制台消息
 */
export interface BrowserConsoleMessage {
  type: string;
  text: string;
  timestamp: string;
  location?: { url?: string; lineNumber?: number; columnNumber?: number };
}

/**
 * 页面错误
 */
export interface BrowserPageError {
  message: string;
  name?: string;
  stack?: string;
  timestamp: string;
}

/**
 * 网络请求
 */
export interface BrowserNetworkRequest {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  resourceType?: string;
  status?: number;
  ok?: boolean;
  failureText?: string;
}

/**
 * 页面状态
 */
interface PageState {
  console: BrowserConsoleMessage[];
  errors: BrowserPageError[];
  requests: BrowserNetworkRequest[];
  requestIds: WeakMap<Request, string>;
  nextRequestId: number;
  // Ref 系统
  roleRefs?: RoleRefMap;
  roleRefsMode?: 'aria';
}

/**
 * 浏览器会话
 */
interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  cdpUrl: string;
  pid: number | null;
}

// 全局状态
const pageStates = new WeakMap<Page, PageState>();
const observedPages = new WeakSet<Page>();
let currentSession: BrowserSession | null = null;

// 限制
const MAX_CONSOLE_MESSAGES = 500;
const MAX_PAGE_ERRORS = 200;
const MAX_NETWORK_REQUESTS = 500;

/**
 * 确保页面状态存在
 * 
 * @param page - Playwright Page
 * @returns 页面状态
 */
export function ensurePageState(page: Page): PageState {
  const existing = pageStates.get(page);
  if (existing) return existing;

  const state: PageState = {
    console: [],
    errors: [],
    requests: [],
    requestIds: new WeakMap(),
    nextRequestId: 0,
  };
  pageStates.set(page, state);

  // 监听页面事件
  if (!observedPages.has(page)) {
    observedPages.add(page);

    // 控制台消息
    page.on('console', (msg: ConsoleMessage) => {
      const entry: BrowserConsoleMessage = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString(),
        location: msg.location(),
      };
      state.console.push(entry);
      if (state.console.length > MAX_CONSOLE_MESSAGES) state.console.shift();
    });

    // 页面错误
    page.on('pageerror', (err: Error) => {
      state.errors.push({
        message: err?.message ? String(err.message) : String(err),
        name: err?.name ? String(err.name) : undefined,
        stack: err?.stack ? String(err.stack) : undefined,
        timestamp: new Date().toISOString(),
      });
      if (state.errors.length > MAX_PAGE_ERRORS) state.errors.shift();
    });

    // 网络请求
    page.on('request', (req: Request) => {
      state.nextRequestId += 1;
      const id = `r${state.nextRequestId}`;
      state.requestIds.set(req, id);
      state.requests.push({
        id,
        timestamp: new Date().toISOString(),
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
      });
      if (state.requests.length > MAX_NETWORK_REQUESTS) state.requests.shift();
    });

    // 网络响应
    page.on('response', (resp: Response) => {
      const req = resp.request();
      const id = state.requestIds.get(req);
      if (!id) return;
      const rec = state.requests.find((r) => r.id === id);
      if (!rec) return;
      rec.status = resp.status();
      rec.ok = resp.ok();
    });

    // 请求失败
    page.on('requestfailed', (req: Request) => {
      const id = state.requestIds.get(req);
      if (!id) return;
      const rec = state.requests.find((r) => r.id === id);
      if (!rec) return;
      rec.failureText = req.failure()?.errorText;
      rec.ok = false;
    });

    // 页面关闭
    page.on('close', () => {
      pageStates.delete(page);
      observedPages.delete(page);
    });
  }

  return state;
}

/**
 * 启动浏览器
 * 
 * @returns 浏览器会话
 */
export async function launchBrowser(): Promise<BrowserSession> {
  // 如果已经启动，直接返回
  if (currentSession) {
    console.log('[Playwright] 浏览器已启动');
    return currentSession;
  }

  const config = resolveBrowserConfig();

  console.log('[Playwright] 正在启动浏览器...');
  console.log('[Playwright] 配置:', {
    headless: config.headless,
    cdpPort: config.cdpPort,
  });

  // 启动浏览器
  const browser = await chromium.launch({
    headless: config.headless,
    args: [
      `--remote-debugging-port=${config.cdpPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
    executablePath: config.executablePath,
  });

  // 创建上下文
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  // 监听上下文中的页面
  context.on('page', (page) => {
    ensurePageState(page);
  });

  // 获取 CDP URL
  const cdpUrl = `http://127.0.0.1:${config.cdpPort}`;

  // 获取浏览器进程 PID（如果可能）
  let pid: number | null = null;
  try {
    // Playwright 没有直接暴露 PID，我们使用 CDP 获取
    const pages = context.pages();
    if (pages.length > 0) {
      const session = await context.newCDPSession(pages[0]);
      const info = await session.send('Browser.getVersion') as { protocolVersion?: string };
      await session.detach();
      // 简化：使用当前进程 PID（实际应该从浏览器进程获取）
      pid = process.pid;
    }
  } catch (error) {
    console.warn('[Playwright] 无法获取浏览器 PID:', error);
  }

  // 创建会话
  currentSession = {
    browser,
    context,
    cdpUrl,
    pid,
  };

  // 监听浏览器断开
  browser.on('disconnected', () => {
    console.log('[Playwright] 浏览器已断开');
    if (currentSession?.browser === browser) {
      currentSession = null;
    }
  });

  console.log('[Playwright] ✅ 浏览器启动成功');
  console.log('[Playwright] CDP URL:', cdpUrl);

  // 优化：自动创建一个空白页面，避免第一次操作失败
  try {
    const initialPage = await context.newPage();
    ensurePageState(initialPage);
    console.log('[Playwright] ✅ 已创建初始页面');
  } catch (error) {
    console.warn('[Playwright] ⚠️ 创建初始页面失败:', error);
    // 不影响浏览器启动，继续
  }

  return currentSession;
}

/**
 * 停止浏览器
 */
export async function closeBrowser(): Promise<void> {
  if (!currentSession) {
    console.log('[Playwright] 浏览器未启动');
    return;
  }

  console.log('[Playwright] 正在停止浏览器...');

  try {
    await currentSession.browser.close();
    console.log('[Playwright] ✅ 浏览器已停止');
  } catch (error) {
    console.error('[Playwright] 停止浏览器失败:', error);
  } finally {
    currentSession = null;
  }
}

/**
 * 获取当前浏览器会话
 * 
 * @returns 浏览器会话，如果未启动返回 null
 */
export function getCurrentSession(): BrowserSession | null {
  return currentSession;
}

/**
 * 获取所有页面
 * 
 * @returns 页面列表
 */
export async function getAllPages(): Promise<Page[]> {
  if (!currentSession) {
    throw new Error('Browser not started');
  }

  return currentSession.context.pages();
}

/**
 * 创建新页面
 * 
 * @param url - 要打开的 URL（可选）
 * @returns 新页面
 */
export async function createNewPage(url?: string): Promise<Page> {
  if (!currentSession) {
    throw new Error('Browser not started');
  }

  const page = await currentSession.context.newPage();
  ensurePageState(page);

  // 如果提供了 URL，导航到该 URL
  if (url && url.trim()) {
    const targetUrl = url.trim();
    if (targetUrl !== 'about:blank') {
      try {
        // 导航到目标 URL，等待页面加载完成
        await page.goto(targetUrl, { 
          timeout: TIMEOUTS.BROWSER_NAVIGATION_TIMEOUT,
          waitUntil: 'load',
        });
        
        // 额外等待网络空闲（确保动态内容加载完成）
        await page.waitForLoadState('networkidle', {
          timeout: TIMEOUTS.BROWSER_NETWORK_IDLE_TIMEOUT,
        }).catch(() => {
          // 如果网络一直不空闲，继续执行
          console.warn('[CreateNewPage] 网络未完全空闲，但继续执行');
        });
      } catch (error) {
        console.warn('[Playwright] 导航失败:', error);
        // 页面已创建，即使导航失败也返回
      }
    }
  }

  return page;
}

/**
 * 根据索引获取页面
 * 
 * @param index - 页面索引（0-based）
 * @returns 页面，如果不存在返回 null
 */
export async function getPageByIndex(index: number): Promise<Page | null> {
  const pages = await getAllPages();
  return pages[index] ?? null;
}

/**
 * 关闭页面
 * 
 * @param page - 要关闭的页面
 */
export async function closePage(page: Page): Promise<void> {
  await page.close();
}

/**
 * 获取页面状态
 * 
 * @param page - Playwright Page
 * @returns 页面状态，如果不存在返回 null
 */
export function getPageState(page: Page): PageState | null {
  return pageStates.get(page) ?? null;
}

/**
 * 存储 refs 到页面状态
 * 
 * @param page - Playwright Page
 * @param refs - Role Ref Map
 */
export function storeRoleRefs(page: Page, refs: RoleRefMap): void {
  const state = ensurePageState(page);
  state.roleRefs = refs;
  state.roleRefsMode = 'aria';
}

/**
 * 获取页面的 refs
 * 
 * @param page - Playwright Page
 * @returns Role Ref Map，如果不存在返回空对象
 */
export function getRoleRefs(page: Page): RoleRefMap {
  const state = getPageState(page);
  return state?.roleRefs ?? {};
}

/**
 * 根据 ref 创建 Playwright Locator
 * 
 * @param page - Playwright Page
 * @param ref - ref 字符串（如 "e1", "@e1", "ref=e1"）
 * @returns Playwright Locator
 */
export function refLocator(page: Page, ref: string) {
  // 标准化 ref 格式
  const normalized = ref.startsWith('@')
    ? ref.slice(1)
    : ref.startsWith('ref=')
      ? ref.slice(4)
      : ref;

  // 检查是否是 aria-ref 格式（e1, e2, ...）
  if (/^e\d+$/.test(normalized)) {
    const state = getPageState(page);
    
    // 如果是 aria 模式，使用 aria-ref 定位器
    if (state?.roleRefsMode === 'aria') {
      // 检查 ref 是否存在
      if (!state.roleRefs || !state.roleRefs[normalized]) {
        // 生成可用 refs 列表
        const availableRefs = state.roleRefs 
          ? Object.entries(state.roleRefs)
              .map(([r, info]) => `  - @${r}: ${info.role}${info.name ? ` "${info.name}"` : ''}`)
              .join('\n')
          : '  (没有可用的 refs)';
        
        throw new Error(
          `❌ 错误的 ref "${normalized}"！\n\n` +
          `⚠️ 这个 ref 不在 snapshot 返回的列表中。\n\n` +
          `✅ 可用的 refs：\n${availableRefs}\n\n` +
          `💡 请从上面的列表中选择正确的 ref，不要猜测！`
        );
      }
      
      return page.locator(`aria-ref=${normalized}`);
    }
    
    // 否则，使用 roleRefs 映射
    const info = state?.roleRefs?.[normalized];
    if (!info) {
      // 生成可用 refs 列表
      const availableRefs = state?.roleRefs 
        ? Object.entries(state.roleRefs)
            .map(([r, info]) => `  - @${r}: ${info.role}${info.name ? ` "${info.name}"` : ''}`)
            .join('\n')
        : '  (没有可用的 refs)';
      
      throw new Error(
        `❌ 错误的 ref "${normalized}"！\n\n` +
        `⚠️ 这个 ref 不在 snapshot 返回的列表中。\n\n` +
        `✅ 可用的 refs：\n${availableRefs}\n\n` +
        `💡 请从上面的列表中选择正确的 ref，不要猜测！`
      );
    }
    
    // 使用 getByRole 定位器
    const locator = info.name
      ? page.getByRole(info.role as any, { name: info.name, exact: true })
      : page.getByRole(info.role as any);
    
    return info.nth !== undefined ? locator.nth(info.nth) : locator;
  }

  // 如果不是标准 ref 格式，尝试作为 aria-ref 使用
  return page.locator(`aria-ref=${normalized}`);
}
