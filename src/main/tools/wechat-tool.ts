/**
 * 微信工具（插件）
 *
 * 提供三个工具：
 * - wechat_send_message：向微信用户发送文本消息
 * - wechat_send_image：向微信用户发送图片
 * - wechat_send_file：向微信用户发送文件
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { expandUserPath } from '../../shared/utils/path-utils';
import type { Gateway } from '../gateway';
import { TOOL_NAMES } from './tool-names';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('WechatTool');

let gatewayInstance: Gateway | null = null;

export function setGatewayForWechatTool(gateway: Gateway): void {
  gatewayInstance = gateway;
}

/**
 * 解析微信发送目标
 * 
 * 优先级：
 * 1. 提供了 userId → 直接发给该用户
 * 2. 提供了 tabName → 查找对应 Tab 的 conversationId
 * 3. 当前 Tab 是微信 connector → 直接用当前会话
 */
function resolveWechatTarget(sessionId: string, userId?: string, tabName?: string): { conversationId: string; connectorId: string } {
  if (!gatewayInstance) throw new Error('Gateway 未初始化');

  // 情况 1：提供了 userId — 需要从当前 tab 或第一个微信连接器获取 connectorId
  if (userId) {
    const tabs = gatewayInstance.getAllTabs();
    const currentTab = tabs.find(t => t.id === sessionId);
    const connectorId = currentTab?.connectorId?.startsWith('wechat') ? currentTab.connectorId : findFirstWechatConnectorId();
    return { conversationId: userId, connectorId };
  }

  // 情况 2：提供了 tabName
  if (tabName) {
    const tabs = gatewayInstance.getAllTabs();
    const normalizedQuery = tabName.replace(/\s+/g, '');
    const targetTab = tabs.find(t => t.title.replace(/\s+/g, '') === normalizedQuery);
    if (!targetTab) throw new Error(`未找到名为 "${tabName}" 的 Tab`);
    if (!targetTab.connectorId?.startsWith('wechat') || !targetTab.conversationId) {
      throw new Error(`Tab "${tabName}" 不是微信会话 Tab`);
    }
    return { conversationId: targetTab.conversationId, connectorId: targetTab.connectorId };
  }

  // 情况 3：当前 Tab 是微信 connector
  const tabs = gatewayInstance.getAllTabs();
  const currentTab = tabs.find(t => t.id === sessionId);
  if (currentTab?.type === 'connector' && currentTab.connectorId?.startsWith('wechat') && currentTab.conversationId) {
    return { conversationId: currentTab.conversationId, connectorId: currentTab.connectorId };
  }

  throw new Error('无法确定发送目标。请提供 userId 或 tabName 参数，或在微信会话 Tab 中调用');
}

/**
 * 查找第一个可用的微信连接器 ID
 */
function findFirstWechatConnectorId(): string {
  if (!gatewayInstance) throw new Error('Gateway 未初始化');
  const connectorManager = gatewayInstance.getConnectorManager();
  const allConnectors = connectorManager.getAllConnectors();
  const wechatConnector = allConnectors.find(c => c.id.startsWith('wechat'));
  return wechatConnector?.id || 'wechat-1';
}

// ── 工具插件 ──────────────────────────────────────────────────────────────────

