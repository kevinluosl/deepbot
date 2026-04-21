/**
 * Preload 脚本
 * 
 * 职责：
 * - 暴露安全的 API 给渲染进程
 * - 桥接主进程和渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';

// IPC 频道名称
const IPC_CHANNELS = {
  SEND_MESSAGE: 'message:send',
  MESSAGE_STREAM: 'message:stream',
  MESSAGE_ERROR: 'message:error',
  STOP_GENERATION: 'message:stop',
  EXECUTION_STEP_UPDATE: 'message:execution-step-update',
  CLEAR_ALL_MESSAGES: 'message:clear-all',
  TASK_MAIN_CREATED: 'task-monitor:main-task-created',
  TASK_MAIN_UPDATED: 'task-monitor:main-task-updated',
  TASK_SUB_ADDED: 'task-monitor:sub-task-added',
  TASK_SUB_UPDATED: 'task-monitor:sub-task-updated',
  TASKS_CLEARED: 'task-monitor:tasks-cleared',
  SKILL_MANAGER: 'skill-manager',
  INVALIDATE_SYSTEM_PROMPTS: 'system-prompt:invalidate',
  SCHEDULED_TASK: 'scheduled-task',
  ENVIRONMENT_CHECK: 'environment-check',
  GET_WORKSPACE_SETTINGS: 'workspace:get-settings',
  GET_DEFAULT_WORKSPACE_SETTINGS: 'workspace:get-default-settings',
  SAVE_WORKSPACE_SETTINGS: 'workspace:save-settings',
  ADD_SKILL_DIR: 'workspace:add-skill-dir',
  REMOVE_SKILL_DIR: 'workspace:remove-skill-dir',
  SET_DEFAULT_SKILL_DIR: 'workspace:set-default-skill-dir',
  ADD_WORKSPACE_DIR: 'workspace:add-workspace-dir',
  REMOVE_WORKSPACE_DIR: 'workspace:remove-workspace-dir',
  READ_IMAGE: 'image:read',
  UPLOAD_IMAGE: 'image:upload',
  UPLOAD_FILE: 'file:upload',
  DELETE_TEMP_FILE: 'file:delete-temp',
  GET_IMAGE_GENERATION_TOOL_CONFIG: 'tool-config:image-generation:get',
  SAVE_IMAGE_GENERATION_TOOL_CONFIG: 'tool-config:image-generation:save',
  GET_WEB_SEARCH_TOOL_CONFIG: 'tool-config:web-search:get',
  SAVE_WEB_SEARCH_TOOL_CONFIG: 'tool-config:web-search:save',
  GET_DISABLED_TOOLS: 'tool-config:disabled:get',
  SAVE_DISABLED_TOOLS: 'tool-config:disabled:save',
  LAUNCH_CHROME_WITH_DEBUG: 'browser:launch-chrome-with-debug',
  GET_NAME_CONFIG: 'name-config:get',
  GET_TAB_AGENT_NAME: 'name-config:get-tab-agent-name',
  SAVE_AGENT_NAME: 'name-config:save-agent-name',
  SAVE_USER_NAME: 'name-config:save-user-name',
  NAME_CONFIG_UPDATED: 'name-config:updated', // 🔥 名字配置更新通知
  MODEL_CONFIG_UPDATED: 'model-config:updated', // 🔥 模型配置更新通知
  CREATE_TAB: 'tab:create',
  CLOSE_TAB: 'tab:close',
  GET_TABS: 'tab:get-all',
  SWITCH_TAB: 'tab:switch',
  TAB_CREATED: 'tab:created', // Tab 创建通知
  TAB_UPDATED: 'tab:updated', // Tab 信息更新通知（如标题变更）
  TAB_HISTORY_LOADED: 'tab:history-loaded', // 🔥 Tab 历史消息加载通知
  TAB_MESSAGES_CLEARED: 'tab:messages-cleared', // 🔥 Tab 消息清除通知
  COMMAND_CLEAR_CHAT: 'command:clear-chat', // 🔥 清空聊天指令
  CONNECTOR_GET_ALL: 'connector:get-all',
  CONNECTOR_GET_CONFIG: 'connector:get-config',
  CONNECTOR_SAVE_CONFIG: 'connector:save-config',
  CONNECTOR_START: 'connector:start',
  CONNECTOR_STOP: 'connector:stop',
  CONNECTOR_HEALTH_CHECK: 'connector:health-check',
  CONNECTOR_GET_PAIRING_RECORDS: 'connector:get-pairing-records',
  CONNECTOR_APPROVE_PAIRING: 'connector:approve-pairing',
  CONNECTOR_SET_ADMIN_PAIRING: 'connector:set-admin-pairing',
  CONNECTOR_DELETE_PAIRING: 'connector:delete-pairing',
  CONNECTOR_PENDING_COUNT_UPDATED: 'connector:pending-count-updated',
} as const;

/**
 * 暴露给渲染进程的 API
 */
