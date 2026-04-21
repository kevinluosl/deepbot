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
  API_SET_FEISHU_CONNECTOR_CONFIG: 'api_set_feishu_connector_config',
  API_SET_CONNECTOR_ENABLED: 'api_set_connector_enabled',
  API_SET_TOOL_ENABLED: 'api_set_tool_enabled',
  API_GET_PAIRING_RECORDS: 'api_get_pairing_records',
  API_APPROVE_PAIRING: 'api_approve_pairing',
  API_REJECT_PAIRING: 'api_reject_pairing',
  API_GET_TABS: 'api_get_tabs',
  API_GET_NAME: 'api_get_name',
  API_SET_NAME: 'api_set_name',
  API_GET_SESSION_FILE_PATH: 'api_get_session_file_path',
  API_GET_DATETIME: 'api_get_datetime',
  
  // 连接器工具
  FEISHU_SEND_IMAGE: 'feishu_send_image',
  FEISHU_SEND_FILE: 'feishu_send_file',
  FEISHU_SEND_MESSAGE: 'feishu_send_message',

  // 微信工具
  WECHAT_SEND_MESSAGE: 'wechat_send_message',
  WECHAT_SEND_IMAGE: 'wechat_send_image',
  WECHAT_SEND_FILE: 'wechat_send_file',
  
  // 飞书云文档工具
  FEISHU_DOC_CREATE: 'feishu_doc_create',
  FEISHU_DOC_GET: 'feishu_doc_get',
  FEISHU_DOC_APPEND: 'feishu_doc_append',
  FEISHU_DOC_UPDATE_BLOCK: 'feishu_doc_update_block',
  FEISHU_DOC_DELETE_BLOCKS: 'feishu_doc_delete_blocks',
  FEISHU_DOC_DELETE_FILE: 'feishu_doc_delete_file',
  FEISHU_DOC_GET_BLOCKS: 'feishu_doc_get_blocks',
  FEISHU_DOC_ADD_COMMENT: 'feishu_doc_add_comment',
  FEISHU_DRIVE_DOWNLOAD: 'feishu_drive_download',
  FEISHU_DOC_INSERT_RICH_BLOCKS: 'feishu_doc_insert_rich_blocks',
  
  // AI 对话工具
  CHAT: 'chat',
  
  // 跨 Tab 调用工具
  CROSS_TAB_CALL: 'cross_tab_call',
  
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

