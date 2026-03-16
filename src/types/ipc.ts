/**
 * IPC 通信类型定义
 */

import { Message } from './message';

// IPC 频道名称
export const IPC_CHANNELS = {
  // 消息相关
  SEND_MESSAGE: 'message:send',
  MESSAGE_RESPONSE: 'message:response',
  MESSAGE_STREAM: 'message:stream',
  MESSAGE_ERROR: 'message:error',
  MESSAGE_RECEIVED: 'message:received', // 消息接收通知
  MESSAGES_LOADED: 'message:messages-loaded', // 消息加载通知
  STOP_GENERATION: 'message:stop', // 停止生成
  EXECUTION_STEP_UPDATE: 'message:execution-step-update', // 执行步骤更新
  CLEAR_ALL_MESSAGES: 'message:clear-all', // 清空所有消息
  
  // 任务监控
  TASK_MAIN_CREATED: 'task-monitor:main-task-created',
  TASK_MAIN_UPDATED: 'task-monitor:main-task-updated',
  TASK_SUB_ADDED: 'task-monitor:sub-task-added',
  TASK_SUB_UPDATED: 'task-monitor:sub-task-updated',
  TASKS_CLEARED: 'task-monitor:tasks-cleared',
  
  // Skill 管理器
  SKILL_MANAGER: 'skill-manager',
  
  // 定时任务管理
  SCHEDULED_TASK: 'scheduled-task',
  
  // 环境检查
  ENVIRONMENT_CHECK: 'environment-check',
  
  // 工作目录配置
  GET_WORKSPACE_SETTINGS: 'workspace:get-settings',
  GET_DEFAULT_WORKSPACE_SETTINGS: 'workspace:get-default-settings',
  SAVE_WORKSPACE_SETTINGS: 'workspace:save-settings',
  ADD_SKILL_DIR: 'workspace:add-skill-dir',
  REMOVE_SKILL_DIR: 'workspace:remove-skill-dir',
  SET_DEFAULT_SKILL_DIR: 'workspace:set-default-skill-dir',
  
  // 模型配置
  GET_MODEL_CONFIG: 'model-config:get',
  SAVE_MODEL_CONFIG: 'model-config:save',
  TEST_MODEL_CONFIG: 'model-config:test',
  
  // 图片读取
  READ_IMAGE: 'image:read',
  
  // 图片上传
  UPLOAD_IMAGE: 'image:upload',
  
  // 文件上传
  UPLOAD_FILE: 'file:upload',
  
  // 删除临时文件
  DELETE_TEMP_FILE: 'file:delete-temp',
  
  // 工具配置
  GET_IMAGE_GENERATION_TOOL_CONFIG: 'tool-config:image-generation:get',
  SAVE_IMAGE_GENERATION_TOOL_CONFIG: 'tool-config:image-generation:save',
  GET_WEB_SEARCH_TOOL_CONFIG: 'tool-config:web-search:get',
  SAVE_WEB_SEARCH_TOOL_CONFIG: 'tool-config:web-search:save',
  
  // 浏览器工具
  LAUNCH_CHROME_WITH_DEBUG: 'browser:launch-chrome-with-debug',
  
  // 名字配置
  GET_NAME_CONFIG: 'name-config:get',
  GET_TAB_AGENT_NAME: 'name-config:get-tab-agent-name',
  SAVE_AGENT_NAME: 'name-config:save-agent-name',
  SAVE_USER_NAME: 'name-config:save-user-name',
  NAME_CONFIG_UPDATED: 'name-config:updated', // 🔥 名字配置更新通知
  MODEL_CONFIG_UPDATED: 'model-config:updated', // 🔥 模型配置更新通知
  
  // Agent Tab 管理
  CREATE_TAB: 'tab:create',
  CLOSE_TAB: 'tab:close',
  GET_TABS: 'tab:get-all',
  SWITCH_TAB: 'tab:switch',
  TABS_UPDATED: 'tab:tabs-updated', // Tab 列表更新通知
  TAB_CREATED: 'tab:created', // Tab 创建通知
  TAB_HISTORY_LOADED: 'tab:history-loaded', // Tab 历史消息加载通知
  TAB_MESSAGES_CLEARED: 'tab:messages-cleared', // Tab 消息清除通知
  
  // 连接器管理
  CONNECTOR_GET_ALL: 'connector:get-all',
  CONNECTOR_GET_CONFIG: 'connector:get-config',
  CONNECTOR_SAVE_CONFIG: 'connector:save-config',
  CONNECTOR_START: 'connector:start',
  CONNECTOR_STOP: 'connector:stop',
  CONNECTOR_HEALTH_CHECK: 'connector:health-check',
  CONNECTOR_GET_PAIRING_RECORDS: 'connector:get-pairing-records',
  CONNECTOR_APPROVE_PAIRING: 'connector:approve-pairing',
  CONNECTOR_DELETE_PAIRING: 'connector:delete-pairing',
  
  // 应用信息
} as const;

