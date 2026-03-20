/**
 * 飞书云文档工具
 *
 * 允许 Agent 操作飞书云文档（docx），包括：
 * - 创建文档
 * - 获取文档信息和纯文本
 * - 获取所有块（用于后续更新/删除）
 * - 追加内容到文档末尾
 * - 更新指定块内容
 * - 删除文档中的块
 *
 * 依赖飞书连接器配置中的 appId / appSecret
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { TOOL_NAMES } from './tool-names';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('FeishuDocTool');

// 全局 configStore 引用，由 gateway.ts 注入
let configStoreInstance: any = null;

// 当前会话发送者 ID（由 gateway-connector.ts 每次消息时更新）
let currentSenderId: string | null = null;

// 缓存的 lark Client 实例（配置不变时复用）
let cachedClient: any = null;
let cachedClientKey: string = '';

/**
 * 注入 configStore（由 gateway.ts 调用）
 * 配置变更时清除 Client 缓存
 */
export function setConfigStoreForFeishuDocTool(store: any): void {
  configStoreInstance = store;
  cachedClient = null;
  cachedClientKey = '';
}

/**
 * 更新当前发送者 ID（由 gateway-connector.ts 在每次消息处理时调用）
 */
export function setCurrentSenderIdForFeishuDocTool(senderId: string): void {
  currentSenderId = senderId;
}

/**
 * 根据 ID 格式判断飞书 member_type
 * open_id 以 "ou_" 开头，user_id 为纯数字字符串
 */
function resolveMemberType(id: string): 'openid' | 'userid' {
  return id.startsWith('ou_') ? 'openid' : 'userid';
}

/**
 * 将用户添加为文档协作者（管理员权限）
 * 创建文档后自动调用
 */
async function addDocumentCollaborator(
  client: any,
  documentId: string,
  senderId: string
): Promise<void> {
  const memberType = resolveMemberType(senderId);
  logger.info(`添加协作者: ${senderId} (${memberType})`);
  await client.drive.v1.permissionMember.create({
    path: { token: documentId },
    params: { type: 'docx', need_notification: false },
    data: {
      member_type: memberType,
      member_id: senderId,
      perm: 'full_access',
      perm_type: 'container',
      type: 'user',
    },
  });
}

/**
 * 获取飞书 lark Client（带缓存，appId/appSecret 不变时复用实例）
 * 从飞书连接器配置中读取 appId / appSecret
 */
async function getLarkClient(): Promise<any> {
  if (!configStoreInstance) {
    throw new Error('configStore 未初始化，请确保飞书连接器已配置');
  }

  const connectorConfig = configStoreInstance.getConnectorConfig('feishu');
  if (!connectorConfig?.config?.appId || !connectorConfig?.config?.appSecret) {
    throw new Error('飞书连接器未配置，请先通过 api_set_feishu_connector_config 设置 appId 和 appSecret');
  }

  // 用 appId+appSecret 作为缓存 key，配置变更时自动重建
  const clientKey = `${connectorConfig.config.appId}:${connectorConfig.config.appSecret}`;
  if (cachedClient && cachedClientKey === clientKey) {
    return cachedClient;
  }

  // 动态加载 SDK，避免打包时强依赖
  const lark = require('@larksuiteoapi/node-sdk');
  cachedClient = new lark.Client({
    appId: connectorConfig.config.appId,
    appSecret: connectorConfig.config.appSecret,
    disableTokenCache: false,
  });
  cachedClientKey = clientKey;
  return cachedClient;
}

/** 生成飞书文档链接 */
function docUrl(documentId: string): string {
  return `https://bytedance.feishu.cn/docx/${documentId}`;
}

/** 统一错误返回 */
function errResult(msg: string, error: unknown) {
  return {
    content: [{ type: 'text' as const, text: `❌ ${msg}: ${getErrorMessage(error)}` }],
    details: { success: false, error: getErrorMessage(error) },
    isError: true,
  };
}

/** 检查 abort 信号，已取消则抛出 AbortError */
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw Object.assign(new Error('操作被取消'), { name: 'AbortError' });
}

/**
 * 从块数据中提取纯文本内容
 * 支持 text/heading/bullet/ordered/code/quote/todo 等文本类块
 */
function extractBlockText(block: any): string {
  // 按块类型字段名查找文本数据（飞书 API 用块类型名作为字段名）
  const TEXT_BLOCK_KEYS = [
    'text', 'heading1', 'heading2', 'heading3', 'heading4', 'heading5',
    'heading6', 'heading7', 'heading8', 'heading9',
    'bullet', 'ordered', 'code', 'quote', 'todo',
  ];
  for (const key of TEXT_BLOCK_KEYS) {
    const textBlock = block[key];
    if (textBlock?.elements) {
      return textBlock.elements
        .map((el: any) => el.text_run?.content || el.mention_user?.user_id || '')
        .join('');
    }
  }
  return `[type:${block.block_type}]`;
}

