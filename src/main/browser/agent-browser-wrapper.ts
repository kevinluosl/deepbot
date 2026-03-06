/**
 * agent-browser CLI 包装器
 * 
 * 职责：
 * - 封装 agent-browser CLI 调用
 * - 提供类型安全的接口
 * - 处理命令执行和输出解析
 * - 支持无头模式和 CDP 连接模式
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync } from 'fs';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { createLogger } from '../../shared/utils/logger';
import { TIMEOUTS } from '../config/timeouts';

const execAsync = promisify(exec);
const logger = createLogger('AgentBrowser');

/**
 * Snapshot 结果接口
 */
export interface SnapshotResult {
  /** 页面标题 */
  title?: string;
  
  /** 页面 URL */
  url?: string;
  
  /** 可交互元素列表 */
  elements?: Array<{
    ref: string;
    role: string;
    name?: string;
    value?: string;
  }>;
  
  /** 原始输出 */
  raw?: string;
}

/**
 * 命令执行选项
 */
interface ExecuteOptions {
  /** 是否返回 JSON 格式 */
  json?: boolean;
  
  /** 超时时间（毫秒） */
  timeout?: number;
  
  /** Session ID */
  sessionId?: string;
}

/**
 * CDP 连接选项
 */
export interface CDPOptions {
  /** CDP 端口或 WebSocket URL */
  port?: number;
  url?: string;
}

/**
 * agent-browser CLI 包装器
 */
export class AgentBrowserWrapper {
  private sessionId?: string;
  private cdpOptions?: CDPOptions;
  
  constructor(sessionId?: string, cdpOptions?: CDPOptions) {
    this.sessionId = sessionId;
    this.cdpOptions = cdpOptions;
  }
  
  /**
   * 获取 agent-browser 可执行文件路径
   */
  private getAgentBrowserPath(): string {
    // 记录环境信息
    logger.info(`环境检测 - NODE_ENV: ${process.env.NODE_ENV}, VITE_DEV_SERVER_URL: ${process.env.VITE_DEV_SERVER_URL}`);
    logger.info(`进程信息 - PID: ${process.pid}, CWD: ${process.cwd()}`);
    logger.info(`资源路径 - resourcesPath: ${process.resourcesPath}`);
    
    // 开发环境：使用 npx
    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
      logger.info('开发环境，使用 npx agent-browser');
      return 'npx agent-browser';
    }
    
    // 生产环境：直接调用可执行文件
    const platform = process.platform;
    const arch = process.arch;
    
    logger.info(`生产环境检测 - Platform: ${platform}, Arch: ${arch}`);
    
    // 确定可执行文件名
    let executableName: string;
    if (platform === 'win32') {
      executableName = 'agent-browser-win32-x64.exe';
    } else if (platform === 'darwin') {
      executableName = arch === 'arm64' ? 'agent-browser-darwin-arm64' : 'agent-browser-darwin-x64';
    } else {
      // Linux
      executableName = arch === 'arm64' ? 'agent-browser-linux-arm64' : 'agent-browser-linux-x64';
    }
    
    // 在 asar: false 的情况下，文件直接在 app 目录中
    const resourcesPath = process.resourcesPath || process.cwd();
    logger.info(`Resources path: ${resourcesPath}`);
    
    // 尝试多个可能的路径
    const possiblePaths = [
      // asar: false 的标准路径
      join(resourcesPath, 'app', 'node_modules', 'agent-browser', 'bin', executableName),
      // 备选路径
      join(resourcesPath, 'node_modules', 'agent-browser', 'bin', executableName),
      // 相对于当前工作目录
      join(process.cwd(), 'node_modules', 'agent-browser', 'bin', executableName),
    ];
    
    logger.info(`尝试查找可执行文件: ${executableName}`);
    
    for (const executablePath of possiblePaths) {
      logger.info(`检查路径: ${executablePath}`);
      const exists = existsSync(executablePath);
      logger.info(`路径存在: ${exists}`);
      
      if (exists) {
        // 检查文件权限
        try {
          const stats = require('fs').statSync(executablePath);
          logger.info(`文件权限: ${stats.mode.toString(8)}, 大小: ${stats.size} bytes`);
        } catch (error) {
          logger.warn(`无法获取文件信息: ${getErrorMessage(error)}`);
        }
        
        logger.info(`✅ 找到可执行文件: ${executablePath}`);
        return `"${executablePath}"`;
      }
    }
    
