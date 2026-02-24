/**
 * Browser 常量定义
 * 
 */

import { TIMEOUTS } from '../config/timeouts';

// 默认浏览器控制端口
export const DEFAULT_BROWSER_CONTROL_PORT = 18791;

// 默认 CDP 端口
export const DEFAULT_CDP_PORT = 9222;

// 默认浏览器颜色
export const DEFAULT_BROWSER_COLOR = '#0066CC';

// 默认 Profile 名称
export const DEFAULT_PROFILE_NAME = 'deepbot';

// AI 快照最大字符数
export const DEFAULT_AI_SNAPSHOT_MAX_CHARS = 50000;

// 默认超时时间（毫秒）- 使用统一配置
export const DEFAULT_BROWSER_TIMEOUT_MS = TIMEOUTS.BROWSER_DEFAULT_TIMEOUT;

// 默认导航超时时间（毫秒）- 使用统一配置
export const DEFAULT_NAVIGATION_TIMEOUT_MS = TIMEOUTS.BROWSER_NAVIGATION_TIMEOUT;

// 默认操作超时时间（毫秒）- 使用统一配置
export const DEFAULT_ACTION_TIMEOUT_MS = TIMEOUTS.BROWSER_ACTION_TIMEOUT;
