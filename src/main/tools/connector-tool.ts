/**
 * 连接器工具（插件）
 *
 * 提供三个工具：
 * - feishu_send_message：向已配对的飞书用户发送文本消息
 * - connector_send_image：发送图片（连接器会话直接发，普通 Tab 通过 userId 指定目标）
 * - connector_send_file：发送文件（同上）
 *
 * 三个工具共用同一套"查找目标会话"逻辑：
 *   1. 当前 Tab 是 connector 类型 → 直接发到当前会话（receive_id_type=conversation_id）
 *   2. 当前 Tab 是普通 Tab，且提供了 userId → 查找 pairing 记录中的 open_id 直发
 *      （receive_id_type=open_id）
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { existsSync, statSync } from 'node:fs';
import { extname, basename } from 'node:path';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { expandUserPath } from '../../shared/utils/path-utils';
import { SystemConfigStore } from '../database/system-config-store';
import type { Gateway } from '../gateway';
import { TOOL_NAMES } from './tool-names';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('ConnectorTool');

let gatewayInstance: Gateway | null = null;

export function setGatewayForConnectorTool(gateway: Gateway): void {
  gatewayInstance = gateway;
}

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface ResolvedTarget {
  connectorId: string;
  conversationId: string;
  /** 飞书接收者 ID 类型：chat_id（群/会话）或 open_id（直接发给用户） */
  receiveIdType: 'chat_id' | 'open_id';
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

/**
 * 解析发送目标
 *
 * 优先级：
 * 1. 提供了 chatId → 直接发到指定群组（chat_id 模式）
 * 2. 提供了 tabName → 查找对应 Tab 的 conversationId
 * 3. 当前 Tab 是 connector → 直接用当前会话（chat_id 模式）
 * 4. 提供了 userId → 在 pairing 记录中查找对应的 open_id，用 open_id 直发
 */
function resolveTarget(sessionId: string, userId?: string, chatId?: string, tabName?: string): ResolvedTarget {
  if (!gatewayInstance) throw new Error('Gateway 未初始化');

  // 情况 1：提供了 chatId，直接发到指定群组
  if (chatId) {
    return {
      connectorId: 'feishu',
      conversationId: chatId,
      receiveIdType: 'chat_id',
    };
  }

  // 情况 2：提供了 tabName，查找对应 Tab 的 conversationId（忽略空格）
  if (tabName) {
    const tabs = gatewayInstance.getAllTabs();
    const normalizedQuery = tabName.replace(/\s+/g, '');
    const targetTab = tabs.find(t => t.title.replace(/\s+/g, '') === normalizedQuery);
    
    if (!targetTab) {
      throw new Error(`未找到名为 "${tabName}" 的 Tab`);
    }
    
    if (targetTab.type !== 'connector' || !targetTab.conversationId) {
      throw new Error(`Tab "${tabName}" 不是飞书会话 Tab`);
    }
    
    return {
      connectorId: targetTab.connectorId || 'feishu',
      conversationId: targetTab.conversationId,
      receiveIdType: 'chat_id',
    };
  }

  const tabs = gatewayInstance.getAllTabs();
  const currentTab = tabs.find(t => t.id === sessionId);

  // 情况 3：当前就是 connector Tab，直接发
  if (currentTab?.type === 'connector' && currentTab.connectorId && currentTab.conversationId) {
    return {
      connectorId: currentTab.connectorId,
      conversationId: currentTab.conversationId,
      receiveIdType: 'chat_id',
    };
  }

  // 情况 4：普通 Tab，必须提供 userId
  if (!userId) {
    throw new Error('当前不在飞书会话中，请提供 userId（发给个人）、chatId（发给群组）或 tabName（通过 Tab 名称发送）参数');
  }

  // 从 pairing 记录中查找该用户的 open_id
  const store = SystemConfigStore.getInstance();
  const records = store.getAllPairingRecords('feishu');
  const record = records.find(r => r.userId === userId || r.openId === userId);

  // 优先使用 open_id（ou_ 开头），其次使用传入的 userId
  const targetId = record?.openId || userId;
  return { connectorId: 'feishu', conversationId: targetId, receiveIdType: 'open_id' };
}

