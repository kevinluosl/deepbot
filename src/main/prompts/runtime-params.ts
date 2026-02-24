/**
 * 运行时参数构建器
 * 
 * 
 * 职责：
 * - 构建运行时信息
 * - 获取用户时区和时间
 * - 提供系统信息
 */

import os from 'os';
import type { RuntimeInfo, RuntimeParams } from '../../types/prompt';

/**
 * 获取用户时区
 */
function getUserTimezone(): string {
  try {
    // 尝试从 Intl API 获取时区
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // 降级到默认时区
    return 'Asia/Shanghai';
  }
}

/**
 * 格式化当前时间
 */
function formatCurrentTime(timezone: string): string {
  try {
    const now = new Date();
    return now.toLocaleString('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    // 降级到 ISO 格式
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }
}

/**
 * 构建运行时参数
 * 
 * @param params 参数
 * @returns 运行时参数
 */
export function buildRuntimeParams(params: {
  agentId?: string;
  model: string;
  sessionId?: string;
}): RuntimeParams {
  const userTimezone = getUserTimezone();
  const userTime = formatCurrentTime(userTimezone);

  const runtimeInfo: RuntimeInfo = {
    agentId: params.agentId,
    model: params.model,
    sessionId: params.sessionId,
    os: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
  };

  return {
    runtimeInfo,
    userTimezone,
    userTime,
  };
}

/**
 * 构建运行时信息行
 * 
 * 用于在提示词中显示运行时信息
 */
export function buildRuntimeLine(runtimeInfo: RuntimeInfo): string {
  const parts: string[] = [];

  if (runtimeInfo.agentId) {
    parts.push(`agent=${runtimeInfo.agentId}`);
  }

  parts.push(`model=${runtimeInfo.model}`);

  if (runtimeInfo.sessionId) {
    parts.push(`session=${runtimeInfo.sessionId}`);
  }

  if (runtimeInfo.os) {
    parts.push(`os=${runtimeInfo.os}`);
  }

  if (runtimeInfo.nodeVersion) {
    parts.push(`node=${runtimeInfo.nodeVersion}`);
  }

  return `Runtime: ${parts.join(' | ')}`;
}
