/**
 * 标签页管理处理器
 */

import type { BrowserServerState } from '../types';
import {
  getAllPages,
  createNewPage,
  getPageByIndex,
  closePage,
} from '../../pw-session';
import { getPageInfo } from '../../pw-tools-core';
import { createErrorResponse } from '../../../../shared/utils/error-handler';

/**
 * 获取标签页列表处理器
 */
export function handleGetTabs(state: BrowserServerState | null) {
  return async (_req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.status(400).json({ error: 'Browser not running' });
      return;
    }

    try {
      const pages = await getAllPages();
      const tabs = await Promise.all(
        pages.map(async (page, index) => {
          const info = await getPageInfo(page);
          return {
            targetId: `page-${index}`, // 简化：使用索引作为 targetId
            title: info.title,
            url: info.url,
            type: 'page',
          };
        })
      );

      res.json({ tabs });
    } catch (error) {
      console.error('[Browser Server] 获取标签页列表失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}

/**
 * 打开新标签页处理器
 */
export function handleOpenTab(state: BrowserServerState | null) {
  return async (req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.status(400).json({ error: 'Browser not running' });
      return;
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    try {
      console.log('[Browser Server] 打开标签页:', url);
      
      // 创建新页面
      const page = await createNewPage(url);
      const info = await getPageInfo(page);
      
      // 获取页面索引作为 targetId
      const pages = await getAllPages();
      const index = pages.indexOf(page);
      
      res.json({ 
        ok: true, 
        targetId: `page-${index}`,
        title: info.title,
        url: info.url,
        type: 'page',
      });
    } catch (error) {
      console.error('[Browser Server] 打开标签页失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}

/**
 * 关闭标签页处理器
 */
export function handleCloseTab(state: BrowserServerState | null) {
  return async (req: any, res: any): Promise<void> => {
    if (!state) {
      res.status(503).json({ error: 'Server not initialized' });
      return;
    }

    if (!state.browser.running) {
      res.status(400).json({ error: 'Browser not running' });
      return;
    }

    const { targetId } = req.params;
    
    try {
      // 解析 targetId 获取页面索引
      const index = parseInt(targetId.replace('page-', ''), 10);
      const page = await getPageByIndex(index);
      
      if (!page) {
        res.status(404).json({ error: 'Tab not found' });
        return;
      }
      
      // 关闭页面
      await closePage(page);
      
      res.json({ ok: true });
    } catch (error) {
      console.error('[Browser Server] 关闭标签页失败:', error);
      res.status(500).json(createErrorResponse(error));
    }
  };
}