/**
 * 获取所有已配对的飞书用户列表（供 AI 参考）
 */
function getApprovedFeishuUsers(): Array<{ userId: string; openId?: string; userName?: string }> {
  const store = SystemConfigStore.getInstance();
  const records = store.getAllPairingRecords('feishu');
  return records
    .filter(r => r.approved)
    .map(r => ({ userId: r.userId, openId: r.openId, userName: r.userName }));
}

/**
 * 格式化已配对用户列表提示（发送失败时附加，帮助 AI 选择正确的 userId）
 */
function formatApprovedUsersHint(fallbackText = ''): string {
  const users = getApprovedFeishuUsers();
  if (users.length === 0) return fallbackText || '\n\n当前没有已配对的飞书用户。';
  return (
    '\n\n已配对用户：\n' +
    users
      .map(u => `- ${u.userName || '未知'} (userId: ${u.userId}${u.openId ? `, openId: ${u.openId}` : ''})`)
      .join('\n')
  );
}

/**
 * 获取飞书连接器实例（统一入口，避免三处重复）
 */
function getFeishuConnector(): any {
  if (!gatewayInstance) throw new Error('Gateway 未初始化');
  const connector = gatewayInstance.getConnectorManager().getConnector('feishu' as any) as any;
  if (!connector) throw new Error('飞书连接器未启动');
  return connector;
}

/**
 * 通过 ConnectorManager 发送消息，receiveIdType 由 ResolvedTarget 决定
 */
async function sendMessageToTarget(target: ResolvedTarget, content: string): Promise<void> {
  if (!gatewayInstance) throw new Error('Gateway 未初始化');

  if (target.receiveIdType === 'open_id') {
    const connector = getFeishuConnector();
    if (!connector.outbound?.sendMessage) throw new Error('飞书连接器不支持发送消息');
    await connector.outbound.sendMessage({
      conversationId: target.conversationId,
      content,
      _receiveIdType: 'open_id',
    });
  } else {
    await gatewayInstance.getConnectorManager().sendOutgoingMessage(
      target.connectorId as any,
      target.conversationId,
      content
    );
  }
}

/**
 * 通过 ConnectorManager 发送图片，receiveIdType 由 ResolvedTarget 决定
 */
async function sendImageToTarget(target: ResolvedTarget, imagePath: string, caption?: string): Promise<void> {
  if (!gatewayInstance) throw new Error('Gateway 未初始化');

  if (target.receiveIdType === 'open_id') {
    const connector = getFeishuConnector();
    if (!connector.outbound?.sendImage) throw new Error('飞书连接器不支持发送图片');
    await connector.outbound.sendImage({
      conversationId: target.conversationId,
      imagePath,
      caption,
      _receiveIdType: 'open_id',
    });
  } else {
    await gatewayInstance.getConnectorManager().sendImage(
      target.connectorId as any,
      target.conversationId,
      imagePath,
      caption
    );
  }
}

/**
 * 通过 ConnectorManager 发送文件，receiveIdType 由 ResolvedTarget 决定
 */
async function sendFileToTarget(target: ResolvedTarget, filePath: string, fileName?: string): Promise<void> {
  if (!gatewayInstance) throw new Error('Gateway 未初始化');

  if (target.receiveIdType === 'open_id') {
    const connector = getFeishuConnector();
    if (!connector.outbound?.sendFile) throw new Error('飞书连接器不支持发送文件');
    await connector.outbound.sendFile({
      conversationId: target.conversationId,
      filePath,
      fileName,
      _receiveIdType: 'open_id',
    });
  } else {
    await gatewayInstance.getConnectorManager().sendFile(
      target.connectorId as any,
      target.conversationId,
      filePath,
      fileName
    );
  }
}

// ── 工具插件 ──────────────────────────────────────────────────────────────────