contextBridge.exposeInMainWorld('deepbot', {
  // 发送消息
  sendMessage: (content: string, sessionId?: string, displayContent?: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, { content, sessionId, displayContent });
  },

  // 停止生成
  stopGeneration: (sessionId?: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.STOP_GENERATION, { sessionId });
  },
  
  // Skill Manager
  skillManager: (request: any) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_MANAGER, request);
  },

  // 标记系统提示词需要重建
  invalidateSystemPrompts: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.INVALIDATE_SYSTEM_PROMPTS);
  },
  
  // 定时任务管理
  scheduledTask: (request: any) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCHEDULED_TASK, request);
  },
  
  // 环境检查
  checkEnvironment: (action: 'check' | 'get_status') => {
    return ipcRenderer.invoke(IPC_CHANNELS.ENVIRONMENT_CHECK, { action });
  },
  
  // 工作目录配置
  getWorkspaceSettings: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_WORKSPACE_SETTINGS);
  },
  
  getDefaultWorkspaceSettings: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_DEFAULT_WORKSPACE_SETTINGS);
  },
  
  saveWorkspaceSettings: (settings: any) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_WORKSPACE_SETTINGS, settings);
  },

  addSkillDir: (dir: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.ADD_SKILL_DIR, { dir });
  },

  removeSkillDir: (dir: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMOVE_SKILL_DIR, { dir });
  },

  setDefaultSkillDir: (dir: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SET_DEFAULT_SKILL_DIR, { dir });
  },

  addWorkspaceDir: (dir: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.ADD_WORKSPACE_DIR, { dir });
  },

  removeWorkspaceDir: (dir: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMOVE_WORKSPACE_DIR, { dir });
  },

  // 读取图片
  readImage: (path: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_IMAGE, { path });
  },

  // 用系统默认应用打开本地文件
  openPath: (filePath: string) => {
    return ipcRenderer.invoke('shell:open-path', { filePath });
  },

  // 打开文件夹选择对话框（仅 Electron）
  selectFolder: () => {
    return ipcRenderer.invoke('dialog:select-folder');
  },

  // 上传图片
  uploadImage: (name: string, dataUrl: string, size: number) => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPLOAD_IMAGE, { name, dataUrl, size });
  },

  // 上传文件
  uploadFile: (name: string, dataUrl: string, size: number, type: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPLOAD_FILE, { name, dataUrl, size, type });
  },

  // 删除临时文件
  deleteTempFile: (path: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DELETE_TEMP_FILE, { path });
  },

  // 工具配置 - 图片生成工具
  getImageGenerationToolConfig: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_IMAGE_GENERATION_TOOL_CONFIG);
  },

  saveImageGenerationToolConfig: (config: { provider?: string; model: string; apiUrl: string; apiKey: string }) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_IMAGE_GENERATION_TOOL_CONFIG, config);
  },

  // 工具配置 - Web Search 工具
  getWebSearchToolConfig: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_WEB_SEARCH_TOOL_CONFIG);
  },

  saveWebSearchToolConfig: (config: { model: string; apiUrl: string; apiKey: string }) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_WEB_SEARCH_TOOL_CONFIG, { config });
  },

  // 工具禁用管理
  getDisabledTools: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_DISABLED_TOOLS);
  },

  saveDisabledTools: (disabledTools: string[]) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_DISABLED_TOOLS, { disabledTools });
  },

  launchChromeWithDebug: (port: number) => {
    return ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_CHROME_WITH_DEBUG, { port });
  },

  // 名字配置
  getNameConfig: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_NAME_CONFIG);
  },
  
  getTabAgentName: (tabId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_TAB_AGENT_NAME, { tabId });
  },
  
  saveAgentName: (agentName: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_AGENT_NAME, { agentName });
  },
  
  saveUserName: (userName: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_USER_NAME, { userName });
  },

  // 应用设置（通用 key-value）
  saveAppSetting: (key: string, value: string) => {
    return ipcRenderer.invoke('app-setting:save', { key, value });
  },
  
  getAppSetting: (key: string) => {
    return ipcRenderer.invoke('app-setting:get', { key });
  },
  
  // 🔥 监听名字配置更新（事件驱动）
  onNameConfigUpdate: (callback: (config: { agentName?: string; userName?: string; tabId?: string; isGlobalUpdate?: boolean }) => void) => {
    const listener = (_event: any, config: any) => callback(config);
    ipcRenderer.on(IPC_CHANNELS.NAME_CONFIG_UPDATED, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.NAME_CONFIG_UPDATED, listener);
    };
  },
  
  // 🔥 监听模型配置更新（事件驱动）
  onModelConfigUpdate: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.MODEL_CONFIG_UPDATED, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MODEL_CONFIG_UPDATED, listener);
    };
  },
  
  // Tab 管理
  createTab: (title?: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CREATE_TAB, { title });
  },
  
  closeTab: (tabId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CLOSE_TAB, { tabId });
  },
  
  getAllTabs: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_TABS);
  },
  
  switchTab: (tabId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SWITCH_TAB, { tabId });
  },
  
  // 监听 Tab 创建（定时任务等后台创建的 Tab）
  onTabCreated: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.TAB_CREATED, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TAB_CREATED, listener);
    };
  },

  // 监听 Tab 信息更新（如标题变更）
  onTabUpdated: (callback: (data: { tabId: string; title: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.TAB_UPDATED, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TAB_UPDATED, listener);
    };
  },
  
  // 🔥 监听 Tab 历史消息加载
  onTabHistoryLoaded: (callback: (data: { tabId: string; messages: any[] }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.TAB_HISTORY_LOADED, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TAB_HISTORY_LOADED, listener);
    };
  },
  
  // 🔥 监听 Tab 消息清除
  onTabMessagesCleared: (callback: (data: { tabId: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.TAB_MESSAGES_CLEARED, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TAB_MESSAGES_CLEARED, listener);
    };
  },
  
  // 🔥 监听清空聊天指令
  onClearChat: (callback: (data: { sessionId: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.COMMAND_CLEAR_CHAT, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.COMMAND_CLEAR_CHAT, listener);
    };
  },
  
  // 连接器管理
  connectorGetAll: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_GET_ALL);
  },
  
  connectorGetConfig: (connectorId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_GET_CONFIG, { connectorId });
  },
  
  connectorSaveConfig: (connectorId: string, config: any) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_SAVE_CONFIG, { connectorId, config });
  },
  
  connectorStart: (connectorId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_START, { connectorId });
  },
  
  connectorStop: (connectorId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_STOP, { connectorId });
  },
  
  connectorHealthCheck: (connectorId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_HEALTH_CHECK, { connectorId });
  },
  
  connectorGetPairingRecords: (connectorId?: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_GET_PAIRING_RECORDS, { connectorId });
  },
  
  connectorApprovePairing: (pairingCode: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_APPROVE_PAIRING, { pairingCode });
  },

  connectorSetAdminPairing: (connectorId: string, userId: string, isAdmin: boolean) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_SET_ADMIN_PAIRING, { connectorId, userId, isAdmin });
  },

  connectorDeletePairing: (connectorId: string, userId: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CONNECTOR_DELETE_PAIRING, { connectorId, userId });
  },

  // 监听待授权用户数量变化
  onPendingCountUpdate: (callback: (data: { pendingCount: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CONNECTOR_PENDING_COUNT_UPDATED, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CONNECTOR_PENDING_COUNT_UPDATED, listener);
    };
  },

  // 监听微信二维码
  onWechatQrCode: (callback: (data: { url: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('wechat:qr-code', listener);
    return () => {
      ipcRenderer.removeListener('wechat:qr-code', listener);
    };
  },

  // 监听流式消息
  onMessageStream: (callback: (chunk: any) => void) => {
    const listener = (_event: any, chunk: any) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.MESSAGE_STREAM, listener);
    
    // 返回取消监听函数
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MESSAGE_STREAM, listener);
    };
  },

  // 监听加载状态变化
  onLoadingStatus: (callback: (data: { status: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('loading-status', listener);
    return () => {
      ipcRenderer.removeListener('loading-status', listener);
    };
  },

  // 监听错误
  onMessageError: (callback: (error: any) => void) => {
    const listener = (_event: any, error: any) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.MESSAGE_ERROR, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MESSAGE_ERROR, listener);
    };
  },

  // 监听执行步骤更新
  onExecutionStepUpdate: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.EXECUTION_STEP_UPDATE, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.EXECUTION_STEP_UPDATE, listener);
    };
  },

  // 监听清空所有消息事件
  onClearAllMessages: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.CLEAR_ALL_MESSAGES, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.CLEAR_ALL_MESSAGES, listener);
    };
  },

  // 任务监控
  taskMonitor: {
    onMainTaskCreated: (callback: (task: any) => void) => {
      const listener = (_event: any, task: any) => callback(task);
      ipcRenderer.on(IPC_CHANNELS.TASK_MAIN_CREATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_MAIN_CREATED, listener);
    },
    onMainTaskUpdated: (callback: (updates: any) => void) => {
      const listener = (_event: any, updates: any) => callback(updates);
      ipcRenderer.on(IPC_CHANNELS.TASK_MAIN_UPDATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_MAIN_UPDATED, listener);
    },
    onSubTaskAdded: (callback: (subTask: any) => void) => {
      const listener = (_event: any, subTask: any) => callback(subTask);
      ipcRenderer.on(IPC_CHANNELS.TASK_SUB_ADDED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_SUB_ADDED, listener);
    },
    onSubTaskUpdated: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.TASK_SUB_UPDATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_SUB_UPDATED, listener);
    },
    onTasksCleared: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.TASKS_CLEARED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TASKS_CLEARED, listener);
    },
  },
});

// 暴露 electron API（用于 Skill Manager 等通用 IPC 调用）
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => {
      return ipcRenderer.invoke(channel, ...args);
    },
    on: (channel: string, listener: (...args: any[]) => void) => {
      const wrappedListener = (_event: any, ...args: any[]) => listener(...args);
      ipcRenderer.on(channel, wrappedListener);
      return wrappedListener;
    },
    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, listener);
    },
  },
});
