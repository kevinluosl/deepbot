/**
 * 工具系统类型定义
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';

/**
 * 工具执行结果
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details?: Record<string, unknown>;
}

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  signal: AbortSignal;
  onUpdate?: (result: Partial<ToolResult>) => void;
}

/**
 * 导出 AgentTool 类型供其他模块使用
 */
export type { AgentTool };
