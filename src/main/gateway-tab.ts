/**
 * Gateway Tab Manager - Tab 生命周期管理
 * 
 * 职责：
 * - Tab 创建、关闭、查询
 * - Tab 持久化加载
 * - 欢迎消息处理
 * - Tab 历史加载
 */

import { BrowserWindow } from 'electron';
import type Database from '../shared/utils/sqlite-adapter';
import type { AgentTab } from '../types/agent-tab';
import type { Message } from '../types/message';
import { getErrorMessage } from '../shared/utils/error-handler';
import { sleep } from '../shared/utils/async-utils';
import { generateTabId, generateExecutionId } from '../shared/utils/id-generator';
import { sendToWindow } from '../shared/utils/webcontents-utils';
import { MAX_TABS } from '../shared/constants/version';
import type { SessionManager } from './session/session-manager';
import { saveTabConfig, updateTabTitle as dbUpdateTabTitle, deleteTabConfig, getAllPersistentTabs } from './database/tab-config';
import { SystemConfigStore } from './database/system-config-store';

/**
 * Tab Manager 类
 */
export class GatewayTabManager {
  private mainWindow: BrowserWindow | null = null;
  private db: Database.Database | null = null;
  private tabs: Map<string, AgentTab> = new Map();
  private tabCounter: number = 1;
  private tabIdCounter: number = 0;
  private taskTabMap: Map<string, string> = new Map();
  private sessionManager: SessionManager | null = null;
  
  // 回调函数
  private handleSendMessageFn: ((content: string, sessionId?: string, displayContent?: string, clearHistory?: boolean, skipHistory?: boolean) => Promise<void>) | null = null;
  private destroySessionRuntimeFn: ((sessionId: string) => Promise<void>) | null = null;
  private getIsWebModeFn: (() => boolean) | null = null; // 获取 Web 模式状态的回调
  
  constructor() {}
  
  /**
   * 设置依赖
   */
  setDependencies(deps: {
    mainWindow: BrowserWindow;
    sessionManager: SessionManager | null;
    handleSendMessage: (content: string, sessionId?: string, displayContent?: string, clearHistory?: boolean, skipHistory?: boolean) => Promise<void>;
    destroySessionRuntime: (sessionId: string) => Promise<void>;
    getIsWebMode?: () => boolean; // 可选：获取 Web 模式状态
  }): void {
    this.mainWindow = deps.mainWindow;
    this.sessionManager = deps.sessionManager;
    this.handleSendMessageFn = deps.handleSendMessage;
    this.destroySessionRuntimeFn = deps.destroySessionRuntime;
    this.getIsWebModeFn = deps.getIsWebMode || null;

    // 初始化数据库引用（单例，已在主进程启动时初始化）
    const { SystemConfigStore } = require('./database/system-config-store');
    this.db = SystemConfigStore.getInstance().getDb();
  }
  
  /**
   * 设置 SessionManager
   */
  setSessionManager(sessionManager: SessionManager | null): void {
    this.sessionManager = sessionManager;
  }

  
  /**
   * 获取所有 Tab
   */
  getTabs(): Map<string, AgentTab> {
    return this.tabs;
  }
  
  /**
   * 获取 Tab
   */
  getTab(tabId: string): AgentTab | undefined {
    return this.tabs.get(tabId);
  }
  
  /**
   * 创建默认 Tab
   */
  createDefaultTab(): void {
    const { SystemConfigStore } = require('./database/system-config-store');
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
    
    // 异步加载默认 Tab 的历史消息
    this.loadDefaultTabHistory().catch(error => {
      console.error('[TabManager] ❌ 加载默认 Tab 历史消息失败:', error);
    });
  }
  
  /**
   * 生成唯一的 Tab 名称
   * 确保名称不与现有 Tab 重复
   */
  private generateUniqueTabName(baseName: string): string {
    // 获取所有现有的 Tab 名称
    const existingNames = new Set<string>();
    for (const tab of this.tabs.values()) {
      existingNames.add(tab.title);
    }
    
    // 从 tabCounter + 1 开始尝试
    let counter = this.tabCounter + 1;
    let candidateName = `${baseName} ${counter}`;
    
    // 如果名称已存在，继续递增直到找到不重复的名称
    while (existingNames.has(candidateName)) {
      counter++;
      candidateName = `${baseName} ${counter}`;
    }
    
    return candidateName;
  }
  
