/**
 * 环境检查工具
 * 
 * 检查系统环境依赖（Python、Node.js）
 */

import { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';
import { execSync } from 'node:child_process';
import { TOOL_NAMES } from './tool-names';
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
    
    // 检查版本
    const versionOutput = execSync(`${command} --version`, { 
      encoding: 'utf-8',
      timeout: TIMEOUTS.COMMAND_EXECUTION_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: fullPath },
    }).trim();

    // 检查路径
    const pathOutput = execSync(`which ${command}`, { 
      encoding: 'utf-8',
      timeout: TIMEOUTS.COMMAND_EXECUTION_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: fullPath },
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
 * 创建环境检查工具
 */
export function createEnvironmentCheckTool(): AgentTool {
  const store = SystemConfigStore.getInstance();

  return {
    name: TOOL_NAMES.ENVIRONMENT_CHECK,
    label: '环境检查',
    description: '检查系统环境依赖（Python、Node.js）并将结果保存到数据库',
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('check'),
        Type.Literal('get_status'),
      ], {
        description: '操作类型：check=检查环境, get_status=获取状态'
      }),
    }),
    execute: async (
      toolCallId: string,
      params: unknown,
      signal?: AbortSignal,
      onUpdate?: (update: any) => void
    ) => {
      const typedParams = params as { action: 'check' | 'get_status' };
      
      try {
        if (typedParams.action === 'check') {
          // 检查 Python
          console.info('[EnvironmentCheck] 🔍 检查 Python 环境...');
          const pythonResult = checkCommand('python3');
          store.saveEnvironmentConfig({
            id: 'python',
            name: 'python',
            isInstalled: pythonResult.installed,
            version: pythonResult.version,
            path: pythonResult.path,
            lastChecked: Date.now(),
            error: pythonResult.error,
          });

          // 检查 Node.js
          console.info('[EnvironmentCheck] 🔍 检查 Node.js 环境...');
          const nodeResult = checkCommand('node');
          store.saveEnvironmentConfig({
            id: 'nodejs',
            name: 'nodejs',
            isInstalled: nodeResult.installed,
            version: nodeResult.version,
            path: nodeResult.path,
            lastChecked: Date.now(),
            error: nodeResult.error,
          });

          // 构建结果消息
          const results = [];
          
          if (pythonResult.installed) {
            results.push(`✅ Python 已安装\n   版本: ${pythonResult.version}\n   路径: ${pythonResult.path}`);
          } else {
            results.push(`❌ Python 未安装\n   错误: ${pythonResult.error}`);
          }

          if (nodeResult.installed) {
            results.push(`✅ Node.js 已安装\n   版本: ${nodeResult.version}\n   路径: ${nodeResult.path}`);
          } else {
            results.push(`❌ Node.js 未安装\n   错误: ${nodeResult.error}`);
          }

          const allInstalled = pythonResult.installed && nodeResult.installed;
          const summary = allInstalled 
            ? '🎉 所有依赖已安装，环境配置完成！' 
            : '⚠️ 部分依赖未安装，请安装缺失的依赖';

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
                nodejs: nodeResult,
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
                  nodejs: null,
                  allInstalled: false,
                  needsCheck: true,
                },
                message,
              },
            };
          }

          const pythonConfig = configs.find(c => c.name === 'python');
          const nodejsConfig = configs.find(c => c.name === 'nodejs');
          const allInstalled = pythonConfig?.isInstalled && nodejsConfig?.isInstalled;
          const message = allInstalled 
            ? '✅ 环境配置正常' 
            : '⚠️ 部分依赖未安装';

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
                nodejs: nodejsConfig,
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
