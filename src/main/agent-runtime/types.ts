/**
 * Agent Runtime 内部类型定义
 */

import type { Agent } from '@mariozechner/pi-agent-core';
import type { Model } from '@mariozechner/pi-ai';

/**
 * Agent Runtime 配置
 */
export interface AgentRuntimeConfig {
  workspaceDir: string;
  sessionId: string;
  model: Model<'openai-completions'>;
  apiKey: string;
  baseUrl: string;
  maxConcurrentSubAgents: number;
}

/**
 * Agent 状态信息
 */
export interface AgentStateInfo {
  isStreaming: boolean;
  messageCount: number;
  toolCount: number;
  tools: Array<{
    name: string;
    label: string;
    description: string;
  }>;
}

/**
 * Agent 实例管理器
 */
export interface AgentInstanceManager {
  agent: Agent | null;
}