export const connectorToolPlugin: ToolPlugin = {
  metadata: {
    id: 'connector',
    name: '连接器',
    version: '2.0.0',
    description: '向飞书用户发送消息、图片、文件。支持连接器会话和普通 Tab',
    author: 'DeepBot',
    category: 'network',
    tags: ['connector', 'feishu', 'image', 'file', 'message'],
    requiresConfig: false,
  },

  create: (_options: ToolCreateOptions) => {
    // 从 create 时的 options 闭包 sessionId，避免多 Tab 并发时全局变量被覆盖
    const sessionId = (_options as any).sessionId as string | undefined;

    return [

      // ── feishu_send_message ───────────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_SEND_MESSAGE,
        label: '发送飞书消息',
        description: [
          '向飞书用户或群组发送文本消息。',
          '在飞书会话中调用时，默认发给当前会话（私聊或群组）；',
          '在普通 Tab / 定时任务 Tab 中调用时，可以：',
          '1. 提供 userId 参数发给个人（推荐使用 openId，可通过 api_get_pairing_records 查询）',
          '2. 提供 chatId 参数发给群组（群组 ID 通常以 oc_ 开头）',
          '3. 提供 tabName 参数通过 Tab 名称发送（如 "FS-GROUP-1"、"FS-张三"）',
        ].join(' '),
        parameters: Type.Object({
          message: Type.String({ description: '要发送的文本消息内容' }),
          userId: Type.Optional(Type.String({
            description: '目标用户的飞书 openId（ou_ 开头）或 userId（发给个人时使用）。推荐使用 openId，可通过 api_get_pairing_records 查询',
          })),
          chatId: Type.Optional(Type.String({
            description: '目标群组的 chat_id（oc_ 开头，发给群组时使用）',
          })),
          tabName: Type.Optional(Type.String({
            description: '目标 Tab 的名称（如 "FS-GROUP-1"、"FS-张三"），通过 Tab 名称查找对应的会话发送',
          })),
        }),

        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            if (!gatewayInstance) throw new Error('Gateway 未初始化');
            if (signal?.aborted) throw Object.assign(new Error('操作被取消'), { name: 'AbortError' });
            if (!sessionId) throw new Error('无法获取会话 ID');

            const target = resolveTarget(sessionId, args.userId, args.chatId, args.tabName);
            logger.info('发送飞书消息:', { target, messageLength: args.message.length });

            await sendMessageToTarget(target, args.message);

            let toDesc = '当前会话';
            if (args.tabName) {
              toDesc = `Tab "${args.tabName}"`;
            } else if (args.chatId) {
              toDesc = `群组 ${args.chatId}`;
            } else if (args.userId) {
              toDesc = `用户 ${args.userId}`;
            }
            
            return {
              content: [{ type: 'text' as const, text: `✅ 消息已发送给${toDesc}` }],
              details: { success: true, target },
            };
          } catch (error) {
            logger.error('发送飞书消息失败:', error);
            return {
              content: [{ type: 'text' as const, text: `❌ 发送失败: ${getErrorMessage(error)}${formatApprovedUsersHint()}` }],
              details: { success: false, error: getErrorMessage(error) },
              isError: true,
            };
          }
        },
      },

      // ── connector_send_image ──────────────────────────────────────────────
      {
        name: TOOL_NAMES.CONNECTOR_SEND_IMAGE,
        label: '发送图片到飞书',
        description: [
          '通过飞书发送图片。',
          '在飞书会话中调用时，默认发给当前会话；',
          '在普通 Tab / 定时任务 Tab 中调用时，可以提供 userId（发给个人）、chatId（发给群组）或 tabName（通过 Tab 名称发送）参数。',
        ].join(' '),
        parameters: Type.Object({
          imagePath: Type.String({ description: '图片文件路径（支持 ~ 符号）' }),
          caption: Type.Optional(Type.String({ description: '图片说明文字（可选）' })),
          userId: Type.Optional(Type.String({
            description: '目标用户的飞书 open_id 或 user_id（发给个人时使用）',
          })),
          chatId: Type.Optional(Type.String({
            description: '目标群组的 chat_id（oc_ 开头，发给群组时使用）',
          })),
          tabName: Type.Optional(Type.String({
            description: '目标 Tab 的名称（如 "FS-GROUP-1"、"FS-张三"），通过 Tab 名称查找对应的会话发送',
          })),
        }),

        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            if (!gatewayInstance) throw new Error('Gateway 未初始化');
            if (signal?.aborted) throw Object.assign(new Error('操作被取消'), { name: 'AbortError' });
            if (!sessionId) throw new Error('无法获取会话 ID');

            const expandedPath = expandUserPath(args.imagePath);
            if (!existsSync(expandedPath)) throw new Error(`图片文件不存在: ${expandedPath}`);

            const ext = extname(expandedPath).toLowerCase();
            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
            if (!imageExts.includes(ext)) throw new Error(`不支持的图片格式: ${ext}`);

            const target = resolveTarget(sessionId, args.userId, args.chatId, args.tabName);
            logger.info('发送图片:', { target, path: expandedPath });

            await sendImageToTarget(target, expandedPath, args.caption);

            let toDesc = '当前会话';
            if (args.tabName) {
              toDesc = `Tab "${args.tabName}"`;
            } else if (args.chatId) {
              toDesc = `群组 ${args.chatId}`;
            } else if (args.userId) {
              toDesc = `用户 ${args.userId}`;
            }
            return {
              content: [{ type: 'text' as const, text: `✅ 图片已发送给${toDesc}\n文件: ${basename(expandedPath)}` }],
              details: { success: true, target, fileName: basename(expandedPath) },
            };
          } catch (error) {
            logger.error('发送图片失败:', error);
            return {
              content: [{ type: 'text' as const, text: `❌ 发送图片失败: ${getErrorMessage(error)}${formatApprovedUsersHint()}` }],
              details: { success: false, error: getErrorMessage(error) },
              isError: true,
            };
          }
        },
      },

      // ── connector_send_file ───────────────────────────────────────────────
      {
        name: TOOL_NAMES.CONNECTOR_SEND_FILE,
        label: '发送文件到飞书',
        description: [
          '通过飞书发送文件。',
          '在飞书会话中调用时，默认发给当前会话；',
          '在普通 Tab / 定时任务 Tab 中调用时，可以提供 userId（发给个人）、chatId（发给群组）或 tabName（通过 Tab 名称发送）参数。',
        ].join(' '),
        parameters: Type.Object({
          filePath: Type.String({ description: '文件路径（支持 ~ 符号）' }),
          fileName: Type.Optional(Type.String({ description: '自定义文件名（可选）' })),
          userId: Type.Optional(Type.String({
            description: '目标用户的飞书 open_id 或 user_id（发给个人时使用）',
          })),
          chatId: Type.Optional(Type.String({
            description: '目标群组的 chat_id（oc_ 开头，发给群组时使用）',
          })),
          tabName: Type.Optional(Type.String({
            description: '目标 Tab 的名称（如 "FS-GROUP-1"、"FS-张三"），通过 Tab 名称查找对应的会话发送',
          })),
        }),

        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            if (!gatewayInstance) throw new Error('Gateway 未初始化');
            if (signal?.aborted) throw Object.assign(new Error('操作被取消'), { name: 'AbortError' });
            if (!sessionId) throw new Error('无法获取会话 ID');

            const expandedPath = expandUserPath(args.filePath);
            if (!existsSync(expandedPath)) throw new Error(`文件不存在: ${expandedPath}`);
            const stats = statSync(expandedPath);
            if (!stats.isFile()) throw new Error(`路径不是文件: ${expandedPath}`);

            const target = resolveTarget(sessionId, args.userId, args.chatId, args.tabName);
            logger.info('发送文件:', { target, path: expandedPath });

            await sendFileToTarget(target, expandedPath, args.fileName);

            const fileName = args.fileName || basename(expandedPath);
            let toDesc = '当前会话';
            if (args.tabName) {
              toDesc = `Tab "${args.tabName}"`;
            } else if (args.chatId) {
              toDesc = `群组 ${args.chatId}`;
            } else if (args.userId) {
              toDesc = `用户 ${args.userId}`;
            }
            
            return {
              content: [{ type: 'text' as const, text: `✅ 文件已发送给${toDesc}\n文件: ${fileName}\n大小: ${(stats.size / 1024).toFixed(2)} KB` }],
              details: { success: true, target, fileName, fileSize: stats.size },
            };
          } catch (error) {
            logger.error('发送文件失败:', error);
            return {
              content: [{ type: 'text' as const, text: `❌ 发送文件失败: ${getErrorMessage(error)}${formatApprovedUsersHint()}` }],
              details: { success: false, error: getErrorMessage(error) },
              isError: true,
            };
          }
        },
      },

    ];
  },
};
