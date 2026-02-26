/**
 * 超时配置（毫秒）
 * 
 * 注意：
 * - 主 Agent 和 Sub Agent 都使用"软超时"机制（通过 AbortSignal）
 * - 超时不会强制中断执行，而是通知工具可以取消
 * - 工具可以选择响应或忽略取消信号
 */
export const TIMEOUTS = {
  // Agent 相关
  AGENT_MESSAGE_TIMEOUT: 30 * 60 * 1000,       // 30 分钟（主 Agent 消息超时，支持长任务）
  SUBAGENT_LONG_TASK_THRESHOLD: 30 * 1000,     // 30 秒（长任务阈值，用于日志提示）
  
  // 浏览器相关
  BROWSER_DEFAULT_TIMEOUT: 30 * 1000,          // 30 秒
  BROWSER_NAVIGATION_TIMEOUT: 30 * 1000,       // 30 秒
  BROWSER_ACTION_TIMEOUT: 10 * 1000,           // 10 秒
  BROWSER_SNAPSHOT_TIMEOUT: 5 * 1000,          // 5 秒（快照生成）
  BROWSER_NETWORK_IDLE_TIMEOUT: 3 * 1000,      // 3 秒（网络空闲等待）
  BROWSER_WAIT_NAVIGATION_TIMEOUT: 10 * 1000,  // 10 秒（等待导航）
  BROWSER_CLIENT_NAVIGATE_TIMEOUT: 15 * 1000,  // 15 秒（客户端导航）
  BROWSER_CLIENT_SNAPSHOT_TIMEOUT: 15 * 1000,  // 15 秒（客户端快照）
  BROWSER_CLIENT_CONTENT_TIMEOUT: 10 * 1000,   // 10 秒（客户端内容获取）
  BROWSER_CLIENT_CONSOLE_TIMEOUT: 20 * 1000,   // 20 秒（客户端控制台）
  BROWSER_CLIENT_TAB_TIMEOUT: 5 * 1000,        // 5 秒（客户端标签操作）
  
  // HTTP 请求相关
  HTTP_REQUEST_TIMEOUT: 5 * 1000,              // 5 秒
  HTTP_START_TIMEOUT: 30 * 1000,               // 30 秒（启动操作）
  HTTP_STOP_TIMEOUT: 15 * 1000,                // 15 秒（停止操作）
  
  // 环境检查
  COMMAND_EXECUTION_TIMEOUT: 5 * 1000,         // 5 秒
  
  // 图片生成
  IMAGE_GENERATION_TIMEOUT: 60 * 1000,         // 60 秒
  
  // Web 搜索
  WEB_SEARCH_TIMEOUT: 30 * 1000,               // 30 秒
  
  // 会话管理
  SESSION_CLEANUP_TIMEOUT: 30 * 60 * 1000,     // 30 分钟
  SESSION_ARCHIVE_AFTER: 60 * 60 * 1000,       // 1 小时
  SESSION_SWEEP_INTERVAL: 60 * 1000,           // 1 分钟
} as const;

/**
 * 从环境变量加载超时配置（可选）
 */
export function loadTimeoutConfig() {
  return {
    AGENT_MESSAGE_TIMEOUT: 
      parseInt(process.env.AGENT_MESSAGE_TIMEOUT || '') || TIMEOUTS.AGENT_MESSAGE_TIMEOUT,
    SUBAGENT_LONG_TASK_THRESHOLD:
      parseInt(process.env.SUBAGENT_LONG_TASK_THRESHOLD || '') || TIMEOUTS.SUBAGENT_LONG_TASK_THRESHOLD,
    BROWSER_DEFAULT_TIMEOUT:
      parseInt(process.env.BROWSER_DEFAULT_TIMEOUT || '') || TIMEOUTS.BROWSER_DEFAULT_TIMEOUT,
    BROWSER_NAVIGATION_TIMEOUT:
      parseInt(process.env.BROWSER_NAVIGATION_TIMEOUT || '') || TIMEOUTS.BROWSER_NAVIGATION_TIMEOUT,
    BROWSER_ACTION_TIMEOUT:
      parseInt(process.env.BROWSER_ACTION_TIMEOUT || '') || TIMEOUTS.BROWSER_ACTION_TIMEOUT,
    SESSION_CLEANUP_TIMEOUT:
      parseInt(process.env.SESSION_CLEANUP_TIMEOUT || '') || TIMEOUTS.SESSION_CLEANUP_TIMEOUT,
    SESSION_ARCHIVE_AFTER:
      parseInt(process.env.SESSION_ARCHIVE_AFTER || '') || TIMEOUTS.SESSION_ARCHIVE_AFTER,
    SESSION_SWEEP_INTERVAL:
      parseInt(process.env.SESSION_SWEEP_INTERVAL || '') || TIMEOUTS.SESSION_SWEEP_INTERVAL,
  };
}