  /**
   * 加载默认 Tab 的历史消息
   */
  private async loadDefaultTabHistory(): Promise<void> {
    await sleep(500);
    
    const isWebMode = this.getIsWebModeFn ? this.getIsWebModeFn() : false;
    
    if (!this.sessionManager) {
      console.warn('[TabManager] SessionManager 未初始化');
      // Web 模式下不自动发送欢迎消息
      if (!isWebMode) {
        await this.sendWelcomeMessage();
      } else {
        // Web 模式下，发送空的历史消息事件
        this.sendEmptyHistoryLoaded('default');
      }
      return;
    }
    
    try {
      const messages = await this.sessionManager.loadUIMessages('default');
      const shouldSendWelcome = this.shouldSendWelcomeMessage(messages);
      
      if (shouldSendWelcome) {
        // Web 模式下不自动发送欢迎消息，等待 WebSocket 连接
        if (!isWebMode) {
          await this.sendWelcomeMessage();
        } else {
          // Web 模式下，发送空的历史消息事件
          this.sendEmptyHistoryLoaded('default');
        }
      } else {
        const tab = this.tabs.get('default');
        if (tab) {
          tab.messages = messages;
        }
        sendToWindow(this.mainWindow, 'tab:history-loaded', { tabId: 'default', messages });
      }
    } catch (error) {
      console.error('[TabManager] ❌ 检查历史消息失败:', getErrorMessage(error));
      // Web 模式下不自动发送欢迎消息
      if (!isWebMode) {
        await this.sendWelcomeMessage();
      } else {
        // Web 模式下，发送空的历史消息事件
        this.sendEmptyHistoryLoaded('default');
      }
    }
  }
  
  /**
   * 发送空的历史消息事件（Web 模式专用）
   */
  private sendEmptyHistoryLoaded(tabId: string): void {
    sendToWindow(this.mainWindow, 'tab:history-loaded', { tabId, messages: [] });
  }
  
  /**
   * 检查并发送欢迎消息（用于模型配置后）
   */
  async checkAndSendWelcomeMessage(): Promise<void> {
    await sleep(500);
    
    if (!this.sessionManager) {
      console.warn('[TabManager] SessionManager 未初始化，跳过欢迎消息检查');
      return;
    }
    
    try {
      const messages = await this.sessionManager.loadUIMessages('default');
      const shouldSendWelcome = this.shouldSendWelcomeMessage(messages);
      
      if (shouldSendWelcome) {
        await this.sendWelcomeMessage();
      } else {
        // 有历史消息时，推送所有 Tab 的历史（用于浏览器刷新后恢复）
        await this.pushAllTabHistories();
      }
    } catch (error) {
      console.error('[TabManager] ❌ 检查欢迎消息失败:', getErrorMessage(error));
    }
  }

  /**
   * 推送所有 Tab 的历史消息（Web 模式下浏览器刷新后恢复用）
   */
  private async pushAllTabHistories(): Promise<void> {
    const allTabIds = Array.from(this.tabs.keys());
    for (const tabId of allTabIds) {
      try {
        const messages = await this.sessionManager!.loadUIMessages(tabId);
        const tab = this.tabs.get(tabId);
        if (tab) {
          tab.messages = messages;
        }
        sendToWindow(this.mainWindow, 'tab:history-loaded', { tabId, messages });
      } catch (error) {
        console.error(`[TabManager] ❌ 推送 Tab 历史失败: ${tabId}`, getErrorMessage(error));
      }
    }
  }
  
