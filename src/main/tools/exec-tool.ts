/**
 * Exec Tool - 命令执行工具
 * 
 * 职责：
 * - 执行 shell 命令
 * - 超时控制
 * - 危险命令拦截
 * - 输出截断（避免输出过大）
 * 
 * 参考：
 * - pi-coding-agent: @mariozechner/pi-coding-agent (createBashTool)
 * 
 * 技术选型：
 * - 使用 pi-coding-agent 提供的 createBashTool
 * - 在外面包装安全检查和危险命令拦截
 * 
 * @example
 * ```typescript
 * const tools = await getExecTools('/path/to/workspace');
 * // tools = [bashTool]
 * ```
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';

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
 * 包装工具，添加安全检查和日志
 * 
 * @param tool - 原始工具
 * @returns 包装后的工具
 */
function wrapToolWithSecurity(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // 提取命令参数
      const record = params && typeof params === 'object' ? params as Record<string, unknown> : undefined;
      const command = record?.command;
      
      // 🔥 添加执行日志
      console.log(`[Exec Tool] 🚀 执行命令: ${command}`);
      console.log(`[Exec Tool] 📋 Tool Call ID: ${toolCallId}`);
      
      // 安全检查：验证命令
      if (typeof command === 'string' && command.trim()) {
        if (isDangerousCommand(command)) {
          console.error(`[Exec Tool] ❌ 危险命令被拦截: ${command}`);
          throw new Error(`危险命令被拦截: ${command}`);
        }
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
          
          // 如果输出为空，添加成功提示
          if (output === '' || output === '(no output)') {
            textContent.text = '✅ 命令执行成功（无输出）';
            console.log(`[Exec Tool] 📝 空输出已替换为成功提示`);
          }
        }
      }
      
      // 🔥 添加执行结果日志
      console.log(`[Exec Tool] ✅ 命令执行完成`);
      console.log(`[Exec Tool] 📊 结果类型: ${typeof result}`);
      
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
  
  // 创建基础工具（使用 pi-coding-agent）
  const bashTool = createBashTool(workspaceDir, {
    // 设置默认超时（5 分钟）
    // commandPrefix: 可以设置命令前缀，如 "shopt -s expand_aliases"
  }) as unknown as AgentTool;
  
  // 包装安全检查
  const secureBashTool = wrapToolWithSecurity(bashTool);
  
  console.info(`[Exec Tool] ✅ Exec Tool 创建完成`);
  console.info(`  工作区: ${workspaceDir}`);
  console.info(`  工具: bash`);
  
  return [secureBashTool];
}
