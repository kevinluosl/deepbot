/**
 * File Tool - 文件系统操作工具
 * 
 * 职责：
 * - 读取文件（read）
 * - 写入文件（write）
 * - 编辑文件（edit）
 * - 权限边界检查（只能访问配置的目录）
 * 
 * 参考：
 * - pi-coding-agent: @mariozechner/pi-coding-agent
 * 
 * 技术选型：
 * - 使用 pi-coding-agent 提供的 createReadTool/createWriteTool/createEditTool
 * - 在外面包装安全检查和参数规范化
 * 
 * @example
 * ```typescript
 * const tools = await getFileTools('/path/to/workspace');
 * // tools = [readTool, writeTool, editTool]
 * ```
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';
import * as path from 'path';
import * as fs from 'fs';
import { assertPathAllowed } from '../utils/path-security';
import { expandUserPath } from '../../shared/utils/path-utils';
import { ensureDirectoryExists, isFile } from '../../shared/utils/fs-utils';

/**
 * 规范化工具参数（支持 Claude 风格参数）
 * 
 * Claude Code 使用 file_path/old_string/new_string
 * pi-coding-agent 使用 path/oldText/newText
 * 
 * 此函数将 Claude 风格参数转换为 pi-coding-agent 风格
 * 
 * @param params - 原始参数
 * @returns 规范化后的参数
 */
function normalizeToolParams(params: unknown): Record<string, unknown> | undefined {
  if (!params || typeof params !== 'object') {
    return undefined;
  }
  
  const record = params as Record<string, unknown>;
  const normalized = { ...record };
  
  // file_path → path (read, write, edit)
  if ('file_path' in normalized && !('path' in normalized)) {
    normalized.path = normalized.file_path;
    delete normalized.file_path;
  }
  
  // old_string → oldText (edit)
  if ('old_string' in normalized && !('oldText' in normalized)) {
    normalized.oldText = normalized.old_string;
    delete normalized.old_string;
  }
  
  // new_string → newText (edit)
  if ('new_string' in normalized && !('newText' in normalized)) {
    normalized.newText = normalized.new_string;
    delete normalized.new_string;
  }
  
  return normalized;
}

/**
 * 改进 read 工具的返回结果，添加更清晰的描述
 * 
 * 优化：
 * - 过滤图片的 base64 数据（避免传递大量数据给 AI）
 * - 为空文件添加清晰的描述
 * 
 * @param result - 原始结果
 * @param filePath - 文件路径
 * @returns 改进后的结果
 */
function improveReadResult(result: any, filePath: string): any {
  // 只处理 read 工具的结果
  if (!result || !result.content || !Array.isArray(result.content)) {
    return result;
  }
  
  // 查找 text 和 image 内容块
  const textBlock = result.content.find((block: any) => block?.type === 'text');
  const imageBlock = result.content.find((block: any) => block?.type === 'image');
  
  // 如果是图片文件，移除 base64 数据（避免传递大量数据给 AI）
  if (imageBlock) {
    // 获取文件大小信息
    const expandedPath = expandUserPath(filePath);
    
    let sizeInfo = '';
    let mimeType = imageBlock.mimeType || 'unknown';
    if (fs.existsSync(expandedPath)) {
      const stats = fs.statSync(expandedPath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      sizeInfo = `${sizeKB} KB`;
    }
    
    // 只返回文本描述，不返回图片数据
    return {
      ...result,
      content: [
        {
          type: 'text',
          text: `✅ 文件已验证存在: ${filePath}\n` +
                `   类型: ${mimeType}\n` +
                `   大小: ${sizeInfo}\n` +
                `   状态: 可读取\n` +
                `\n` +
                `⚠️ 不要重复读取此文件，文件已确认存在且可访问。`
        }
      ]
    };
  }
  
  // 如果不是图片，检查文本是否为空
  if (textBlock && textBlock.text === '') {
    // 展开路径（支持 ~ 符号）
    const expandedPath = expandUserPath(filePath);
    
    if (fs.existsSync(expandedPath)) {
      // 文件存在但内容为空
      const stats = fs.statSync(expandedPath);
      textBlock.text = `[文件存在，内容为空（${stats.size} 字节）]`;
    } else {
      // 文件不存在
      textBlock.text = `[文件不存在: ${filePath}]`;
    }
  }
  
  return result;
}

/**
 * 包装工具，添加安全检查和参数规范化
 * 
 * @param tool - 原始工具
 * @param workspaceDir - 工作区目录
 * @param isReadTool - 是否是 read 工具
 * @returns 包装后的工具
 */
function wrapToolWithSecurity(
  tool: AgentTool,
  workspaceDir: string,
  isReadTool: boolean = false
): AgentTool {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // 规范化参数
      const normalized = normalizeToolParams(params);
      const record = normalized ?? (params && typeof params === 'object' ? params as Record<string, unknown> : undefined);
      
      // 安全检查：验证文件路径
      const filePath = record?.path;
      if (typeof filePath === 'string' && filePath.trim()) {
        assertPathAllowed(filePath);
      }
      
      // 执行原始工具
      const result = await tool.execute(toolCallId, normalized ?? params, signal, onUpdate);
      
      // 如果是 read 工具，改进返回结果
      if (isReadTool && typeof filePath === 'string') {
        return improveReadResult(result, filePath);
      }
      
      return result;
    },
  };
}

/**
 * 创建 File Tools（read, write, edit）
 * 
 * 使用动态 import 加载 ESM 模块
 * 
 * @param workspaceDir - 工作区目录路径
 * @returns File Tools 数组
 * 
 * @example
 * ```typescript
 * const tools = await getFileTools('/path/to/workspace');
 * // tools = [readTool, writeTool, editTool]
 * ```
 */
export async function getFileTools(workspaceDir: string): Promise<AgentTool[]> {
  // 确保工作区目录存在
  if (!ensureDirectoryExists(workspaceDir)) {
    console.info(`[File Tool] 已创建工作区目录: ${workspaceDir}`);
  }
  
  // 动态导入 ESM 模块（使用 eval 绕过 TypeScript 编译器）
  // eslint-disable-next-line no-eval
  const { createReadTool, createWriteTool, createEditTool } = await eval('import("@mariozechner/pi-coding-agent")');
  
  // 创建基础工具（使用 pi-coding-agent）
  const readTool = createReadTool(workspaceDir) as unknown as AgentTool;
  const writeTool = createWriteTool(workspaceDir) as unknown as AgentTool;
  const editTool = createEditTool(workspaceDir) as unknown as AgentTool;
  
  // 包装安全检查（read 工具需要改进返回结果）
  const secureReadTool = wrapToolWithSecurity(readTool, workspaceDir, true);
  const secureWriteTool = wrapToolWithSecurity(writeTool, workspaceDir, false);
  const secureEditTool = wrapToolWithSecurity(editTool, workspaceDir, false);
  
  console.info(`[File Tool] ✅ File Tools 创建完成`);
  console.info(`  工作区: ${workspaceDir}`);
  console.info(`  工具: read, write, edit`);
  
  return [secureReadTool, secureWriteTool, secureEditTool];
}
