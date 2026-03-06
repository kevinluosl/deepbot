/**
 * 统一的日志工具
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { expandUserPath } from './path-utils';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private module: string;
  private static logDir: string = expandUserPath('~/.deepbot/logs');
  private static logFile: string = join(Logger.logDir, 'deepbot.log');
  private static initialized: boolean = false;

  constructor(module: string) {
    this.module = module;
    Logger.initializeLogFile();
  }

  private static initializeLogFile() {
    if (Logger.initialized) return;
    
    try {
      // 确保日志目录存在
      if (!existsSync(Logger.logDir)) {
        mkdirSync(Logger.logDir, { recursive: true });
      }
      
      // 在应用启动时写入分隔符
      const startupMessage = `\n=== DeepBot 启动 ${new Date().toISOString()} ===\n`;
      appendFileSync(Logger.logFile, startupMessage);
      
      Logger.initialized = true;
    } catch (error) {
      console.error('初始化日志文件失败:', error);
    }
  }

  private writeToFile(level: string, message: string, ...args: any[]) {
    try {
      const timestamp = new Date().toISOString();
      const argsStr = args.length > 0 ? ' ' + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ') : '';
      
      const logEntry = `[${timestamp}] [${level}] [${this.module}] ${message}${argsStr}\n`;
      appendFileSync(Logger.logFile, logEntry);
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  /**
   * 安全地写入控制台（捕获 EPIPE 错误）
   */
  private safeConsoleLog(method: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]) {
    try {
      console[method](`[${this.module}] ${message}`, ...args);
    } catch (error: any) {
      // 忽略 EPIPE 错误（应用退出时管道关闭）
      if (error?.code !== 'EPIPE') {
        // 其他错误写入文件
        this.writeToFile('ERROR', `Console write failed: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  debug(message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      this.safeConsoleLog('debug', `🔍 ${message}`, ...args);
      this.writeToFile('DEBUG', message, ...args);
    }
  }

  info(message: string, ...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      this.safeConsoleLog('info', `ℹ️  ${message}`, ...args);
      this.writeToFile('INFO', message, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.level <= LogLevel.WARN) {
      this.safeConsoleLog('warn', `⚠️  ${message}`, ...args);
      this.writeToFile('WARN', message, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      this.safeConsoleLog('error', `❌ ${message}`, ...args);
      this.writeToFile('ERROR', message, ...args);
    }
  }

  /**
   * 获取日志文件路径
   */
  static getLogFilePath(): string {
    return Logger.logFile;
  }

  /**
   * 清理旧日志文件（保留最近7天）
   */
  static cleanupOldLogs() {
    // TODO: 实现日志清理逻辑
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

/**
 * 获取日志文件路径
 */
export function getLogFilePath(): string {
  return Logger.getLogFilePath();
}