// 发送消息请求
export interface SendMessageRequest {
  content: string;
  sessionId?: string;
}

// 消息响应
export interface MessageResponse {
  message: Message;
  sessionId: string;
}

// 流式消息
export interface StreamMessageChunk {
  messageId: string;
  content: string;
  done: boolean;
  executionSteps?: import('./message').ExecutionStep[]; // 执行步骤
  totalDuration?: number; // 总执行时间（毫秒）
  sentAt?: number; // 发送时间（毫秒时间戳）
}

// 错误响应
export interface ErrorResponse {
  error: string;
  code?: string;
}

// 停止生成请求
export interface StopGenerationRequest {
  sessionId?: string;
}

// 定时任务请求
export interface ScheduledTaskRequest {
  action: 'create' | 'list' | 'delete' | 'pause' | 'resume' | 'trigger' | 'history';
  name?: string;
  description?: string;
  schedule?: {
    type: 'once' | 'interval' | 'cron';
    executeAt?: number;
    intervalMs?: number;
    startAt?: number;
    cronExpr?: string;
    timezone?: string;
  };
  taskId?: string;
  enabled?: boolean;
  limit?: number;
}

// 定时任务响应
export interface ScheduledTaskResponse {
  success: boolean;
  message?: string;
  task?: any;
  tasks?: any[];
  count?: number;
  executions?: any[];
}

// 工作目录配置
export interface WorkspaceSettings {
  workspaceDir: string;    // 默认工作目录（必须设置，所有操作限制在此目录及其子目录）
  scriptDir: string;       // Python 脚本目录
  skillDirs: string[];     // Skill 目录列表（支持多个路径）
  defaultSkillDir: string; // 默认 Skill 目录
  imageDir: string;        // 图片生成目录
}

export interface GetWorkspaceSettingsResponse {
  success: boolean;
  settings?: WorkspaceSettings;
  error?: string;
}

export interface SaveWorkspaceSettingsRequest {
  settings: WorkspaceSettings;
}

export interface SaveWorkspaceSettingsResponse {
  success: boolean;
  error?: string;
}

// 添加 Skill 目录
export interface AddSkillDirRequest {
  dir: string;
}

export interface AddSkillDirResponse {
  success: boolean;
  settings?: WorkspaceSettings;
  error?: string;
}

// 删除 Skill 目录
export interface RemoveSkillDirRequest {
  dir: string;
}

export interface RemoveSkillDirResponse {
  success: boolean;
  settings?: WorkspaceSettings;
  error?: string;
}

// 设置默认 Skill 目录
export interface SetDefaultSkillDirRequest {
  dir: string;
}

export interface SetDefaultSkillDirResponse {
  success: boolean;
  settings?: WorkspaceSettings;
  error?: string;
}

// 模型配置
export interface ModelConfig {
  providerType: 'qwen' | 'deepseek' | 'gemini' | 'minimax' | 'custom'; // 提供商类型（用于 UI 下拉选择）
  providerId: string;
  providerName: string;
  baseUrl: string;
  modelId: string;         // 模型 ID（主模型）
  apiType: string;         // API 类型（'openai-completions' | 'google-generative-ai'）
  modelId2?: string;       // 模型 ID 2（快速模型，选填，用于轻量级任务）
  apiKey: string;
  contextWindow?: number;  // 上下文窗口大小（tokens）
  lastFetched?: number;    // 最后获取时间（时间戳）
}

