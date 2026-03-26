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
import { applyShellPath, getShellEnvFromLoginShell } from './shell-env';
import { isBlockingInteractiveCommand, getBlockingCommandSuggestion } from './exec-blocking-check';
import { TIMEOUTS } from '../config/timeouts';
import { assertPathAllowed } from '../utils/path-security';

/**
 * 危险命令列表（黑名单）
 * 
 * 这些命令可能造成系统损坏或数据丢失
 */
const DANGEROUS_COMMANDS = [
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
  
  // 系统关机/重启
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  
  // Fork 炸弹
  ':(){ :|:& };:',
  
  // 覆盖重要文件
  '> /dev/sda',
  '> /dev/hda',
];

/**
 * 危险命令模式（正则表达式）
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /xxx
  /rm\s+-rf\s+~/,            // rm -rf ~/xxx
  /rm\s+-rf\s+\*/,           // rm -rf *
  /dd\s+if=\/dev\/(zero|random)/, // dd if=/dev/zero
  /mkfs/,                    // 格式化
  />\s*\/dev\/(sd|hd)[a-z]/, // 覆盖磁盘
];

/**
 * 检查命令中的路径是否安全（严格模式）
 * 
 * 使用 assertPathAllowed 进行严格的路径安全检查，
 * 如果发现不安全的路径会直接抛出异常终止执行
 * 
 * @param command - 要执行的命令
 * @throws 如果包含不安全路径会抛出异常
 */
