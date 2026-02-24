/**
 * Playwright 核心工具
 * 
 * 职责：
 * - 页面快照（AI 格式）
 * - 截图
 * - PDF 导出
 * - 页面交互（点击、输入、滚动等）
 * - 导航
 * 
 * 
 * 简化版本（MVP）：
 * - 只实现 AI 格式快照（不实现 ARIA 格式）
 * - 简化的交互功能
 * - 基础的截图和 PDF 导出
 */

import type { Page } from 'playwright-core';
import { getAllPages, ensurePageState, getPageState, storeRoleRefs, refLocator } from './pw-session';
import type { BrowserConsoleMessage } from './pw-session';
import { buildRoleSnapshotFromAiSnapshot } from './pw-role-snapshot';
import { TIMEOUTS } from '../config/timeouts';

/**
 * AI 快照结果
 */
export interface SnapshotAiResult {
  snapshot: string;
  truncated?: boolean;
  url: string;
  title: string;
  refs: Record<string, { role: string; name?: string; nth?: number }>;
}

/**
 * 截图选项
 */
export interface ScreenshotOptions {
  type?: 'png' | 'jpeg';
  quality?: number;
  fullPage?: boolean;
}

/**
 * 交互选项
 */
export interface InteractionOptions {
  timeout?: number;
}

/**
 * Playwright 私有 API 类型定义
 */
interface WithSnapshotForAI {
  _snapshotForAI?: (options?: {
    timeout?: number;
    track?: 'response';
  }) => Promise<{ full?: string }>;
}

/**
 * 获取页面快照（AI 格式）
 * 
 * 使用 Playwright 的 _snapshotForAI 私有 API 生成带 ref 的可访问性树快照
 * 
 * @param page - Playwright Page
 * @param maxChars - 最大字符数（可选）
 * @returns 快照结果
 */
export async function snapshotAi(
  page: Page,
  maxChars?: number
): Promise<SnapshotAiResult> {
  ensurePageState(page);

  // 获取页面基本信息
  const url = page.url();
  const title = await page.title().catch(() => '');

  // 尝试使用 Playwright 的私有 API _snapshotForAI
  const maybe = page as unknown as WithSnapshotForAI;
  let snapshot = '';
  
  if (maybe._snapshotForAI) {
    // 使用私有 API（包含 ref 标记）
    const result = await maybe._snapshotForAI({
      timeout: TIMEOUTS.BROWSER_SNAPSHOT_TIMEOUT,
      track: 'response',
    });
    snapshot = String(result?.full ?? '');
  } else {
    // 降级到公开 API（不包含 ref 标记）
    console.warn('[Playwright] _snapshotForAI 不可用，使用 ariaSnapshot 降级');
    const ariaSnapshot = await page.locator(':root').ariaSnapshot();
    snapshot = String(ariaSnapshot ?? '');
  }
  
  // 从 snapshot 中提取 refs
  const { refs } = buildRoleSnapshotFromAiSnapshot(snapshot);
  
  // 存储 refs 到页面状态
  storeRoleRefs(page, refs);

  // 添加页面基本信息和 ref 使用说明
  const refList = Object.entries(refs)
    .map(([ref, info]) => `  - @${ref}: ${info.role}${info.name ? ` "${info.name}"` : ''}`)
    .join('\n');
  
  const header = [
    `URL: ${url}`,
    `Title: ${title}`,
    '',
    '=' .repeat(80),
    '⚠️⚠️⚠️ 极其重要：必须使用下面列表中的 refs ⚠️⚠️⚠️',
    '=' .repeat(80),
    '',
    '🚨 绝对不要猜测 ref！不要使用 @e1, @e2 这样的编号！',
    '🚨 ref 编号是随机的，每个页面都不同！',
    '🚨 必须从下面的列表中选择！',
    '',
    '可用的 refs（必须从这个列表中选择）：',
    refList,
    '',
    '使用规则：',
    '1. 只能使用上面列表中的 refs',
    '2. 不要猜测或使用列表中没有的 refs（如 @e1, @e2）',
    '3. 格式：@eXX（如 @e36, @e73）',
    '',
    '=' .repeat(80),
    '',
  ].join('\n');
  
  snapshot = header + snapshot;

  // 截断处理
  const limit =
    typeof maxChars === 'number' && Number.isFinite(maxChars) && maxChars > 0
      ? Math.floor(maxChars)
      : undefined;
  
  let truncated = false;
  if (limit && snapshot.length > limit) {
    snapshot = `${snapshot.slice(0, limit)}\n\n[...TRUNCATED - page too large]`;
    truncated = true;
  }

  return {
    snapshot,
    truncated,
    url,
    title,
    refs,
  };
}

