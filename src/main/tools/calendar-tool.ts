/**
 * Calendar Tool - 日历管理工具（仅支持 macOS）
 * 
 * 职责：
 * - 读取日历事件（getEvents）
 * - 创建日历事件（createEvent）
 * - 使用 AppleScript 与 macOS Calendar 交互
 * 
 * 平台限制：
 * - ⚠️ 仅支持 macOS
 * - 需要用户授予 Automation 权限
 * 
 * 权限要求：
 * - System Preferences > Security & Privacy > Privacy > Automation
 * - 允许 DeepBot 控制 Calendar.app
 * 
 * @example
 * ```typescript
 * const tools = getCalendarTools();
 * // tools = [getEventsTool, createEventTool]
 * ```
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { TOOL_NAMES } from './tool-names';
import { Type } from '@sinclair/typebox';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 日历事件接口
 */
interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location?: string;
  notes?: string;
}

/**
 * 检查是否为 macOS 平台
 */
function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * 执行 AppleScript 脚本
 * 
 * @param script - AppleScript 脚本内容
 * @returns 脚本执行结果
 */
async function runAppleScript(script: string): Promise<string> {
  if (!isMacOS()) {
    throw new Error('Calendar Tool 仅支持 macOS 平台');
  }

  try {
    const { stdout, stderr } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    
    if (stderr) {
      console.warn('[Calendar Tool] AppleScript 警告:', stderr);
    }
    
    return stdout.trim();
  } catch (error) {
    if (error instanceof Error) {
      // 检查是否是权限问题
      if (error.message.includes('not allowed') || error.message.includes('permission')) {
        throw new Error(
          'Calendar Tool 需要 Automation 权限。\n' +
          '请前往：系统偏好设置 > 安全性与隐私 > 隐私 > 自动化\n' +
          '允许 DeepBot 控制 Calendar.app'
        );
      }
      throw new Error(`AppleScript 执行失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 格式化日期为 AppleScript 可识别的格式
 * 
 * @param dateStr - ISO 日期字符串
 * @returns AppleScript 日期格式（YYYY-MM-DD HH:mm:ss）
 */
function formatDateForAppleScript(dateStr: string): string {
  const date = new Date(dateStr);
  
  // AppleScript 接受 "YYYY-MM-DD HH:mm:ss" 格式
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 解析日期范围
 * 
 * @param dateRange - 日期范围字符串（"today", "tomorrow", "this week", "YYYY-MM-DD", "YYYY-MM-DD to YYYY-MM-DD"）
 * @returns { startDate, endDate } ISO 格式
 */
function parseDateRange(dateRange: string): { startDate: string; endDate: string } {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  switch (dateRange.toLowerCase()) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
      break;
    
    case 'tomorrow':
      startDate = new Date(now.setDate(now.getDate() + 1));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;
    
    case 'this week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay()); // 本周日
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // 本周六
      endDate.setHours(23, 59, 59, 999);
      break;
    
    default:
      // 尝试解析 "YYYY-MM-DD" 或 "YYYY-MM-DD to YYYY-MM-DD"
      if (dateRange.includes(' to ')) {
        const [start, end] = dateRange.split(' to ');
        startDate = new Date(start.trim());
        endDate = new Date(end.trim());
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date(dateRange);
        endDate = new Date(dateRange);
        endDate.setHours(23, 59, 59, 999);
      }
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  };
}

/**
 * 创建"读取日历事件"工具
 */
function createGetEventsTool(): AgentTool {
  return {
    name: TOOL_NAMES.CALENDAR_GET_EVENTS,
    label: '读取日历事件',
    description: '读取指定日期范围内的日历事件（仅支持 macOS）。支持自然语言日期：today, tomorrow, this week，或具体日期：YYYY-MM-DD',
    parameters: Type.Object({
      dateRange: Type.String({
        description: '日期范围（例如："today", "tomorrow", "this week", "2024-02-01", "2024-02-01 to 2024-02-07"）'
      }),
      calendarName: Type.Optional(Type.String({
        description: '日历名称（可选，默认读取所有日历）'
      }))
    }),
    execute: async (toolCallId, params: any) => {
      console.log('[Calendar Tool] 📅 读取日历事件');
      console.log('  参数:', params);

      try {
        // 检查平台
        if (!isMacOS()) {
          return {
            content: [
              {
                type: 'text' as const,
                text: '❌ Calendar Tool 仅支持 macOS 平台'
              }
            ],
            details: {
              success: false,
              error: 'Calendar Tool 仅支持 macOS 平台'
            }
          };
        }

        // 解析日期范围
        const { startDate, endDate } = parseDateRange(params.dateRange);
        console.log('  日期范围:', startDate, 'to', endDate);

        // 构建日历过滤器
        const calendarFilter = params.calendarName 
          ? `whose name is "${params.calendarName}"` 
          : '';

        // 构建 AppleScript
        // 注意：需要从每个日历中分别获取事件
        const script = `
          tell application "Calendar"
            set startDate to date "${formatDateForAppleScript(startDate)}"
            set endDate to date "${formatDateForAppleScript(endDate)}"
            
            set eventList to {}
            set calendarList to every calendar ${calendarFilter}
            
            repeat with cal in calendarList
              set calEvents to (every event of cal whose start date ≥ startDate and start date ≤ endDate)
              repeat with anEvent in calEvents
                set eventInfo to summary of anEvent & "|" & (start date of anEvent as string) & "|" & (end date of anEvent as string) & "|" & location of anEvent & "|" & description of anEvent
                set end of eventList to eventInfo
              end repeat
            end repeat
            
            set AppleScript's text item delimiters to linefeed
            return eventList as text
          end tell
        `;

        const result = await runAppleScript(script);
        console.log('  AppleScript 结果:', result);

        // 解析结果（每行一个事件，格式：title|startDate|endDate|location|notes）
        const events: CalendarEvent[] = [];
        
        if (result && result.trim() !== '') {
          const lines = result.trim().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            
            const parts = line.split('|');
            if (parts.length >= 3) {
              // 处理 AppleScript 的 "missing value"
              const location = parts[3] && parts[3] !== 'missing value' ? parts[3] : undefined;
              const notes = parts[4] && parts[4] !== 'missing value' ? parts[4] : undefined;
              
              events.push({
                id: `event-${Date.now()}-${Math.random()}`,
                title: parts[0] || '(无标题)',
                startDate: parts[1] || '',
                endDate: parts[2] || '',
                location,
                notes
              });
            }
          }
          console.log('  找到事件:', events.length);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `📅 找到 ${events.length} 个事件\n日期范围: ${startDate} 到 ${endDate}`
            }
          ],
          details: {
            success: true,
            events,
            dateRange: { startDate, endDate }
          }
        };

      } catch (error) {
        console.error('[Calendar Tool] ❌ 读取事件失败:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ 读取日历事件失败: ${getErrorMessage(error)}`
            }
          ],
          details: {
            success: false,
            error: getErrorMessage(error)
          }
        };
      }
    }
  };
}

