/**
 * Web 服务器类型定义
 */

import type { Request } from 'express';

import type { AgentTab } from '../types/agent-tab';
import type { Message } from '../types/message';

/**
 * 扩展的 Express Request，包含用户信息
 */
export interface AuthRequest extends Request {
  userId: string;
}

/**
 * JWT Token Payload
 */
export interface TokenPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * 登录请求
 */
export interface LoginRequest {
  password?: string;
}

/**
 * 登录响应
 */
export interface LoginResponse {
  token: string;
  userId: string;
  expiresIn: string;
}

/**
 * WebSocket 客户端消息
 */
export type ClientMessage =
  | { type: 'ping' }
  | { type: 'subscribe'; tabId: string }
  | { type: 'unsubscribe'; tabId: string };

/**
 * WebSocket 服务器消息
 */
export type ServerMessage =
  | { type: 'pong' }
  | { type: 'message:stream'; sessionId: string; messageId: string; content: string; done: boolean; role?: string; executionSteps?: any[]; totalDuration?: number; sentAt?: number; modelId?: string; isSubAgentResult?: boolean; subAgentTask?: string }
  | { type: 'execution-step:update'; sessionId: string; messageId: string; executionSteps: any[] }
  | { type: 'agent_status'; tabId: string; status: string }
  | { type: 'message:error'; sessionId: string; error: string }
  | { type: 'tab:messages-cleared'; tabId: string }
  | { type: 'tab:history-loaded'; tabId: string; messages: Message[] }
  | { type: 'tab:created'; tab: AgentTab }
  | { type: 'tab:updated'; tabId: string; title: string }
  | { type: 'clear-chat'; sessionId: string }
  | { type: 'name-config:update'; agentName?: string; userName?: string; tabId?: string; isGlobalUpdate?: boolean }
  | { type: 'model-config:update' }
  | { type: 'pending-count:update'; pendingCount: number }
  | { type: 'wechat:qr-code'; url: string; connectorId?: string }
  | { type: 'session:kicked'; reason: string }
  | { type: 'loading-status'; status: string; sessionId?: string };