/**
 * 截图
 * 
 * @param page - Playwright Page
 * @param options - 截图选项
 * @returns 截图 Buffer
 */
export async function screenshot(
  page: Page,
  options?: ScreenshotOptions
): Promise<Buffer> {
  ensurePageState(page);

  return await page.screenshot({
    type: options?.type ?? 'png',
    quality: options?.quality,
    fullPage: options?.fullPage ?? false,
  });
}

/**
 * 导出 PDF
 * 
 * @param page - Playwright Page
 * @returns PDF Buffer
 */
export async function exportPdf(page: Page): Promise<Buffer> {
  ensurePageState(page);

  return await page.pdf({
    printBackground: true,
    format: 'A4',
  });
}

/**
 * 导航到 URL
 * 
 * @param page - Playwright Page
 * @param url - 目标 URL
 * @param timeoutMs - 超时时间（毫秒）
 * @returns 导航后的 URL
 */
export async function navigate(
  page: Page,
  url: string,
  timeoutMs?: number
): Promise<string> {
  ensurePageState(page);

  const targetUrl = String(url ?? '').trim();
  if (!targetUrl) {
    throw new Error('url is required');
  }

  // 导航到目标 URL，等待页面加载完成
  await page.goto(targetUrl, {
    timeout: Math.max(1000, Math.min(120000, timeoutMs ?? 20000)),
    // 等待 load 事件（DOM 加载完成）
    waitUntil: 'load',
  });

  // 额外等待网络空闲（确保动态内容加载完成）
  await page.waitForLoadState('networkidle', {
    timeout: TIMEOUTS.BROWSER_SNAPSHOT_TIMEOUT, // 最多等待 5 秒
  }).catch(() => {
    // 如果网络一直不空闲，继续执行（避免卡住）
    console.warn('[Navigate] 网络未完全空闲，但继续执行');
  });

  return page.url();
}

/**
 * 点击元素
 * 
 * @param page - Playwright Page
 * @param selector - CSS 选择器或 ref（如 "@e1", "e1", "#id"）
 * @param options - 交互选项
 */
export async function click(
  page: Page,
  selector: string,
  options?: InteractionOptions
): Promise<void> {
  ensurePageState(page);

  // 等待页面加载完成
  await page.waitForLoadState('domcontentloaded');

  // 判断是否是 ref 格式
  const isRef = /^@?e\d+$/.test(selector) || selector.startsWith('ref=');
  
  // 设置导航等待的 Promise（如果点击导致页面跳转）
  const navigationPromise = page.waitForNavigation({ 
    waitUntil: 'load',
    timeout: TIMEOUTS.BROWSER_WAIT_NAVIGATION_TIMEOUT, // 最多等待 10 秒
  }).catch(() => {
    // 如果没有导航发生，忽略超时错误
    // 这是正常的，因为不是所有点击都会导致导航
  });
  
  // 执行点击
  if (isRef) {
    // 使用 ref 定位器
    const locator = refLocator(page, selector);
    await locator.click({
      timeout: options?.timeout ?? 30000,
    });
  } else {
    // 使用 CSS 选择器
    await page.waitForSelector(selector, {
      state: 'visible',
      timeout: options?.timeout ?? 30000,
    });
    await page.click(selector, {
      timeout: options?.timeout ?? 30000,
    });
  }
  
  // 等待可能的导航完成
  await navigationPromise;
  
  // 额外等待网络空闲（确保动态内容加载完成）
  await page.waitForLoadState('networkidle', {
    timeout: TIMEOUTS.BROWSER_NETWORK_IDLE_TIMEOUT, // 最多等待 3 秒
  }).catch(() => {
    // 如果网络一直不空闲，忽略超时
    // 继续执行，因为页面可能有持续的网络请求（如轮询）
  });
}

/**
 * 输入文本
 * 
 * @param page - Playwright Page
 * @param selector - CSS 选择器或 ref（如 "@e1", "e1", "#id"）
 * @param text - 要输入的文本
 * @param options - 交互选项
 */
export async function type(
  page: Page,
  selector: string,
  text: string,
  options?: InteractionOptions
): Promise<void> {
  ensurePageState(page);

  // 等待页面加载完成
  await page.waitForLoadState('domcontentloaded');
  
  // 判断是否是 ref 格式
  const isRef = /^@?e\d+$/.test(selector) || selector.startsWith('ref=');
  
  if (isRef) {
    // 使用 ref 定位器
    const locator = refLocator(page, selector);
    await locator.fill(text, {
      timeout: options?.timeout ?? 30000,
    });
  } else {
    // 使用 CSS 选择器
    await page.waitForSelector(selector, {
      state: 'visible',
      timeout: options?.timeout ?? 30000,
    });
    await page.fill(selector, '');
    await page.fill(selector, text, {
      timeout: options?.timeout ?? 30000,
    });
  }
}