  /**
   * 判断是否需要发送欢迎消息
   */
  private shouldSendWelcomeMessage(messages: Message[]): boolean {
    if (messages.length === 0) {
      return true;
    }
    
    if (messages.length === 1 && messages[0].role === 'user') {
      return true;
    }
    
    const hasOnlySystemMessages = messages.every(msg => msg.role === 'system');
    if (hasOnlySystemMessages) {
      return true;
    }
    
    const hasUserMessage = messages.some(msg => msg.role === 'user');
    const hasAssistantMessage = messages.some(msg => msg.role === 'assistant');
    if (hasUserMessage && !hasAssistantMessage) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 发送欢迎消息
   */
  private async sendWelcomeMessage(): Promise<void> {
    if (!this.handleSendMessageFn) {
      console.error('[TabManager] handleSendMessage 未设置');
      return;
    }
    
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const configStore = SystemConfigStore.getInstance();
      const nameConfig = configStore.getNameConfig();
      
      const isDefaultUserName = nameConfig.userName === 'user';
      const isDefaultAgentName = nameConfig.agentName === 'DeepBot';
      
      // 清除默认 Tab 的所有消息
      const defaultTab = this.tabs.get('default');
      if (defaultTab) {
        defaultTab.messages = [];
        sendToWindow(this.mainWindow, 'tab:messages-cleared', { tabId: 'default' });
      }
      
      // 清除历史记录
      if (this.sessionManager) {
        await this.sessionManager.clearSession('default');
      }
      
      // 构建欢迎消息内容
      const welcomeContent = this.generateWelcomeContent(nameConfig.userName, nameConfig.agentName, isDefaultUserName, isDefaultAgentName);
      const welcomeMessage = this.generateWelcomePrompt(welcomeContent, nameConfig.userName, isDefaultUserName);
      
      await this.handleSendMessageFn(welcomeMessage, 'default', undefined, false, true);
    } catch (error) {
      console.error('[TabManager] ❌ 发送欢迎消息失败:', getErrorMessage(error));
    }
  }
  
