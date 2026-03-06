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
    // 开发环境：使用 npx
    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
      logger.info('🔧 开发环境检测');
      logger.info(`  NODE_ENV: ${process.env.NODE_ENV || 'N/A'}`);
      logger.info(`  VITE_DEV_SERVER_URL: ${process.env.VITE_DEV_SERVER_URL || 'N/A'}`);
      logger.info('  使用命令: npx agent-browser');
      logger.info('  npx 会调用: node_modules/.bin/agent-browser');
      logger.info('  该脚本会调用: node_modules/agent-browser/bin/agent-browser-<platform>-<arch>');
      return 'npx agent-browser';
    }
    
    // 生产环境：直接调用可执行文件
    logger.info('🔧 生产环境检测');
    const platform = process.platform;
    const arch = process.arch;
    
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
    
    logger.info(`  平台: ${platform}, 架构: ${arch}`);
    logger.info(`  目标可执行文件: ${executableName}`);
    
    // 在 asar: false 的情况下，文件直接在 app 目录中
    const resourcesPath = process.resourcesPath || process.cwd();
    
    // 尝试多个可能的路径
    const possiblePaths = [
      // asar: false 的标准路径
      join(resourcesPath, 'app', 'node_modules', 'agent-browser', 'bin', executableName),
      // 备选路径
      join(resourcesPath, 'node_modules', 'agent-browser', 'bin', executableName),
      // 相对于当前工作目录
      join(process.cwd(), 'node_modules', 'agent-browser', 'bin', executableName),
    ];
    
    logger.info('  尝试查找路径:');
    for (const executablePath of possiblePaths) {
      const exists = existsSync(executablePath);
      logger.info(`    ${exists ? '✅' : '❌'} ${executablePath}`);
      if (exists) {
        logger.info(`  ✅ 找到可执行文件: ${executableName}`);
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
    
    // 🔧 设置环境变量：让 agent-browser 使用 Electron 内置的 Node.js
    const env = {
      ...process.env,
      NODE: process.execPath,  // Electron 可执行文件路径（包含 Node.js）
      PATH: process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin',
    };
    
    // 🔗 在生产环境中，确保 node 包装脚本存在并添加到 PATH
    if (process.env.NODE_ENV !== 'development' && !process.env.VITE_DEV_SERVER_URL) {
      const resourcesPath = process.resourcesPath || process.cwd();
      const appDir = join(resourcesPath, 'app');
      const nodeWrapperPath = join(appDir, 'node');
      
      // 检查包装脚本是否存在
      if (!existsSync(nodeWrapperPath)) {
        logger.warn('⚠️ node 包装脚本不存在，尝试创建...');
        try {
          const { writeFileSync, chmodSync } = require('fs');
          
          // 创建包装脚本
          const wrapperScript = `#!/bin/bash
# Node.js wrapper for agent-browser
# This script uses Electron's built-in Node.js to run scripts

# CRITICAL: Set ELECTRON_RUN_AS_NODE before anything else
# This tells Electron to run as pure Node.js, not as an Electron app
export ELECTRON_RUN_AS_NODE=1

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"

# Get the Electron executable path (3 levels up: app -> Resources -> Contents -> MacOS)
ELECTRON_PATH="$SCRIPT_DIR/../../MacOS/$(basename "${process.execPath}")"

# Execute with all arguments
exec "$ELECTRON_PATH" "$@"
`;
          
          writeFileSync(nodeWrapperPath, wrapperScript);
          chmodSync(nodeWrapperPath, 0o755);
          logger.info('✅ node 包装脚本创建成功');
        } catch (error) {
          logger.error(`❌ 创建 node 包装脚本失败: ${getErrorMessage(error)}`);
        }
      }
      
      // 将 app 目录添加到 PATH 前面，让 agent-browser 能找到 node 命令
      if (existsSync(nodeWrapperPath)) {
        env.PATH = `${appDir}:${env.PATH}`;
        logger.info(`✅ 已将 app 目录添加到 PATH: ${appDir}`);
      }
    }
    
    // 📋 详细诊断日志（仅在首次调用或出错时输出）
    const isFirstCall = !process.env.DEEPBOT_BROWSER_INITIALIZED;
    if (isFirstCall) {
      process.env.DEEPBOT_BROWSER_INITIALIZED = '1';
      
      logger.info('=== agent-browser 首次执行诊断 ===');
      logger.info(`📌 命令: ${command}`);
      logger.info('');
      
      // 环境信息
      logger.info('🔧 环境信息:');
      logger.info(`  工作目录: ${process.cwd()}`);
      logger.info(`  NODE 环境变量: ${env.NODE}`);
      logger.info(`  PATH: ${env.PATH.split(':').slice(0, 3).join(':') + '...'}`);
      logger.info(`  process.platform: ${process.platform}`);
      logger.info(`  process.arch: ${process.arch}`);
      logger.info('');
      
      // 检查关键文件是否存在
      logger.info('📂 关键文件检查:');
      const agentBrowserBinPath = agentBrowserCmd.replace(/"/g, '');
      
      logger.info(`  agent-browser 二进制: ${existsSync(agentBrowserBinPath) ? '✅' : '❌'}`);
      
      // 🔗 检查 node 包装脚本
      if (process.env.NODE_ENV !== 'development' && !process.env.VITE_DEV_SERVER_URL) {
        const resourcesPath = process.resourcesPath || process.cwd();
        const appDir = join(resourcesPath, 'app');
        const nodeWrapperPath = join(appDir, 'node');
        
        logger.info(`  node 包装脚本: ${existsSync(nodeWrapperPath) ? '✅' : '❌'}`);
        
        if (existsSync(nodeWrapperPath)) {
          try {
            const { readFileSync } = require('fs');
            const content = readFileSync(nodeWrapperPath, 'utf-8');
            const hasElectronRunAsNode = content.includes('ELECTRON_RUN_AS_NODE=1');
            logger.info(`  包含 ELECTRON_RUN_AS_NODE: ${hasElectronRunAsNode ? '✅' : '❌'}`);
          } catch (error) {
            logger.error(`  读取脚本失败: ${getErrorMessage(error)}`);
          }
        }
      }
      
      logger.info('');
      logger.info('=== 诊断完成 ===');
      logger.info('');
    }
    
    try {
      const { stdout, stderr } = await execAsync(fullCommand, {
        timeout: options.timeout || TIMEOUTS.BROWSER_NAVIGATION_TIMEOUT,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        cwd: process.cwd(),
        env, // 传递环境变量
      });
      
      return stdout.trim();
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      
      // 📋 详细错误诊断
      logger.error('');
      logger.error('=== agent-browser 执行失败 ===');
      logger.error(`❌ 命令: ${command}`);
      logger.error(`❌ 错误: ${errorMessage}`);
      
      if (error.stderr) {
        logger.error(`📤 stderr: ${error.stderr.substring(0, 500)}`);
      }
      
      logger.error('');
      
      // 处理超时错误
      if (error.killed && error.signal === 'SIGTERM') {
        throw new Error(`命令执行超时: ${command}`);
      }
      
      // 处理可执行文件不存在的错误
      if (error.code === 'ENOENT' || error.message.includes('command not found')) {
        throw new Error(`agent-browser 可执行文件未找到。请检查安装或联系技术支持。错误详情: ${errorMessage}`);
      }
      
      throw new Error(`命令执行失败: ${errorMessage}`);
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
