/**
 * Web API 客户端
 * 
 * 用于 Web 模式下替换 IPC 调用
 */

import type { AgentTab } from '../../types/agent-tab';
import type { Message } from '../../types/message';

// 动态获取 API 地址：优先使用环境变量，否则使用当前页面的 host
const API_BASE_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.host}`;

/**
 * 获取 Token（从 localStorage）
 */
function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

/**
 * 设置 Token（保存到 localStorage）
 */
function setToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

/**
 * 清除 Token
 */
function clearToken(): void {
  localStorage.removeItem('auth_token');
}

/**
 * 发送 HTTP 请求
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      throw new Error('未授权，请重新登录');
    }
    
    const error = await response.json().catch(() => ({ error: '请求失败' }));
    throw new Error(error.error || '请求失败');
  }
  
  return response.json();
}

/**
 * Web API 客户端
 */
export const webClient = {
  // ==================== 认证 ====================
  
  /**
   * 登录
   */
  async login(password: string): Promise<{ token: string }> {
    const result = await request<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    
    setToken(result.token);
    return result;
  },
  
  /**
   * 登出
   */
  logout(): void {
    clearToken();
  },
  
  /**
   * 检查是否已登录
   */
  isAuthenticated(): boolean {
    return !!getToken();
  },
  
  // ==================== 配置管理 ====================
  
  /**
   * 获取配置
   */
  async getConfig(): Promise<any> {
    return request('/api/config');
  },
  
  /**
   * 更新配置
   */
  async updateConfig(updates: any): Promise<void> {
    await request('/api/config', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },
  
  // ==================== Tab 管理 ====================
  
  /**
   * 获取所有 Tab
   */
  async getTabs(): Promise<AgentTab[]> {
    const result = await request<{ tabs: AgentTab[] }>('/api/tabs');
    return result.tabs;
  },
  
  /**
   * 创建新 Tab
   */
  async createTab(title?: string): Promise<AgentTab> {
    const result = await request<{ tab: AgentTab }>('/api/tabs', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    return result.tab;
  },
  
  /**
   * 获取指定 Tab
   */
  async getTab(tabId: string): Promise<AgentTab> {
    const result = await request<{ tab: AgentTab }>(`/api/tabs/${tabId}`);
    return result.tab;
  },
  
  /**
   * 关闭 Tab
   */
  async closeTab(tabId: string): Promise<void> {
    await request(`/api/tabs/${tabId}`, {
      method: 'DELETE',
    });
  },
  
  /**
   * 发送消息
   */
  async sendMessage(
    tabId: string,
    content: string,
    clearHistory?: boolean
  ): Promise<void> {
    await request(`/api/tabs/${tabId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, clearHistory }),
    });
  },
  
  /**
   * 获取消息历史
   */
  async getMessages(
    tabId: string,
    limit: number = 50,
    before?: string
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      ...(before && { before }),
    });
    
    return request(`/api/tabs/${tabId}/messages?${params}`);
  },
  
  // ==================== WebSocket ====================
  
  /**
   * 创建 WebSocket 连接
   */
  createWebSocket(): WebSocket {
    const token = getToken();
    const wsUrl = API_BASE_URL.replace('http', 'ws');
    return new WebSocket(`${wsUrl}/ws?token=${token}`);
  },
  
  // ==================== 通用 HTTP 方法 ====================
  
  /**
   * GET 请求
   */
  async get(endpoint: string): Promise<any> {
    return request(endpoint, { method: 'GET' });
  },
  
  /**
   * POST 请求
   */
  async post(endpoint: string, data: any): Promise<any> {
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  /**
   * DELETE 请求
   */
  async delete(endpoint: string): Promise<any> {
    return request(endpoint, { method: 'DELETE' });
  },
};
