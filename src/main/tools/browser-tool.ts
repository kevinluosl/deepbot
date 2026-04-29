/**
 * 浏览器工具（插件）
 * 
 * 基于 agent-browser CLI 实现浏览器自动化
 * 
 * 特点：
 * - 使用 @ref 系统进行元素定位（如 @e1, @e2）
 * - 连接到系统已安装的 Chrome 浏览器
 * - 无需配置文件，开箱即用
 * 
 * 依赖要求：
 * - agent-browser 已在 package.json 中声明
 * - 系统需要安装 Chrome 浏览器
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { AgentBrowserWrapper } from '../browser/agent-browser-wrapper';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { expandUserPath } from '../../shared/utils/path-utils';
import { isDockerMode } from '../../shared/utils/docker-utils';
import { TOOL_NAMES } from './tool-names';
import { SystemConfigStore } from '../database/system-config-store';
import { ensureDirectoryExists } from '../../shared/utils/fs-utils';
import { TIMEOUTS } from '../config/timeouts';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * 浏览器操作类型
 */
const BROWSER_ACTIONS = [
  'open',           // 打开 URL
  'snapshot',       // 获取页面快照
  'click',          // 点击元素
  'dblclick',       // 双击元素
  'fill',           // 填充输入框（清空后输入）
  'type',           // 输入文本（不清空）
  'press',          // 按键
  'hover',          // 悬停
  'check',          // 选中复选框
  'uncheck',        // 取消选中复选框
  'select',         // 选择下拉框
  'scroll',         // 滚动页面
  'scrollintoview', // 滚动元素到可见区域
  'get',            // 获取信息（text, value, title, url）
  'screenshot',     // 截图
  'back',           // 后退
  'forward',        // 前进
  'reload',         // 刷新
  'wait',           // 等待
  'tab',            // 标签页管理
  'close',          // 关闭浏览器
] as const;

/**
 * 获取信息类型
 */
const GET_TYPES = ['text', 'value', 'title', 'url'] as const;

/**
 * 滚动方向
 */
const SCROLL_DIRECTIONS = ['up', 'down'] as const;

/**
 * 标签页操作类型
 */
const TAB_ACTIONS = ['new', 'list', 'switch', 'close'] as const;

/**
 * 浏览器工具参数 Schema
 */
const BrowserToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal('open', { description: '打开网页 URL' }),
    Type.Literal('snapshot', { description: '获取页面快照（可交互元素列表或完整文本内容）' }),
    Type.Literal('click', { description: '点击元素（需要 ref 参数）' }),
    Type.Literal('dblclick', { description: '双击元素（需要 ref 参数）' }),
    Type.Literal('fill', { description: '填充输入框，清空后输入（需要 ref 和 text 参数）' }),
    Type.Literal('type', { description: '输入文本，不清空原内容（需要 ref 和 text 参数）' }),
    Type.Literal('press', { description: '按键（需要 key 参数，如 Enter、Escape）' }),
    Type.Literal('hover', { description: '鼠标悬停在元素上（需要 ref 参数）' }),
    Type.Literal('check', { description: '选中复选框（需要 ref 参数）' }),
    Type.Literal('uncheck', { description: '取消选中复选框（需要 ref 参数）' }),
    Type.Literal('select', { description: '选择下拉框选项（需要 ref 和 text 参数）' }),
    Type.Literal('scroll', { description: '滚动页面（需要 direction 和 amount 参数）' }),
    Type.Literal('scrollintoview', { description: '滚动元素到可见区域（需要 ref 参数）' }),
    Type.Literal('get', { description: '获取信息（需要 getType 参数：text、value、title、url）' }),
    Type.Literal('screenshot', { description: '截图（可选 screenshotPath 和 fullPage 参数）' }),
    Type.Literal('back', { description: '浏览器后退' }),
    Type.Literal('forward', { description: '浏览器前进' }),
    Type.Literal('reload', { description: '刷新页面' }),
    Type.Literal('wait', { description: '等待元素出现或等待指定时间（需要 ref 或 waitTimeout 参数）' }),
    Type.Literal('tab', { description: '标签页管理（需要 tabAction 参数：new、list、switch、close）' }),
    Type.Literal('close', { description: '关闭浏览器' }),
  ]),
  
  // URL（用于 open）
  url: Type.Optional(Type.String({
    description: '要打开的网页 URL',
  })),
  
  // 元素引用（用于 click, fill, type, hover 等）
  ref: Type.Optional(Type.String({
    description: '⚠️ 极其重要：必须使用 snapshot 返回的 @ref（如 @e1, @e36）。ref 编号是随机的，每个页面都不同，绝对不要猜测！',
  })),
  
  // 文本/值（用于 fill, type, select）
  text: Type.Optional(Type.String({
    description: '要输入的文本内容',
  })),
  
  // 按键（用于 press）
  key: Type.Optional(Type.String({
    description: '要按下的键（如 Enter, Escape, Control+a）',
  })),
  
  // 快照选项（用于 snapshot）
  interactive: Type.Optional(Type.Boolean({
    description: '是否只显示可交互元素（默认 true）。true: 显示可交互元素（按钮、链接、输入框等），用于操作页面；false: 显示页面完整文本内容，用于阅读信息',
  })),
  
  // 获取信息类型（用于 get）
  getType: Type.Optional(Type.Union([
    Type.Literal('text', { description: '获取元素文本内容' }),
    Type.Literal('value', { description: '获取输入框的值' }),
    Type.Literal('title', { description: '获取页面标题' }),
    Type.Literal('url', { description: '获取当前页面 URL' }),
  ])),
  
  // 滚动方向（用于 scroll）
  direction: Type.Optional(Type.Union([
    Type.Literal('up', { description: '向上滚动' }),
    Type.Literal('down', { description: '向下滚动' }),
  ])),
  
  // 滚动距离（用于 scroll）
  amount: Type.Optional(Type.Number({
    description: '滚动距离（像素），默认 500',
  })),
  
  // 截图选项
  screenshotPath: Type.Optional(Type.String({
    description: '截图保存路径（可选）',
  })),
  
  fullPage: Type.Optional(Type.Boolean({
    description: '是否截取整个页面（默认 false）',
  })),
  
  // 等待超时（用于 wait）
  waitTimeout: Type.Optional(Type.Number({
    description: '等待超时时间（毫秒）',
  })),
  
  // 标签页操作（用于 tab）
  tabAction: Type.Optional(Type.Union([
    Type.Literal('new', { description: '创建新标签页' }),
    Type.Literal('list', { description: '列出所有标签页' }),
    Type.Literal('switch', { description: '切换到指定标签页（需要 tabIndex 参数）' }),
    Type.Literal('close', { description: '关闭当前标签页' }),
  ])),
  
  // 标签页索引（用于 tab switch）
  tabIndex: Type.Optional(Type.Number({
    description: '标签页索引（从 1 开始）',
  })),
});

/**
 * 浏览器工具插件
 */