/**
 * 创建"创建日历事件"工具
 */
function createCreateEventTool(): AgentTool {
  return {
    name: TOOL_NAMES.CALENDAR_CREATE_EVENT,
    label: '创建日历事件',
    description: '在日历中创建新事件（仅支持 macOS）。需要提供标题、开始时间、结束时间，可选地点和备注',
    parameters: Type.Object({
      title: Type.String({
        description: '事件标题'
      }),
      startDate: Type.String({
        description: '开始时间（ISO 格式：YYYY-MM-DD HH:mm 或 YYYY-MM-DDTHH:mm:ss）'
      }),
      endDate: Type.String({
        description: '结束时间（ISO 格式：YYYY-MM-DD HH:mm 或 YYYY-MM-DDTHH:mm:ss）'
      }),
      location: Type.Optional(Type.String({
        description: '地点（可选）'
      })),
      notes: Type.Optional(Type.String({
        description: '备注（可选）'
      })),
      calendarName: Type.Optional(Type.String({
        description: '日历名称（可选，默认使用默认日历）'
      }))
    }),
    execute: async (toolCallId, params: any) => {
      console.log('[Calendar Tool] 📅 创建日历事件');
      console.log('  参数:', params);

      try {
        // 检查平台
        if (!isMacOS()) {
          return {
            content: [
              {
                type: 'text' as const,
                text: '❌ Calendar Tool 仅支持 macOS 平台'
              }
            ],
            details: {
              success: false,
              error: 'Calendar Tool 仅支持 macOS 平台'
            }
          };
        }

        const { title, startDate, endDate, location, notes, calendarName } = params;

        // 格式化日期
        const formattedStartDate = formatDateForAppleScript(startDate);
        const formattedEndDate = formatDateForAppleScript(endDate);

        console.log('  开始时间:', formattedStartDate);
        console.log('  结束时间:', formattedEndDate);

        // 构建 AppleScript
        const calendarTarget = calendarName 
          ? `calendar "${calendarName}"` 
          : 'calendar "日历"'; // 使用默认的"日历"

        const locationScript = location 
          ? `set location of newEvent to "${location.replace(/"/g, '\\"')}"` 
          : '';

        const notesScript = notes 
          ? `set description of newEvent to "${notes.replace(/"/g, '\\"')}"` 
          : '';

        const script = `
          tell application "Calendar"
            tell ${calendarTarget}
              set newEvent to make new event with properties {¬
                summary:"${title.replace(/"/g, '\\"')}", ¬
                start date:date "${formattedStartDate}", ¬
                end date:date "${formattedEndDate}"¬
              }
              ${locationScript}
              ${notesScript}
            end tell
            return "success"
          end tell
        `;

        const result = await runAppleScript(script);
        console.log('  事件已创建，结果:', result);

        return {
          content: [
            {
              type: 'text' as const,
              text: `✅ 事件"${title}"已创建\n开始时间: ${startDate}\n结束时间: ${endDate}${location ? `\n地点: ${location}` : ''}${notes ? `\n备注: ${notes}` : ''}`
            }
          ],
          details: {
            success: true,
            result: result, // AppleScript 返回 "success"
            event: {
              title,
              startDate,
              endDate,
              location,
              notes
            }
          }
        };

      } catch (error) {
        console.error('[Calendar Tool] ❌ 创建事件失败:', error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ 创建日历事件失败: ${getErrorMessage(error)}`
            }
          ],
          details: {
            success: false,
            error: getErrorMessage(error)
          }
        };
      }
    }
  };
}

/**
 * 获取所有日历工具
 * 
 * @returns 日历工具数组
 */
export function getCalendarTools(): AgentTool[] {
  // 检查平台
  if (!isMacOS()) {
    console.warn('[Calendar Tool] ⚠️ 当前平台不是 macOS，Calendar Tool 将不可用');
    return [];
  }

  return [
    createGetEventsTool(),
    createCreateEventTool()
  ];
}
