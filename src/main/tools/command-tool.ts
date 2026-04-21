/**
 * 系统指令工具
 * 
 * 处理系统级别的指令，如 /new（清空会话）等
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { TOOL_NAMES } from './tool-names';

/**
 * 系统指令参数 Schema
 */
const CommandToolSchema = Type.Object({
  command: Type.String({
    description: '系统指令名称（如：new）',
  }),
});

/**
 * 系统指令工具插件
 */
export const commandToolPlugin: ToolPlugin = {
  metadata: {
    id: 'command',
    name: '系统指令',
    version: '1.0.0',
    description: '执行系统指令（如 /new 清空会话）',
  },

  create(options: ToolCreateOptions) {
    const { sessionId } = options;

    return [
      {
        name: TOOL_NAMES.SYSTEM_COMMAND,
        label: '系统指令',
        description: '执行系统指令。可用指令：\n- new: 清空当前会话历史，开始新对话',
        inputSchema: CommandToolSchema,
        parameters: CommandToolSchema,

        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          const params = args as { command: string };
          const { command } = params;

          console.log(`[Command Tool] 执行系统指令: /${command}`);

          // 检查是否被取消
          if (signal?.aborted) {
            const err = new Error('系统指令执行被取消');
            err.name = 'AbortError';
            throw err;
          }

          // 处理不同的指令
          switch (command.toLowerCase()) {
            case 'new':
              return await handleNewCommand(sessionId);

            default:
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `❌ 未知指令: /${command}\n\n可用指令：\n- /new - 清空当前会话历史，开始新对话\n- /reload-path - 刷新环境变量`,
                  },
                ],
                details: {
                  success: false,
                  error: `未知指令: ${command}`,
                },
                isError: true,
              };
          }
        },
      },
    ];
  },
};

/**
 * 处理 /new 指令 - 清空会话
 */
async function handleNewCommand(sessionId: string) {
  try {
    console.log(`[Command Tool] 执行 /new 指令，清空会话: ${sessionId}`);

    // 1. 清空 session 历史文件
    const { SessionManager } = await import('../session/session-manager');
    const { SystemConfigStore } = await import('../database/system-config-store');
    
    const store = SystemConfigStore.getInstance();
    const settings = store.getWorkspaceSettings();
    const sessionManager = new SessionManager(settings.sessionDir);
    
    // 清空会话历史
    await sessionManager.clearSession(sessionId);
    
    console.log(`[Command Tool] ✅ 会话历史已清空: ${sessionId}`);

    // 2. 🔥 使用统一的重置逻辑（销毁但不重新创建 Runtime）
    const { getGatewayInstance } = await import('../gateway');
    const gateway = getGatewayInstance();
    
    if (gateway) {
      await gateway.resetSessionRuntime(sessionId, {
        reason: '/new 指令清空会话',
        recreate: false  // 仅清理，不重新创建（用户下次发消息时会自动创建）
      });
      console.log(`[Command Tool] ✅ AgentRuntime 已重置，上下文已清除`);
    }

    // 3. 通知前端清空 UI
    const { BrowserWindow } = await import('electron');
    const { sendToWindow } = await import('../../shared/utils/webcontents-utils');
    
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      // 发送清空 UI 的消息
      sendToWindow(mainWindow, 'command:clear-chat', { sessionId });
      console.log(`[Command Tool] ✅ 已通知前端清空 UI`);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: '✅ 已清空会话历史，开始新对话',
        },
      ],
      details: {
        success: true,
        command: 'new',
        sessionId,
      },
    };
  } catch (error) {
    console.error('[Command Tool] ❌ 执行 /new 指令失败:', error);
    
    const { getErrorMessage } = await import('../../shared/utils/error-handler');
    
    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ 清空会话失败: ${getErrorMessage(error)}`,
        },
      ],
      details: {
        success: false,
        error: getErrorMessage(error),
      },
      isError: true,
    };
  }
}
