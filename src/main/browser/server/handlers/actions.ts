/**
 * 页面操作处理器
 */

import type { BrowserServerState } from '../types';
import {
  snapshotAi,
  screenshot,
  exportPdf,
  navigate,
  click,
  type as typeText,
  press,
  hover,
  scroll,
  select,
  fill,
  getConsoleMessages,
  getPageByIndexOrThrow,
} from '../../pw-tools-core';
import { createErrorResponse } from '../../../../shared/utils/error-handler';

/**
 * 解析 targetId 获取页面索引
 */
function parseTargetId(targetId: string | undefined): number {
  return targetId ? parseInt(targetId.replace('page-', ''), 10) : 0;
}

/**
 * 获取页面快照处理器
 */
export function handleSnapshot(state: BrowserServerState | null) {
  return async (req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.status(400).json({ error: 'Browser not running' });
      return;
    }

    const { targetId, maxChars } = req.body;
    
    try {
      const index = parseTargetId(targetId);
      const page = await getPageByIndexOrThrow(index);
      
      // 获取快照
      const result = await snapshotAi(page, maxChars);
      
      res.json({
        ok: true,
        format: 'ai',
        targetId: targetId || `page-${index}`,
        ...result,
      });
    } catch (error) {
      console.error('[Browser Server] 获取快照失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}

/**
 * 截图处理器
 */
export function handleScreenshot(state: BrowserServerState | null) {
  return async (req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.status(400).json({ error: 'Browser not running' });
      return;
    }

    const { targetId, type = 'png', fullPage = false } = req.body;
    
    try {
      const index = parseTargetId(targetId);
      const page = await getPageByIndexOrThrow(index);
      
      // 截图
      const buffer = await screenshot(page, { type, fullPage });
      
      // 返回 base64 编码的图片
      res.json({
        ok: true,
        type,
        data: buffer.toString('base64'),
      });
    } catch (error) {
      console.error('[Browser Server] 截图失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}

/**
 * 导出 PDF 处理器
 */
export function handleExportPdf(state: BrowserServerState | null) {
  return async (req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.status(400).json({ error: 'Browser not running' });
      return;
    }

    const { targetId } = req.body;
    
    try {
      const index = parseTargetId(targetId);
      const page = await getPageByIndexOrThrow(index);
      
      // 导出 PDF
      const buffer = await exportPdf(page);
      
      // 返回 base64 编码的 PDF
      res.json({
        ok: true,
        data: buffer.toString('base64'),
      });
    } catch (error) {
      console.error('[Browser Server] 导出 PDF 失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}

/**
 * 导航处理器
 */
export function handleNavigate(state: BrowserServerState | null) {
  return async (req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.status(400).json({ error: 'Browser not running' });
      return;
    }

    const { targetId, url, timeoutMs } = req.body;
    
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    try {
      const index = parseTargetId(targetId);
      const page = await getPageByIndexOrThrow(index);
      
      // 导航
      const finalUrl = await navigate(page, url, timeoutMs);
      
      res.json({
        ok: true,
        url: finalUrl,
        targetId: targetId || `page-${index}`,
      });
    } catch (error) {
      console.error('[Browser Server] 导航失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}

/**
 * 交互操作处理器
 */
export function handleAct(state: BrowserServerState | null) {
  return async (req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.status(400).json({ error: 'Browser not running' });
      return;
    }

    const { targetId, action, selector, value, key, x, y, timeout } = req.body;
    
    if (!action || typeof action !== 'string') {
      res.status(400).json({ error: 'action is required' });
      return;
    }

    try {
      const index = parseTargetId(targetId);
      const page = await getPageByIndexOrThrow(index);
      
      // 执行操作
      switch (action) {
        case 'click':
          if (!selector) throw new Error('selector is required for click');
          await click(page, selector, { timeout });
          break;
        
        case 'type':
          if (!selector) throw new Error('selector is required for type');
          if (!value) throw new Error('value is required for type');
          await typeText(page, selector, value, { timeout });
          break;
        
        case 'press':
          if (!key) throw new Error('key is required for press');
          await press(page, key);
          break;
        
        case 'hover':
          if (!selector) throw new Error('selector is required for hover');
          await hover(page, selector, { timeout });
          break;
        
        case 'scroll':
          await scroll(page, x ?? 0, y ?? 0);
          break;
        
        case 'select':
          if (!selector) throw new Error('selector is required for select');
          if (!value) throw new Error('value is required for select');
          await select(page, selector, value, { timeout });
          break;
        
        case 'fill':
          if (!selector) throw new Error('selector is required for fill');
          if (!value) throw new Error('value is required for fill');
          await fill(page, selector, value, { timeout });
          break;
        
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      
      res.json({ ok: true });
    } catch (error) {
      console.error('[Browser Server] 交互操作失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}

/**
 * 获取控制台消息处理器
 */
export function handleGetConsole(state: BrowserServerState | null) {
  return async (req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.status(400).json({ error: 'Browser not running' });
      return;
    }

    const { targetId, limit } = req.body;
    
    try {
      const index = parseTargetId(targetId);
      const page = await getPageByIndexOrThrow(index);
      
      // 获取控制台消息
      const messages = getConsoleMessages(page, limit);
      
      res.json({
        ok: true,
        messages,
      });
    } catch (error) {
      console.error('[Browser Server] 获取控制台消息失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}
