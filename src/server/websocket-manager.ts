/**
 * WebSocket 管理器
 * 
 * 职责：
 * - 管理 WebSocket 连接
 * - 验证客户端 Token
 * - 订阅/取消订阅 Tab 消息
 * - 广播消息到订阅的客户端
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import type { GatewayAdapter } from './gateway-adapter';
import type { ClientMessage, ServerMessage, TokenPayload } from './types';
import { getErrorMessage } from '../shared/utils/error-handler';
import { generateId } from '../shared/utils/id-generator';
import { TIMEOUTS } from '../main/config/timeouts';

const JWT_SECRET = process.env.JWT_SECRET || 'deepbot-default-secret-change-in-production';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;

interface ClientInfo {
  ws: WebSocket;
  userId: string;
  subscriptions: Set<string>; // 订阅的 tabId 集合
}

export class WebSocketManager {
  private clients = new Map<string, ClientInfo>(); // clientId → ClientInfo
  
  constructor(
    private wss: WebSocketServer,
    private gatewayAdapter: GatewayAdapter
  ) {
    this.setupWebSocketServer();
    this.setupGatewayListeners();
  }
  
  /**
   * 设置 WebSocket 服务器
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request);
    });
  }
  
  /**
   * 踢掉同一用户的旧连接（后来者踢掉先来者）
   */
  private kickExistingClients(newClientId: string, userId: string): void {
    for (const [clientId, client] of this.clients) {
      if (clientId !== newClientId && client.userId === userId) {
        console.log(`[WebSocket] 🔒 踢掉旧连接 ${clientId}（用户 ${userId} 在新设备登录）`);
        // 发送被踢消息
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'session:kicked',
            reason: '你的账号在其他设备登录，当前会话已断开',
          }));
        }
        // 关闭旧连接
        client.ws.close(4001, '被新连接踢出');
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * 处理新的 WebSocket 连接
   */
  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    // 从 URL query 中获取 Token
    const url = new URL(request.url || '', 'http://localhost');
    const token = url.searchParams.get('token');
    
    // 如果没有设置密码，直接允许连接
    if (!ACCESS_PASSWORD) {
      const clientId = generateId();
      this.clients.set(clientId, {
        ws,
        userId: 'default',
        subscriptions: new Set()
      });
      
      // 踢掉同一用户的旧连接
      this.kickExistingClients(clientId, 'default');
      
      console.log(`[WebSocket] 客户端 ${clientId} 连接成功（无密码模式）`);
      this.setupClientHandlers(clientId, ws);
      
      // 每次连接都检查是否需要发送欢迎消息
      this.checkAndSendWelcomeMessage();
      return;
    }
    
    // 验证 Token
    if (!token) {
      ws.close(1008, '需要身份验证');
      return;
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      const clientId = generateId();
      
      this.clients.set(clientId, {
        ws,
        userId: decoded.userId,
        subscriptions: new Set()
      });
      
      // 踢掉同一用户的旧连接
      this.kickExistingClients(clientId, decoded.userId);
      
      console.log(`[WebSocket] 用户 ${decoded.userId} 连接成功`);
      this.setupClientHandlers(clientId, ws);
      
      // 每次连接都检查是否需要发送欢迎消息
      this.checkAndSendWelcomeMessage();
    } catch (error) {
      ws.close(1008, 'Token 无效或已过期');
    }
  }
  
  /**
   * 检查并发送欢迎消息
   */
  private checkAndSendWelcomeMessage(): void {
    console.log('[WebSocket] 客户端连接，触发欢迎消息检查');
    
    // 延迟确保客户端订阅完成
    setTimeout(() => {
      this.gatewayAdapter.checkAndSendWelcomeMessage().catch(error => {
        console.error('[WebSocket] ❌ 发送欢迎消息失败:', getErrorMessage(error));
      });
    }, TIMEOUTS.WEBSOCKET_WELCOME_DELAY);
  }
  
  /**
   * 设置客户端消息处理器
   */
  private setupClientHandlers(clientId: string, ws: WebSocket): void {
    // 处理客户端消息
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        this.handleClientMessage(clientId, message);
      } catch (error) {
        console.error('[WebSocket] 解析消息失败:', getErrorMessage(error));
      }
    });
    
    // 处理断开连接
    ws.on('close', () => {
      const client = this.clients.get(clientId);
      if (client) {
        console.log(`[WebSocket] 客户端 ${clientId} 断开连接`);
        
        // 停止客户端订阅的所有 Tab 的 Agent 执行
        this.handleClientDisconnect(client);
        
        this.clients.delete(clientId);
      }
    });
    
    // 处理错误
    ws.on('error', (error) => {
      console.error(`[WebSocket] 客户端 ${clientId} 错误:`, getErrorMessage(error));
    });
  }
  
  /**
   * 处理客户端消息
   */
  private handleClientMessage(clientId: string, message: ClientMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    switch (message.type) {
      case 'ping':
        // 心跳响应
        this.sendToClient(clientId, { type: 'pong' });
        break;
        
      case 'subscribe':
        // 已订阅则跳过，避免重复日志
        if (!client.subscriptions.has(message.tabId)) {
          client.subscriptions.add(message.tabId);
          console.log(`[WebSocket] 客户端 ${clientId} 订阅 Tab ${message.tabId}`);
        }
        break;
        
      case 'unsubscribe':
        // 取消订阅 Tab 消息
        client.subscriptions.delete(message.tabId);
        console.log(`[WebSocket] 客户端 ${clientId} 取消订阅 Tab ${message.tabId}`);
        break;
    }
  }
  
  /**
   * 处理客户端断开连接
   * 停止客户端订阅的所有 Tab 的 Agent 执行
   */
  private handleClientDisconnect(client: ClientInfo): void {
    if (client.subscriptions.size === 0) {
      console.log('[WebSocket] 客户端未订阅任何 Tab，无需停止 Agent');
      return;
    }
    
    console.log(`[WebSocket] 🛑 客户端断开，停止 ${client.subscriptions.size} 个 Tab 的 Agent 执行`);
    
    // 停止所有订阅的 Tab 的 Agent 执行
    for (const tabId of client.subscriptions) {
      console.log(`[WebSocket] 🛑 停止 Tab ${tabId} 的 Agent 执行...`);
      this.gatewayAdapter.stopGeneration(tabId).catch(error => {
        console.error(`[WebSocket] ❌ 停止 Tab ${tabId} 的 Agent 执行失败:`, getErrorMessage(error));
      });
    }
  }
  
  /**
   * 设置 Gateway 事件监听
   */
  private setupGatewayListeners(): void {
    // 监听流式消息（包括用户消息、AI 响应片段、完成消息）
    this.gatewayAdapter.on('message_stream', (event: any) => {
      this.broadcast(event.sessionId, {
        type: 'message:stream',
        sessionId: event.sessionId,
        messageId: event.messageId,
        content: event.content,
        done: event.done,
        role: event.role,
        executionSteps: event.executionSteps,
        totalDuration: event.totalDuration,
        sentAt: event.sentAt,
        isSubAgentResult: event.isSubAgentResult,
        subAgentTask: event.subAgentTask
      });
    });
    
    // 监听执行步骤更新
    this.gatewayAdapter.on('execution_step_update', (event: any) => {
      this.broadcast(event.sessionId, {
        type: 'execution-step:update',
        sessionId: event.sessionId,
        messageId: event.messageId,
        executionSteps: event.executionSteps
      });
    });
    
    // 监听 Agent 状态
    this.gatewayAdapter.on('agent_status', (event: any) => {
      this.broadcast(event.tabId, {
        type: 'agent_status',
        tabId: event.tabId,
        status: event.status
      });
    });
    
    // 监听错误
    this.gatewayAdapter.on('message_error', (event: any) => {
      this.broadcast(event.sessionId, {
        type: 'message:error',
        sessionId: event.sessionId,
        error: event.error
      });
    });
    
    // 监听 Tab 消息清空
    this.gatewayAdapter.on('tab_messages_cleared', (event: any) => {
      this.broadcast(event.tabId, {
        type: 'tab:messages-cleared',
        tabId: event.tabId
      });
    });
    
    // 监听 Tab 历史消息加载完成
    this.gatewayAdapter.on('tab_history_loaded', (event: any) => {
      this.broadcast(event.tabId, {
        type: 'tab:history-loaded',
        tabId: event.tabId,
        messages: event.messages
      });
    });
    
    // 监听清空聊天指令
    this.gatewayAdapter.on('clear_chat', (event: any) => {
      this.broadcast(event.sessionId, {
        type: 'clear-chat',
        sessionId: event.sessionId
      });
    });

    // 监听名字配置更新
    this.gatewayAdapter.on('name_config_update', (event: any) => {
      this.broadcastToAll({
        type: 'name-config:update',
        agentName: event.agentName,
        userName: event.userName,
        tabId: event.tabId,
        isGlobalUpdate: event.isGlobalUpdate
      });
    });

    // 监听模型配置更新
    this.gatewayAdapter.on('model_config_update', () => {
      this.broadcastToAll({
        type: 'model-config:update'
      });
    });

    // 监听待授权数量更新
    this.gatewayAdapter.on('pending_count_update', (event: any) => {
      this.broadcastToAll({
        type: 'pending-count:update',
        pendingCount: event.pendingCount
      });
    });
    
    // 监听 Tab 创建（广播给所有客户端）
    this.gatewayAdapter.on('tab_created', (event: any) => {
      this.broadcastToAll({
        type: 'tab:created',
        tab: event.tab
      });
    });
    
    // 监听 Tab 更新（广播给所有客户端）
    this.gatewayAdapter.on('tab_updated', (event: any) => {
      this.broadcastToAll({
        type: 'tab:updated',
        tabId: event.tabId,
        title: event.title
      });
    });

    // 监听加载状态变化（广播给所有客户端）
    this.gatewayAdapter.on('loading-status', (event: any) => {
      this.broadcastToAll({
        type: 'loading-status',
        status: event.status
      });
    });
  }
  
  /**
   * 广播消息到所有客户端（不限制订阅）
   */
  private broadcastToAll(message: ServerMessage): void {
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }
  
  /**
   * 发送消息给指定客户端
   */
  private sendToClient(clientId: string, message: ServerMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }
  
  /**
   * 广播消息到订阅了指定 Tab 的所有客户端
   */
  private broadcast(tabId: string, message: ServerMessage): void {
    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(tabId) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }
  
  /**
   * 获取活跃连接数
   */
  getActiveConnectionCount(): number {
    return this.clients.size;
  }
}
