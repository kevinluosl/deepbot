/**
 * 统一 API 接口
 * 根据运行环境自动选择 IPC（Electron）或 HTTP（Web）
 */

import { isElectron } from '../utils/platform';
import { webClient } from './web-client';
import type { AgentTab } from '../../types/agent-tab';
import type { Message } from '../../types/message';

// Web 模式的事件监听器存储
const webEventListeners = new Map<string, Set<Function>>();

// Web 模式的 WebSocket 实例（单例）
let wsInstance: WebSocket | null = null;

// 已订阅的 Tab 集合，避免重复订阅
const subscribedTabs = new Set<string>();

export const api = {
  // ==================== 认证 ====================

  async login(password: string): Promise<{ token: string }> {
    if (isElectron()) throw new Error('Electron 模式不需要登录');
    return webClient.login(password);
  },

  logout(): void {
    if (!isElectron()) webClient.logout();
  },

  isAuthenticated(): boolean {
    if (isElectron()) return true;
    return webClient.isAuthenticated();
  },

  // ==================== 配置管理 ====================

  async getConfig(): Promise<any> {
    if (isElectron()) return (window as any).electron.ipcRenderer.invoke('get-config');
    return webClient.getConfig();
  },

  async updateConfig(updates: any): Promise<void> {
    if (isElectron()) return (window as any).electron.ipcRenderer.invoke('update-config', updates);
    return webClient.updateConfig(updates);
  },

  async getModelConfig(): Promise<any> {
    if (isElectron()) return (window as any).electron.ipcRenderer.invoke('model-config:get');
    const config = await webClient.getConfig();
    return { success: true, config: config.model || null };
  },

  async saveModelConfig(config: any): Promise<any> {
    if (isElectron()) return (window as any).electron.ipcRenderer.invoke('model-config:save', { config });
    await webClient.updateConfig({ model: config });
    return { success: true };
  },

  async getTabAgentName(tabId: string): Promise<{ success: boolean; agentName: string; userName: string; error?: string }> {
    if (isElectron()) return (window as any).deepbot.getTabAgentName(tabId);
    const config = await webClient.getConfig();
    return { success: true, agentName: config.names?.agentName || 'DeepBot', userName: config.names?.userName || '用户' };
  },

  // ==================== 系统设置 ====================

  async checkEnvironment(action: 'check' | 'get_status'): Promise<any> {
    if (isElectron()) return (window as any).deepbot.checkEnvironment(action);
    return webClient.post('/api/tools/environment-check', { action });
  },

  async getImageGenerationToolConfig(): Promise<any> {
    if (isElectron()) return (window as any).deepbot.getImageGenerationToolConfig();
    const config = await webClient.getConfig();
    return config.imageGeneration || null;
  },

  async saveImageGenerationToolConfig(config: any): Promise<void> {
    if (isElectron()) return (window as any).deepbot.saveImageGenerationToolConfig(config);
    await webClient.updateConfig({ imageGeneration: config });
  },

  async getWebSearchToolConfig(): Promise<any> {
    if (isElectron()) return (window as any).electron.ipcRenderer.invoke('tool-config:web-search:get');
    const config = await webClient.getConfig();
    return { success: true, config: config.webSearch || null };
  },

  async saveWebSearchToolConfig(config: any): Promise<any> {
    if (isElectron()) return (window as any).electron.ipcRenderer.invoke('tool-config:web-search:save', { config });
    await webClient.updateConfig({ webSearch: config });
    return { success: true };
  },

  async getWorkspaceSettings(): Promise<any> {
    if (isElectron()) return (window as any).deepbot.getWorkspaceSettings();
    const config = await webClient.getConfig();
    return {
      success: true,
      settings: config.workspace || { workspaceDir: '', scriptDir: '', skillDirs: [], defaultSkillDir: '', imageDir: '', memoryDir: '', sessionDir: '' }
    };
  },

  async getDefaultWorkspaceSettings(): Promise<any> {
    if (isElectron()) return (window as any).deepbot.getDefaultWorkspaceSettings();
    // Web 模式：从 getConfig 获取 isDocker 标识，并返回对应的默认路径
    const config = await webClient.getConfig();
    const isDocker = config.isDocker === true;
    if (isDocker) {
      return {
        success: true,
        isDocker: true,
        settings: {
          workspaceDir: '/data/workspace',
          scriptDir: '/data/workspace/.deepbot/scripts',
          skillDirs: ['/data/skills'],
          defaultSkillDir: '/data/skills',
          imageDir: '/data/workspace/.deepbot/generated-images',
          memoryDir: '/data/memory',
          sessionDir: '/data/sessions',
        }
      };
    }
    return {
      success: true,
      isDocker: false,
      settings: { workspaceDir: '~/', scriptDir: '~/.deepbot/scripts', skillDirs: ['~/.agents/skills'], defaultSkillDir: '~/.agents/skills', imageDir: '~/.deepbot/generated-images', memoryDir: '~/.deepbot/memory', sessionDir: '~/.deepbot/sessions' }
    };
  },

  async saveWorkspaceSettings(settings: any): Promise<any> {
    if (isElectron()) return (window as any).deepbot.saveWorkspaceSettings(settings);
    await webClient.updateConfig({ workspace: settings });
    return { success: true, settings };
  },

  async addSkillDir(dir: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.addSkillDir(dir);
    const config = await webClient.getConfig();
    const currentSettings = config.workspace || {};
    const skillDirs = currentSettings.skillDirs || [];
    if (!skillDirs.includes(dir)) {
      skillDirs.push(dir);
      const updatedSettings = { ...currentSettings, skillDirs };
      await webClient.updateConfig({ workspace: updatedSettings });
      return { success: true, settings: updatedSettings };
    }
    return { success: true, settings: currentSettings };
  },

  async removeSkillDir(dir: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.removeSkillDir(dir);
    const config = await webClient.getConfig();
    const currentSettings = config.workspace || {};
    const skillDirs = (currentSettings.skillDirs || []).filter((d: string) => d !== dir);
    const updatedSettings = { ...currentSettings, skillDirs };
    await webClient.updateConfig({ workspace: updatedSettings });
    return { success: true, settings: updatedSettings };
  },

  async setDefaultSkillDir(dir: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.setDefaultSkillDir(dir);
    const config = await webClient.getConfig();
    const currentSettings = config.workspace || {};
    const updatedSettings = { ...currentSettings, defaultSkillDir: dir };
    await webClient.updateConfig({ workspace: updatedSettings });
    return { success: true, settings: updatedSettings };
  },

  async launchChromeWithDebug(port: number): Promise<any> {
    if (isElectron()) return (window as any).deepbot.launchChromeWithDebug(port);
    return webClient.post('/api/tools/launch-chrome', { port });
  },

  async connectorGetAll(): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorGetAll();
    return webClient.get('/api/connectors');
  },

  async connectorGetConfig(connectorId: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorGetConfig(connectorId);
    return webClient.get(`/api/connectors/${connectorId}/config`);
  },

  async connectorSaveConfig(connectorId: string, config: any): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorSaveConfig(connectorId, config);
    return webClient.post(`/api/connectors/${connectorId}/config`, config);
  },

  async connectorStart(connectorId: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorStart(connectorId);
    return webClient.post(`/api/connectors/${connectorId}/start`, {});
  },

  async connectorStop(connectorId: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorStop(connectorId);
    return webClient.post(`/api/connectors/${connectorId}/stop`, {});
  },

  async connectorHealthCheck(connectorId: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorHealthCheck(connectorId);
    return webClient.get(`/api/connectors/${connectorId}/health`);
  },

  async connectorApprovePairing(pairingCode: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorApprovePairing(pairingCode);
    return webClient.post('/api/connectors/pairing/approve', { pairingCode });
  },

  async connectorSetAdminPairing(connectorId: string, userId: string, isAdmin: boolean): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorSetAdminPairing(connectorId, userId, isAdmin);
    return webClient.post(`/api/connectors/${connectorId}/pairing/${userId}/admin`, { isAdmin });
  },

  async connectorDeletePairing(connectorId: string, userId: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorDeletePairing(connectorId, userId);
    return webClient.delete(`/api/connectors/${connectorId}/pairing/${userId}`);
  },

  async scheduledTask(request: any): Promise<any> {
    if (isElectron()) return (window as any).deepbot.scheduledTask(request);
    return webClient.post('/api/tasks', request);
  },

  // ==================== Tab 管理 ====================

  async getAllTabs(): Promise<{ success: boolean; tabs?: AgentTab[]; error?: string }> {
    if (isElectron()) return (window as any).deepbot.getAllTabs();
    const tabs = await webClient.getTabs();
    return { success: true, tabs };
  },

  async createTab(title?: string): Promise<{ success: boolean; tab?: AgentTab; error?: string }> {
    if (isElectron()) return (window as any).deepbot.createTab(title);
    const tab = await webClient.createTab(title);
    return { success: true, tab };
  },

  async closeTab(tabId: string): Promise<{ success: boolean; error?: string }> {
    if (isElectron()) return (window as any).deepbot.closeTab(tabId);
    await webClient.closeTab(tabId);
    return { success: true };
  },

  async switchTab(tabId: string): Promise<{ success: boolean; error?: string }> {
    if (isElectron()) return (window as any).deepbot.switchTab(tabId);
    // 切换 Tab 时确保已订阅（防漏订阅）
    this.subscribeTab(tabId);
    return { success: true };
  },

  /**
   * 订阅指定 Tab 的 WebSocket 消息（仅 Web 模式）
   * 已订阅的 Tab 不会重复发送订阅消息
   */
  subscribeTab(tabId: string): void {
    if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) return;
    // 已订阅则跳过，避免重复日志和无效消息
    if (subscribedTabs.has(tabId)) return;
    subscribedTabs.add(tabId);
    console.log(`[API] 订阅 Tab: ${tabId}`);
    wsInstance.send(JSON.stringify({ type: 'subscribe', tabId }));
  },

  // ==================== 消息管理 ====================

  async sendMessage(content: string, sessionId?: string): Promise<void> {
    if (isElectron()) return (window as any).deepbot.sendMessage(content, sessionId);
    return webClient.sendMessage(sessionId || 'default', content);
  },

  async stopGeneration(sessionId?: string): Promise<void> {
    if (isElectron()) return (window as any).deepbot.stopGeneration(sessionId);
    await webClient.post('/api/tabs/stop-generation', { sessionId });
  },

  // ==================== Connector 管理 ====================

  async connectorGetPairingRecords(): Promise<any> {
    if (isElectron()) return (window as any).deepbot.connectorGetPairingRecords();
    return webClient.get('/api/connectors/pairing');
  },

  // ==================== 文件管理 ====================

  async uploadFile(fileName: string, dataUrl: string, fileSize: number, fileType: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.uploadFile(fileName, dataUrl, fileSize, fileType);
    return webClient.post('/api/files/upload', { fileName, dataUrl, fileSize, fileType });
  },

  async uploadImage(fileName: string, dataUrl: string, fileSize: number): Promise<any> {
    if (isElectron()) return (window as any).deepbot.uploadImage(fileName, dataUrl, fileSize);
    return webClient.post('/api/files/upload-image', { fileName, dataUrl, fileSize });
  },

  async readImage(filePath: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.readImage(filePath);
    return webClient.get(`/api/files/read-image?path=${encodeURIComponent(filePath)}`);
  },

  // 用系统默认应用打开本地文件（仅 Electron）
  // Web 模式返回 { success: false }，由前端降级处理
  async openPath(filePath: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.openPath(filePath);
    return { success: false, error: 'web' };
  },

  // 打开文件夹选择对话框（仅 Electron）
  async selectFolder(): Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }> {
    if (isElectron()) return (window as any).deepbot.selectFolder();
    return { success: false, error: 'web' };
  },

  async deleteTempFile(filePath: string): Promise<any> {
    if (isElectron()) return (window as any).deepbot.deleteTempFile(filePath);
    return webClient.delete(`/api/files/temp?path=${encodeURIComponent(filePath)}`);
  },

  // ==================== Skill 管理 ====================

  async skillManager(request: any): Promise<any> {
    if (isElectron()) return (window as any).deepbot.skillManager(request);
    return webClient.post('/api/skills', request);
  },

  // ==================== 事件监听 ====================

  onTabCreated(callback: (data: { tab: AgentTab }) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onTabCreated(callback);
    return this._registerWebEvent('tab:created', callback);
  },

  onTabUpdated(callback: (data: { tabId: string; title: string }) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onTabUpdated(callback);
    return this._registerWebEvent('tab:updated', callback);
  },

  onTabMessagesCleared(callback: (data: { tabId: string }) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onTabMessagesCleared(callback);
    return this._registerWebEvent('tab:messages-cleared', callback);
  },

  onTabHistoryLoaded(callback: (data: { tabId: string; messages: Message[] }) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onTabHistoryLoaded(callback);
    return this._registerWebEvent('tab:history-loaded', callback);
  },

  onNameConfigUpdate(callback: (config: any) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onNameConfigUpdate(callback);
    return this._registerWebEvent('name-config:update', callback);
  },

  onModelConfigUpdate(callback: () => void): () => void {
    if (isElectron()) return (window as any).deepbot.onModelConfigUpdate(callback);
    return this._registerWebEvent('model-config:update', callback);
  },

  onPendingCountUpdate(callback: (data: { pendingCount: number }) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onPendingCountUpdate(callback);
    return this._registerWebEvent('pending-count:update', callback);
  },

  onClearAllMessages(callback: () => void): () => void {
    if (isElectron()) return (window as any).deepbot.onClearAllMessages(callback);
    return this._registerWebEvent('clear-all-messages', callback);
  },

  onClearChat(callback: (data: { sessionId: string }) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onClearChat?.(callback) || (() => {});
    return this._registerWebEvent('clear-chat', callback);
  },

  onMessageStream(callback: (chunk: any) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onMessageStream(callback);
    return this._registerWebEvent('message:stream', callback);
  },

  onExecutionStepUpdate(callback: (data: any) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onExecutionStepUpdate?.(callback) || (() => {});
    return this._registerWebEvent('execution-step:update', callback);
  },

  onMessageError(callback: (error: any) => void): () => void {
    if (isElectron()) return (window as any).deepbot.onMessageError(callback);
    return this._registerWebEvent('message:error', callback);
  },

  // 监听被踢出事件（仅 Web 模式）
  onSessionKicked(callback: (data: { reason: string }) => void): () => void {
    if (isElectron()) return () => {};
    return this._registerWebEvent('session:kicked', callback);
  },

  // ==================== WebSocket 管理 ====================

  /**
   * 创建 WebSocket 连接（仅 Web 模式）
   * 连接建立后订阅所有已存在的 Tab，确保飞书等外部 Tab 的历史记录推送不被遗漏
   */
  createWebSocket(): WebSocket | null {
    if (isElectron()) return null;

    if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] 复用现有连接');
      return wsInstance;
    }

    if (wsInstance) {
      console.log('[WebSocket] 清理旧连接');
      wsInstance = null;
    }

    const ws = webClient.createWebSocket();
    if (!ws) return null;

    wsInstance = ws;

    // 连接建立后，订阅所有已存在的 Tab
    ws.addEventListener('open', async () => {
      console.log('[WebSocket] 连接已建立，订阅所有 Tab');
      try {
        // 先订阅 default Tab（保底）
        ws.send(JSON.stringify({ type: 'subscribe', tabId: 'default' }));
        // 拉取所有 Tab 并全部订阅，确保飞书等外部 Tab 的历史记录推送不被遗漏
        const tabs = await webClient.getTabs();
        for (const tab of tabs) {
          if (tab.id !== 'default') {
            console.log(`[WebSocket] 订阅 Tab: ${tab.id}`);
            ws.send(JSON.stringify({ type: 'subscribe', tabId: tab.id }));
          }
        }
      } catch (error) {
        console.error('[WebSocket] 批量订阅 Tab 失败:', error);
      }
    });

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        if (import.meta.env.DEV) {
          console.log('[WebSocket] 收到消息:', data.type, data);
        }

        if (data.type === 'pong') return;

        const listeners = webEventListeners.get(data.type);
        if (listeners) {
          if (import.meta.env.DEV) {
            console.log(`[WebSocket] 分发事件 ${data.type} 到 ${listeners.size} 个监听器`);
          }
          listeners.forEach(callback => callback(data));
        } else {
          if (import.meta.env.DEV) {
            console.warn(`[WebSocket] 没有监听器订阅事件: ${data.type}`);
          }
        }
      } catch (error) {
        console.error('WebSocket 消息解析失败:', error);
      }
    });

    ws.addEventListener('close', () => {
      console.log('[WebSocket] 连接已关闭');
      wsInstance = null;
      // 清空已订阅集合，重连后需要重新订阅
      subscribedTabs.clear();
    });

    ws.addEventListener('error', (error) => {
      console.error('[WebSocket] 连接错误:', error);
    });

    return ws;
  },

  /**
   * 注册 Web 模式的事件监听器
   */
  _registerWebEvent(eventType: string, callback: Function): () => void {
    if (!webEventListeners.has(eventType)) {
      webEventListeners.set(eventType, new Set());
    }
    const listeners = webEventListeners.get(eventType)!;
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) webEventListeners.delete(eventType);
    };
  },

  // ==================== 自动更新（仅 Electron）====================

  async checkForUpdates(): Promise<void> {
    if (isElectron()) {
      return (window as any).electron.ipcRenderer.invoke('update:check');
    }
  },

  async downloadUpdate(): Promise<void> {
    if (isElectron()) {
      return (window as any).electron.ipcRenderer.invoke('update:download');
    }
  },

  async installUpdate(): Promise<void> {
    if (isElectron()) {
      return (window as any).electron.ipcRenderer.invoke('update:install');
    }
  },

  onUpdateAvailable(callback: (info: { version: string; releaseNotes?: string }) => void): () => void {
    if (isElectron()) {
      const handler = (info: any) => callback(info);
      (window as any).electron.ipcRenderer.on('update-available', handler);
      return () => (window as any).electron.ipcRenderer.removeListener('update-available', handler);
    }
    return () => {};
  },

  onUpdateDownloadProgress(callback: (progress: { percent: number }) => void): () => void {
    if (isElectron()) {
      const handler = (progress: any) => callback(progress);
      (window as any).electron.ipcRenderer.on('update-download-progress', handler);
      return () => (window as any).electron.ipcRenderer.removeListener('update-download-progress', handler);
    }
    return () => {};
  },

  onUpdateDownloaded(callback: () => void): () => void {
    if (isElectron()) {
      const handler = () => callback();
      (window as any).electron.ipcRenderer.on('update-downloaded', handler);
      return () => (window as any).electron.ipcRenderer.removeListener('update-downloaded', handler);
    }
    return () => {};
  },
};
