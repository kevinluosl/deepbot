/**
 * 工具名称常量
 * 
 * 统一管理所有工具的名称，避免硬编码
 * 
 */

export const TOOL_NAMES = {
  // 核心工具
  BROWSER: 'browser',
  
  // 文件操作
  FILE_READ: 'file_read',
  FILE_WRITE: 'file_write',
  FILE_LIST: 'file_list',
  
  // Skill 管理
  SKILL_MANAGER: 'skill_manager',
  
  // 定时任务
  SCHEDULED_TASK: 'scheduled_task',
  
  // 日历
  CALENDAR_GET_EVENTS: 'calendar_get_events',
  CALENDAR_CREATE_EVENT: 'calendar_create_event',
  
  // 图片生成
  IMAGE_GENERATION: 'image_generation',
  
  // Web 搜索
  WEB_SEARCH: 'web_search',
  
  // Web 内容获取
  WEB_FETCH: 'web_fetch',
  
  // 记忆管理
  MEMORY: 'memory',
  
  // 环境检查
  ENVIRONMENT_CHECK: 'environment_check',
  
  // 邮件工具
  SEND_EMAIL: 'send_email',
  
  // API 工具（系统配置访问）
  API_GET_CONFIG: 'api_get_config',
  API_SET_WORKSPACE_CONFIG: 'api_set_workspace_config',
  API_SET_MODEL_CONFIG: 'api_set_model_config',
  API_SET_IMAGE_GENERATION_CONFIG: 'api_set_image_generation_config',
  API_SET_WEB_SEARCH_CONFIG: 'api_set_web_search_config',
  API_GET_NAME: 'api_get_name',
  API_SET_NAME: 'api_set_name',
  
  // 连接器工具
  CONNECTOR_SEND_IMAGE: 'connector_send_image',
  CONNECTOR_SEND_FILE: 'connector_send_file',
  
  // AI 对话工具
  CHAT: 'chat',
  
  // 系统指令工具
  SYSTEM_COMMAND: 'system_command',
  
  // Mock 工具（测试用）
  MOCK_TOOL: 'mock_tool',
  MOCK_LONG_RUNNING: 'mock_long_running',
  MOCK_FAILING: 'mock_failing',
  MOCK_PREFIX: 'mock_',
} as const;

// 导出类型
export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];

/**
 * 判断是否是 Mock 工具
 */
export function isMockTool(toolName: string): boolean {
  return toolName.startsWith(TOOL_NAMES.MOCK_PREFIX);
}

