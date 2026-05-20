/**
 * Exec Tool - 命令执行工具
 * 
 * 职责：
 * - 执行 shell 命令
 * - 统一超时控制（120秒）
 * - 危险命令拦截
 * - 输出截断（避免输出过大）
 * 
 * 参考：
 * - pi-coding-agent: @mariozechner/pi-coding-agent (createBashTool)
 * 
 * 技术选型：
 * - 使用 pi-coding-agent 提供的 createBashTool
 * - 在外面包装安全检查和危险命令拦截
 * - 使用统一的超时配置（TIMEOUTS.EXEC_TOOL_TIMEOUT）
 * 
 * 参数：
 * - command: 要执行的命令（必需）
 * - 不再需要 timeout 参数，使用统一配置
 * 
 * @example
 * ```typescript
 * const tools = await getExecTools('/path/to/workspace');
 * // tools = [bashTool]
 * ```
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';
import { getShellEnvFromLoginShell } from './shell-env';
import { isBlockingInteractiveCommand, getBlockingCommandSuggestion } from './exec-blocking-check';
import { TIMEOUTS } from '../config/timeouts';
import { SystemConfigStore } from '../database/system-config-store';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';

/**
 * 危险命令列表（黑名单）
 * 
 * 这些命令可能造成系统损坏或数据丢失
 */
const DANGEROUS_COMMANDS = [
  // === Unix/Linux/macOS 危险命令 ===
  
  // 删除命令
  'rm -rf /',
  'rm -rf ~',
  'rm -rf *',
  'rm -rf .',
  'rm -rf ..',
  
  // 格式化命令
  'mkfs',
  'dd if=/dev/zero',
  'dd if=/dev/random',
  
  // 系统关机/重启（Unix/Linux/macOS）
  'shutdown -h',
  'shutdown -r',
  'shutdown -P',
  'reboot',
  'halt',
  'poweroff',
  'init 0',
  'init 6',
  
  // Fork 炸弹
  ':(){ :|:& };:',
  
  // 覆盖重要文件
  '> /dev/sda',
  '> /dev/hda',
  
  // === Windows 危险命令 ===
  
  // 删除命令
  'rd /s /q c:\\',
  'rmdir /s /q c:\\',
  'del /f /s /q c:\\',
  'del /f /s /q %systemroot%',
  
  // 格式化命令
  'format c:',
  'format d:',
  
  // 注册表破坏
  'reg delete hklm',
  'reg delete hkcu',
  
  // 系统关机/重启（Windows）
  'shutdown /s',
  'shutdown /r',
  
  // Fork 炸弹（Windows）
  '%0|%0',
  
  // 磁盘清除
  'diskpart',
  'cipher /w:c',
];

/**
 * 危险命令模式（正则表达式）
 */
const DANGEROUS_PATTERNS = [
  // === Unix/Linux/macOS 模式 ===
  /rm\s+-rf\s+\//,           // rm -rf /xxx
  /rm\s+-rf\s+~/,            // rm -rf ~/xxx
  /rm\s+-rf\s+\*/,           // rm -rf *
  /dd\s+if=\/dev\/(zero|random)/, // dd if=/dev/zero
  /mkfs/,                    // 格式化
  />\s*\/dev\/(sd|hd)[a-z]/, // 覆盖磁盘
  
  // === Windows 模式 ===
  /rd\s+\/s\s+\/q\s+[a-z]:\\/i,       // rd /s /q C:\
  /rmdir\s+\/s\s+\/q\s+[a-z]:\\/i,    // rmdir /s /q C:\
  /del\s+\/[fFsS].*[a-z]:\\/i,        // del /f /s C:\
  /del\s+\/[fFsS].*%\w+%/i,           // del /f /s %systemroot%
  /format\s+[a-z]:/i,                  // format C:
  /reg\s+delete\s+hk(lm|cu|cr|u|cc)/i, // reg delete HKLM/HKCU/HKCR/HKU/HKCC
  /diskpart/i,                          // diskpart（磁盘分区工具）
  /cipher\s+\/w:/i,                     // cipher /w:C（磁盘数据擦除）
  /bcdedit/i,                           // bcdedit（引导配置编辑）
];

/**
 * 检查命令是否危险
 * 
 * @param command - 要执行的命令
 * @returns 如果危险返回 true，否则返回 false
 */
function isDangerousCommand(command: string): boolean {
  const trimmed = command.trim().toLowerCase();
  
  // 检查黑名单
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (trimmed.includes(dangerous.toLowerCase())) {
      return true;
    }
  }
  
  // 检查危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  
  return false;
}



/**
 * 包装 bash 工具，添加命令安全检查（危险命令 + 阻塞命令 + 路径安全）和空输出处理
 * 
 * @param tool - 原始工具
 * @param shellPath - 合并后的 PATH
 * @returns 包装后的工具
 */
