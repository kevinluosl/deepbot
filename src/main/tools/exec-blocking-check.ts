/**
 * 命令执行检测模块
 * 
 * 职责：
 * - 检测并拦截会阻塞的交互式命令
 * - 提供友好的错误提示和替代方案
 * 
 * 说明：
 * - AI Agent 不应该执行需要用户交互的命令
 * - 拦截这些命令可以避免进程卡住
 */

/**
 * 纯交互式命令列表（会阻塞等待用户输入）
 * 
 * 这些命令会打开交互界面，等待用户操作，不适合 AI Agent 执行
 */
const BLOCKING_INTERACTIVE_COMMANDS = [
  'vim',
  'vi',
  'nano',
  'emacs',
  'less',
  'more',
  'top',
  'htop',
  'ssh',
  'telnet',
  'ftp',
  'mysql',   // 不带参数会进入交互模式
  'psql',    // 不带参数会进入交互模式
  'python',  // 不带参数会进入 REPL
  'node',    // 不带参数会进入 REPL
  'irb',     // Ruby REPL
  'ipython', // Python REPL
];

/**
 * 检查命令是否是会阻塞的纯交互式命令
 * 
 * @param command - 要检查的命令
 * @returns 如果是阻塞命令返回 true
 */
export function isBlockingInteractiveCommand(command: string): boolean {
  const trimmed = command.trim();
  
  // 提取命令的第一个单词（去除路径）
  const firstWord = trimmed.split(/\s+/)[0];
  const commandName = firstWord.split('/').pop() || '';
  
  // 检查是否在黑名单中
  for (const blocked of BLOCKING_INTERACTIVE_COMMANDS) {
    // 精确匹配命令名
    if (commandName === blocked) {
      // 检查是否有有效参数（排除只有文件名的情况）
      const args = trimmed.slice(firstWord.length).trim();
      
      // vim file.txt - 阻塞
      // vim --version - 不阻塞
      // python script.py - 不阻塞
      // python - 阻塞
      
      // 特殊处理：编辑器 + 文件名 = 阻塞
      if (['vim', 'vi', 'nano', 'emacs'].includes(blocked)) {
        // 如果有参数且不是 --help 或 --version，认为是要打开文件
        if (args && !args.startsWith('--help') && !args.startsWith('--version') && !args.startsWith('-h')) {
          return true;
        }
        // 无参数也是阻塞
        if (!args) {
          return true;
        }
      }
      
      // 特殊处理：监控工具（top、htop）总是阻塞
      if (['top', 'htop', 'less', 'more'].includes(blocked)) {
        return true;
      }
      
      // 特殊处理：REPL（无参数时阻塞）
      if (['python', 'node', 'irb', 'ipython', 'mysql', 'psql'].includes(blocked)) {
        if (!args) {
          return true;
        }
      }
      
      // 特殊处理：远程连接总是阻塞
      if (['ssh', 'telnet', 'ftp'].includes(blocked)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 获取阻塞命令的友好提示
 * 
 * @param command - 被阻塞的命令
 * @returns 友好的错误提示
 */
export function getBlockingCommandSuggestion(command: string): string {
  const trimmed = command.trim();
  const firstWord = trimmed.split(/\s+/)[0];
  const commandName = firstWord.split('/').pop() || '';
  
  const suggestions: Record<string, string> = {
    vim: '使用文件工具读写文件，或使用 `cat`、`echo` 等非交互式命令',
    vi: '使用文件工具读写文件，或使用 `cat`、`echo` 等非交互式命令',
    nano: '使用文件工具读写文件，或使用 `cat`、`echo` 等非交互式命令',
    emacs: '使用文件工具读写文件，或使用 `cat`、`echo` 等非交互式命令',
    less: '使用 `cat` 或 `head`/`tail` 查看文件内容',
    more: '使用 `cat` 或 `head`/`tail` 查看文件内容',
    top: '使用 `ps aux` 查看进程列表',
    htop: '使用 `ps aux` 查看进程列表',
    python: '使用 `python script.py` 执行脚本，或使用 `python -c "code"` 执行代码',
    node: '使用 `node script.js` 执行脚本',
    mysql: '使用 `mysql -e "SQL"` 执行 SQL 语句',
    psql: '使用 `psql -c "SQL"` 执行 SQL 语句',
    ssh: 'SSH 连接需要交互式操作，AI Agent 无法执行',
    telnet: 'Telnet 连接需要交互式操作，AI Agent 无法执行',
    ftp: 'FTP 连接需要交互式操作，AI Agent 无法执行',
  };
  
  const suggestion = suggestions[commandName] || '使用非交互式命令替代';
  
  return `命令被拦截：\`${command}\` 是交互式命令，会阻塞等待用户输入。\n\n建议：${suggestion}`;
}
