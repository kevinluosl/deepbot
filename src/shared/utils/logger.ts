/**
 * 统一的日志工具
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  debug(message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`[${this.module}] 🔍 ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      console.info(`[${this.module}] ℹ️  ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[${this.module}] ⚠️  ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[${this.module}] ❌ ${message}`, ...args);
    }
  }
}

/**
 * 创建日志记录器
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

/**
 * 全局日志级别设置
 */
let globalLogLevel = LogLevel.INFO;

export function setGlobalLogLevel(level: LogLevel) {
  globalLogLevel = level;
}

export function getGlobalLogLevel(): LogLevel {
  return globalLogLevel;
}