function checkCommandPathSecurity(command: string): void {
  // 🔥 系统路径白名单（这些是安全的系统路径）
  const SYSTEM_PATH_WHITELIST = [
    // Unix/Linux/macOS 标准设备文件（精确匹配）
    '/dev/null',
    '/dev/zero',
    '/dev/stdin',
    '/dev/stdout',
    '/dev/stderr',
    '/dev/urandom',
    '/dev/random',
    '/dev/tty',
    '/dev/full',
    '/dev/ptmx',
    
    // Windows 设备文件（精确匹配）
    'NUL',           // Windows 空设备
    'nul',           // Windows 空设备（小写）
    'CON',           // Windows 控制台
    'con',           // Windows 控制台（小写）
    'AUX',           // Windows 辅助设备
    'aux',           // Windows 辅助设备（小写）
    'PRN',           // Windows 打印机
    'prn',           // Windows 打印机（小写）
  ];
  
  // 🔥 系统目录前缀白名单（前缀匹配）
  const SYSTEM_DIR_PREFIX_WHITELIST = [
    // Unix/Linux 临时目录
    '/tmp/',
    '/var/tmp/',
    '/var/log/',      // 日志目录（只读）
    '/var/run/',      // 运行时数据
    
    // macOS 特有
    '/private/tmp/',
    '/private/var/tmp/',
    '/private/var/log/',
    
    // Linux 系统信息（只读）
    '/proc/',         // 进程信息
    '/sys/',          // 系统信息
    '/run/',          // 运行时数据
    
    // Windows 临时目录（需要处理大小写）
    'C:\\Windows\\Temp\\',
    'C:\\WINDOWS\\TEMP\\',
    'c:\\windows\\temp\\',
    'C:\\Temp\\',
    'C:\\TEMP\\',
    'c:\\temp\\',
    
    // Windows 用户临时目录（通过环境变量）
    // 注意：这些路径在实际使用时会被展开，这里只是示例
  ];
  
  // 🔥 安全的环境变量白名单（用于临时目录）
  const SAFE_ENV_VARS = ['TMPDIR', 'TEMP', 'TMP'];
  
  // 🔥 动态添加环境变量指向的临时目录到白名单
  const envTempDirs: string[] = [];
  for (const envVar of SAFE_ENV_VARS) {
    const envValue = process.env[envVar];
    if (envValue) {
      // 确保路径以 / 或 \ 结尾
      const normalizedPath = envValue.endsWith('/') || envValue.endsWith('\\') 
        ? envValue 
        : envValue + (process.platform === 'win32' ? '\\' : '/');
      envTempDirs.push(normalizedPath);
    }
  }
  
  // 合并所有前缀白名单
  const allPrefixWhitelist = [...SYSTEM_DIR_PREFIX_WHITELIST, ...envTempDirs];
  
  // 提取命令中可能的路径参数
  // 注意：只检查 shell 层面的路径参数，不扫描命令字符串内容（避免误判 Python/JS 代码里的路径字符串）
  const pathPatterns = [
    // cd 命令：cd /path/to/dir
    { pattern: /cd\s+([^\s&|;]+)/gi, name: 'cd' },
    // 文件操作：cp, mv, rm, mkdir, rmdir, touch, cat, ls, find, grep 等
    // 注意：这里只匹配第一个参数，多参数情况由下面的 multiArg 处理
    { pattern: /(cp|mv|rm|mkdir|rmdir|touch|cat|ls|find|grep)\s+([^\s&|;-][^\s&|;]*)/gi, name: 'file operations' },
    // 重定向：> /path/to/file, >> /path/to/file
    { pattern: /(>>?)\s*([^\s&|;]+)/gi, name: 'redirection' },
    // Python/Node.js 脚本文件执行：python /path/to/script.py（注意：-c 参数会被跳过）
    { pattern: /(python|python3|node|npm|pip|pip3)\s+([^\s&|;-][^\s&|;]*)/gi, name: 'script execution' },
    // 注意：移除了通用 absolute paths 正则，因为它会误匹配命令字符串内容（如 URL、Python 代码里的路径）
  ];

  // 🔥 额外检查：提取文件操作命令中所有路径参数（包括 flags 后面的路径）
  // 例如：ls -la ~/Downloads/ 中的 ~/Downloads/
  const fileOpMultiArgPattern = /(?:^|\s)(cp|mv|rm|mkdir|rmdir|touch|cat|ls|find|grep)\s+(.*?)(?=\s*(?:&&|\|\||;|$))/gi;
  const fileOpMatches = Array.from(command.matchAll(fileOpMultiArgPattern));
  for (const match of fileOpMatches) {
    const args = match[2].trim().split(/\s+/);
    for (const arg of args) {
      // 跳过 flags（以 - 开头）
      if (arg.startsWith('-')) continue;
      // 只检查包含路径分隔符或 ~ 的参数
      if (!arg.includes('/') && !arg.includes('\\') && !arg.startsWith('~')) continue;
      if (arg.startsWith('http://') || arg.startsWith('https://')) continue;
      if (SYSTEM_PATH_WHITELIST.includes(arg)) continue;
      if (allPrefixWhitelist.some(prefix => arg.startsWith(prefix))) continue;
      try {
        assertPathAllowed(arg);
      } catch (error) {
        throw new Error(`命令安全检查失败：${error instanceof Error ? error.message : '未知错误'}\n命令：${command}\n不安全路径：${arg}`);
      }
    }
  }
  
  for (const { pattern, name } of pathPatterns) {
    const matches = Array.from(command.matchAll(pattern));
    
    for (const match of matches) {
      // 根据不同的模式提取路径
      let pathToCheck: string;
      
      if (name === 'cd') {
        pathToCheck = match[1]; // cd 命令的路径参数
      } else if (name === 'file operations') {
        pathToCheck = match[2]; // 文件操作的路径参数
      } else if (name === 'redirection') {
        pathToCheck = match[2]; // 重定向的文件路径
      } else if (name === 'script execution') {
        pathToCheck = match[2]; // 脚本文件路径
      } else if (name === 'absolute paths') {
        pathToCheck = match[1]; // 绝对路径
      } else {
        continue;
      }
      
      // 清理路径（去掉引号等）
      pathToCheck = pathToCheck.replace(/^['"]|['"]$/g, '').trim();
      
      // 跳过明显的参数（以 - 开头）
      if (pathToCheck.startsWith('-')) {
        continue;
      }
      
      // 跳过空路径
      if (!pathToCheck) {
        continue;
      }
      
      // 跳过单独的 /（根目录，通常是误匹配，如 "url1 / url2" 中的分隔符）
      if (pathToCheck === '/') {
        continue;
      }
      
      // 跳过 URL（http:// 或 https:// 开头）
      if (pathToCheck.startsWith('http://') || pathToCheck.startsWith('https://')) {
        continue;
      }
      
      // 跳过纯文件名（不包含路径分隔符）
      if (!pathToCheck.includes('/') && !pathToCheck.includes('\\') && !pathToCheck.startsWith('~')) {
        continue;
      }
      
      // 🔥 跳过系统路径白名单
      // 1. 精确匹配
      if (SYSTEM_PATH_WHITELIST.includes(pathToCheck)) {
        continue;
      }
      
      // 2. 前缀匹配（用于目录）
      if (allPrefixWhitelist.some(prefix => pathToCheck.startsWith(prefix))) {
        continue;
      }
      
      // 🔥 使用 assertPathAllowed 进行严格检查
      // 如果路径不安全，会直接抛出异常
      try {
        assertPathAllowed(pathToCheck);
      } catch (error) {
        throw new Error(`命令安全检查失败：${error instanceof Error ? error.message : '未知错误'}\n命令：${command}\n不安全路径：${pathToCheck}`);
      }
    }
  }
}
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
 * 包装工具，添加安全检查、PATH 处理和日志
 * 
 * @param tool - 原始工具
 * @param shellPath - 合并后的 PATH
 * @returns 包装后的工具
 */
function wrapToolWithSecurity(tool: AgentTool, shellPath: string, fullShellEnv?: Record<string, string>): AgentTool {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // 提取命令参数
      const record = params && typeof params === 'object' ? params as Record<string, unknown> : undefined;
      const command = record?.command;
      
      // 安全检查：验证命令
      if (typeof command === 'string' && command.trim()) {
        // 1. 危险命令检查
        if (isDangerousCommand(command)) {
          throw new Error(`危险命令被拦截: ${command}`);
        }
        
        // 2. 🔥 路径安全检查（严格模式）
        // 使用 assertPathAllowed 检查命令中的所有路径
        checkCommandPathSecurity(command);
      }
      
      // 🔥 应用完整的 shell 环境变量
      // 如果用户没有提供自定义 env，则使用完整的 shell 环境变量
      if (record && !record.env) {
        const env = fullShellEnv ? { ...fullShellEnv } : { ...process.env } as Record<string, string>;
        if (!fullShellEnv) {
          applyShellPath(env, shellPath);
        }
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
  
  // 🔥 从登录 shell 获取完整环境变量
  // 解决 Electron 主进程环境变量不完整的问题（TAVILY_API_KEY 等用户自定义变量缺失）
  const shellEnv = getShellEnvFromLoginShell({
    env: process.env,
    timeoutMs: 15_000,
  });
  
  // 兼容：保留 shellPath 变量供其他地方使用
  const shellPath = shellEnv.PATH || process.env.PATH || '';
  
  // 创建基础工具（使用 pi-coding-agent）
  // 🔥 使用 operations 自定义命令执行，添加阻塞命令检查
  const bashTool = createBashTool(workspaceDir, {
    operations: {
      exec: async (command: string, cwd: string, options: any) => {
        // 🔥 检查是否是阻塞的交互式命令
        if (isBlockingInteractiveCommand(command)) {
          const suggestion = getBlockingCommandSuggestion(command);
          throw new Error(suggestion);
        }
        
        // 🔥 检查工作目录是否安全（严格模式）
        try {
          assertPathAllowed(cwd);
        } catch (error) {
          throw new Error(`工作目录安全检查失败：${error instanceof Error ? error.message : '未知错误'}\n工作目录：${cwd}`);
        }
        
        // 🔥 检查命令中的路径是否安全（严格模式）
        checkCommandPathSecurity(command);
        
        // 🔥 使用完整的 shell 环境变量（包含用户在 .zshrc 中定义的变量）
        const env: Record<string, string> = { ...shellEnv };
        
        // 🔥 Windows 中文编码处理：设置代码页为 UTF-8
        if (process.platform === 'win32') {
          env.CHCP = '65001';
        }
        
        // 🔥 Windows 中文编码处理：在命令前添加 chcp 65001
        let finalCommand = command;
        if (process.platform === 'win32') {
          finalCommand = `chcp 65001 >nul 2>&1 && ${command}`;
        }
        
        // 🔥 使用统一的超时配置
        const timeoutMs = TIMEOUTS.EXEC_TOOL_TIMEOUT;
        const { spawn } = require('node:child_process');
        
        return new Promise((resolve) => {
          const child = spawn(finalCommand, [], {
            cwd,
            env,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: timeoutMs,
          });
          
          child.on('error', (error: Error) => {
            resolve({ exitCode: null });
          });
          
          // 监听输出
          child.stdout?.on('data', (data: Buffer) => {
            // 🔥 Windows 中文编码处理
            let output: string;
            if (process.platform === 'win32') {
              // Windows 使用 GBK 编码，需要转换为 UTF-8
              try {
                // 尝试使用 iconv-lite 转换编码
                const iconv = require('iconv-lite');
                output = iconv.decode(data, 'cp936'); // cp936 是 GBK 编码
              } catch (error) {
                // 如果 iconv-lite 不可用，使用默认处理
                output = data.toString('utf8');
              }
            } else {
              // Unix/Linux/macOS 使用 UTF-8
              output = data.toString('utf8');
            }
            
            // 将字符串转换回 Buffer 传递给 onData
            options.onData(Buffer.from(output, 'utf8'));
          });
          
          child.stderr?.on('data', (data: Buffer) => {
            // 🔥 Windows 中文编码处理
            let output: string;
            if (process.platform === 'win32') {
              // Windows 使用 GBK 编码，需要转换为 UTF-8
              try {
                // 尝试使用 iconv-lite 转换编码
                const iconv = require('iconv-lite');
                output = iconv.decode(data, 'cp936'); // cp936 是 GBK 编码
              } catch (error) {
                // 如果 iconv-lite 不可用，使用默认处理
                output = data.toString('utf8');
              }
            } else {
              // Unix/Linux/macOS 使用 UTF-8
              output = data.toString('utf8');
            }
            
            // 将字符串转换回 Buffer 传递给 onData
            options.onData(Buffer.from(output, 'utf8'));
          });
          
          // 监听取消信号
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              child.kill();
            });
          }
          
          // 监听退出
          child.on('close', (code: number | null, signal: string | null) => {
            resolve({ exitCode: code });
          });
          
          child.on('error', (error: Error) => {
            resolve({ exitCode: null });
          });
        });
      },
    },
  }) as unknown as AgentTool;
  
  // 包装安全检查和 PATH 处理
  const secureBashTool = wrapToolWithSecurity(bashTool, shellPath, shellEnv);
  
  return [secureBashTool];
}