export const browserToolPlugin: ToolPlugin = {
  metadata: {
    id: 'browser',
    name: '浏览器控制',
    version: '2.0.0',
    description: '使用 agent-browser 控制浏览器。支持：打开网页、获取快照、点击、填充表单、截图等操作。使用 @ref 系统进行元素定位',
    author: 'DeepBot',
    category: 'system',
    tags: ['browser', 'automation', 'web'],
    requiresConfig: false,
  },
  
  create: (options: ToolCreateOptions) => {
    const { sessionId } = options;
    
    return [
      {
        name: TOOL_NAMES.BROWSER,
        label: '浏览器控制',
        description: `使用 agent-browser 控制浏览器。支持：打开网页、获取快照、点击、填充表单、截图、标签页管理等操作。使用 @ref 系统进行元素定位。

⚠️ 核心规则：
1. 执行任何改变页面的操作后（open、click、fill、type、back、forward、reload、tab 等），必须立即执行 snapshot
2. snapshot 是查看页面内容的唯一方式
3. 页面跳转、按钮点击、表单提交、标签页切换后，都需要 snapshot 确认新页面内容
4. 只有 snapshot 能获取 JS 渲染后的实际页面内容和可交互元素列表

📑 标签页管理：
• 创建新标签页：{ action: "tab", tabAction: "new" }
• 列出所有标签页：{ action: "tab", tabAction: "list" }
• 切换标签页：{ action: "tab", tabAction: "switch", tabIndex: 2 }
• 关闭当前标签页：{ action: "tab", tabAction: "close" }

⚠️ 在新标签页打开网址：必须分两步执行
1. { action: "tab", tabAction: "new" } - 创建新标签页
2. { action: "open", url: "..." } - 在新标签页中打开网址

📋 Snapshot 模式：
• 强制使用 interactive: false - 获取页面完整文本内容和可交互元素
• 原因：很多可交互元素在 interactive: true 模式下不显示

详细使用说明请参考 TOOLS.md`,
        parameters: BrowserToolSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          // 🔥 3分钟超时保护：防止浏览器操作卡住导致 Agent 永远不停止
          const executeCore = async () => {
          try {
            // Docker 模式：强制使用 headless Chromium（Playwright），CDP 端口 9222
            // 非 Docker 模式：连接用户系统 Chrome，CDP 端口 9222
            const cdpPort = 9222;
            const cdpOptions = { url: `http://localhost:${cdpPort}` };
            const dockerMode = isDockerMode();
            
            const params = args as {
              action: typeof BROWSER_ACTIONS[number];
              url?: string;
              ref?: string;
              text?: string;
              key?: string;
              interactive?: boolean;
              getType?: typeof GET_TYPES[number];
              direction?: typeof SCROLL_DIRECTIONS[number];
              amount?: number;
              screenshotPath?: string;
              fullPage?: boolean;
              waitTimeout?: number;
              tabAction?: typeof TAB_ACTIONS[number];
              tabIndex?: number;
            };
            
            // 检查是否被取消
            if (signal?.aborted) {
              const err = new Error('浏览器操作被取消');
              err.name = 'AbortError';
              throw err;
            }
            
            // 创建 wrapper（浏览器 session 固定为 default，所有 Tab 共享同一个浏览器实例）
            const wrapper = new AgentBrowserWrapper('default', cdpOptions);
            
            // 尝试连接，如果失败则自动启动浏览器
            try {
              // 先尝试获取当前 URL 来测试连接
              await wrapper.getUrl();
            } catch (connectError) {
              // Docker 模式：直接启动 Playwright Chromium 二进制，暴露 CDP 端口
              if (dockerMode) {
                try {
                  const { spawn, execSync } = await import('child_process');
                  // 查找 Playwright 安装的 Chromium 可执行文件
                  const chromiumPath = execSync(
                    'find /ms-playwright -name "chrome" -path "*/chrome-linux/*" 2>/dev/null | head -1',
                    { encoding: 'utf-8' }
                  ).trim();
                  
                  if (!chromiumPath) {
                    throw new Error('未找到 Chromium，请先执行: npx playwright install chromium --with-deps');
                  }
                  
                  spawn(chromiumPath, [
                    '--headless',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-gpu',
                    '--disable-dev-shm-usage',
                    `--remote-debugging-port=${cdpPort}`,
                    `--user-data-dir=${join(tmpdir(), 'deepbot-chromium')}`,
                  ], {
                    detached: true,
                    stdio: 'ignore',
                  }).unref();
                  
                  // 等待启动（最多 15 秒）
                  let connected = false;
                  for (let i = 0; i < 15; i++) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    try {
                      await wrapper.getUrl();
                      connected = true;
                      break;
                    } catch { /* 继续等待 */ }
                  }
                  
                  if (!connected) {
                    throw new Error('Playwright Chromium 启动超时，请检查容器内 Playwright 是否已安装');
                  }
                } catch (launchError) {
                  throw new Error(`Docker 模式下无法启动 Headless Chromium: ${getErrorMessage(launchError)}`);
                }
              } else {
                // 非 Docker 模式：尝试启动系统 Chrome
                try {
                  const { spawn } = await import('child_process');
                  
                  const platform = process.platform;
                  let command: string;
                  
                  if (platform === 'darwin') {
                    // macOS: 直接调用 Chrome 可执行文件，前台运行
                    const userDataDir = expandUserPath('~/.deepbot/browser-profile');
                    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
                    command = `"${chromePath}" --remote-debugging-port=${cdpPort} --user-data-dir="${userDataDir}" --no-first-run --no-default-browser-check`;
                  } else if (platform === 'win32') {
                    command = `start chrome --remote-debugging-port=${cdpPort} --user-data-dir=%USERPROFILE%\\.deepbot\\browser-profile --no-first-run --no-default-browser-check`;
                  } else {
                    // Linux
                    const userDataDir = expandUserPath('~/.deepbot/browser-profile');
                    command = `google-chrome --remote-debugging-port=${cdpPort} --user-data-dir="${userDataDir}" --no-first-run --no-default-browser-check`;
                  }
                  
                  // 使用 spawn 启动 Chrome，不等待进程结束
                  if (platform === 'darwin' || platform === 'linux') {
                    spawn(command, [], {
                      shell: true,
                      detached: true,
                      stdio: 'ignore',
                    }).unref();
                  } else {
                    spawn('cmd', ['/c', command], {
                      detached: true,
                      stdio: 'ignore',
                    }).unref();
                  }
                  
                  // 等待 Chrome 启动（最多 10 秒）
                  let connected = false;
                  for (let i = 0; i < 10; i++) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    try {
                      await wrapper.getUrl();
                      connected = true;
                      break;
                    } catch {
                      // 继续等待
                    }
                  }
                  
                  if (!connected) {
                    throw new Error('Chrome 启动超时，请手动启动 Chrome 后重试');
                  }
              } catch (launchError) {
                  const launchErrorMsg = getErrorMessage(launchError);
                  const userDataDir = expandUserPath('~/.deepbot/browser-profile');
                  
                  const macCommand = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="${userDataDir}"`;
                  const winCommand = `chrome.exe --remote-debugging-port=9222 --user-data-dir=%USERPROFILE%\\.deepbot\\browser-profile`;
                  const linuxCommand = `google-chrome --remote-debugging-port=9222 --user-data-dir="${userDataDir}"`;
                  
                  throw new Error(`无法连接到 Chrome 浏览器。\n\n请先启动 Chrome（使用独立的用户数据目录）：\n\nmacOS:\n${macCommand}\n\nWindows:\n${winCommand}\n\nLinux:\n${linuxCommand}\n\n或在系统配置 > 浏览器工具中点击"启动 Chrome"按钮。\n\n错误详情: ${launchErrorMsg}`);
                }
              }
            }
            
            // 执行操作
            switch (params.action) {
              case 'open': {
                if (!params.url) {
                  throw new Error('缺少参数: url');
                }
                
                await wrapper.open(params.url);
                
                const text = `✅ 已打开网页: ${params.url}\n\n⚠️ 重要：页面已打开但内容尚未获取。\n\n💡 推荐下一步：使用 { action: "snapshot" } 查看页面内容`;
                
                return {
                  content: [{
                    type: 'text',
                    text,
                  }],
                  details: {
                    success: true,
                    url: params.url,
                    needsSnapshot: true,
                  },
                };
              }
              
              case 'snapshot': {
                // 🔥 强制使用 interactive: false，因为很多可交互元素在 true 模式不显示
                const interactive = false;
                const result = await wrapper.snapshot(interactive);
                
                // 格式化输出
                let text = `📸 页面快照（阅读模式）\n\n`;
                
                if (result.title) {
                  text += `📄 标题: ${result.title}\n`;
                }
                
                if (result.url) {
                  text += `🔗 URL: ${result.url}\n`;
                }
                
                // 显示完整文本内容
                if (result.raw) {
                  // 移除标题和 URL 行，只保留内容
                  const lines = result.raw.split('\n');
                  const contentLines: string[] = [];
                  let skipNext = false;
                  
                  for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    
                    // 跳过标题行（✓ 开头）
                    if (line.match(/^✓\s+/)) {
                      skipNext = true;
                      continue;
                    }
                    
                    // 跳过 URL 行（紧跟标题的缩进行）
                    if (skipNext && line.match(/^\s+https?:\/\//)) {
                      skipNext = false;
                      continue;
                    }
                    
                    skipNext = false;
                    
                    // 跳过空行（开头的）
                    if (contentLines.length === 0 && line.trim() === '') {
                      continue;
                    }
                    
                    contentLines.push(line);
                  }
                    
                  const content = contentLines.join('\n').trim();
                  
                  if (content) {
                    text += `\n📝 页面文本内容:\n\n${content}`;
                    
                    // 如果有可交互元素，也显示出来
                    if (result.elements && result.elements.length > 0) {
                      text += `\n\n🎯 可交互元素 (共 ${result.elements.length} 个):\n\n`;
                      result.elements.forEach((el) => {
                        text += `  ${el.ref} - ${el.role}`;
                        if (el.name) {
                          text += ` "${el.name}"`;
                        }
                        if (el.value) {
                          text += ` [值: ${el.value}]`;
                        }
                        text += '\n';
                      });
                      text += `\n💡 操作提示：使用 @ref 进行操作，例如：\n   { action: "click", ref: "${result.elements[0].ref}" }`;
                    }
                  } else {
                    text += `\n⚠️ 页面内容为空或仍在加载中\n💡 建议：等待几秒后重试，或使用 wait 操作`;
                  }
                }
                
                return {
                  content: [{
                    type: 'text',
                    text,
                  }],
                  details: result,
                };
              }
              
              case 'click': {
                if (!params.ref) {
                  throw new Error('缺少参数: ref（必须使用 snapshot 返回的 @ref）');
                }
                
                await wrapper.click(params.ref);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已点击元素: ${params.ref}\n\n⚠️ 页面可能已改变！必须立即执行 snapshot 查看新页面内容。`,
                  }],
                  details: {
                    success: true,
                    ref: params.ref,
                    requiresSnapshot: true,
                  },
                };
              }
              
              case 'dblclick': {
                if (!params.ref) {
                  throw new Error('缺少参数: ref');
                }
                
                await wrapper.doubleClick(params.ref);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已双击元素: ${params.ref}`,
                  }],
                  details: {
                    success: true,
                    ref: params.ref,
                  },
                };
              }
              
              case 'fill': {
                if (!params.ref || !params.text) {
                  throw new Error('缺少参数: ref 和 text');
                }
                
                await wrapper.fill(params.ref, params.text);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已填充输入框: ${params.ref}\n\n💡 提示：如果填充后触发了页面变化（如自动提交、下拉建议等），需要执行 snapshot 查看新内容。`,
                  }],
                  details: {
                    success: true,
                    ref: params.ref,
                  },
                };
              }
              
              case 'type': {
                if (!params.ref || !params.text) {
                  throw new Error('缺少参数: ref 和 text');
                }
                
                await wrapper.type(params.ref, params.text);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已输入文本: ${params.ref}`,
                  }],
                  details: {
                    success: true,
                    ref: params.ref,
                  },
                };
              }
              
              case 'press': {
                if (!params.key) {
                  throw new Error('缺少参数: key');
                }
                
                await wrapper.press(params.key);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已按下键: ${params.key}\n\n💡 提示：如果按键触发了页面变化（如 Enter 提交表单、Tab 切换焦点等），需要执行 snapshot 查看新内容。`,
                  }],
                  details: {
                    success: true,
                    key: params.key,
                  },
                };
              }
              
              case 'hover': {
                if (!params.ref) {
                  throw new Error('缺少参数: ref');
                }
                
                await wrapper.hover(params.ref);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已悬停在元素: ${params.ref}`,
                  }],
                  details: {
                    success: true,
                    ref: params.ref,
                  },
                };
              }
              
              case 'check': {
                if (!params.ref) {
                  throw new Error('缺少参数: ref');
                }
                
                await wrapper.check(params.ref);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已选中复选框: ${params.ref}`,
                  }],
                  details: {
                    success: true,
                    ref: params.ref,
                  },
                };
              }
              
              case 'uncheck': {
                if (!params.ref) {
                  throw new Error('缺少参数: ref');
                }
                
                await wrapper.uncheck(params.ref);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已取消选中复选框: ${params.ref}`,
                  }],
                  details: {
                    success: true,
                    ref: params.ref,
                  },
                };
              }
              
              case 'select': {
                if (!params.ref || !params.text) {
                  throw new Error('缺少参数: ref 和 text（选项值）');
                }
                
                await wrapper.select(params.ref, params.text);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已选择下拉框选项: ${params.ref} = ${params.text}\n\n💡 提示：如果选择后触发了页面变化，需要执行 snapshot 查看新内容。`,
                  }],
                  details: {
                    success: true,
                    ref: params.ref,
                    value: params.text,
                  },
                };
              }
              
              case 'scroll': {
                const direction = params.direction || 'down';
                const amount = params.amount || 500;
                
                await wrapper.scroll(direction, amount);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已滚动页面: ${direction} ${amount}px\n\n💡 提示：滚动后可能显示新内容，建议执行 snapshot 查看新出现的元素。`,
                  }],
                  details: {
                    success: true,
                    direction,
                    amount,
                  },
                };
              }
              
              case 'scrollintoview': {
                if (!params.ref) {
                  throw new Error('缺少参数: ref');
                }
                
                await wrapper.scrollIntoView(params.ref);
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已滚动元素到可见区域: ${params.ref}`,
                  }],
                  details: {
                    success: true,
                    ref: params.ref,
                  },
                };
              }
              
              case 'get': {
                if (!params.getType) {
                  throw new Error('缺少参数: getType（text, value, title, url）');
                }
                
                let result: string;
                
                switch (params.getType) {
                  case 'text':
                    if (!params.ref) {
                      throw new Error('获取文本需要 ref 参数');
                    }
                    result = await wrapper.getText(params.ref);
                    break;
                    
                  case 'value':
                    if (!params.ref) {
                      throw new Error('获取值需要 ref 参数');
                    }
                    result = await wrapper.getValue(params.ref);
                    break;
                    
                  case 'title':
                    result = await wrapper.getTitle();
                    break;
                    
                  case 'url':
                    result = await wrapper.getUrl();
                    break;
                    
                  default:
                    throw new Error(`未知的 getType: ${params.getType}`);
                }
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 获取 ${params.getType}: ${result}`,
                  }],
                  details: {
                    success: true,
                    type: params.getType,
                    value: result,
                  },
                };
              }
              
              case 'screenshot': {
                // 默认保存到图片工作目录
                let defaultDir: string;
                try {
                  const settings = SystemConfigStore.getInstance().getWorkspaceSettings();
                  defaultDir = settings.imageDir;
                  ensureDirectoryExists(defaultDir);
                } catch {
                  // 回退到系统临时目录
                  defaultDir = tmpdir();
                }
                const defaultPath = join(defaultDir, `screenshot-${Date.now()}.png`);
                const rawPath = params.screenshotPath || defaultPath;
                
                // 展开用户路径（支持 ~ 符号）
                const path = expandUserPath(rawPath);
                const fullPage = params.fullPage || false;
                
                await wrapper.screenshot({
                  path,
                  fullPage,
                });
                
                // Windows 路径转正斜杠，避免 Markdown 渲染时反斜杠被当作转义字符
                const displayPath = path.replace(/\\/g, '/');
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 截图已保存: ${displayPath}${fullPage ? ' (完整页面)' : ' (可见区域)'}`,
                  }],
                  details: {
                    success: true,
                    path: displayPath,
                    fullPage,
                  },
                };
              }
              
              case 'back': {
                await wrapper.back();
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已后退\n\n⚠️ 页面已改变！必须立即执行 snapshot 查看当前页面内容。`,
                  }],
                  details: {
                    success: true,
                    requiresSnapshot: true,
                  },
                };
              }
              
              case 'forward': {
                await wrapper.forward();
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已前进\n\n⚠️ 页面已改变！必须立即执行 snapshot 查看当前页面内容。`,
                  }],
                  details: {
                    success: true,
                    requiresSnapshot: true,
                  },
                };
              }
              
              case 'reload': {
                await wrapper.reload();
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已刷新页面\n\n⚠️ 页面已重新加载！必须立即执行 snapshot 查看刷新后的内容。`,
                  }],
                  details: {
                    success: true,
                    requiresSnapshot: true,
                  },
                };
              }
              
              case 'wait': {
                if (params.ref) {
                  await wrapper.wait(params.ref, params.waitTimeout);
                  
                  return {
                    content: [{
                      type: 'text',
                      text: `✅ 已等待元素出现: ${params.ref}`,
                    }],
                    details: {
                      success: true,
                      ref: params.ref,
                    },
                  };
                } else if (params.waitTimeout) {
                  await wrapper.waitTime(params.waitTimeout);
                  
                  return {
                    content: [{
                      type: 'text',
                      text: `✅ 已等待 ${params.waitTimeout}ms`,
                    }],
                    details: {
                      success: true,
                      duration: params.waitTimeout,
                    },
                  };
                } else {
                  throw new Error('缺少参数: ref 或 waitTimeout');
                }
              }
              
              case 'tab': {
                if (!params.tabAction) {
                  throw new Error('缺少参数: tabAction（new, list, switch, close）');
                }
                
                switch (params.tabAction) {
                  case 'new': {
                    await wrapper.newTab();
                    
                    return {
                      content: [{
                        type: 'text',
                        text: `✅ 已创建新标签页\n\n⚠️ 已切换到新标签页！必须立即执行 snapshot 查看新标签页内容。\n\n💡 提示：新标签页默认显示空白页（about:blank），使用 open 操作打开网址。`,
                      }],
                      details: {
                        success: true,
                        requiresSnapshot: true,
                      },
                    };
                  }
                  
                  case 'list': {
                    const list = await wrapper.listTabs();
                    
                    return {
                      content: [{
                        type: 'text',
                        text: `📑 标签页列表:\n\n${list}\n\n💡 提示：使用 { action: "tab", tabAction: "switch", tabIndex: N } 切换到指定标签页`,
                      }],
                      details: {
                        success: true,
                        list,
                      },
                    };
                  }
                  
                  case 'switch': {
                    if (!params.tabIndex) {
                      throw new Error('缺少参数: tabIndex（标签页索引，从 1 开始）');
                    }
                    
                    await wrapper.switchTab(params.tabIndex);
                    
                    return {
                      content: [{
                        type: 'text',
                        text: `✅ 已切换到标签页 ${params.tabIndex}\n\n⚠️ 已切换标签页！必须立即执行 snapshot 查看当前标签页内容。`,
                      }],
                      details: {
                        success: true,
                        tabIndex: params.tabIndex,
                        requiresSnapshot: true,
                      },
                    };
                  }
                  
                  case 'close': {
                    await wrapper.closeTab();
                    
                    return {
                      content: [{
                        type: 'text',
                        text: `✅ 已关闭当前标签页\n\n⚠️ 已自动切换到其他标签页！必须立即执行 snapshot 查看当前标签页内容。`,
                      }],
                      details: {
                        success: true,
                        requiresSnapshot: true,
                      },
                    };
                  }
                  
                  default:
                    throw new Error(`未知的 tabAction: ${params.tabAction}`);
                }
              }
              
              case 'close': {
                await wrapper.close();
                
                return {
                  content: [{
                    type: 'text',
                    text: `✅ 已关闭浏览器`,
                  }],
                  details: {
                    success: true,
                  },
                };
              }
              
              default:
                throw new Error(`未知操作: ${params.action}`);
            }
          } catch (error) {
            console.error('[Browser Tool] ❌ 操作失败:', error);
            
            // 构建错误消息
            let errorMessage = `❌ 浏览器操作失败: ${getErrorMessage(error)}\n\n`;
            
            // 添加常见问题提示
            const errorStr = getErrorMessage(error).toLowerCase();
            
            if (errorStr.includes('connect') || errorStr.includes('econnrefused')) {
              errorMessage += `💡 无法连接到 Chrome 浏览器\n\n`;
              errorMessage += `请先手动启动 Chrome 并开启远程调试（使用独立的用户数据目录）：\n\n`;
              errorMessage += `macOS:\n`;
              errorMessage += `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-9222\n\n`;
              errorMessage += `Windows:\n`;
              errorMessage += `chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\\chrome-debug-9222\n\n`;
              errorMessage += `Linux:\n`;
              errorMessage += `google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-9222\n`;
            } else if (errorStr.includes('timeout')) {
              errorMessage += `💡 操作超时，可能原因：\n`;
              errorMessage += `   • 网络连接较慢\n`;
              errorMessage += `   • 页面加载时间过长\n`;
              errorMessage += `   • 元素未找到\n`;
            } else if (errorStr.includes('ref') || errorStr.includes('@e')) {
              errorMessage += `💡 元素引用错误，请注意：\n`;
              errorMessage += `   • 必须先使用 snapshot 获取元素列表\n`;
              errorMessage += `   • 使用 snapshot 返回的 @ref（如 @e1, @e36）\n`;
              errorMessage += `   • 不要猜测 ref 编号\n`;
            } else if (errorStr.includes('spawn') || errorStr.includes('enoent') || errorStr.includes('command not found')) {
              errorMessage += `💡 agent-browser 可执行文件问题：\n`;
              errorMessage += `   • 开发环境：确保已安装 agent-browser 依赖\n`;
              errorMessage += `   • 生产环境：可执行文件可能未正确打包\n`;
              errorMessage += `   • 请检查 node_modules/agent-browser/bin/ 目录\n`;
              errorMessage += `   • 尝试重新安装依赖：pnpm install\n`;
            }
            
            return {
              content: [{
                type: 'text',
                text: errorMessage,
              }],
              details: {
                success: false,
                error: getErrorMessage(error),
              },
              isError: true,
            };
          }
          }; // executeCore 结束

          // 超时竞争：executeCore vs 3分钟超时
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('浏览器操作超时（60秒），已强制停止')), TIMEOUTS.BROWSER_TOOL_EXECUTE_TIMEOUT);
          });

          try {
            return await Promise.race([executeCore(), timeoutPromise]);
          } catch (error) {
            const msg = getErrorMessage(error);
            console.error(`[Browser Tool] ❌ 执行超时或异常: ${msg}`);
            return {
              content: [{ type: 'text', text: `❌ ${msg}` }],
              details: { success: false, error: msg },
              isError: true,
            };
          }
        },
      },
    ];
  },
};