export const wechatToolPlugin: ToolPlugin = {
  metadata: {
    id: 'wechat',
    name: '微信消息',
    version: '1.0.0',
    description: '向微信用户发送文本消息、图片、文件',
    author: 'DeepBot',
    category: 'network',
    tags: ['wechat', 'message', 'image', 'file'],
    requiresConfig: false,
  },

  create: (_options: ToolCreateOptions) => {
    const sessionId = (_options as any).sessionId as string | undefined;

    return [
      // ── wechat_send_message ─────────────────────────────────────────
      {
        name: TOOL_NAMES.WECHAT_SEND_MESSAGE,
        label: '发送微信消息',
        description: '向微信用户发送文本消息。在微信会话中调用时，默认发给当前会话；在普通 Tab 中调用时，需要提供 userId 或 tabName 参数。',
        parameters: Type.Object({
          message: Type.String({ description: '要发送的文本消息内容' }),
          userId: Type.Optional(Type.String({ description: '目标用户 ID（在普通 Tab 中发送时使用）' })),
          tabName: Type.Optional(Type.String({ description: '目标 Tab 名称（如 "WX-张三"）' })),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            if (!gatewayInstance) throw new Error('Gateway 未初始化');
            if (signal?.aborted) throw Object.assign(new Error('操作被取消'), { name: 'AbortError' });
            if (!sessionId) throw new Error('无法获取会话 ID');

            const target = resolveWechatTarget(sessionId, args.userId, args.tabName);
            logger.info('发送微信消息:', { target, messageLength: args.message.length });

            const connectorManager = gatewayInstance.getConnectorManager();
            await connectorManager.sendOutgoingMessage(target.connectorId, target.conversationId, args.message);

            return {
              content: [{ type: 'text', text: `✅ 微信消息已发送` }],
              details: { success: true },
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `❌ 发送失败: ${getErrorMessage(error)}` }],
              details: { success: false, error: getErrorMessage(error) },
              isError: true,
            };
          }
        },
      },

      // ── wechat_send_image ───────────────────────────────────────────
      {
        name: TOOL_NAMES.WECHAT_SEND_IMAGE,
        label: '发送微信图片',
        description: '向微信用户发送图片。支持本地图片路径。',
        parameters: Type.Object({
          imagePath: Type.String({ description: '图片文件路径，支持 ~ 符号' }),
          caption: Type.Optional(Type.String({ description: '图片说明文字（可选）' })),
          userId: Type.Optional(Type.String({ description: '目标用户 ID' })),
          tabName: Type.Optional(Type.String({ description: '目标 Tab 名称' })),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            if (!gatewayInstance) throw new Error('Gateway 未初始化');
            if (signal?.aborted) throw Object.assign(new Error('操作被取消'), { name: 'AbortError' });
            if (!sessionId) throw new Error('无法获取会话 ID');

            const expandedPath = expandUserPath(args.imagePath);
            if (!existsSync(expandedPath)) throw new Error(`图片文件不存在: ${args.imagePath}`);

            const target = resolveWechatTarget(sessionId, args.userId, args.tabName);
            const connectorManager = gatewayInstance.getConnectorManager();
            await connectorManager.sendImage(target.connectorId, target.conversationId, expandedPath, args.caption);

            return {
              content: [{ type: 'text', text: `✅ 微信图片已发送` }],
              details: { success: true },
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `❌ 发送失败: ${getErrorMessage(error)}` }],
              details: { success: false, error: getErrorMessage(error) },
              isError: true,
            };
          }
        },
      },

      // ── wechat_send_file ────────────────────────────────────────────
      {
        name: TOOL_NAMES.WECHAT_SEND_FILE,
        label: '发送微信文件',
        description: '向微信用户发送文件。支持本地文件路径。',
        parameters: Type.Object({
          filePath: Type.String({ description: '文件路径，支持 ~ 符号' }),
          fileName: Type.Optional(Type.String({ description: '文件名（可选，默认使用原文件名）' })),
          userId: Type.Optional(Type.String({ description: '目标用户 ID' })),
          tabName: Type.Optional(Type.String({ description: '目标 Tab 名称' })),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            if (!gatewayInstance) throw new Error('Gateway 未初始化');
            if (signal?.aborted) throw Object.assign(new Error('操作被取消'), { name: 'AbortError' });
            if (!sessionId) throw new Error('无法获取会话 ID');

            const expandedPath = expandUserPath(args.filePath);
            if (!existsSync(expandedPath)) throw new Error(`文件不存在: ${args.filePath}`);

            const target = resolveWechatTarget(sessionId, args.userId, args.tabName);
            const connectorManager = gatewayInstance.getConnectorManager();
            await connectorManager.sendFile(target.connectorId, target.conversationId, expandedPath, args.fileName);

            return {
              content: [{ type: 'text', text: `✅ 微信文件已发送: ${args.fileName || basename(expandedPath)}` }],
              details: { success: true },
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `❌ 发送失败: ${getErrorMessage(error)}` }],
              details: { success: false, error: getErrorMessage(error) },
              isError: true,
            };
          }
        },
      },
    ];
  },
};
