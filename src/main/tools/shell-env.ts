/**
 * Shell 环境变量工具
 * 
 * 职责：
 * - 从登录 shell 获取完整的环境变量（PATH + 用户自定义变量）
 * - 解决 Electron 主进程环境变量不完整的问题（macOS Dock 启动时不加载 .zshrc）
 * - 支持 /reload-env 指令刷新缓存
 */

import { execFileSync } from 'node:child_process';
import { getErrorMessage } from '../../shared/utils/error-handler';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BUFFER_BYTES = 2 * 1024 * 1024;

// 缓存，避免重复执行 shell
let cachedShellPath: string | undefined;
let cachedShellEnv: Record<string, string> | undefined;

/**
 * 解析 shell env -0 输出（\0 分隔的 KEY=VALUE 格式）
 */
function parseShellEnv(stdout: Buffer): Map<string, string> {
  const shellEnv = new Map<string, string>();
  const parts = stdout.toString('utf8').split('\0');
  
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key) shellEnv.set(key, value);
  }
  
  return shellEnv;
}

/**
 * 解析用户 shell 路径
 */
function resolveShell(env: NodeJS.ProcessEnv): string {
  const shell = env.SHELL?.trim();
  return shell && shell.length > 0 ? shell : '/bin/sh';
}

/**
 * 从单个 shell 配置文件中提取 export KEY=value 格式的环境变量
 * 作为 shell 执行失败时的 fallback，只处理简单静态赋值
 */
function extractEnvFromShellConfig(configFile: string): Map<string, string> {
  const envVars = new Map<string, string>();
  
  try {
    const fs = require('fs');
    if (!fs.existsSync(configFile)) return envVars;
    
    const content = fs.readFileSync(configFile, 'utf-8');
    
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // 匹配 export KEY="value" 或 export KEY=value（排除 PATH，PATH 有专门处理）
      const match = trimmed.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=["']?([^"']*)["']?$/);
      if (match) {
        const [, key, value] = match;
        if (key !== 'PATH' && key && value) {
          const expanded = value
            .replace(/\$HOME/g, process.env.HOME || '~')
            .replace(/^~/, process.env.HOME || '~');
          envVars.set(key, expanded);
        }
      }
    }
  } catch (error) {
    console.warn(`[Shell Env] ⚠️ 读取 ${configFile} 失败:`, getErrorMessage(error));
  }
  
  return envVars;
}

/**
 * 从多个 shell 配置文件中提取所有环境变量（fallback 补充）
 */
function getEnvFromShellConfigs(): Map<string, string> {
  const homeDir = process.env.HOME;
  if (!homeDir) return new Map();
  
  // 按加载顺序排列，后面的优先级更高（会覆盖前面的）
  const configFiles = [
    `${homeDir}/.zprofile`,
    `${homeDir}/.bash_profile`,
    `${homeDir}/.profile`,
    `${homeDir}/.zshrc`,
    `${homeDir}/.bashrc`,
  ];
  
  const allEnv = new Map<string, string>();
  for (const configFile of configFiles) {
    for (const [key, value] of extractEnvFromShellConfig(configFile)) {
      allEnv.set(key, value);
    }
  }
  const configEnvCount = allEnv.size;
  
  // 补充：读取所有 Skill 的 .env 文件（优先级最高，覆盖系统配置）
  let skillEnvCount = 0;
  try {
    const { getAllSkillEnvVars } = require('./skill-manager/manage');
    const skillEnv: Map<string, string> = getAllSkillEnvVars();
    skillEnvCount = skillEnv.size;
    for (const [key, value] of skillEnv) {
      allEnv.set(key, value);
    }
  } catch (error) {
    // skill-manager 模块不可用时静默忽略
  }

  if (allEnv.size > 0) {
    console.info(`[Shell Env] 📝 配置文件补充: ${configEnvCount} 个变量，Skill .env 补充: ${skillEnvCount} 个变量`);
  }
  
  return allEnv;
}

/**
 * 从单个 shell 配置文件中提取 PATH 相关配置
 */