    // 如果都找不到，尝试使用系统 PATH 中的 agent-browser
    logger.warn('⚠️ 未找到可执行文件，尝试系统 PATH');
    return 'agent-browser';
  }

  /**
   * 执行 agent-browser 命令
   */
  private async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<string> {
    const sessionFlag = options.sessionId || this.sessionId 
      ? `--session ${options.sessionId || this.sessionId}` 
      : '';
    const jsonFlag = options.json ? '--json' : '';
    
    // CDP 连接参数
    let cdpFlag = '';
    if (this.cdpOptions) {
      if (this.cdpOptions.url) {
        cdpFlag = `--cdp "${this.cdpOptions.url}"`;
      } else if (this.cdpOptions.port) {
        cdpFlag = `--cdp ${this.cdpOptions.port}`;
      }
    }
    
    // 获取 agent-browser 路径
    const agentBrowserCmd = this.getAgentBrowserPath();
    
    // 构建完整命令
    const fullCommand = `${agentBrowserCmd} ${sessionFlag} ${cdpFlag} ${command} ${jsonFlag}`.trim().replace(/\s+/g, ' ');
    
    logger.info(`准备执行命令: ${fullCommand}`);
    logger.info(`当前工作目录: ${process.cwd()}`);
    
    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        timeout: options.timeout || TIMEOUTS.BROWSER_NAVIGATION_TIMEOUT,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        cwd: process.cwd(), // 明确设置工作目录
      });
      
      if (stderr && !stderr.includes('Debugger') && !stderr.includes('npm warn')) {
        logger.warn(`stderr: ${stderr}`);
      }
      
      logger.info(`命令执行成功，输出长度: ${stdout.length}`);
      return stdout.trim();
    } catch (error: any) {
      logger.error(`命令执行失败:`, error);
      logger.error(`失败的命令: ${fullCommand}`);
      logger.error(`错误代码: ${error.code}, 信号: ${error.signal}`);
      
      // 处理超时错误
      if (error.killed && error.signal === 'SIGTERM') {
        throw new Error(`命令执行超时: ${command}`);
      }
      
      // 处理可执行文件不存在的错误
      if (error.code === 'ENOENT' || error.message.includes('command not found')) {
        throw new Error(`agent-browser 可执行文件未找到。请检查安装或联系技术支持。错误详情: ${getErrorMessage(error)}`);
      }
      
      throw new Error(`命令执行失败: ${getErrorMessage(error)}`);
    }
  }
  
  /**
   * 打开 URL
   */
  async open(url: string): Promise<void> {
    await this.execute(`open "${url}"`);
  }
  
  /**
   * 获取页面快照
   * 
   * @param interactive - 是否只显示可交互元素（默认 true）
   *                      true: 只显示可交互元素（按钮、链接、输入框等）
   *                      false: 显示页面的完整文本内容
   */
  async snapshot(interactive: boolean = true): Promise<SnapshotResult> {
    const flag = interactive ? '-i' : '';
    const output = await this.execute(`snapshot ${flag}`, { json: false });
    
    // 解析输出
    return this.parseSnapshot(output, interactive);
  }
  
  /**
   * 点击元素
   */
  async click(ref: string): Promise<void> {
    await this.execute(`click ${ref}`);
  }
  
  /**
   * 双击元素
   */
  async doubleClick(ref: string): Promise<void> {
    await this.execute(`dblclick ${ref}`);
  }
  
  /**
   * 填充输入框（清空后输入）
   */
  async fill(ref: string, text: string): Promise<void> {
    // 转义引号
    const escapedText = text.replace(/"/g, '\\"');
    await this.execute(`fill ${ref} "${escapedText}"`);
  }
  
  /**
   * 输入文本（不清空）
   */
  async type(ref: string, text: string): Promise<void> {
    const escapedText = text.replace(/"/g, '\\"');
    await this.execute(`type ${ref} "${escapedText}"`);
  }
  
  /**
   * 按键
   */
  async press(key: string): Promise<void> {
    await this.execute(`press ${key}`);
  }
  
  /**
   * 悬停
   */
  async hover(ref: string): Promise<void> {
    await this.execute(`hover ${ref}`);
  }
  
  /**
   * 选中复选框
   */
  async check(ref: string): Promise<void> {
    await this.execute(`check ${ref}`);
  }
  
  /**
   * 取消选中复选框
   */
  async uncheck(ref: string): Promise<void> {
    await this.execute(`uncheck ${ref}`);
  }
  
  /**
   * 选择下拉框
   */
  async select(ref: string, value: string): Promise<void> {
    await this.execute(`select ${ref} "${value}"`);
  }
  
  /**
   * 滚动页面
   */
  async scroll(direction: 'up' | 'down', amount: number = 500): Promise<void> {
    await this.execute(`scroll ${direction} ${amount}`);
  }
  
  /**
   * 滚动元素到可见区域
   */
  async scrollIntoView(ref: string): Promise<void> {
    await this.execute(`scrollintoview ${ref}`);
  }
  
  /**
   * 获取元素文本
   */
  async getText(ref: string): Promise<string> {
    return await this.execute(`get text ${ref}`);
  }
  
  /**
   * 获取输入框值
   */
  async getValue(ref: string): Promise<string> {
    return await this.execute(`get value ${ref}`);
  }
  
  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.execute(`get title`);
  }
  
  /**
   * 获取当前 URL
   */
  async getUrl(): Promise<string> {
    return await this.execute(`get url`);
  }
  
  /**
   * 截图
   */
  async screenshot(options?: {
    path?: string;
    fullPage?: boolean;
  }): Promise<string> {
    let command = 'screenshot';
    
    if (options?.path) {
      command += ` "${options.path}"`;
    }
    
    if (options?.fullPage) {
      command += ' --full';
    }
    
    return await this.execute(command);
  }
  
  /**
   * 后退
   */
  async back(): Promise<void> {
    await this.execute('back');
  }
  
  /**
   * 前进
   */
  async forward(): Promise<void> {
    await this.execute('forward');
  }
  
  /**
   * 刷新
   */
  async reload(): Promise<void> {
    await this.execute('reload');
  }
  
  /**
   * 等待元素
   */
  async wait(ref: string, timeout?: number): Promise<void> {
    let command = `wait ${ref}`;
    if (timeout) {
      command += ` --timeout ${timeout}`;
    }
    await this.execute(command);
  }
  
  /**
   * 等待指定时间
   */
  async waitTime(ms: number): Promise<void> {
    await this.execute(`wait ${ms}`);
  }
  
  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    await this.execute('close');
  }
  
  /**
   * 创建新标签页
   */
  async newTab(): Promise<void> {
    await this.execute('tab new');
  }
  
  /**
   * 列出所有标签页
   */
  async listTabs(): Promise<string> {
    return await this.execute('tab list');
  }
  
  /**
   * 切换到指定标签页
   * @param index 标签页索引（从 1 开始）
   */
  async switchTab(index: number): Promise<void> {
    await this.execute(`tab ${index}`);
  }
  
  /**
   * 关闭当前标签页
   */
  async closeTab(): Promise<void> {
    await this.execute('tab close');
  }
  
  /**
   * 解析 snapshot 输出
   * 
   * agent-browser 输出格式示例：
   * 
   * interactive=true 时（可交互元素）：
   * ```
   * ✓ Example Domain
   *   https://example.com/
   * 
   * - link "More information..." [ref=e1]
   * - button "Submit" [ref=e2]
   * - textbox "Search" [ref=e3] [value=""]
   * ```
   * 
   * interactive=false 时（完整文本内容）：
   * ```
   * ✓ Example Domain
   *   https://example.com/
   * 
   * Example Domain
   * This domain is for use in illustrative examples...
   * More information...
   * ```
   */
  private parseSnapshot(output: string, interactive: boolean = true): SnapshotResult {
    const result: SnapshotResult = {
      raw: output,
      elements: [],
    };
    
    // 提取标题（第一行，✓ 开头）
    const titleMatch = output.match(/^✓\s+(.+)$/m);
    if (titleMatch) {
      result.title = titleMatch[1].trim();
    }
    
    // 提取 URL（第二行，缩进开头）
    const urlMatch = output.match(/^\s+(https?:\/\/.+)$/m);
    if (urlMatch) {
      result.url = urlMatch[1].trim();
    }
    
    if (interactive) {
      // 解析可交互元素列表
      // 格式：- role "name" [ref=e1]
      // 或：- role "name" [ref=e1] [value="xxx"]
      const lines = output.split('\n');
      
      for (const line of lines) {
        // 匹配 - role "name" [ref=eN] 或 - role "name" [ref=eN] [value="xxx"]
        const match = line.match(/^-\s+(\w+)\s+"([^"]+)"\s+\[ref=(\w+)\](?:\s+\[value="([^"]*)"\])?/);
        
        if (match) {
          result.elements?.push({
            ref: `@${match[3]}`,  // 添加 @ 前缀
            role: match[1],
            name: match[2],
            value: match[4] || undefined,
          });
        }
      }
    }
    // 如果是 interactive=false，elements 保持为空数组，raw 字段包含完整文本
    
    return result;
  }
}
