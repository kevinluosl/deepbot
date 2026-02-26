/**
 * Browser 配置管理
 * 
 * 
 * 简化版本（MVP）：
 * - 只支持一个 Profile（deepbot）
 * - 不支持 Chrome Extension
 * - 不支持远程节点
 * - 使用系统浏览器（不打包 Playwright 浏览器）
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expandUserPath } from '../../shared/utils/path-utils';
import {
  DEFAULT_BROWSER_CONTROL_PORT,
  DEFAULT_CDP_PORT,
  DEFAULT_BROWSER_COLOR,
  DEFAULT_PROFILE_NAME,
} from './constants';

/**
 * 浏览器配置
 */
export interface BrowserConfig {
  enabled: boolean;
  controlPort: number;
  cdpPort: number;
  color: string;
  headless: boolean;
  executablePath?: string;
}

/**
 * Profile 配置
 */
export interface ProfileConfig {
  name: string;
  cdpPort: number;
  color: string;
}

/**
 * 浏览器可执行文件
 */
export interface BrowserExecutable {
  kind: 'chrome' | 'brave' | 'edge' | 'chromium' | 'canary' | 'custom';
  path: string;
}

/**
 * 检查文件是否存在
 * 
 * @param filePath - 文件路径
 * @returns 是否存在
 */
function exists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * 查找第一个存在的可执行文件
 * 
 * @param candidates - 候选列表
 * @returns 第一个存在的可执行文件，如果都不存在返回 null
 */
function findFirstExecutable(candidates: BrowserExecutable[]): BrowserExecutable | null {
  for (const candidate of candidates) {
    if (exists(candidate.path)) {
      return candidate;
    }
  }
  return null;
}

/**
 * 查找 macOS 系统浏览器
 * 
 * 
 * @returns 浏览器可执行文件，如果未找到返回 null
 */
