/**
 * Tab 管理器 - 负责 Tab 的创建、关闭、查询和历史加载
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../types/ipc';
import type { AgentTab } from '../../types/agent-tab';
import type { Message } from '../../types/message';
import type { SessionManager } from '../session/session-manager';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { sleep } from '../../shared/utils/async-utils';
import { generateTabId } from '../../shared/utils/id-generator';
import { sendToWindow } from '../../shared/utils/webcontents-utils';
import type { CreateTabOptions, TabNotificationData } from './types';

export class TabManager {
  private tabs: Map<string, AgentTab> = new Map();
  private tabCounter: number = 1;
  private tabIdCounter: number = 0;
  private readonly MAX_TABS = 10;
  private taskTabMap: Map<string, string> = new Map(); // 任务 ID -> Tab ID 映射

  constructor(private mainWindow: BrowserWindow | null) {}

  /**
   * 更新主窗口引用
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * 创建默认 Tab
   */
  createDefaultTab(): void {
    const { SystemConfigStore } = require('../database/system-config-store');
    const configStore = SystemConfigStore.getInstance();
    const nameConfig = configStore.getNameConfig();
    
    const defaultTab: AgentTab = {
      id: 'default',
      title: nameConfig.agentName,
      messages: [],
      isLoading: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    
    this.tabs.set('default', defaultTab);
    console.log('[Gateway] 创建默认 Tab:', defaultTab.id, defaultTab.title);
  }

  /**
   * 创建新 Tab
   */
  async createTab(options: CreateTabOptions): Promise<AgentTab> {
    if (this.tabs.size >= this.MAX_TABS) {
      throw new Error(`最多只能创建 ${this.MAX_TABS} 个 Tab`);
    }

    // 生成唯一的 Tab ID
    let tabId: string;
    if (options.taskId) {
      tabId = options.taskId;
    } else {
      this.tabIdCounter++;
      tabId = generateTabId();
    }

    const tab: AgentTab = {
      id: tabId,
      title: options.title,
      messages: [],
      isLoading: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      taskId: options.taskId,
      conversationKey: options.conversationKey,
      connectorId: options.connectorId,
      conversationId: options.conversationId,
    };

    this.tabs.set(tabId, tab);
    
    // 如果是任务 Tab，记录映射关系
    if (options.taskId) {
      this.taskTabMap.set(options.taskId, tabId);
    }

    this.notifyTabCreated(tab);
    console.log(`[Gateway] ✅ 创建 Tab: ${tabId} - ${options.title}`);
    
    return tab;
  }
  /**
   * 获取或创建任务专属 Tab
   */
  getOrCreateTaskTab(taskId: string, taskName: string): AgentTab {
    // 检查是否已存在该任务的 Tab
    const existingTabId = this.taskTabMap.get(taskId);
    if (existingTabId && this.tabs.has(existingTabId)) {
      const existingTab = this.tabs.get(existingTabId)!;
      console.log(`[Gateway] 🔄 复用任务 Tab: ${taskId} -> ${existingTabId}`);
      return existingTab;
    }

    // 创建新的任务 Tab
    const tab: AgentTab = {
      id: taskId, // 使用 taskId 作为 Tab ID
      title: taskName,
      messages: [],
      isLoading: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      taskId: taskId,
    };

    this.tabs.set(taskId, tab);
    this.taskTabMap.set(taskId, taskId);
    
    this.notifyTabCreated(tab);
    console.log(`[Gateway] ✅ 创建任务 Tab: ${taskId} - ${taskName}`);
    
    return tab;
  }

  /**
   * 关闭 Tab
   */
  async closeTab(tabId: string, sessionManager: SessionManager | null): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      console.warn(`[Gateway] Tab 不存在: ${tabId}`);
      return;
    }

    // 不能关闭默认 Tab
    if (tabId === 'default') {
      console.warn('[Gateway] 不能关闭默认 Tab');
      return;
    }

    console.log(`[Gateway] 🗑️ 关闭 Tab: ${tabId} - ${tab.title}`);

    // 从映射中移除任务 Tab
    if (tab.taskId) {
      this.taskTabMap.delete(tab.taskId);
    }

    // 从 tabs 中移除
    this.tabs.delete(tabId);

    // 从数据库中删除会话
    if (sessionManager) {
      try {
        await sessionManager.deleteSession(tabId);
        console.log(`[Gateway] ✅ 会话已从数据库删除: ${tabId}`);
      } catch (error) {
        console.error(`[Gateway] ❌ 删除会话失败: ${tabId}`, error);
      }
    }

    // 通知前端更新
    this.sendTabsUpdate();
    console.log(`[Gateway] ✅ Tab 已关闭: ${tabId}`);
  }

  /**
   * 获取所有 Tab
   */
  getAllTabs(): AgentTab[] {
    return Array.from(this.tabs.values());
  }

  /**
   * 获取指定 Tab
   */
  getTab(tabId: string): AgentTab | undefined {
    return this.tabs.get(tabId);
  }

  /**
   * 更新 Tab 的最后活跃时间
   */
  updateTabActivity(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.lastActiveAt = Date.now();
      this.sendTabsUpdate();
    }
  }

  /**
   * 根据对话键查找 Tab
   */
  findTabByConversationKey(key: string): AgentTab | null {
    for (const tab of this.tabs.values()) {
      if (tab.conversationKey === key) {
        return tab;
      }
    }
    return null;
  }
  /**
   * 加载 Tab 历史消息
   */
  async loadTabHistory(tabId: string, sessionManager: SessionManager | null, isActiveTab: boolean = false): Promise<void> {
    if (!sessionManager) {
      console.warn(`[Gateway] SessionManager 未初始化，跳过加载 Tab 历史: ${tabId}`);
      return;
    }

    try {
      console.log(`[Gateway] 🔄 加载 Tab 历史消息: ${tabId} (激活: ${isActiveTab})`);
      
      const messages = await sessionManager.getMessages(tabId);
      console.log(`[Gateway] 📚 Tab ${tabId} 历史消息数量: ${messages.length}`);

      // 如果是激活的 Tab，立即发送消息到前端
      if (isActiveTab && messages.length > 0) {
        sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGES_LOADED, {
          sessionId: tabId,
          messages,
        });
        console.log(`[Gateway] ✅ 已发送 ${messages.length} 条历史消息到前端: ${tabId}`);
      }

      // 更新 Tab 的消息数组（用于显示消息数量等）
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.messages = messages;
      }
    } catch (error) {
      console.error(`[Gateway] ❌ 加载 Tab 历史消息失败: ${tabId}`, getErrorMessage(error));
    }
  }

  /**
   * 加载默认 Tab 的历史消息
   */
  async loadDefaultTabHistory(sessionManager: SessionManager | null, sendWelcomeMessage: () => Promise<void>): Promise<void> {
    // 等待 SessionManager 初始化完成
    await sleep(500);
    
    if (!sessionManager) {
      console.warn('[Gateway] SessionManager 未初始化，发送欢迎消息');
      await sendWelcomeMessage();
      return;
    }
    
    try {
      console.log('[Gateway] 🔄 检查默认 Tab 是否有历史消息...');
      
      const messages = await sessionManager.getMessages('default');
      console.log(`[Gateway] 📚 默认 Tab 历史消息数量: ${messages.length}`);
      
      if (messages.length === 0) {
        console.log('[Gateway] 📝 默认 Tab 无历史消息，发送欢迎消息');
        await sendWelcomeMessage();
      } else {
        console.log('[Gateway] 📤 发送默认 Tab 历史消息到前端');
        sendToWindow(this.mainWindow, IPC_CHANNELS.MESSAGES_LOADED, {
          sessionId: 'default',
          messages,
        });
        
        // 更新默认 Tab 的消息数组
        const defaultTab = this.tabs.get('default');
        if (defaultTab) {
          defaultTab.messages = messages;
        }
      }
    } catch (error) {
      console.error('[Gateway] ❌ 加载默认 Tab 历史消息失败:', getErrorMessage(error));
      await sendWelcomeMessage();
    }
  }

  /**
   * 加载持久化的 Tab
   */
  async loadPersistentTabs(sessionManager: SessionManager | null): Promise<void> {
    if (!sessionManager) {
      console.log('[Gateway] SessionManager 未初始化，跳过加载持久化 Tab');
      return;
    }

    try {
      console.log('[Gateway] 🔄 加载持久化 Tab...');
      
      const sessions = await sessionManager.getAllSessions();
      console.log(`[Gateway] 📚 发现 ${sessions.length} 个持久化会话`);

      for (const session of sessions) {
        // 跳过默认会话（已经创建）
        if (session.id === 'default') {
          continue;
        }

        const tab: AgentTab = {
          id: session.id,
          title: session.title || `会话 ${this.tabCounter++}`,
          messages: [],
          isLoading: false,
          createdAt: Date.now(), // 使用当前时间作为创建时间
          lastActiveAt: Date.now(), // 使用当前时间作为最后活跃时间
        };

        this.tabs.set(session.id, tab);
        console.log(`[Gateway] 📂 加载持久化 Tab: ${tab.id} - ${tab.title}`);

        // 异步加载历史消息（非激活 Tab）
        this.loadTabHistory(session.id, sessionManager, false).catch(error => {
          console.error(`[Gateway] ❌ 加载 Tab 历史失败: ${session.id}`, error);
        });
      }

      // 通知前端更新 Tab 列表
      this.sendTabsUpdate();
      console.log('[Gateway] ✅ 持久化 Tab 加载完成');
    } catch (error) {
      console.error('[Gateway] ❌ 加载持久化 Tab 失败:', getErrorMessage(error));
    }
  }
  /**
   * 通知 Tab 创建
   */
  private notifyTabCreated(tab: AgentTab): void {
    this.sendTabsUpdate();
  }

  /**
   * 发送 Tab 更新到前端
   */
  private sendTabsUpdate(): void {
    if (this.mainWindow) {
      sendToWindow(this.mainWindow, IPC_CHANNELS.TABS_UPDATED, this.getAllTabs());
    }
  }
}