  /**
   * 生成欢迎消息内容
   */
  private generateWelcomeContent(userName: string, agentName: string, isDefaultUserName: boolean, isDefaultAgentName: boolean): string {
    const isEn = SystemConfigStore.getInstance().getAppSetting('language') === 'en';
    
    if (isEn) {
      return `👋 Hi! Welcome to DeepBot!

I'm your all-in-one AI assistant, available 24/7 to help with all kinds of tasks. Before we start, let's get to know each other!

---

About me:

- I don't have a name yet — give me one? (Just say "Your name is XXX")${!isDefaultAgentName ? ` Current name: ${agentName}` : ''}
- Who am I? Your all-in-one AI assistant, ready to help anytime
- Conversation style? Formal / casual / professional / warm — your call
- Memory system: Say "Remember XXX" anytime and I'll permanently remember your preferences, habits, project info, etc.
- Role setting: You can assign me a professional role, e.g. "Python expert", "DevOps engineer", "Data analyst", etc. I'll work in that domain and you can install matching Skills

About you:

- What should I call you? (I'll remember permanently)${!isDefaultUserName ? ` Current name: ${userName}` : ''}
- What projects/work do you do? (I can remember your common tools)
- Any preferences or pet peeves? (e.g. code style, work habits)

What I can do:

- 📁 File operations: read, write, search, organize files
- 🌐 Browse the web: automate web pages, extract info
- ⚙️ Run commands: execute scripts, manage processes
- 📋 Task management: create, track, remind
- ⏰ Scheduled tasks: set up background automation
- 🧠 Memory system: remember your preferences, tools, project info
- 🔧 Skill extensions: install skill packages to expand my abilities

Extensions:

- 🔧 Install Skills: Say "search XXX skill" or "install XXX skill"
- 🐍 Python tools: I can install and use Python tools for complex tasks

More info:

- 💡 Click [⚙️ Config] in the top right to see the "Quick Start" guide

Commands:

- /new — Clear session history, start fresh
- /memory — View and manage memory
- /merge-memory <Tab name> — Merge memory from another Tab
- /clone <Tab name> — Clone history and memory from another Tab
- /history — View conversation stats
- /stop — Stop the current running task
- /status — View current task status
- /reload-path — Reload PATH environment variables

As we interact, I'll get to know you better and improve at completing tasks. 😊

Feel free to ask anything or tell me what you need!`;
    }

    return `👋 你好！欢迎第一次使用 DeepBot！

我是你的全能 AI 助手，24 小时待命帮你处理各种任务。在开始之前，让我们先互相认识一下吧！

---

关于我：

- 我还没有名字，你帮我取一个？（说"你叫 XXX"即可）${!isDefaultAgentName ? ` 当前名字：${agentName}` : ''}
- 我是谁？全能 AI 助手，24 小时待命帮你干活
- 对话风格？你希望我正式/随意/专业/温暖？
- 记忆系统：你可以随时说"记住 XXX"，我会永久记住你的偏好、习惯、项目信息等
- 角色设定：你可以给我设定专业角色，比如"Python 开发专家"、"运维工程师"、"数据分析师"等，设定后我会按照这个专业领域来帮你，还可以安装对应的 Skill 扩展能力

关于你：

- 怎么称呼你？（我会永久记住）${!isDefaultUserName ? ` 当前称呼：${userName}` : ''}
- 你主要做什么项目/工作？（我可以记住常用工具和命令）
- 有什么特别在意或讨厌的？（比如代码风格、工作习惯）

我能帮你做什么：

- 📁 文件操作：读写、搜索、整理文件
- 🌐 浏览网页：自动化网页操作、信息提取
- ⚙️ 执行命令：运行脚本、管理进程
- 📋 任务管理：创建、跟踪、提醒任务
- ⏰ 定时任务：设置后台自动执行的任务
- 🧠 记忆系统：记住你的偏好、常用工具、项目信息
- 🔧 Skill 扩展：安装专业技能包，扩展我的能力

扩展能力：

- 🔧 安装 Skill：通过说"搜索 XXX skill"或"安装 XXX skill"来扩展专业能力
- 🐍 Python 工具：我可以帮你安装和使用 Python 工具来处理更复杂的任务

更多使用说明：

- 💡 点击右上角 [⚙️ Config] 按钮，查看"快速入门"了解详细使用指南

常用指令：

- /new — 清空当前会话历史，开始新对话
- /memory — 查看和管理记忆
- /merge-memory <Tab名称> — 合并其他 Tab 的记忆到当前 Tab
- /clone <Tab名称> — 克隆其他 Tab 的历史和记忆到当前 Tab
- /history — 查看对话历史统计
- /stop — 停止当前正在执行的任务
- /status — 查看当前任务执行状态
- /reload-path — 刷新环境变量（安装新工具后使用）

在我们的沟通过程中，我会越来越了解你，知道怎么更好的完成任务。😊

有什么问题或者需要帮忙的，尽管说！`;
  }
  