function wrapBashToolWithCommandCheck(tool: AgentTool, shellPath: string): AgentTool {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // 提取命令参数
      const record = params && typeof params === 'object' ? params as Record<string, unknown> : undefined;
      const command = record?.command;
      
      // 安全检查：统一在此处完成所有前置检查
      if (typeof command === 'string' && command.trim()) {
        // 1. 阻塞命令检查（vim、npm run dev 等会卡住的命令）
        if (isBlockingInteractiveCommand(command)) {
          const suggestion = getBlockingCommandSuggestion(command);
          throw new Error(suggestion);
        }
        
        // 2. 危险命令检查（rm -rf /、format c: 等）
        if (isDangerousCommand(command)) {
          const isEn = SystemConfigStore.getInstance().getAppSetting('language') === 'en';
          throw new Error(isEn ? `Dangerous command blocked: ${command}` : `危险命令被拦截: ${command}`);
        }
        
        // 路径安全检查已统一在 beforeToolCall 中处理
      }
      
      // 🔥 应用完整的 shell 环境变量（动态获取，支持 /reload-path 刷新）
      if (record && !record.env) {
        const env = { ...getShellEnvFromLoginShell({ env: process.env, timeoutMs: 15_000 }) };
        record.env = env;
      }
      
      // 执行原始工具
      const result = await tool.execute(toolCallId, params, signal, onUpdate);
      
      // 🔥 处理空输出：添加成功提示
      if (result && typeof result === 'object' && 'content' in result) {
        const content = result.content as any[];
        
        // 查找 text 类型的内容
        const textContent = content.find(c => c.type === 'text');
        
        if (textContent && typeof textContent.text === 'string') {
          const output = textContent.text.trim();
          
          // 🔥 修复：只有在真正没有输出且命令成功时才添加成功提示
          // 检查是否有实际的输出内容（不仅仅是空白字符）
          if (output === '' || output === '(no output)') {
            // 检查是否有错误信息（通过检查 result 中是否有错误相关的内容）
            const hasError = content.some(c => 
              c.type === 'text' && 
              typeof c.text === 'string' && 
              (c.text.includes('error:') || c.text.includes('Error:') || c.text.includes('ERROR:'))
            );
            
            if (!hasError) {
              textContent.text = '✅ 命令执行成功（无输出）';
            }
          }
        }
      }
      
      return result;
    },
  };
}

/**
 * 创建 Exec Tool（bash）
 * 
 * 使用动态 import 加载 ESM 模块
 * 
 * @param workspaceDir - 工作区目录路径
 * @returns Exec Tool
 * 
 * @example
 * ```typescript
 * const tools = await getExecTools('/path/to/workspace');
 * // tools = [bashTool]
 * ```
 */
