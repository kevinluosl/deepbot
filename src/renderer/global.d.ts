/**
 * 全局类型声明
 */

import type { ExecutionStep } from '../types/message';

// 消息流块
interface MessageStreamChunk {
  messageId: string;
  content: string;
  done: boolean;
  isSubAgentResult?: boolean;
  subAgentTask?: string;
  executionSteps?: ExecutionStep[];
}

// DeepBot API
interface DeepBotAPI {
  version: string;
  sendMessage: (content: string, sessionId?: string) => Promise<any>;
  stopGeneration: (sessionId?: string) => Promise<any>;
  getSubAgents: (sessionId?: string) => Promise<any>;
  cancelSubAgent: (subAgentId: string) => Promise<any>;
  skillManager: (request: any) => Promise<any>;
  scheduledTask: (request: any) => Promise<any>;
  checkEnvironment: (action: 'check' | 'get_status') => Promise<any>;
  getWorkspaceSettings: () => Promise<any>;
  saveWorkspaceSettings: (settings: any) => Promise<any>;
  addSkillDir: (dir: string) => Promise<any>;
  removeSkillDir: (dir: string) => Promise<any>;
  setDefaultSkillDir: (dir: string) => Promise<any>;
  readImage: (path: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  uploadImage: (name: string, dataUrl: string, size: number) => Promise<{ 
    success: boolean; 
    image?: { id: string; path: string; name: string; size: number; dataUrl: string }; 
    error?: string 
  }>;
  getImageGenerationToolConfig: () => Promise<{ model: string; apiUrl: string; apiKey: string } | null>;
  saveImageGenerationToolConfig: (config: { model: string; apiUrl: string; apiKey: string }) => Promise<void>;
  getNameConfig: () => Promise<{ success: boolean; config?: { agentName: string; userName: string }; error?: string }>;
  saveAgentName: (agentName: string) => Promise<{ success: boolean; error?: string }>;
  saveUserName: (userName: string) => Promise<{ success: boolean; error?: string }>;
  createTab: (title?: string) => Promise<{ success: boolean; tab?: any; error?: string }>;
  closeTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
  getAllTabs: () => Promise<{ success: boolean; tabs?: any[]; error?: string }>;
  switchTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
  onTabCreated: (callback: (data: { tab: any }) => void) => () => void;
  onTabHistoryLoaded: (callback: (data: { tabId: string; messages: any[] }) => void) => () => void;
  onClearChat?: (callback: (data: { sessionId: string }) => void) => () => void;
  onSubAgentStatusUpdate: (callback: (data: any) => void) => () => void;
  onMessageStream: (callback: (chunk: MessageStreamChunk) => void) => () => void;
  onMessageError: (callback: (error: any) => void) => () => void;
  onSubAgentNotification: (callback: (notification: any) => void) => () => void;
  onExecutionStepUpdate?: (callback: (data: { messageId: string; executionSteps: ExecutionStep[] }) => void) => () => void;
  taskMonitor: {
    onMainTaskCreated: (callback: (task: any) => void) => () => void;
    onMainTaskUpdated: (callback: (updates: any) => void) => () => void;
    onSubTaskAdded: (callback: (subTask: any) => void) => () => void;
    onSubTaskUpdated: (callback: (data: any) => void) => () => void;
    onTasksCleared: (callback: () => void) => () => void;
  };
}

// 扩展 Window 接口
declare global {
  interface Window {
    deepbot: DeepBotAPI;
  }
}

// 图片资源模块声明
declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

export {};
