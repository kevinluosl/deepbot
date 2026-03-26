/**
 * Shell 环境变量工具
 * 
 * 职责：
 * - 从登录 shell 获取完整的 PATH
 * - 解决 Electron 主进程 PATH 不完整的问题
 * 
 */

import { execFileSync } from 'node:child_process';
import { getErrorMessage } from '../../shared/utils/error-handler';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BUFFER_BYTES = 2 * 1024 * 1024;

// 缓存 shell PATH，避免重复执行
let cachedShellPath: string | undefined;

/**
 * 解析 shell 环境变量输出
 * 
 * @param stdout - shell 输出的环境变量（\0 分隔）
 * @returns 环境变量 Map
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
    
    if (!key) continue;
    shellEnv.set(key, value);
  }
  
  return shellEnv;
}

/**
 * 解析 shell 路径
 * 
 * @param env - 进程环境变量
 * @returns shell 路径
 */
function resolveShell(env: NodeJS.ProcessEnv): string {
  const shell = env.SHELL?.trim();
  return shell && shell.length > 0 ? shell : '/bin/sh';
}

/**
 * 从 shell 配置文件中提取 PATH
 * 
 * 解析 ~/.zshrc, ~/.bashrc 等文件，提取 PATH 相关的配置
 * 
 * @param configFile - 配置文件路径
 * @returns 提取的 PATH 数组
 */
function extractPathFromShellConfig(configFile: string): string[] {
  const paths: string[] = [];
  
  try {
    const fs = require('fs');
    if (!fs.existsSync(configFile)) {
      return paths;
    }
    
    const content = fs.readFileSync(configFile, 'utf-8');
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过注释和空行
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // 匹配 export PATH=... 或 PATH=...
      const pathMatch = trimmed.match(/^(?:export\s+)?PATH=["']?([^"']+)["']?/);
      if (pathMatch) {
        const pathValue = pathMatch[1];
        // 展开 $PATH 变量
        const expandedPaths = pathValue.split(':').filter(Boolean);
        for (const p of expandedPaths) {
          if (p !== '$PATH' && !p.includes('$')) {
            // 展开 ~ 为 HOME
            const expanded = p.replace(/^~/, process.env.HOME || '~');
            paths.push(expanded);
          }
        }
      }
      
      // 匹配 export PATH="...:$PATH" 或 PATH="...:$PATH"
      const prependMatch = trimmed.match(/^(?:export\s+)?PATH=["']?([^"':]+):?\$PATH["']?/);
      if (prependMatch) {
        const pathValue = prependMatch[1];
        const expanded = pathValue.replace(/^~/, process.env.HOME || '~');
        paths.push(expanded);
      }
      
      // 匹配 export PATH="$PATH:..." 或 PATH="$PATH:..."
      const appendMatch = trimmed.match(/^(?:export\s+)?PATH=["']?\$PATH:([^"']+)["']?/);
      if (appendMatch) {
        const pathValue = appendMatch[1];
        const expanded = pathValue.replace(/^~/, process.env.HOME || '~');
        paths.push(expanded);
      }
    }
    
    console.info(`[Shell Env] 📝 从 ${configFile} 提取了 ${paths.length} 个 PATH`);
  } catch (error) {
    console.warn(`[Shell Env] ⚠️ 读取 ${configFile} 失败:`, getErrorMessage(error));
  }
  
  return paths;
}

/**
 * 检测并加载 nvm PATH
 * 
 * nvm 通过脚本动态设置 PATH，需要特殊处理
 */