export function findChromeExecutableMac(): BrowserExecutable | null {
  const candidates: BrowserExecutable[] = [
    {
      kind: 'chrome',
      path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    {
      kind: 'chrome',
      path: expandUserPath('~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    },
    {
      kind: 'brave',
      path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    },
    {
      kind: 'brave',
      path: expandUserPath('~/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'),
    },
    {
      kind: 'edge',
      path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    },
    {
      kind: 'edge',
      path: expandUserPath('~/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    },
    {
      kind: 'chromium',
      path: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    },
    {
      kind: 'chromium',
      path: expandUserPath('~/Applications/Chromium.app/Contents/MacOS/Chromium'),
    },
    {
      kind: 'canary',
      path: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    },
    {
      kind: 'canary',
      path: expandUserPath('~/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'),
    },
  ];

  return findFirstExecutable(candidates);
}

/**
 * 查找 Linux 系统浏览器
 * 
 * 
 * @returns 浏览器可执行文件，如果未找到返回 null
 */
export function findChromeExecutableLinux(): BrowserExecutable | null {
  const candidates: BrowserExecutable[] = [
    { kind: 'chrome', path: '/usr/bin/google-chrome' },
    { kind: 'chrome', path: '/usr/bin/google-chrome-stable' },
    { kind: 'chrome', path: '/usr/bin/chrome' },
    { kind: 'brave', path: '/usr/bin/brave-browser' },
    { kind: 'brave', path: '/usr/bin/brave-browser-stable' },
    { kind: 'brave', path: '/usr/bin/brave' },
    { kind: 'brave', path: '/snap/bin/brave' },
    { kind: 'edge', path: '/usr/bin/microsoft-edge' },
    { kind: 'edge', path: '/usr/bin/microsoft-edge-stable' },
    { kind: 'chromium', path: '/usr/bin/chromium' },
    { kind: 'chromium', path: '/usr/bin/chromium-browser' },
    { kind: 'chromium', path: '/snap/bin/chromium' },
  ];

  return findFirstExecutable(candidates);
}

/**
 * 查找 Windows 系统浏览器
 * 
 * 
 * @returns 浏览器可执行文件，如果未找到返回 null
 */
export function findChromeExecutableWindows(): BrowserExecutable | null {
  const localAppData = process.env.LOCALAPPDATA ?? '';
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';

  const joinWin = path.win32.join;
  const candidates: BrowserExecutable[] = [];

  if (localAppData) {
    // Chrome (用户安装)
    candidates.push({
      kind: 'chrome',
      path: joinWin(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    });
    // Brave (用户安装)
    candidates.push({
      kind: 'brave',
      path: joinWin(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    });
    // Edge (用户安装)
    candidates.push({
      kind: 'edge',
      path: joinWin(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    });
    // Chromium (用户安装)
    candidates.push({
      kind: 'chromium',
      path: joinWin(localAppData, 'Chromium', 'Application', 'chrome.exe'),
    });
    // Chrome Canary (用户安装)
    candidates.push({
      kind: 'canary',
      path: joinWin(localAppData, 'Google', 'Chrome SxS', 'Application', 'chrome.exe'),
    });
  }

  // Chrome (系统安装, 64-bit)
  candidates.push({
    kind: 'chrome',
    path: joinWin(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  });
  // Chrome (系统安装, 32-bit on 64-bit Windows)
  candidates.push({
    kind: 'chrome',
    path: joinWin(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  });
  // Brave (系统安装, 64-bit)
  candidates.push({
    kind: 'brave',
    path: joinWin(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  });
  // Brave (系统安装, 32-bit on 64-bit Windows)
  candidates.push({
    kind: 'brave',
    path: joinWin(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  });
  // Edge (系统安装, 64-bit)
  candidates.push({
    kind: 'edge',
    path: joinWin(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  });
  // Edge (系统安装, 32-bit on 64-bit Windows)
  candidates.push({
    kind: 'edge',
    path: joinWin(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  });

  return findFirstExecutable(candidates);
}

/**
 * 检测系统浏览器
 * 
 * 
 * @returns 浏览器可执行文件，如果未找到返回 null
 */
export function detectSystemBrowser(): BrowserExecutable | null {
  const platform = process.platform;

  if (platform === 'darwin') return findChromeExecutableMac();
  if (platform === 'linux') return findChromeExecutableLinux();
  if (platform === 'win32') return findChromeExecutableWindows();

  return null;
}

/**
 * 解析浏览器配置
 * 
 * @returns 解析后的配置
 */
export function resolveBrowserConfig(): BrowserConfig {
  // 自动检测系统浏览器
  const detected = detectSystemBrowser();
  let executablePath: string | undefined;
  
  if (detected) {
    executablePath = detected.path;
    console.log(`[Browser Config] ✅ 检测到系统浏览器: ${detected.kind} (${detected.path})`);
  } else {
    console.warn('[Browser Config] ⚠️ 未检测到系统浏览器');
    console.warn('[Browser Config] 请安装以下浏览器之一：');
    console.warn('[Browser Config]   - Google Chrome: https://www.google.com/chrome/');
    console.warn('[Browser Config]   - Brave Browser: https://brave.com/');
    console.warn('[Browser Config]   - Microsoft Edge: https://www.microsoft.com/edge');
  }
  
  return {
    enabled: true,
    controlPort: DEFAULT_BROWSER_CONTROL_PORT,
    cdpPort: DEFAULT_CDP_PORT,
    color: DEFAULT_BROWSER_COLOR,
    headless: false, // MVP 阶段使用有头模式，方便调试
    executablePath,
  };
}

/**
 * 获取默认 Profile
 * 
 * @returns Profile 配置
 */
export function getDefaultProfile(): ProfileConfig {
  const config = resolveBrowserConfig();
  
  return {
    name: DEFAULT_PROFILE_NAME,
    cdpPort: config.cdpPort,
    color: config.color,
  };
}