export interface GetModelConfigResponse {
  success: boolean;
  config?: ModelConfig;
  error?: string;
}

export interface SaveModelConfigRequest {
  config: ModelConfig;
}

export interface SaveModelConfigResponse {
  success: boolean;
  error?: string;
}

export interface TestModelConfigRequest {
  config: ModelConfig;
}

export interface TestModelConfigResponse {
  success: boolean;
  error?: string;
}

// 读取图片
export interface ReadImageRequest {
  path: string;
}

export interface ReadImageResponse {
  success: boolean;
  data?: string; // base64 data URL
  error?: string;
}

// 上传图片
export interface UploadImageRequest {
  name: string;
  dataUrl: string; // base64 data URL
  size: number;
}

export interface UploadImageResponse {
  success: boolean;
  image?: {
    id: string;
    path: string; // 临时文件路径
    name: string;
    size: number;
    dataUrl: string;
  };
  error?: string;
}

// 上传文件
export interface UploadFileRequest {
  name: string;
  dataUrl: string; // base64 data URL
  size: number;
  type: string; // MIME 类型
}

export interface UploadFileResponse {
  success: boolean;
  file?: {
    id: string;
    path: string; // 临时文件路径
    name: string;
    size: number;
    type: string;
  };
  error?: string;
}

// 删除临时文件
export interface DeleteTempFileRequest {
  path: string; // 临时文件路径
}

export interface DeleteTempFileResponse {
  success: boolean;
  error?: string;
}

// 名字配置
export interface NameConfig {
  agentName: string;
  userName: string;
}

export interface GetNameConfigResponse {
  success: boolean;
  config?: NameConfig;
  error?: string;
}

export interface SaveAgentNameRequest {
  agentName: string;
}

export interface SaveAgentNameResponse {
  success: boolean;
  error?: string;
}

export interface SaveUserNameRequest {
  userName: string;
}

export interface SaveUserNameResponse {
  success: boolean;
  error?: string;
}

// 连接器管理
export interface GetAllConnectorsResponse {
  success: boolean;
  connectors?: Array<{
    id: string;
    name: string;
    version: string;
    enabled: boolean;
    hasConfig: boolean;
  }>;
  error?: string;
}

export interface GetConnectorConfigRequest {
  connectorId: string;
}

export interface GetConnectorConfigResponse {
  success: boolean;
  config?: any;
  enabled?: boolean;
  error?: string;
}

export interface SaveConnectorConfigRequest {
  connectorId: string;
  config: any;
  enabled?: boolean;
}

export interface SaveConnectorConfigResponse {
  success: boolean;
  error?: string;
}

export interface StartConnectorRequest {
  connectorId: string;
}

export interface StartConnectorResponse {
  success: boolean;
  error?: string;
}

export interface StopConnectorRequest {
  connectorId: string;
}

export interface StopConnectorResponse {
  success: boolean;
  error?: string;
}

export interface HealthCheckConnectorRequest {
  connectorId: string;
}

export interface HealthCheckConnectorResponse {
  success: boolean;
  status?: 'healthy' | 'unhealthy';
  message?: string;
  error?: string;
}

export interface GetPairingRecordsRequest {
  connectorId?: string;
}

export interface GetPairingRecordsResponse {
  success: boolean;
  records?: Array<{
    connectorId: string;
    userId: string;
    pairingCode: string;
    approved: boolean;
    createdAt: number;
    approvedAt?: number;
  }>;
  error?: string;
}

export interface ApprovePairingRequest {
  pairingCode: string;
}

export interface ApprovePairingResponse {
  success: boolean;
  error?: string;
}

export interface DeletePairingRequest {
  connectorId: string;
  userId: string;
}

export interface DeletePairingResponse {
  success: boolean;
  error?: string;
}