function getNvmPath(): string[] {
  const paths: string[] = [];
  
  try {
    const fs = require('fs');
    const homeDir = process.env.HOME;
    if (!homeDir) {
      console.warn('[Shell Env] ⚠️ HOME 环境变量不存在');
      return paths;
    }
    
    console.info('[Shell Env] 🔍 开始检测 nvm PATH...');
    
    // 1. 优先使用 NVM_BIN 环境变量（如果 nvm.sh 已加载）
    const nvmBin = process.env.NVM_BIN;
    console.info(`[Shell Env] 📝 NVM_BIN 环境变量: ${nvmBin || '(不存在)'}`);
    if (nvmBin && fs.existsSync(nvmBin)) {
      paths.push(nvmBin);
      console.info(`[Shell Env] ✅ 使用 NVM_BIN 环境变量: ${nvmBin}`);
      return paths;
    }
    
    // 2. 检查 NVM_DIR 环境变量
    let nvmDir = process.env.NVM_DIR;
    console.info(`[Shell Env] 📝 NVM_DIR 环境变量: ${nvmDir || '(不存在)'}`);
    
    // 3. 如果没有，尝试从配置文件中读取
    if (!nvmDir) {
      console.info('[Shell Env] 📝 尝试从配置文件读取 NVM_DIR...');
      const configFiles = [
        `${homeDir}/.zshrc`,
        `${homeDir}/.zprofile`,
        `${homeDir}/.bashrc`,
        `${homeDir}/.bash_profile`,
      ];
      
      for (const configFile of configFiles) {
        if (fs.existsSync(configFile)) {
          const content = fs.readFileSync(configFile, 'utf-8');
          const match = content.match(/export\s+NVM_DIR=["']?([^"'\n]+)["']?/);
          if (match) {
            nvmDir = match[1].replace(/\$HOME/g, homeDir).replace(/~/g, homeDir);
            console.info(`[Shell Env] ✅ 从 ${configFile} 读取到 NVM_DIR: ${nvmDir}`);
            break;
          }
        }
      }
    }
    
    // 4. 默认 nvm 目录
    if (!nvmDir) {
      nvmDir = `${homeDir}/.nvm`;
      console.info(`[Shell Env] 📝 使用默认 NVM_DIR: ${nvmDir}`);
    }
    
    // 5. 检查 nvm 目录是否存在
    if (!fs.existsSync(nvmDir)) {
      console.warn(`[Shell Env] ⚠️ nvm 目录不存在: ${nvmDir}`);
      return paths;
    }
    
    console.info(`[Shell Env] ✅ nvm 目录存在: ${nvmDir}`);
    
    // 6. 读取默认 Node.js 版本
    const defaultAliasPath = `${nvmDir}/alias/default`;
    console.info(`[Shell Env] 📝 检查 alias/default 文件: ${defaultAliasPath}`);
    
    if (fs.existsSync(defaultAliasPath)) {
      let version = fs.readFileSync(defaultAliasPath, 'utf-8').trim();
      console.info(`[Shell Env] 📝 读取到版本号: "${version}"`);
      
      // 如果版本号不是完整格式（如 "24" 而不是 "v24.11.1"），需要解析实际版本
      if (!version.startsWith('v')) {
        console.info(`[Shell Env] 📝 版本号不完整，尝试解析...`);
        // 尝试从 versions/node/ 目录找到匹配的版本
        const versionsDir = `${nvmDir}/versions/node`;
        if (fs.existsSync(versionsDir)) {
          const allVersions = fs.readdirSync(versionsDir);
          console.info(`[Shell Env] 📝 找到 ${allVersions.length} 个已安装版本: ${allVersions.join(', ')}`);
          // 找到以 "v{version}." 开头的版本（如 v24.11.1）
          const matchedVersion = allVersions.find((v: string) => v.startsWith(`v${version}.`));
          if (matchedVersion) {
            version = matchedVersion;
            console.info(`[Shell Env] ✅ nvm alias 解析: ${fs.readFileSync(defaultAliasPath, 'utf-8').trim()} -> ${version}`);
          } else {
            console.warn(`[Shell Env] ⚠️ 未找到匹配的版本，查找模式: v${version}.*`);
          }
        } else {
          console.warn(`[Shell Env] ⚠️ versions/node 目录不存在: ${versionsDir}`);
        }
      }
      
      const nvmNodeBin = `${nvmDir}/versions/node/${version}/bin`;
      console.info(`[Shell Env] 📝 构建 nvm bin 路径: ${nvmNodeBin}`);
      
      if (fs.existsSync(nvmNodeBin)) {
        paths.push(nvmNodeBin);
        console.info(`[Shell Env] ✅ 从 nvm alias/default 读取版本: ${version}`);
        console.info(`[Shell Env] ✅ nvm PATH: ${nvmNodeBin}`);
      } else {
        console.warn(`[Shell Env] ⚠️ nvm bin 目录不存在: ${nvmNodeBin}`);
      }
    } else {
      console.warn(`[Shell Env] ⚠️ alias/default 文件不存在: ${defaultAliasPath}`);
    }
  } catch (error) {
    console.error('[Shell Env] ❌ 检测 nvm PATH 失败:', getErrorMessage(error));
  }
  
  return paths;
}