function extractPathFromShellConfig(configFile: string): string[] {
  const paths: string[] = [];
  
  try {
    const fs = require('fs');
    if (!fs.existsSync(configFile)) return paths;
    
    const content = fs.readFileSync(configFile, 'utf-8');
    
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // 匹配各种 PATH 赋值格式
      const pathMatch = trimmed.match(/^(?:export\s+)?PATH=["']?([^"']+)["']?/);
      if (pathMatch) {
        for (const p of pathMatch[1].split(':').filter(Boolean)) {
          if (p !== '$PATH' && !p.includes('\n')) {
            paths.push(p.replace(/^~/, process.env.HOME || '~'));
          }
        }
      }
      
      const prependMatch = trimmed.match(/^(?:export\s+)?PATH=["']?([^"':]+):?\$PATH["']?/);
      if (prependMatch) {
        paths.push(prependMatch[1].replace(/^~/, process.env.HOME || '~'));
      }
      
      const appendMatch = trimmed.match(/^(?:export\s+)?PATH=["']?\$PATH:([^"']+)["']?/);
      if (appendMatch) {
        paths.push(appendMatch[1].replace(/^~/, process.env.HOME || '~'));
      }
    }
  } catch (error) {
    console.warn(`[Shell Env] ⚠️ 读取 ${configFile} 失败:`, getErrorMessage(error));
  }
  
  return paths;
}

/**
 * 检测 nvm 的 Node.js bin 路径
 */
function getNvmPath(): string[] {
  const paths: string[] = [];
  
  try {
    const fs = require('fs');
    const homeDir = process.env.HOME;
    if (!homeDir) return paths;
    
    // 优先使用 NVM_BIN 环境变量
    const nvmBin = process.env.NVM_BIN;
    
    // 从环境变量或配置文件获取 NVM_DIR
    let nvmDir = process.env.NVM_DIR;
    if (!nvmDir) {
      const configFiles = [
        `${homeDir}/.zshrc`, `${homeDir}/.zprofile`,
        `${homeDir}/.bashrc`, `${homeDir}/.bash_profile`,
      ];
      for (const configFile of configFiles) {
        if (fs.existsSync(configFile)) {
          const match = fs.readFileSync(configFile, 'utf-8')
            .match(/export\s+NVM_DIR=["']?([^"'\n]+)["']?/);
          if (match) {
            nvmDir = match[1].replace(/\$HOME/g, homeDir).replace(/~/g, homeDir);
            break;
          }
        }
      }
    }
    
    nvmDir = nvmDir || `${homeDir}/.nvm`;
    if (!fs.existsSync(nvmDir)) return paths;
    
    const defaultAliasPath = `${nvmDir}/alias/default`;
    if (!fs.existsSync(defaultAliasPath)) return paths;
    
    let version = fs.readFileSync(defaultAliasPath, 'utf-8').trim();
    
    // 解析不完整的版本号（如 "24" → "v24.11.1"）
    if (!version.startsWith('v')) {
      const versionsDir = `${nvmDir}/versions/node`;
      if (fs.existsSync(versionsDir)) {
        const matched = fs.readdirSync(versionsDir)
          .find((v: string) => v.startsWith(`v${version}.`));
        if (matched) version = matched;
      }
    }
    
    const nvmNodeBin = `${nvmDir}/versions/node/${version}/bin`;
    if (fs.existsSync(nvmNodeBin)) {
      paths.push(nvmNodeBin);
      console.info(`[Shell Env] ✅ nvm PATH: ${nvmNodeBin}`);
    }
  } catch (error) {
    console.error('[Shell Env] ❌ 检测 nvm PATH 失败:', getErrorMessage(error));
  }
  
  return paths;
}

/**
 * 从配置文件获取所有 PATH
 */
function getPathFromShellConfigs(): string[] {
  const homeDir = process.env.HOME;
  if (!homeDir) return [];
  
  const configFiles = [
    `${homeDir}/.zshrc`,
    `${homeDir}/.zprofile`,
    `${homeDir}/.bashrc`,
    `${homeDir}/.bash_profile`,
    `${homeDir}/.profile`,
  ];
  
  const allPaths: string[] = [];
  for (const configFile of configFiles) {
    allPaths.push(...extractPathFromShellConfig(configFile));
  }
  allPaths.push(...getNvmPath());
  
  return allPaths;
}

/**
 * 合并多个 PATH 来源，去重保序
 */
function mergePaths(currentPath: string, shellPath: string | null, configPaths: string[]): string {
  const allPaths: string[] = [
    ...currentPath.split(':').filter(Boolean),
    ...(shellPath ? shellPath.split(':').filter(Boolean) : []),
    ...configPaths,
  ];
  
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const p of allPaths) {
    if (!seen.has(p)) {
      merged.push(p);
      seen.add(p);
    }
  }
  
  return merged.join(':');
}

