/**
 * Window 全局类型定义
 */

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
  getDefaultWorkspaceSettings: () => Promise<any>;
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
  getBrowserToolConfig: () => Promise<{ mode: 'headless' | 'cdp'; cdpPort: number } | null>;
  saveBrowserToolConfig: (config: { mode: 'headless' | 'cdp'; cdpPort: number }) => Promise<void>;
  launchChromeWithDebug: (port: number) => Promise<{ success: boolean; message?: string }>;
  getNameConfig: () => Promise<{ success: boolean; config?: { agentName: string; userName: string }; error?: string }>;
  getTabAgentName: (tabId: string) => Promise<{ success: boolean; agentName: string; userName: string; error?: string }>;
  saveAgentName: (agentName: string) => Promise<{ success: boolean; error?: string }>;
  saveUserName: (userName: string) => Promise<{ success: boolean; error?: string }>;
  onNameConfigUpdate: (callback: (config: { agentName?: string; userName?: string; tabId?: string; isGlobalUpdate?: boolean }) => void) => () => void;
  onModelConfigUpdate: (callback: () => void) => () => void;
  createTab: (title?: string) => Promise<{ success: boolean; tab?: import('./agent-tab').AgentTab; error?: string }>;
  closeTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
  getAllTabs: () => Promise<{ success: boolean; tabs?: import('./agent-tab').AgentTab[]; error?: string }>;
  switchTab: (tabId: string) => Promise<{ success: boolean; error?: string }>;
  onTabCreated: (callback: (data: { tab: import('./agent-tab').AgentTab }) => void) => () => void;
  onTabHistoryLoaded: (callback: (data: { tabId: string; messages: any[] }) => void) => () => void;
  onTabMessagesCleared: (callback: (data: { tabId: string }) => void) => () => void;
  onClearChat?: (callback: (data: { sessionId: string }) => void) => () => void;
  connectorGetAll: () => Promise<any>;
  connectorGetConfig: (connectorId: string) => Promise<any>;
  connectorSaveConfig: (connectorId: string, config: any) => Promise<any>;
  connectorStart: (connectorId: string) => Promise<any>;
  connectorStop: (connectorId: string) => Promise<any>;
  connectorHealthCheck: (connectorId: string) => Promise<any>;
  connectorGetPairingRecords: (connectorId?: string) => Promise<any>;
  connectorApprovePairing: (pairingCode: string) => Promise<any>;
  connectorDeletePairing: (connectorId: string, userId: string) => Promise<any>;
  onSubAgentStatusUpdate: (callback: (data: any) => void) => () => void;
  onMessageStream: (callback: (chunk: any) => void) => () => void;
  onMessageError: (callback: (error: any) => void) => () => void;
  onSubAgentNotification: (callback: (notification: any) => void) => () => void;
  onExecutionStepUpdate?: (callback: (data: any) => void) => () => void;
  onClearAllMessages: (callback: () => void) => () => void;
  taskMonitor: {
    onMainTaskCreated: (callback: (task: any) => void) => () => void;
    onMainTaskUpdated: (callback: (updates: any) => void) => () => void;
    onSubTaskAdded: (callback: (subTask: any) => void) => () => void;
    onSubTaskUpdated: (callback: (data: any) => void) => () => void;
    onTasksCleared: (callback: () => void) => () => void;
  };
}

interface Window {
  deepbot: DeepBotAPI;
  electron: {
    ipcRenderer: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  };
}
