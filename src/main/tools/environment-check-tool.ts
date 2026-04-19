/**
 * 环境检查工具
 * 
 * 检查系统环境依赖（Python、Node.js）
 */

import { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';
import { execSync } from 'node:child_process';
import { TOOL_NAMES } from './tool-names';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { SystemConfigStore } from '../database/system-config-store';
import { TIMEOUTS } from '../config/timeouts';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { getShellPathFromLoginShell } from './shell-env';

/**
 * 获取完整的 PATH 环境变量
 * 
 * 使用 shell-env.ts 从登录 shell 获取合并后的 PATH
 */
function getFullPath(): string {
  // 从登录 shell 获取合并后的 PATH（包含后备路径）
  const mergedPath = getShellPathFromLoginShell({
    env: process.env,
    timeoutMs: 15_000,
  });
  
  console.log('[EnvironmentCheck] 使用合并后的 PATH');
  
  return mergedPath;
}

/**
 * 检查命令是否存在
 */
function checkCommand(command: string): { installed: boolean; version?: string; path?: string; error?: string } {
  try {
    const fullPath = getFullPath();
    const isWindows = process.platform === 'win32';
    
    // 检查版本
    const versionOutput = execSync(`${command} --version`, { 
      encoding: 'utf-8',
      timeout: TIMEOUTS.COMMAND_EXECUTION_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: fullPath },
    }).trim();

    // 检查路径（Windows 使用 where，Unix 使用 command -v）
    const pathCommand = isWindows ? 'where' : 'command -v';
    const pathOutput = execSync(`${pathCommand} ${command}`, { 
      encoding: 'utf-8',
      timeout: TIMEOUTS.COMMAND_EXECUTION_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: fullPath },
      shell: isWindows ? undefined : '/bin/sh',
    }).trim();

    return {
      installed: true,
      version: versionOutput,
      path: pathOutput,
    };
  } catch (error: any) {
    return {
      installed: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * 检查 Python（同时支持 python3 和 python）
 */
function checkPython(): { installed: boolean; version?: string; path?: string; error?: string; command?: string } {
  // 优先尝试 python3
  console.info('[EnvironmentCheck] 🔍 尝试检查 python3...');
  const python3Result = checkCommand('python3');
  
  if (python3Result.installed) {
    console.info('[EnvironmentCheck] ✅ 找到 python3');
    return { ...python3Result, command: 'python3' };
  }
  
  // 如果 python3 不存在，尝试 python
  console.info('[EnvironmentCheck] ⚠️  python3 未找到，尝试检查 python...');
  const pythonResult = checkCommand('python');
  
  if (pythonResult.installed) {
    console.info('[EnvironmentCheck] ✅ 找到 python');
    return { ...pythonResult, command: 'python' };
  }
  
  // 两者都不存在
  console.warn('[EnvironmentCheck] ❌ python3 和 python 都未找到');
  return {
    installed: false,
    error: `python3 错误: ${python3Result.error}; python 错误: ${pythonResult.error}`,
  };
}

/**
 * 创建环境检查工具
 */
export function createEnvironmentCheckTool(): AgentTool {
  const store = SystemConfigStore.getInstance();

  return {
    name: TOOL_NAMES.ENVIRONMENT_CHECK,
    label: '环境检查',
    description: '检查系统环境依赖（Python）并将结果保存到数据库',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('check', { description: '检查环境依赖' }),
        Type.Literal('get_status', { description: '获取环境状态' }),
        Type.Literal('refresh', { description: '刷新环境变量' }),
      ]),
    }),
    execute: async (
      toolCallId: string,
      params: unknown,
      signal?: AbortSignal,
      onUpdate?: (update: any) => void
    ) => {
      const typedParams = params as { action: 'check' | 'get_status' | 'refresh' };
      
      try {
        if (typedParams.action === 'refresh') {
          // 刷新环境变量缓存
          console.info('[EnvironmentCheck] 🔄 刷新环境变量缓存...');
          const { resetShellPathCache } = await import('./shell-env');
          resetShellPathCache();
          
          const message = '✅ 环境变量缓存已刷新，请重新执行环境检查';
          return {
            content: [
              {
                type: 'text' as const,
                text: message,
              },
            ],
            details: {
              success: true,
              message,
            },
          };
        } else if (typedParams.action === 'check') {
          // 🔥 检查前先刷新环境变量缓存
          console.info('[EnvironmentCheck] 🔄 检查前刷新环境变量缓存...');
          const { resetShellPathCache } = await import('./shell-env');
          resetShellPathCache();
          
          // 检查 Python（同时支持 python3 和 python）
          console.info('[EnvironmentCheck] 🔍 检查 Python 环境...');
          const pythonResult = checkPython();
          store.saveEnvironmentConfig({
            id: 'python',
            name: 'python',
            isInstalled: pythonResult.installed,
            version: pythonResult.version,
            path: pythonResult.path,
            lastChecked: Date.now(),
            error: pythonResult.error,
          });
          
          // 🔥 保险机制：将 Python 路径添加到环境变量
          if (pythonResult.installed && pythonResult.path) {
            const path = require('path');
            const pythonDir = path.dirname(pythonResult.path);
            const pathSeparator = process.platform === 'win32' ? ';' : ':';
            
            console.info('[EnvironmentCheck] 🔒 保险机制：检查 Python 路径');
            console.info(`  Python 完整路径: ${pythonResult.path}`);
            console.info(`  Python 目录: ${pythonDir}`);
            console.info(`  当前 PATH 长度: ${process.env.PATH?.length || 0} 字符`);
            
            if (!process.env.PATH?.includes(pythonDir)) {
              const oldPath = process.env.PATH;
              process.env.PATH = `${pythonDir}${pathSeparator}${process.env.PATH}`;
              console.info('[EnvironmentCheck] ✅ 已将 Python 路径添加到环境变量');
              console.info(`  新 PATH 长度: ${process.env.PATH.length} 字符`);
              console.info(`  增加: ${process.env.PATH.length - (oldPath?.length || 0)} 字符`);
            } else {
              console.info('[EnvironmentCheck] ℹ️  Python 路径已存在于 PATH 中，跳过添加');
            }
          } else {
            console.warn('[EnvironmentCheck] ⚠️  Python 未安装或路径为空，跳过保险机制');
          }
          
          // 🔥 输出最终 PATH 状态
          console.info('[EnvironmentCheck] 📊 最终环境变量状态:');
          console.info(`  PATH 总长度: ${process.env.PATH?.length || 0} 字符`);
          console.info(`  PATH 包含路径数: ${process.env.PATH?.split(process.platform === 'win32' ? ';' : ':').length || 0} 个`);
          if (process.env.PATH) {
            const paths = process.env.PATH.split(process.platform === 'win32' ? ';' : ':');
            console.info(`  前 5 个路径:`);
            paths.slice(0, 5).forEach((p, i) => {
              console.info(`    ${i + 1}. ${p}`);
            });
          }

          // 构建结果消息
          const results = [];
          
          if (pythonResult.installed) {
            const pythonCommand = (pythonResult as any).command || 'python';
            results.push(`✅ Python 已安装 (${pythonCommand})\n   版本: ${pythonResult.version}\n   路径: ${pythonResult.path}`);
          } else {
            results.push(`❌ Python 未安装\n   错误: ${pythonResult.error}`);
          }

          const allInstalled = pythonResult.installed;
          const summary = allInstalled 
            ? '🎉 Python 环境配置完成！'
            : '⚠️ Python 未安装，请先安装 Python';

          const message = `${summary}\n\n${results.join('\n\n')}`;

          return {
            content: [
              {
                type: 'text' as const,
                text: message,
              },
            ],
            details: {
              success: true,
              data: {
                python: pythonResult,
                allInstalled,
              },
              message,
            },
          };
        } else if (typedParams.action === 'get_status') {
          // 获取环境状态
          const configs = store.getAllEnvironmentConfigs();
          
          if (configs.length === 0) {
            const message = '尚未检查环境，请先执行环境检查';
            return {
              content: [
                {
                  type: 'text' as const,
                  text: message,
                },
              ],
              details: {
                success: true,
                data: {
                  python: null,
                  allInstalled: false,
                  needsCheck: true,
                },
                message,
              },
            };
          }

          const pythonConfig = configs.find(c => c.name === 'python');
          const allInstalled = pythonConfig?.isInstalled;
          const message = allInstalled 
            ? '✅ Python 环境配置完成'
            : '⚠️ Python 未安装';

          return {
            content: [
              {
                type: 'text' as const,
                text: message,
              },
            ],
            details: {
              success: true,
              data: {
                python: pythonConfig,
                allInstalled,
                needsCheck: false,
              },
              message,
            },
          };
        }

        const errorMessage = '未知操作类型';
        return {
          content: [
            {
              type: 'text' as const,
              text: errorMessage,
            },
          ],
          details: {
            success: false,
            error: errorMessage,
          },
          isError: true,
        };
      } catch (error: any) {
        console.error('[Environment Check] ❌ 环境检查失败:', error);
        const errorMessage = getErrorMessage(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: errorMessage,
            },
          ],
          details: {
            success: false,
            error: errorMessage,
          },
          isError: true,
        };
      }
    },
  };
}


// ── ToolPlugin 接口 ──────────────────────────────────────────────────────────

export const environmentCheckToolPlugin: ToolPlugin = {
  metadata: {
    id: 'environment-check',
    name: '环境检查',
    version: '1.0.0',
    description: '检查系统环境依赖（Python、Node.js 等）',
    author: 'DeepBot',
    category: 'system',
    tags: ['environment', 'check', 'python', 'node'],
  },
  create: (_options: ToolCreateOptions) => createEnvironmentCheckTool(),
};