  /**
   * 生成欢迎消息的 Agent 提示词
   */
  private generateWelcomePrompt(welcomeContent: string, userName: string, isDefaultUserName: boolean): string {
    const isEn = SystemConfigStore.getInstance().getAppSetting('language') === 'en';
    const userRef = isDefaultUserName ? (isEn ? 'the user' : '用户') : userName;
    
    return isEn
      ? `Please welcome the user as follows:

1. Output the following content directly (keep formatting):

${welcomeContent}

2. Then use the environment_check tool to check the runtime environment
3. If the environment is not configured, remind ${userRef} that you can help install it

Do not show planning steps, just execute.`
      : `请按照以下方式欢迎用户：

1. 直接输出以下内容（保持格式）：

${welcomeContent}

2. 然后使用 environment_check 工具检查运行环境
3. 如果环境未配置，提醒${isDefaultUserName ? '用户' : userName}你可以帮助安装

不要显示计划步骤，直接执行。`;
  }

  
  /**
   * 加载 Tab 历史消息
   */
  async loadTabHistory(tabId: string, isActiveTab: boolean = false): Promise<void> {
    if (!this.sessionManager) {
      console.warn('[TabManager] SessionManager 未初始化，跳过加载历史消息');
      return;
    }
    
    try {
      if (!isActiveTab) {
        await sleep(1000);
      }
      
      const messages = await this.sessionManager.loadUIMessages(tabId);
      
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.messages = messages;
      }
      
      // 即使消息为空，也要发送事件，避免前端一直显示"初始化中"
      sendToWindow(this.mainWindow, 'tab:history-loaded', { tabId, messages });
    } catch (error) {
      console.error(`[TabManager] ❌ 加载 Tab 历史消息失败: ${tabId}`, getErrorMessage(error));
    }
  }
  
  /**
   * 加载持久化的 Tab
   */
  async loadPersistentTabs(): Promise<void> {
    try {
      await sleep(500);

      if (!this.db) {
        console.warn('[TabManager] db 未初始化，跳过加载持久化 Tab');
        return;
      }

      const persistentTabs = getAllPersistentTabs(this.db);
      
      if (persistentTabs.length === 0) {
        return;
      }
      
      for (const tabConfig of persistentTabs) {
        try {
          const tabId = tabConfig.id;
          let tabType: 'normal' | 'connector' | 'scheduled_task' = 'normal';
          if (tabConfig.type === 'connector') {
            tabType = 'connector';
          } else if (tabConfig.type === 'task') {
            tabType = 'scheduled_task';
          }
          
          const conversationKey = tabConfig.connectorId && tabConfig.conversationId
            ? `${tabConfig.connectorId}_${tabConfig.conversationId}`
            : undefined;
          
          const tab: AgentTab = {
            id: tabId,
            title: tabConfig.title,
            type: tabType,
            messages: [],
            isLoading: false,
            createdAt: tabConfig.createdAt,
            lastActiveAt: tabConfig.lastActiveAt,
            memoryFile: tabConfig.memoryFile,
            agentName: tabConfig.agentName,
            isPersistent: true,
            conversationKey,
            connectorId: tabConfig.connectorId,
            conversationId: tabConfig.conversationId,
            taskId: tabConfig.taskId,
            modelConfig: tabConfig.modelConfig,
          };
          
          this.tabs.set(tabId, tab);
          
          // 加载历史消息（异步，不阻塞）
          if (this.sessionManager) {
            const isActiveTab = tabId === 'default';
            this.loadTabHistory(tabId, isActiveTab).catch(error => {
              console.error(`[TabManager] ❌ 加载 Tab 历史消息失败: ${tabId}`, error);
            });
          }
          
          // 通知前端 Tab 已创建
          this.notifyTabCreated(tab);
        } catch (error) {
          console.error(`[TabManager] ❌ 恢复 Tab 失败: ${tabConfig.id}`, error);
        }
      }
    } catch (error) {
      console.error('[TabManager] ❌ 加载持久化 Tab 失败:', error);
    }
  }
  
  /**
   * 创建新 Tab
   */
  async createTab(options: {
    type?: 'normal' | 'connector' | 'scheduled_task';
    title?: string;
    conversationKey?: string;
    connectorId?: string;
    conversationId?: string;
    taskId?: string;
    memoryFile?: string | null;
    agentName?: string | null;
    isPersistent?: boolean;
    groupName?: string;
  }): Promise<AgentTab> {
    // 检查 Tab 数量限制
    if (this.tabs.size >= MAX_TABS) {
      throw new Error(`最多只能创建 ${MAX_TABS} 个窗口`);
    }
    
    // 生成唯一的 Tab ID
    this.tabIdCounter++;
    const tabId = generateTabId(this.tabIdCounter);
    
    // 确定 Tab 类型
    let tabType: 'manual' | 'task' | 'connector' = 'manual';
    if (options.type === 'scheduled_task') {
      tabType = 'task';
    } else if (options.type === 'connector') {
      tabType = 'connector';
    }
    
    // 生成默认标题（确保不重复）
    let tabTitle: string;
    if (options.title) {
      tabTitle = options.title;
    } else if (tabType === 'task' || tabType === 'connector') {
      // 生成不重复的 Agent 名称
      tabTitle = this.generateUniqueTabName('Agent');
    } else {
      if (options.agentName) {
        tabTitle = options.agentName;
      } else {
        const { SystemConfigStore } = await import('./database/system-config-store');
        const configStore = SystemConfigStore.getInstance();
        const nameConfig = configStore.getNameConfig();
        // 生成不重复的名称
        tabTitle = this.generateUniqueTabName(nameConfig.agentName);
      }
    }
    
    this.tabCounter++;
    
    // 确定是否持久化
    const isPersistent = options.isPersistent !== undefined 
      ? options.isPersistent 
      : (tabType === 'manual' || tabType === 'connector');
    
    // 生成独立的 memory 文件名
    const memoryFile = options.memoryFile !== undefined
      ? options.memoryFile
      : `memory-${tabId}.md`;
    
    // 创建 Tab
    const tab: AgentTab = {
      id: tabId,
      title: tabTitle,
      type: options.type || 'normal',
      messages: [],
      isLoading: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      conversationKey: options.conversationKey,
      connectorId: options.connectorId,
      conversationId: options.conversationId,
      taskId: options.taskId,
      memoryFile,
      agentName: options.agentName,
      isPersistent,
      groupName: options.groupName,
    };
    
    this.tabs.set(tabId, tab);
    console.log('[TabManager] 创建新 Tab:', tabId, tabTitle, options.type, isPersistent ? '(持久化)' : '(临时)');
    
    // 如果是持久化 Tab，保存到数据库
    if (isPersistent && this.db) {
      try {
        saveTabConfig(this.db, {
          id: tabId,
          title: tabTitle,
          type: tabType,
          memoryFile,
          agentName: options.agentName || null,
          isPersistent: true,
          createdAt: tab.createdAt,
          lastActiveAt: tab.lastActiveAt,
          taskId: options.taskId,
          connectorId: options.connectorId,
          conversationId: options.conversationId,
        });
        
        console.log('[TabManager] 💾 Tab 配置已持久化:', tabId);
        
        // 创建 Tab 的 memory 文件
        if (memoryFile) {
          try {
            const { createTabMemoryFile } = await import('./tools/memory-tool');
            await createTabMemoryFile(tabId, memoryFile);
          } catch (error) {
            console.error('[TabManager] ❌ 创建 Tab memory 文件失败:', error);
          }
        }
      } catch (error) {
        console.error('[TabManager] ❌ 保存 Tab 配置失败:', error);
      }
    }
    
    // 通知前端 Tab 已创建
    this.notifyTabCreated(tab);
    
    return tab;
  }
  
  /**
   * 获取或创建任务专属 Tab
   */
  getOrCreateTaskTab(taskId: string, taskName: string): AgentTab {
    // 检查是否已有该任务的 Tab
    const existingTabId = this.taskTabMap.get(taskId);
    if (existingTabId) {
      const existingTab = this.tabs.get(existingTabId);
      if (existingTab) {
        console.log('[TabManager] 复用任务 Tab:', existingTabId, taskName);
        return existingTab;
      }
    }
    
    // 生成任务名称缩写
    const shortName = taskName.length > 8 ? taskName.slice(0, 8) + '...' : taskName;
    const tabTitle = `⏰ ${shortName}`;
    const tabId = `task-tab-${taskId}`;
    
    // 创建锁定的任务 Tab
    const tab: AgentTab = {
      id: tabId,
      title: tabTitle,
      messages: [],
      isLoading: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      isLocked: true,
      taskId: taskId,
    };
    
    this.tabs.set(tabId, tab);
    this.taskTabMap.set(taskId, tabId);
    console.log('[TabManager] 创建任务专属 Tab:', tabId, tabTitle);
    
    // 通知前端 Tab 已创建
    this.notifyTabCreated(tab);
    
    return tab;
  }
  
  /**
   * 通知前端 Tab 已创建
   */
  private notifyTabCreated(tab: AgentTab): void {
    sendToWindow(this.mainWindow, 'tab:created', { tab });
  }

  /**
   * 更新 Tab 标题并通知前端，同步持久化到数据库
   * @param groupName 可选，同步更新 groupName 字段（飞书群 Tab 专用）
   */
  updateTabTitle(tabId: string, newTitle: string, groupName?: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.title === newTitle) return;
    tab.title = newTitle;
    if (groupName !== undefined) {
      tab.groupName = groupName;
    }
    sendToWindow(this.mainWindow, 'tab:updated', { tabId, title: newTitle });

    // 持久化 Tab 才需要写数据库
    if (tab.isPersistent && this.db) {
      try {
        dbUpdateTabTitle(this.db, tabId, newTitle);
      } catch (err) {
        console.error('[TabManager] ❌ 更新 Tab 标题到数据库失败:', err);
      }
    }
  }
  
  /**
   * 关闭 Tab
   */
  async closeTab(tabId: string): Promise<void> {
    // 不允许关闭默认 Tab
    if (tabId === 'default') {
      throw new Error('不能关闭默认窗口');
    }
    
    // 检查 Tab 是否存在
    const tab = this.tabs.get(tabId);
    if (!tab) {
      throw new Error('窗口不存在');
    }
    
    // 如果是任务 Tab，暂停关联的任务
    if (tab.isLocked && tab.taskId) {
      console.log('[TabManager] 检测到任务 Tab 关闭，暂停任务:', tab.taskId);
      try {
        const { createScheduledTaskTool } = await import('./tools/scheduled-task-tool');
        const tool = createScheduledTaskTool();
        
        await tool.execute(
          generateExecutionId('pause-task'),
          {
            action: 'pause',
            taskId: tab.taskId,
          },
          new AbortController().signal,
          () => {}
        );
        
        console.log('[TabManager] 任务已暂停:', tab.taskId);
        this.taskTabMap.delete(tab.taskId);
      } catch (error) {
        console.error('[TabManager] 暂停任务失败:', error);
      }
    }
    
    // 销毁对应的 AgentRuntime
    if (this.destroySessionRuntimeFn) {
      await this.destroySessionRuntimeFn(tabId);
    }
    
    // 删除 Tab 的 memory 文件
    if (tab.memoryFile) {
      try {
        const { deleteTabMemoryFile } = await import('./tools/memory-tool');
        await deleteTabMemoryFile(tabId, tab.memoryFile);
      } catch (error) {
        console.error('[TabManager] ❌ 删除 Tab memory 文件失败:', error);
      }
    }
    
    // 清空 Tab 的 session 文件
    if (this.sessionManager) {
      try {
        await this.sessionManager.clearSession(tabId);
        console.log('[TabManager] 🗑️ 已清空 Tab session 文件:', tabId);
      } catch (error) {
        console.error('[TabManager] ❌ 清空 Tab session 文件失败:', error);
      }
    }
    
    // 如果是持久化 Tab，从数据库删除配置
    if (tab.isPersistent && this.db) {
      try {
        deleteTabConfig(this.db, tabId);
        console.log('[TabManager] 🗑️ 已删除 Tab 持久化配置:', tabId);
      } catch (error) {
        console.error('[TabManager] ❌ 删除 Tab 配置失败:', error);
      }
    }
    
    // 删除 Tab
    this.tabs.delete(tabId);
    console.log('[TabManager] 关闭 Tab:', tabId);
  }
  
  /**
   * 获取所有 Tab
   */
  getAllTabs(): AgentTab[] {
    return Array.from(this.tabs.values()).sort((a, b) => {
      if (a.id === 'default') return -1;
      if (b.id === 'default') return 1;
      return a.createdAt - b.createdAt;
    });
  }
  
  /**
   * 更新 Tab 的最后活跃时间
   */
  updateTabActivity(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.lastActiveAt = Date.now();
    }
  }
  
  /**
   * 查找 Tab（基于 conversationKey）
   */
  findTabByConversationKey(key: string): AgentTab | null {
    for (const tab of this.tabs.values()) {
      if (tab.conversationKey === key) {
        return tab;
      }
    }
    return null;
  }
}