export async function getExecTools(workspaceDir: string): Promise<AgentTool[]> {
  // 动态导入 ESM 模块（使用 eval 绕过 TypeScript 编译器）
  // eslint-disable-next-line no-eval
  const { createBashTool } = await eval('import("@mariozechner/pi-coding-agent")');
  
  // 🔥 从登录 shell 获取完整环境变量（初始化时预热缓存）
  // 解决 Electron 主进程环境变量不完整的问题（TAVILY_API_KEY 等用户自定义变量缺失）
  getShellEnvFromLoginShell({
    env: process.env,
    timeoutMs: 15_000,
  });
  
  // shellPath 供 wrapBashToolWithCommandCheck 使用
  const shellPath = getShellEnvFromLoginShell({ env: process.env, timeoutMs: 15_000 }).PATH || process.env.PATH || '';
  
  // 创建基础工具（使用 pi-coding-agent）
  // 🔥 使用 operations 自定义命令执行，添加阻塞命令检查
  const bashTool = createBashTool(workspaceDir, {
    operations: {
      exec: async (command: string, cwd: string, options: any) => {
        // cwd 路径安全检查已统一在 beforeToolCall 中处理
        
        // 命令安全检查（危险命令 + 阻塞命令）已在外层 wrapBashToolWithCommandCheck 中统一处理
        // 这里只负责执行逻辑
        
        // 🔥 使用完整的 shell 环境变量（每次动态获取，支持 /reload-path 刷新）
        const env: Record<string, string> = { ...getShellEnvFromLoginShell({ env: process.env, timeoutMs: 15_000 }) };
        
        // 🔥 Windows 中文编码处理：设置代码页为 UTF-8
        if (process.platform === 'win32') {
          env.CHCP = '65001';
        }
        
        // 🔥 Windows 中文编码处理：在命令前添加 chcp 65001
        let finalCommand = command;
        if (process.platform === 'win32') {
          finalCommand = `chcp 65001 >nul 2>&1 && ${command}`;
        }
        
        // 🔥 使用统一的超时配置，同时支持 Agent 传入的 timeout 参数
        const timeoutMs = TIMEOUTS.EXEC_TOOL_TIMEOUT;
        // Agent 传入的 timeout 是秒为单位，优先使用
        const agentTimeoutMs = options.timeout && options.timeout > 0 ? options.timeout * 1000 : 0;
        const noOutputTimeoutMs = TIMEOUTS.EXEC_TOOL_NO_OUTPUT_TIMEOUT;
        const { spawn } = require('node:child_process');
        
        return new Promise((resolve) => {
          const child = spawn(finalCommand, [], {
            cwd,
            env,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: agentTimeoutMs || timeoutMs, // 优先使用 Agent 指定的超时
          });
          
          // 🔥 无输出超时机制：如果命令从未有过任何输出，5 分钟后强制终止
          let noOutputTimer: ReturnType<typeof setTimeout> | null = null;
          let resolved = false;
          let hasReceivedOutput = false; // 是否曾经收到过输出
          
          // 启动无输出计时器（只在命令从未有过输出时生效）
          if (noOutputTimeoutMs > 0) {
            noOutputTimer = setTimeout(() => {
              if (!resolved && !hasReceivedOutput) {
                resolved = true;
                child.kill();
                const timeoutSec = Math.round(noOutputTimeoutMs / 1000);
                const timeoutDisplay = timeoutSec >= 60 ? `${Math.round(timeoutSec / 60)} 分钟` : `${timeoutSec} 秒`;
                const timeoutMsg = `命令执行超时：${timeoutDisplay}内没有任何输出，已强制终止。请检查命令是否正确，或尝试其他方式。`;
                options.onData(Buffer.from(timeoutMsg, 'utf8'));
                resolve({ exitCode: 124 }); // 124 是 timeout 的标准退出码
              }
            }, noOutputTimeoutMs);
          }
          
          child.on('error', (error: Error) => {
            if (!resolved) {
              resolved = true;
              if (noOutputTimer) clearTimeout(noOutputTimer);
              resolve({ exitCode: null });
            }
          });
          
          // 监听输出
          child.stdout?.on('data', (data: Buffer) => {
            // 🔥 收到输出，标记并取消无输出计时器
            if (!hasReceivedOutput) {
              hasReceivedOutput = true;
              if (noOutputTimer) { clearTimeout(noOutputTimer); noOutputTimer = null; }
            }
            
            // 🔥 Windows 中文编码处理
            let output: string;
            if (process.platform === 'win32') {
              try {
                const iconv = require('iconv-lite');
                output = iconv.decode(data, 'cp936');
              } catch (error) {
                output = data.toString('utf8');
              }
            } else {
              output = data.toString('utf8');
            }
            
            options.onData(Buffer.from(output, 'utf8'));
          });
          
          child.stderr?.on('data', (data: Buffer) => {
            // 🔥 收到输出，标记并取消无输出计时器
            if (!hasReceivedOutput) {
              hasReceivedOutput = true;
              if (noOutputTimer) { clearTimeout(noOutputTimer); noOutputTimer = null; }
            }
            
            // 🔥 Windows 中文编码处理
            let output: string;
            if (process.platform === 'win32') {
              try {
                const iconv = require('iconv-lite');
                output = iconv.decode(data, 'cp936');
              } catch (error) {
                output = data.toString('utf8');
              }
            } else {
              output = data.toString('utf8');
            }
            
            options.onData(Buffer.from(output, 'utf8'));
          });
          
          // 监听取消信号
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              if (noOutputTimer) clearTimeout(noOutputTimer);
              child.kill();
            });
          }
          
          // 监听退出
          child.on('close', (code: number | null, signal: string | null) => {
            if (!resolved) {
              resolved = true;
              if (noOutputTimer) clearTimeout(noOutputTimer);
              resolve({ exitCode: code });
            }
          });
        });
      },
    },
  }) as unknown as AgentTool;
  
  // 包装命令安全检查
  const secureBashTool = wrapBashToolWithCommandCheck(bashTool, shellPath);
  
  return [secureBashTool];
}


// ── ToolPlugin 接口 ──────────────────────────────────────────────────────────

export const execToolPlugin: ToolPlugin = {
  metadata: {
    id: 'exec',
    name: '命令执行',
    version: '1.0.0',
    description: 'Shell 命令执行，带安全检查和环境变量注入',
    author: 'DeepBot',
    category: 'system',
    tags: ['bash', 'exec', 'shell', 'command'],
  },
  create: (options: ToolCreateOptions) => getExecTools(options.workspaceDir),
};
