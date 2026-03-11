/**
 * 图片生成工具 - 通用工具函数
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { TIMEOUTS } from '../../config/timeouts';
import { assertPathAllowed } from '../../utils/path-security';

/**
 * 展开路径（将 ~ 转换为用户主目录，并执行 shell 命令）
 * 
 * 支持：
 * - ~ 展开为用户主目录
 * - $(command) 执行 shell 命令
 * - `command` 执行 shell 命令
 * 
 * @param filePath - 文件路径（可能包含 shell 命令）
 * @returns 展开后的路径
 */
export function expandPath(filePath: string): string {
  let expanded = filePath;
  
  // 1. 展开 ~ 为用户主目录
  if (expanded.startsWith('~')) {
    expanded = expanded.replace(/^~/, homedir());
  }
  
  // 2. 检查是否包含 shell 命令 $(command) 或 `command`
  const hasShellCommand = /\$\([^)]+\)|`[^`]+`/.test(expanded);
  
  if (hasShellCommand) {
    try {
      // 使用 echo 命令让 shell 展开所有变量和命令
      // 注意：使用双引号保留路径中的空格
      const result = execSync(`echo "${expanded}"`, {
        shell: '/bin/bash',
        encoding: 'utf-8',
        timeout: TIMEOUTS.COMMAND_EXECUTION_TIMEOUT,
      });
      
      expanded = result.trim();
      console.log(`[Image Tool] 🔧 路径展开: ${filePath} → ${expanded}`);
    } catch (error) {
      console.warn(`[Image Tool] ⚠️ 路径展开失败: ${filePath}`, error);
      // 展开失败时使用原始路径
    }
  }
  
  return expanded;
}

/**
 * 根据文件扩展名获取 MIME 类型
 */
export function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif',
  };
  return mimeTypes[ext || ''] || 'image/png';
}

/**
 * 读取并验证图片文件
 */
export function readImageFile(imagePath: string): { buffer: Buffer; mimeType: string; expandedPath: string } {
  // 安全检查：验证路径
  assertPathAllowed(imagePath);
  
  // 展开路径
  const expandedPath = expandPath(imagePath);
  
  // 读取图片
  const buffer = readFileSync(expandedPath);
  const mimeType = getMimeType(expandedPath);
  
  return { buffer, mimeType, expandedPath };
}