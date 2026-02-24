/**
 * Browser Tool
 * 
 * 职责：
 * - 提供浏览器控制能力给 AI Agent
 * - 封装 Browser HTTP Client 调用
 * - 处理结果格式化
 * 
 * 
 * 简化版本（MVP）：
 * - 只支持本地浏览器
 * - 不支持多 Profile
 * - 不支持远程节点
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';
import { BrowserToolSchema, type BrowserToolParams } from './browser-tool.schema';
import {
  browserStatus,
  browserStart,
  browserStop,
  browserTabs,
  browserOpenTab,
  browserCloseTab,
  browserSnapshot,
  browserScreenshot,
  browserPdf,
  browserNavigate,
  browserAct,
  browserConsoleMessages,
} from '../browser/client';
import { getErrorMessage, isAbortError } from '../../shared/utils/error-handler';
import { TOOL_NAMES } from './tool-names';

/**
 * 默认最大字符数
 */
const DEFAULT_AI_SNAPSHOT_MAX_CHARS = 80000;

/**
 * 默认 Browser Server URL
 */
const DEFAULT_BROWSER_BASE_URL = 'http://127.0.0.1:18791';

/**
 * 创建 Browser Tool
 * 
 * @returns Browser Tool
 */
export function createBrowserTool(): AgentTool {
  return {
    name: TOOL_NAMES.BROWSER,
    label: 'Browser',
    description: '控制浏览器执行自动化任务。支持：status, start, stop, tabs, open, close, snapshot, screenshot, navigate, act, console, pdf。详细说明请参考 TOOLS.md',
    parameters: BrowserToolSchema,
    execute: async (_toolCallId, args, signal) => {
      const params = args as BrowserToolParams;
      const action = params.action;
      const baseUrl = DEFAULT_BROWSER_BASE_URL;

      // 检查是否已被取消（执行前）
      if (signal?.aborted) {
        const err = new Error('浏览器操作被取消');
        err.name = 'AbortError';
        throw err;
      }

      try {
        switch (action) {
          case 'status': {
            const status = await browserStatus(baseUrl);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(status, null, 2),
                },
              ],
              details: status,
            };
          }

          case 'start': {
            await browserStart(baseUrl);
            
            // 检查是否已被取消
            if (signal?.aborted) {
              const err = new Error('浏览器操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            const status = await browserStatus(baseUrl);
            return {
              content: [
                {
                  type: 'text',
                  text: `浏览器已启动\n${JSON.stringify(status, null, 2)}`,
                },
              ],
              details: status,
            };
          }

          case 'stop': {
            await browserStop(baseUrl);
            return {
              content: [
                {
                  type: 'text',
                  text: '浏览器已停止',
                },
              ],
              details: { ok: true },
            };
          }

          case 'tabs': {
            const tabs = await browserTabs(baseUrl);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ tabs }, null, 2),
                },
              ],
              details: { tabs },
            };
          }

          case 'open': {
            if (!params.targetUrl) {
              throw new Error('targetUrl is required for open action');
            }
            const tab = await browserOpenTab(baseUrl, params.targetUrl);
            
            // 检查是否已被取消
            if (signal?.aborted) {
              const err = new Error('浏览器操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            return {
              content: [
                {
                  type: 'text',
                  text: `已打开新标签页\n${JSON.stringify(tab, null, 2)}`,
                },
              ],
              details: tab,
            };
          }

          case 'close': {
            if (!params.targetId) {
              throw new Error('targetId is required for close action');
            }
            await browserCloseTab(baseUrl, params.targetId);
            return {
              content: [
                {
                  type: 'text',
                  text: `已关闭标签页: ${params.targetId}`,
                },
              ],
              details: { ok: true, targetId: params.targetId },
            };
          }

          case 'snapshot': {
            const maxChars = params.maxChars ?? DEFAULT_AI_SNAPSHOT_MAX_CHARS;
            const snapshot = await browserSnapshot(
              baseUrl,
              params.targetId,
              maxChars
            );
            
            // 检查是否已被取消
            if (signal?.aborted) {
              const err = new Error('浏览器操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 检查快照格式
            if (snapshot.format === 'ai') {
              return {
                content: [
                  {
                    type: 'text',
                    text: snapshot.snapshot,
                  },
                ],
                details: snapshot,
              };
            } else {
              // ARIA 格式
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(snapshot, null, 2),
                  },
                ],
                details: snapshot,
              };
            }
          }

          case 'screenshot': {
            const type = params.type ?? 'png';
            const fullPage = params.fullPage ?? false;
            const result = await browserScreenshot(
              baseUrl,
              params.targetId,
              type,
              fullPage
            );
            
            // 检查是否已被取消
            if (signal?.aborted) {
              const err = new Error('浏览器操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            const fs = await import('fs/promises');
            const path = await import('path');
            const os = await import('os');
            
            // 生成文件名：screenshot-{timestamp}.{type}
            const timestamp = Date.now();
            const filename = `screenshot-${timestamp}.${type}`;
            const filepath = path.join(os.tmpdir(), filename);
            
            // 保存文件
            const buffer = Buffer.from(result.data, 'base64');
            await fs.writeFile(filepath, buffer);
            
            // 🔥 关键改进：只返回文件路径，不返回 base64 数据
            // 这样可以大幅减少传给 AI 的数据量，节省 token
            // 同时提供清晰的下一步操作指引
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ 截图已保存到临时文件：${filepath}

📝 如何保存到目标位置：

使用 exec_run 工具执行 cp 命令：

示例：
• 保存到桌面：
  exec_run({ command: "cp '${filepath}' ~/Desktop/screenshot.png" })

• 保存到工作区：
  exec_run({ command: "cp '${filepath}' ./screenshot.png" })

⚠️ 重要提示：
1. 必须使用 exec_run 工具（不是 write 工具）
2. 文件已生成，不要重复调用 screenshot
3. 复制完成后，记得回复文本消息说明结果`,
                },
              ],
              details: {
                ok: result.ok,
                type: result.type,
                path: filepath,
                // 不再包含 data 字段，避免传递大量 base64 数据
              },
            };
          }

          case 'navigate': {
            if (!params.targetUrl) {
              throw new Error('targetUrl is required for navigate action');
            }
            const result = await browserNavigate(
              baseUrl,
              params.targetUrl,
              params.targetId,
              params.timeoutMs
            );
            
            // 检查是否已被取消
            if (signal?.aborted) {
              const err = new Error('浏览器操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            return {
              content: [
                {
                  type: 'text',
                  text: `已导航到: ${result.url}`,
                },
              ],
              details: result,
            };
          }

          case 'console': {
            const result = await browserConsoleMessages(
              baseUrl,
              params.targetId,
              params.limit
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
              details: result,
            };
          }

          case 'pdf': {
            const result = await browserPdf(baseUrl, params.targetId);
            return {
              content: [
                {
                  type: 'text',
                  text: `PDF 已生成（base64 编码）\n长度: ${result.data.length} 字符`,
                },
              ],
              details: result,
            };
          }

          case 'act': {
            if (!params.request) {
              throw new Error('request is required for act action');
            }

            const request = params.request;
            const kind = request.kind;

            // 构建操作参数
            const actOptions: Record<string, unknown> = {
              targetId: params.targetId,
            };

            switch (kind) {
              case 'click':
                if (!request.selector) {
                  throw new Error('selector is required for click');
                }
                await browserAct(baseUrl, 'click', {
                  ...actOptions,
                  selector: request.selector,
                  timeout: request.timeout,
                });
                break;

              case 'type':
                if (!request.selector || !request.text) {
                  throw new Error('selector and text are required for type');
                }
                await browserAct(baseUrl, 'type', {
                  ...actOptions,
                  selector: request.selector,
                  value: request.text,
                  timeout: request.timeout,
                });
                break;

              case 'press':
                if (!request.key) {
                  throw new Error('key is required for press');
                }
                await browserAct(baseUrl, 'press', {
                  ...actOptions,
                  key: request.key,
                });
                break;

              case 'hover':
                if (!request.selector) {
                  throw new Error('selector is required for hover');
                }
                await browserAct(baseUrl, 'hover', {
                  ...actOptions,
                  selector: request.selector,
                  timeout: request.timeout,
                });
                break;

              case 'scroll':
                await browserAct(baseUrl, 'scroll', {
                  ...actOptions,
                  x: request.x ?? 0,
                  y: request.y ?? 0,
                });
                break;

              case 'select':
                if (!request.selector || !request.value) {
                  throw new Error('selector and value are required for select');
                }
                await browserAct(baseUrl, 'select', {
                  ...actOptions,
                  selector: request.selector,
                  value: request.value,
                  timeout: request.timeout,
                });
                break;

              case 'fill':
                if (!request.selector || !request.value) {
                  throw new Error('selector and value are required for fill');
                }
                await browserAct(baseUrl, 'fill', {
                  ...actOptions,
                  selector: request.selector,
                  value: request.value,
                  timeout: request.timeout,
                });
                break;

              default:
                throw new Error(`Unknown act kind: ${kind}`);
            }

            return {
              content: [
                {
                  type: 'text',
                  text: `已执行操作: ${kind}`,
                },
              ],
              details: { ok: true, action: kind },
            };
          }

          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (error) {
        // 错误处理
        const errorMessage = getErrorMessage(error);
        
        // 检查是否是取消错误
        if (isAbortError(error)) {
          throw error; // 重新抛出取消错误
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `浏览器操作失败: ${errorMessage}`,
            },
          ],
          details: { error: errorMessage },
          isError: true,
        };
      }
    },
  };
}