/**
 * 从登录 shell 获取完整 PATH
 * 
 * 解决 Electron 主进程 PATH 不完整的问题（macOS Dock 启动时不加载 .zshrc）
 */
export function getShellPathFromLoginShell(opts: {
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): string {
  if (cachedShellPath !== undefined) return cachedShellPath;
  
  const currentPath = process.env.PATH || '';
  
  if (process.platform === 'win32') {
    cachedShellPath = currentPath;
    return cachedShellPath;
  }
  
  const timeoutMs =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs)
      ? Math.max(0, opts.timeoutMs)
      : DEFAULT_TIMEOUT_MS;
  
  const shell = resolveShell(opts.env);
  let shellPath: string | null = null;
  
  try {
    const stdout = execFileSync(shell, ['-l', '-c', 'env -0'], {
      encoding: 'buffer',
      timeout: timeoutMs,
      maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    shellPath = parseShellEnv(stdout).get('PATH')?.trim() || null;
    
    if (shellPath) {
      console.info('[Shell Env] ✅ 成功获取登录 shell PATH');
    }
  } catch (error) {
    console.warn('[Shell Env] ⚠️ 获取登录 shell PATH 失败:', getErrorMessage(error));
  }
  
  const configPaths = getPathFromShellConfigs();
  cachedShellPath = mergePaths(currentPath, shellPath, configPaths);
  
  return cachedShellPath;
}

/**
 * 重置缓存（/reload-env 指令调用）
 */
export function resetShellPathCache(): void {
  cachedShellPath = undefined;
  cachedShellEnv = undefined;
  console.info('[Shell Env] 🔄 PATH 和环境变量缓存已重置');
}

/**
 * 重置缓存（仅用于测试）
 */
export function resetShellPathCacheForTests(): void {
  cachedShellPath = undefined;
  cachedShellEnv = undefined;
}

/**
 * 从登录 shell 获取完整环境变量
 * 
 * 解决 Electron 主进程环境变量不完整的问题：
 * - macOS 通过 Dock/Finder 启动时不会加载 ~/.zshrc
 * - 导致 TAVILY_API_KEY 等用户自定义环境变量缺失
 * 
 * 降级策略：zsh -l → 手动解析配置文件
 */
export function getShellEnvFromLoginShell(opts: {
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Record<string, string> {
  if (cachedShellEnv !== undefined) return cachedShellEnv;

  // 基础：从 process.env 复制（过滤 undefined）
  const baseEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.env)) {
    if (value !== undefined) baseEnv[key] = value;
  }

  // Windows 直接使用当前环境变量
  if (process.platform === 'win32') {
    cachedShellEnv = baseEnv;
    return cachedShellEnv;
  }

  const timeoutMs =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs)
      ? Math.max(0, opts.timeoutMs)
      : DEFAULT_TIMEOUT_MS;

  const shell = resolveShell(opts.env);

  try {
    // 第一优先：-l -i（登录 + 交互式，加载 .zshrc）
    const result = require('child_process').spawnSync(shell, ['-l', '-c', 'env -0'], {
      timeout: timeoutMs,
      maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
      env: opts.env,
    });

    if (result.error || result.status !== 0 || !result.stdout) {
      throw new Error(result.error?.message || `shell 退出码: ${result.status}`);
    }

    for (const [key, value] of parseShellEnv(result.stdout as Buffer)) {
      baseEnv[key] = value;
    }

    // 补充：手动解析配置文件（补充 shell 未返回的简单静态变量）
    for (const [key, value] of getEnvFromShellConfigs()) {
      if (!baseEnv[key]) baseEnv[key] = value;
    }

    // 确保 PATH 使用合并后的完整版本
    baseEnv.PATH = getShellPathFromLoginShell(opts);

    console.info(`[Shell Env] ✅ 环境变量加载完成: 共 ${Object.keys(baseEnv).length} 个`);
  } catch (error) {
    console.warn('[Shell Env] ⚠️ 获取登录 shell 环境变量失败，使用配置文件 fallback:', getErrorMessage(error));
    // 最终 fallback：手动解析配置文件
    for (const [key, value] of getEnvFromShellConfigs()) {
      if (!baseEnv[key]) baseEnv[key] = value;
    }
    baseEnv.PATH = getShellPathFromLoginShell(opts);
  }

  cachedShellEnv = baseEnv;
  return cachedShellEnv;
}