/**
 * 按键
 * 
 * @param page - Playwright Page
 * @param key - 按键名称（如 'Enter', 'Escape'）
 */
export async function press(page: Page, key: string): Promise<void> {
  ensurePageState(page);

  await page.keyboard.press(key);
}

/**
 * 悬停
 * 
 * @param page - Playwright Page
 * @param selector - CSS 选择器
 * @param options - 交互选项
 */
export async function hover(
  page: Page,
  selector: string,
  options?: InteractionOptions
): Promise<void> {
  ensurePageState(page);

  await page.hover(selector, {
    timeout: options?.timeout ?? 30000,
  });
}

/**
 * 滚动
 * 
 * @param page - Playwright Page
 * @param x - 水平滚动距离（像素）
 * @param y - 垂直滚动距离（像素）
 */
export async function scroll(page: Page, x: number, y: number): Promise<void> {
  ensurePageState(page);

  await page.evaluate(
    ({ scrollX, scrollY }: { scrollX: number; scrollY: number }) => {
      // @ts-expect-error - window 在浏览器上下文中可用
      window.scrollBy(scrollX, scrollY);
    },
    { scrollX: x, scrollY: y }
  );
}

/**
 * 选择下拉框选项
 * 
 * @param page - Playwright Page
 * @param selector - CSS 选择器
 * @param value - 选项值
 * @param options - 交互选项
 */
export async function select(
  page: Page,
  selector: string,
  value: string,
  options?: InteractionOptions
): Promise<void> {
  ensurePageState(page);

  await page.selectOption(selector, value, {
    timeout: options?.timeout ?? 30000,
  });
}

/**
 * 填充表单
 * 
 * @param page - Playwright Page
 * @param selector - CSS 选择器
 * @param value - 表单值
 * @param options - 交互选项
 */
export async function fill(
  page: Page,
  selector: string,
  value: string,
  options?: InteractionOptions
): Promise<void> {
  ensurePageState(page);

  await page.fill(selector, value, {
    timeout: options?.timeout ?? 30000,
  });
}

/**
 * 等待选择器
 * 
 * @param page - Playwright Page
 * @param selector - CSS 选择器
 * @param options - 交互选项
 */
export async function waitForSelector(
  page: Page,
  selector: string,
  options?: InteractionOptions
): Promise<void> {
  ensurePageState(page);

  await page.waitForSelector(selector, {
    timeout: options?.timeout ?? 5000,
  });
}

/**
 * 获取控制台消息
 * 
 * @param page - Playwright Page
 * @param limit - 最大消息数（可选）
 * @returns 控制台消息列表
 */
export function getConsoleMessages(
  page: Page,
  limit?: number
): BrowserConsoleMessage[] {
  const state = getPageState(page);
  if (!state) return [];

  const messages = state.console;
  if (limit && limit > 0) {
    return messages.slice(-limit);
  }

  return messages;
}

/**
 * 清空控制台消息
 * 
 * @param page - Playwright Page
 */
export function clearConsoleMessages(page: Page): void {
  const state = getPageState(page);
  if (state) {
    state.console = [];
  }
}

/**
 * 获取页面错误
 * 
 * @param page - Playwright Page
 * @param limit - 最大错误数（可选）
 * @returns 页面错误列表
 */
export function getPageErrors(page: Page, limit?: number) {
  const state = getPageState(page);
  if (!state) return [];

  const errors = state.errors;
  if (limit && limit > 0) {
    return errors.slice(-limit);
  }

  return errors;
}

/**
 * 获取网络请求
 * 
 * @param page - Playwright Page
 * @param limit - 最大请求数（可选）
 * @returns 网络请求列表
 */
export function getNetworkRequests(page: Page, limit?: number) {
  const state = getPageState(page);
  if (!state) return [];

  const requests = state.requests;
  if (limit && limit > 0) {
    return requests.slice(-limit);
  }

  return requests;
}

/**
 * 获取页面信息
 * 
 * @param page - Playwright Page
 * @returns 页面信息
 */
export async function getPageInfo(page: Page) {
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
  };
}

/**
 * 根据索引获取页面
 * 
 * @param index - 页面索引（0-based）
 * @returns 页面，如果不存在抛出错误
 */
export async function getPageByIndexOrThrow(index: number): Promise<Page> {
  const pages = await getAllPages();
  const page = pages[index];
  
  if (!page) {
    throw new Error(`Page at index ${index} not found`);
  }

  return page;
}