/**
 * 从 shell 配置文件获取 PATH
 * 
 * 按优先级读取多个配置文件
 */
function getPathFromShellConfigs(): string[] {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    return [];
  }
  
  const configFiles = [
    `${homeDir}/.zshrc`,      // zsh 配置
    `${homeDir}/.zprofile`,   // zsh profile
    `${homeDir}/.bashrc`,     // bash 配置
    `${homeDir}/.bash_profile`, // bash profile
    `${homeDir}/.profile`,    // 通用 profile
  ];
  
  const allPaths: string[] = [];
  
  // 1. 从配置文件提取 PATH
  for (const configFile of configFiles) {
    const paths = extractPathFromShellConfig(configFile);
    allPaths.push(...paths);
  }
  
  // 2. 特殊处理：nvm PATH
  const nvmPaths = getNvmPath();
  allPaths.push(...nvmPaths);
  
  return allPaths;
}

/**
 * 合并 PATH
 * 
 * 将当前 PATH、shell PATH 和配置文件 PATH 合并，去重
 * 
 * @param currentPath - 当前 PATH
 * @param shellPath - Shell PATH
 * @param configPaths - 配置文件 PATH
 * @returns 合并后的 PATH
 */
function mergePaths(currentPath: string, shellPath: string | null, configPaths: string[]): string {
  // 收集所有路径
  const allPaths: string[] = [];
  
  // 1. 当前 PATH（优先级最高，保持在前面）
  if (currentPath) {
    allPaths.push(...currentPath.split(':').filter(Boolean));
  }
  
  // 2. Shell PATH（补充缺失的路径）
  if (shellPath) {
    allPaths.push(...shellPath.split(':').filter(Boolean));
  }
  
  // 3. 配置文件 PATH（最后补充）
  allPaths.push(...configPaths);
  
  // 去重（保持顺序，第一次出现的路径优先）
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
 * 从登录 shell 获取 PATH
 * 
 * 解决 Electron 主进程 PATH 不完整的问题：
 * - macOS: Electron 启动时不会加载 ~/.zshrc 等配置
 * - 导致 pnpm、nvm 等工具不在 PATH 中
 * 
 * 解决方案：
 * - 执行 `shell -l -c "env -0"` 获取登录 shell 的完整环境
 * - 提取 PATH 并与当前 PATH 合并
 * - 不依赖硬编码路径，完全从环境变量获取
 * 
 * @param opts - 选项
 * @returns 合并后的 PATH 字符串
 */
export function getShellPathFromLoginShell(opts: {
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): string {
  // 使用缓存
  if (cachedShellPath !== undefined) {
    return cachedShellPath;
  }
  
  const currentPath = process.env.PATH || '';
  
  // Windows 直接使用当前 PATH
  if (process.platform === 'win32') {
    cachedShellPath = currentPath;
    console.info('[Shell Env] 📝 Windows 平台，使用当前 PATH');
    return cachedShellPath;
  }
  
  const timeoutMs =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs)
      ? Math.max(0, opts.timeoutMs)
      : DEFAULT_TIMEOUT_MS;
  
  const shell = resolveShell(opts.env);
  
  let shellPath: string | null = null;
  
  try {
    // 执行登录 shell 获取环境变量
    // -l: 登录 shell（加载 ~/.zshrc 等配置）
    // -c: 执行命令
    // env -0: 输出环境变量（\0 分隔）
    const stdout = execFileSync(shell, ['-l', '-c', 'env -0'], {
      encoding: 'buffer',
      timeout: timeoutMs,
      maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    // 解析环境变量
    const shellEnv = parseShellEnv(stdout);
    shellPath = shellEnv.get('PATH')?.trim() || null;
    
    if (shellPath) {
      console.info('[Shell Env] ✅ 成功获取登录 shell PATH');
      console.info(`  Shell PATH 长度: ${shellPath.length} 字符`);
      console.info(`  Shell PATH 包含: ${shellPath.split(':').length} 个路径`);
    } else {
      console.warn('[Shell Env] ⚠️ 登录 shell PATH 为空');
    }
  } catch (error) {
    console.warn('[Shell Env] ⚠️ 获取登录 shell PATH 失败:', getErrorMessage(error));
    console.warn('[Shell Env] 📝 Shell:', shell);
    console.warn('[Shell Env] 📝 将使用当前 PATH');
  }
  
  // 合并当前 PATH、shell PATH 和配置文件 PATH
  const configPaths = getPathFromShellConfigs();
  
  if (shellPath) {
    cachedShellPath = mergePaths(currentPath, shellPath, configPaths);
  } else {
    cachedShellPath = mergePaths(currentPath, null, configPaths);
  }
  
  console.info('[Shell Env] ✅ 最终 PATH 配置完成');
  console.info(`  最终 PATH 长度: ${cachedShellPath.length} 字符`);
  console.info(`  最终 PATH 包含: ${cachedShellPath.split(':').length} 个路径`);
  console.info(`  配置文件贡献: ${configPaths.length} 个路径`);
  
  return cachedShellPath;
}

/**
 * 应用 shell PATH 到环境变量
 * 
 * @param env - 环境变量对象
 * @param shellPath - 合并后的 PATH
 */
export function applyShellPath(
  env: Record<string, string>,
  shellPath: string,
): void {
  env.PATH = shellPath;
  console.log('[Shell Env] 📝 已应用合并后的 PATH');
}

/**
 * 重置缓存（用于刷新环境变量）
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

// 缓存完整的 shell 环境变量
let cachedShellEnv: Record<string, string> | undefined;

/**
 * 从登录 shell 获取完整环境变量
 * 
 * 解决 Electron 主进程环境变量不完整的问题：
 * - macOS 通过 Dock/Finder 启动时不会加载 ~/.zshrc
 * - 导致 TAVILY_API_KEY 等用户自定义环境变量缺失
 * 
 * @param opts - 选项
 * @returns 合并后的完整环境变量（process.env + shell env）
 */
export function getShellEnvFromLoginShell(opts: {
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Record<string, string> {
  // 使用缓存
  if (cachedShellEnv !== undefined) {
    return cachedShellEnv;
  }

  // 基础环境变量：从 process.env 复制（过滤 undefined）
  const baseEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.env)) {
    if (value !== undefined) {
      baseEnv[key] = value;
    }
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
    const stdout = execFileSync(shell, ['-l', '-c', 'env -0'], {
      encoding: 'buffer',
      timeout: timeoutMs,
      maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const shellEnv = parseShellEnv(stdout);

    // 合并：shell 环境变量覆盖 process.env（shell 中的更完整）
    // 但保留 process.env 中 shell 没有的变量
    for (const [key, value] of shellEnv) {
      baseEnv[key] = value;
    }

    // 确保 PATH 使用合并后的版本（包含配置文件补充的路径）
    const shellPath = getShellPathFromLoginShell(opts);
    baseEnv.PATH = shellPath;

    console.info('[Shell Env] ✅ 成功获取登录 shell 完整环境变量');
    console.info(`  环境变量数量: ${Object.keys(baseEnv).length}`);
  } catch (error) {
    console.warn('[Shell Env] ⚠️ 获取登录 shell 环境变量失败:', getErrorMessage(error));
    // 失败时仍然确保 PATH 是合并后的
    const shellPath = getShellPathFromLoginShell(opts);
    baseEnv.PATH = shellPath;
  }

  cachedShellEnv = baseEnv;
  return cachedShellEnv;
}
