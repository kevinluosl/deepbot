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
  TASK_MAIN_CREATED: 'task-monitor:main-task-created',
  TASK_MAIN_UPDATED: 'task-monitor:main-task-updated',
  TASK_SUB_ADDED: 'task-monitor:sub-task-added',
  TASK_SUB_UPDATED: 'task-monitor:sub-task-updated',
  TASKS_CLEARED: 'task-monitor:tasks-cleared',
  SKILL_MANAGER: 'skill-manager',
  SCHEDULED_TASK: 'scheduled-task',
  ENVIRONMENT_CHECK: 'environment-check',
  GET_WORKSPACE_SETTINGS: 'workspace:get-settings',
  GET_DEFAULT_WORKSPACE_SETTINGS: 'workspace:get-default-settings',
  SAVE_WORKSPACE_SETTINGS: 'workspace:save-settings',
  ADD_SKILL_DIR: 'workspace:add-skill-dir',
  REMOVE_SKILL_DIR: 'workspace:remove-skill-dir',
  SET_DEFAULT_SKILL_DIR: 'workspace:set-default-skill-dir',
  READ_IMAGE: 'image:read',
  UPLOAD_IMAGE: 'image:upload',
  GET_IMAGE_GENERATION_TOOL_CONFIG: 'tool-config:image-generation:get',
  SAVE_IMAGE_GENERATION_TOOL_CONFIG: 'tool-config:image-generation:save',
  GET_WEB_SEARCH_TOOL_CONFIG: 'tool-config:web-search:get',
  SAVE_WEB_SEARCH_TOOL_CONFIG: 'tool-config:web-search:save',
  GET_NAME_CONFIG: 'name-config:get',
  SAVE_AGENT_NAME: 'name-config:save-agent-name',
  SAVE_USER_NAME: 'name-config:save-user-name',
  NAME_CONFIG_UPDATED: 'name-config:updated', // 🔥 名字配置更新通知
  CREATE_TAB: 'tab:create',
  CLOSE_TAB: 'tab:close',
  GET_TABS: 'tab:get-all',
  SWITCH_TAB: 'tab:switch',
  TAB_CREATED: 'tab:created', // Tab 创建通知
} as const;

/**
 * 暴露给渲染进程的 API
 */
contextBridge.exposeInMainWorld('deepbot', {
  // 版本信息
  version: '0.1.0',

  // 发送消息
  sendMessage: (content: string, sessionId?: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SEND_MESSAGE, { content, sessionId });
  },

  // 停止生成
  stopGeneration: (sessionId?: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.STOP_GENERATION, { sessionId });
  },
  
  // Skill Manager
  skillManager: (request: any) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SKILL_MANAGER, request);
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

  // 读取图片
  readImage: (path: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_IMAGE, { path });
  },

  // 上传图片
  uploadImage: (name: string, dataUrl: string, size: number) => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPLOAD_IMAGE, { name, dataUrl, size });
  },

  // 工具配置 - 图片生成工具
  getImageGenerationToolConfig: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_IMAGE_GENERATION_TOOL_CONFIG);
  },

  saveImageGenerationToolConfig: (config: { model: string; apiUrl: string; apiKey: string }) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_IMAGE_GENERATION_TOOL_CONFIG, config);
  },

  // 工具配置 - Web Search 工具
  getWebSearchToolConfig: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_WEB_SEARCH_TOOL_CONFIG);
  },

  saveWebSearchToolConfig: (config: { model: string; apiUrl: string; apiKey: string }) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_WEB_SEARCH_TOOL_CONFIG, { config });
  },
  
  // 名字配置
  getNameConfig: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_NAME_CONFIG);
  },
  
  saveAgentName: (agentName: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_AGENT_NAME, { agentName });
  },
  
  saveUserName: (userName: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_USER_NAME, { userName });
  },
  
  // 🔥 监听名字配置更新（事件驱动）
  onNameConfigUpdate: (callback: (config: { agentName: string; userName: string }) => void) => {
    const listener = (_event: any, config: any) => callback(config);
    ipcRenderer.on(IPC_CHANNELS.NAME_CONFIG_UPDATED, listener);
    
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.NAME_CONFIG_UPDATED, listener);
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

  // 监听流式消息
  onMessageStream: (callback: (chunk: any) => void) => {
    const listener = (_event: any, chunk: any) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.MESSAGE_STREAM, listener);
    
    // 返回取消监听函数
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MESSAGE_STREAM, listener);
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
  },
});