// ==================== 工具插件 ====================

export const feishuDocToolPlugin: ToolPlugin = {
  metadata: {
    id: 'feishu-doc-tool',
    name: 'feishu_doc',
    version: '1.0.0',
    description: '操作飞书云文档：创建、读取、追加内容、更新块、删除块、获取所有块',
    author: 'DeepBot',
    category: 'network',
    tags: ['feishu', 'lark', 'doc', 'document'],
    requiresConfig: false,
  },

  create: (_options: ToolCreateOptions) => {
    return [

      // ── 创建文档 ──────────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_DOC_CREATE,
        label: '创建飞书文档',
        description: '在飞书云空间创建一篇新文档',
        parameters: Type.Object({
          title: Type.String({ description: '文档标题' }),
          folder_token: Type.Optional(Type.String({ description: '父文件夹 token，不填则创建在根目录' })),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            checkAbort(signal);
            const client = await getLarkClient();
            const data: Record<string, string> = { title: args.title };
            if (args.folder_token) data.folder_token = args.folder_token;
            logger.info('创建飞书文档:', args.title);
            const res = await client.docx.v1.document.create({ data });
            const doc = res?.data?.document;

            // 自动将发送者添加为文档管理员
            if (currentSenderId && doc?.document_id) {
              try {
                await addDocumentCollaborator(client, doc.document_id, currentSenderId);
                logger.info('已添加协作者:', currentSenderId);
              } catch (permError) {
                // 权限添加失败不影响文档创建结果，仅记录警告
                logger.warn('添加协作者失败（不影响文档创建）:', getErrorMessage(permError));
              }
            }

            return {
              content: [{ type: 'text' as const, text: `✅ 文档创建成功\n文档 ID: ${doc?.document_id}\n标题: ${doc?.title}\n链接: ${docUrl(doc?.document_id)}` }],
              details: { document_id: doc?.document_id, title: doc?.title, url: docUrl(doc?.document_id) },
            };
          } catch (error) {
            logger.error('创建文档失败:', error);
            return errResult('创建文档失败', error);
          }
        },
      },

      // ── 获取文档信息 ──────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_DOC_GET,
        label: '获取飞书文档信息',
        description: '获取飞书文档的基本信息和纯文本内容',
        parameters: Type.Object({
          document_id: Type.String({ description: '文档 ID' }),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            checkAbort(signal);
            const client = await getLarkClient();
            logger.info('获取文档信息:', args.document_id);
            const [infoRes, textRes] = await Promise.all([
              client.docx.v1.document.get({ path: { document_id: args.document_id } }),
              client.docx.v1.document.rawContent({ path: { document_id: args.document_id }, params: { lang: 0 } }),
            ]);
            const doc = infoRes?.data?.document;
            const text: string = textRes?.data?.content || '';
            return {
              content: [{
                type: 'text' as const,
                text: `📄 文档信息\n文档 ID: ${doc?.document_id}\n标题: ${doc?.title}\n版本: ${doc?.revision_id}\n链接: ${docUrl(doc?.document_id)}\n\n内容预览:\n${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`,
              }],
              details: { document_id: doc?.document_id, title: doc?.title, revision_id: doc?.revision_id, content: text, url: docUrl(doc?.document_id) },
            };
          } catch (error) {
            logger.error('获取文档失败:', error);
            return errResult('获取文档失败', error);
          }
        },
      },

      // ── 获取所有块 ────────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_DOC_GET_BLOCKS,
        label: '获取飞书文档所有块',
        description: '获取文档的所有块（block）列表及文本内容，用于后续更新或删除操作',
        parameters: Type.Object({
          document_id: Type.String({ description: '文档 ID' }),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            checkAbort(signal);
            const client = await getLarkClient();
            logger.info('获取文档块列表:', args.document_id);
            const res = await client.docx.v1.documentBlock.list({
              path: { document_id: args.document_id },
              params: { page_size: 100, document_revision_id: -1 },
            });
            const blocks: any[] = res?.data?.items || [];

            // 第一个块是 Page 根块（block_id === document_id），其余是内容块
            // 删除时 start_index/end_index 是相对于父块（Page根块）的子块列表索引
            // 即内容块的删除索引 = 在 blocks 数组中的位置 - 1（跳过根块）
            const summary = blocks.map((b: any, i: number) => {
              const text = extractBlockText(b);
              const isRoot = b.block_id === args.document_id;
              const deleteIndex = isRoot ? '(根块，不可删除)' : `删除索引: ${i - 1}`;
              return `- block_id: ${b.block_id}  type: ${b.block_type}  ${deleteIndex}  内容: ${text.substring(0, 80)}${text.length > 80 ? '...' : ''}`;
            }).join('\n');

            return {
              content: [{ type: 'text' as const, text: `📦 共 ${blocks.length} 个块:\n${summary}\n\n⚠️ 删除时 start_index/end_index 使用"删除索引"（从0开始，不含根块）\n链接: ${docUrl(args.document_id)}` }],
              details: { blocks, url: docUrl(args.document_id) },
            };
          } catch (error) {
            logger.error('获取块列表失败:', error);
            return errResult('获取块列表失败', error);
          }
        },
      },

      // ── 追加内容 ──────────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_DOC_APPEND,
        label: '追加内容到飞书文档',
        description: '将文本内容追加到飞书文档末尾',
        parameters: Type.Object({
          document_id: Type.String({ description: '文档 ID' }),
          content: Type.String({ description: '要追加的文本内容' }),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            checkAbort(signal);
            const client = await getLarkClient();
            logger.info('追加内容到文档:', args.document_id);
            const res = await client.docx.v1.documentBlockChildren.create({
              path: { document_id: args.document_id, block_id: args.document_id },
              params: { document_revision_id: -1 },
              data: {
                children: [{
                  block_type: 2,
                  text: {
                    elements: [{ text_run: { content: args.content } }],
                    style: {},
                  },
                }],
                index: -1,
              },
            });
            return {
              content: [{ type: 'text' as const, text: `✅ 内容已追加到文档\n链接: ${docUrl(args.document_id)}` }],
              details: { document_id: args.document_id, url: docUrl(args.document_id), result: res?.data },
            };
          } catch (error) {
            logger.error('追加内容失败:', error);
            return errResult('追加内容失败', error);
          }
        },
      },

      // ── 更新块内容 ────────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_DOC_UPDATE_BLOCK,
        label: '更新飞书文档块内容',
        description: '更新文档中指定块的文本内容（先用 feishu_doc_get_blocks 获取 block_id）',
        parameters: Type.Object({
          document_id: Type.String({ description: '文档 ID' }),
          block_id: Type.String({ description: '要更新的块 ID' }),
          content: Type.String({ description: '新的文本内容' }),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            checkAbort(signal);
            const client = await getLarkClient();
            logger.info('更新块内容:', args.block_id);
            await client.docx.v1.documentBlock.patch({
              path: { document_id: args.document_id, block_id: args.block_id },
              params: { document_revision_id: -1 },
              data: {
                update_text_elements: {
                  elements: [{ text_run: { content: args.content } }],
                },
              },
            });
            return {
              content: [{ type: 'text' as const, text: `✅ 块内容已更新\nblock_id: ${args.block_id}\n链接: ${docUrl(args.document_id)}` }],
              details: { document_id: args.document_id, block_id: args.block_id, url: docUrl(args.document_id) },
            };
          } catch (error) {
            logger.error('更新块失败:', error);
            return errResult('更新块失败', error);
          }
        },
      },

      // ── 删除块 ────────────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_DOC_DELETE_BLOCKS,
        label: '删除飞书文档中的块',
        description: '删除文档中指定范围的块。start_index/end_index 是相对于父块子块列表的索引（从0开始，不含根块），先用 feishu_doc_get_blocks 查看"删除索引"再操作',
        parameters: Type.Object({
          document_id: Type.String({ description: '文档 ID' }),
          parent_block_id: Type.Optional(Type.String({ description: '父块 ID，不填则默认使用 document_id' })),
          start_index: Type.Number({ description: '起始块索引（从 0 开始）' }),
          end_index: Type.Number({ description: '结束块索引（不含）' }),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            checkAbort(signal);
            const client = await getLarkClient();
            const parentBlockId = args.parent_block_id ?? args.document_id;
            logger.info('删除文档块:', args.document_id, args.start_index, '-', args.end_index);
            await client.docx.v1.documentBlockChildren.batchDelete({
              path: { document_id: args.document_id, block_id: parentBlockId },
              params: { document_revision_id: -1 },
              data: { start_index: args.start_index, end_index: args.end_index },
            });
            return {
              content: [{ type: 'text' as const, text: `✅ 已删除块 [${args.start_index}, ${args.end_index})\n链接: ${docUrl(args.document_id)}` }],
              details: { document_id: args.document_id, start_index: args.start_index, end_index: args.end_index, url: docUrl(args.document_id) },
            };
          } catch (error) {
            logger.error('删除块失败:', error);
            return errResult('删除块失败', error);
          }
        },
      },

      // ── 添加文档评论 ──────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_DOC_ADD_COMMENT,
        label: '添加飞书文档评论',
        description: '在飞书文档中添加全文评论',
        parameters: Type.Object({
          document_id: Type.String({ description: '文档 ID（即文档的 file_token）' }),
          content: Type.String({ description: '评论文本内容' }),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            checkAbort(signal);
            const client = await getLarkClient();
            logger.info('添加文档评论:', args.document_id);
            const res = await client.drive.v1.fileComment.create({
              path: { file_token: args.document_id },
              params: { file_type: 'docx', user_id_type: 'open_id' },
              data: {
                reply_list: {
                  replies: [{
                    content: {
                      elements: [{
                        type: 'text_run',
                        text_run: { text: args.content },
                      }],
                    },
                  }],
                },
              },
            });
            const commentId = res?.data?.comment?.comment_id;
            return {
              content: [{ type: 'text' as const, text: `✅ 评论已添加\ncomment_id: ${commentId}\n链接: ${docUrl(args.document_id)}` }],
              details: { document_id: args.document_id, comment_id: commentId, url: docUrl(args.document_id) },
            };
          } catch (error) {
            logger.error('添加评论失败:', error);
            return errResult('添加评论失败', error);
          }
        },
      },

      // ── 删除文档文件 ──────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_DOC_DELETE_FILE,
        label: '删除飞书云文档文件',
        description: '永久删除一篇飞书云文档（不可恢复，请谨慎操作）',
        parameters: Type.Object({
          document_id: Type.String({ description: '要删除的文档 ID（即文档的 file_token）' }),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            checkAbort(signal);
            const client = await getLarkClient();
            logger.info('删除文档文件:', args.document_id);
            await client.drive.v1.file.delete({
              path: { file_token: args.document_id },
              params: { type: 'docx' },
            });
            return {
              content: [{ type: 'text' as const, text: `✅ 文档已删除\n文档 ID: ${args.document_id}` }],
              details: { document_id: args.document_id },
            };
          } catch (error) {
            logger.error('删除文档失败:', error);
            return errResult('删除文档失败', error);
          }
        },
      },

      // ── 下载云空间文件 ────────────────────────────────────────
      {
        name: TOOL_NAMES.FEISHU_DRIVE_DOWNLOAD,
        label: '下载飞书云空间文件',
        description: '下载飞书云空间中的文件（如 PDF、Word 等），不支持在线文档（docx/sheet/bitable）。需要 drive:file:download 或 drive:drive 权限。',
        parameters: Type.Object({
          file_token: Type.String({ description: '文件的 token，可从云空间文件链接或 API 获取' }),
          file_name: Type.Optional(Type.String({ description: '保存的本地文件名（含扩展名），不填则使用 file_token 作为文件名' })),
        }),
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          try {
            checkAbort(signal);
            const client = await getLarkClient();

            // 直接从配置读取凭证，获取 tenant_access_token
            const connectorConfig = configStoreInstance.getConnectorConfig('feishu');
            const tokenRes = await client.auth.tenantAccessToken.internal({
              data: {
                app_id: connectorConfig.config.appId,
                app_secret: connectorConfig.config.appSecret,
              },
            });
            const accessToken = (tokenRes as any)?.tenant_access_token;
            if (!accessToken) {
              throw new Error('获取 tenant_access_token 失败');
            }

            logger.info('下载云空间文件:', args.file_token);

            // 调用下载接口，获取文件二进制流
            const response = await fetch(
              `https://open.feishu.cn/open-apis/drive/v1/files/${args.file_token}/download`,
              {
                method: 'GET',
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );

            if (!response.ok) {
              throw new Error(`下载失败，HTTP ${response.status}: ${await response.text()}`);
            }

            // 从响应头提取原始文件名
            const disposition = response.headers.get('content-disposition') || '';
            const headerFileName = disposition.match(/filename\*?=(?:UTF-8'')?([^;\r\n]+)/i)?.[1]
              ?.replace(/['"]/g, '')
              .trim();

            const localFileName = args.file_name || headerFileName || `feishu_${args.file_token}`;

            // 写入临时目录
            const os = require('os');
            const path = require('path');
            const fs = require('fs');
            const savePath = path.join(os.tmpdir(), localFileName);

            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(savePath, buffer);

            logger.info('文件已保存:', savePath);

            return {
              content: [{
                type: 'text' as const,
                text: `✅ 文件下载成功\n文件名: ${localFileName}\n保存路径: ${savePath}\n文件大小: ${buffer.length} 字节`,
              }],
              details: { file_token: args.file_token, file_name: localFileName, save_path: savePath, size: buffer.length },
            };
          } catch (error) {
            logger.error('下载云空间文件失败:', error);
            return errResult('下载云空间文件失败', error);
          }
        },
      },

    ];
  },
};
