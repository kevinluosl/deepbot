/**
 * 日期时间工具
 * 
 * 统一管理时区获取、时间格式化等功能
 */

/**
 * 获取系统时区
 * 
 * @returns 系统时区字符串（如：Asia/Shanghai）
 */
export function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // 降级到默认时区
    return 'Asia/Shanghai';
  }
}

/**
 * 计算时区偏移信息
 * 
 * @param date 日期对象
 * @returns 时区偏移信息
 */
export function getTimezoneOffset(date: Date = new Date()) {
  const timezoneOffset = date.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
  const offsetMinutes = Math.abs(timezoneOffset) % 60;
  const offsetSign = timezoneOffset <= 0 ? '+' : '-';
  const offsetString = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
  
  return {
    offsetMinutes: timezoneOffset,
    offsetHours,
    offsetSign,
    offsetString,
  };
}

/**
 * 时间格式化选项
 */
export interface DateTimeFormatOptions {
  /** 时区 */
  timezone?: string;
  /** 语言 */
  locale?: string;
  /** 是否包含星期 */
  includeWeekday?: boolean;
  /** 是否使用 12 小时制 */
  hour12?: boolean;
}

/**
 * 格式化当前时间（简单格式）
 * 
 * @param options 格式化选项
 * @returns 格式化后的时间字符串
 */
export function formatCurrentTime(options: DateTimeFormatOptions = {}): string {
  const {
    timezone = getSystemTimezone(),
    locale = 'zh-CN',
    hour12 = false,
  } = options;

  try {
    const now = new Date();
    return now.toLocaleString(locale, {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12,
    });
  } catch {
    // 降级到 ISO 格式
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }
}

/**
 * 格式化日期（仅日期部分）
 * 
 * @param options 格式化选项
 * @returns 格式化后的日期字符串
 */
export function formatCurrentDate(options: DateTimeFormatOptions = {}): string {
  const {
    timezone = getSystemTimezone(),
    locale = 'zh-CN',
    includeWeekday = false,
  } = options;

  try {
    const now = new Date();
    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };

    if (includeWeekday) {
      formatOptions.weekday = 'long';
    }

    return now.toLocaleDateString(locale, formatOptions);
  } catch {
    // 降级到简单格式
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * 格式化时间（仅时间部分）
 * 
 * @param options 格式化选项
 * @returns 格式化后的时间字符串
 */
export function formatCurrentTimeOnly(options: DateTimeFormatOptions = {}): string {
  const {
    timezone = getSystemTimezone(),
    locale = 'zh-CN',
    hour12 = false,
  } = options;

  try {
    const now = new Date();
    return now.toLocaleTimeString(locale, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12,
    });
  } catch {
    // 降级到简单格式
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  }
}

/**
 * 获取详细的日期时间信息
 * 
 * @param options 格式化选项
 * @returns 详细的日期时间信息
 */
export function getDetailedDateTime(options: DateTimeFormatOptions = {}) {
  const now = new Date();
  const timezone = options.timezone || getSystemTimezone();
  const offsetInfo = getTimezoneOffset(now);

  return {
    timestamp: now.getTime(),
    iso: now.toISOString(),
    timezone,
    ...offsetInfo,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
    weekday: now.getDay(),
    formatted: {
      full: formatCurrentTime({ ...options, timezone }),
      date: formatCurrentDate({ ...options, timezone, includeWeekday: true }),
      time: formatCurrentTimeOnly({ ...options, timezone }),
      datetime: formatCurrentTime({ ...options, timezone }),
    },
  };
}