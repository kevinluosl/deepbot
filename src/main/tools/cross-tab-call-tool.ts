/**
 * 跨 Tab 调用工具
 * 
 * 允许不同 Tab 之间互相发送消息进行协作
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { getErrorMessage } from '../../shared/utils/error-handler';
import type { Gateway } from '../gateway';
import { TOOL_NAMES } from './tool-names';

let currentCrossTabSessionId: string | null = null;

/**
 * 设置当前会话 ID（由 AgentRuntime 调用）
 */
export function setCrossTabCallSessionId(sessionId: string): void {
  currentCrossTabSessionId = sessionId;
}

let gatewayInstance: Gateway | null = null;

/**
 * 设置 Gateway 实例
 */
export function setGatewayForCrossTabCallTool(gateway: Gateway): void {
  gatewayInstance = gateway;
}

/**
 * 跨 Tab 调用工具参数 Schema
 */
const CrossTabCallSchema = Type.Object({
  targetTabName: Type.String({
    description: '目标 Tab 的名称（如"市场分析助理"、"产品经理"等）',
  }),
  message: Type.String({
    description: '要发送的消息内容',
  }),
  senderTabName: Type.Optional(Type.String({
    description: '发送者 Tab 的名称（由系统自动填充，Agent 无需提供）',
  })),
});

/**
 * 跨 Tab 调用工具插件
 */
export const crossTabCallToolPlugin: ToolPlugin = {
  metadata: {
    id: 'cross-tab-call',
    name: '跨 Tab 调用',
    version: '1.0.0',
    description: '向其他 Tab 发送消息。用于多 Agent 协作场景，Tab 之间可以互相对话',
    author: 'DeepBot',
    category: 'system',
    tags: ['cross-tab', 'agent', 'collaboration'],
    requiresConfig: false,
  },
  
  create: (_options: ToolCreateOptions) => {
    return [
      {
        name: TOOL_NAMES.CROSS_TAB_CALL,
        label: '跨 Tab 消息',
        description: '向其他 Tab 发送消息。用于多 Agent 协作场景，Tab 之间可以互相对话',
        parameters: CrossTabCallSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            if (!gatewayInstance) {
              throw new Error('Gateway 未初始化');
            }
            
            const params = args as {
              targetTabName: string;
              message: string;
              senderTabName?: string; // 由 AgentRuntime 注入
            };
            
            console.log('[Cross Tab Call] 🔄 跨 Tab 消息');
            console.log('  目标 Tab:', params.targetTabName);
            console.log('  消息:', params.message);
            console.log('  发送者 Tab:', params.senderTabName || '未知');
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('跨 Tab 消息操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 查找目标 Tab（忽略空格，去掉所有空格后比较）
            const tabs = gatewayInstance.getAllTabs();
            const normalizedQuery = params.targetTabName.replace(/\s+/g, '');
            const targetTab = tabs.find(t => t.title.replace(/\s+/g, '') === normalizedQuery);
            
            if (!targetTab) {
              throw new Error(`未找到名为"${params.targetTabName}"的 Tab。可用的 Tab: ${tabs.map(t => t.title).join(', ')}`);
            }
            
            console.log('[Cross Tab Call] ✅ 找到目标 Tab:', targetTab.id);
            
            // 🔥 使用参数中的 senderTabName（由 AgentRuntime 注入）
            const senderName = params.senderTabName || '未知 Tab';
            
            console.log('[Cross Tab Call] 📍 发送者名称:', senderName);
            
            // 构建消息（标记来源）
            const messageWithSource = `[跨tab调用，源目标tab ${senderName}]\n${params.message}`;
            
            // 添加系统提示，明确说明除非明确要求回复，否则不回复
            const systemPrompt = `\n\n[系统提示: 这是来自其他 Tab 的消息。除非消息中明确要求你回复，否则不需要回复，根据最新一条[来自 xxxx]信息确认回复源目标，回复的时候必须调用cross_tab_call回复]`;
            const fullMessage = messageWithSource + systemPrompt;
            
            // 发送消息到目标 Tab（异步，不等待结果）
            console.log('[Cross Tab Call] 📤 发送消息到目标 Tab...');
            gatewayInstance.handleSendMessage(
              fullMessage,        // 完整消息（包含来源标记和系统提示）
              targetTab.id,       // 目标 Tab ID
              messageWithSource   // 前端显示内容（包含来源标记，但不包含系统提示）
            ).catch(error => {
              console.error('[Cross Tab Call] ❌ 发送消息失败:', error);
            });
            
            // 立即返回成功
            const resultMessage = `✅ 消息已发送到 ${params.targetTabName}\n\n消息内容：\n${params.message}`;
            
            return {
              content: [
                {
                  type: 'text',
                  text: resultMessage,
                },
              ],
              details: {
                success: true,
                targetTabName: params.targetTabName,
                targetTabId: targetTab.id,
                message: params.message,
                senderName,
              },
            };
          } catch (error) {
            console.error('[Cross Tab Call] ❌ 跨 Tab 消息失败:', error);
            
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 跨 Tab 消息失败: ${getErrorMessage(error)}`,
                },
              ],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
        },
      },
    ];
  },
};
