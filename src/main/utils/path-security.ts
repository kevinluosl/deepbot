/**
 * 路径安全检查工具
 * 
 * 统一管理文件路径的安全检查，确保只能访问配置的目录
 */

import * as path from 'path';
import { tmpdir } from 'os';
import { SystemConfigStore } from '../database/system-config-store';
import { getDbDir, isDockerMode } from '../../shared/utils/docker-utils';

/**
 * 展开路径中的 ~ 为用户主目录
 * 
 * @param filePath - 文件路径
 * @returns 展开后的路径
 */
export function expandHomePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return filePath.replace(/^~/, process.env.HOME || '~');
  }
  return filePath;
}

/**
 * 获取所有允许访问的目录（绝对路径）
 * 
 * @returns 允许的目录列表
 */
export function getAllowedDirectories(): string[] {
  const store = SystemConfigStore.getInstance();
  const settings = store.getWorkspaceSettings();
  
  // Docker 模式下用 /data/db，Electron 模式下用 ~/.deepbot
  const extraDir = getDbDir();

  const dirs = [
    ...settings.workspaceDirs.map(dir => path.resolve(dir)),
    path.resolve(extraDir),
    path.resolve(settings.scriptDir),
    ...settings.skillDirs.map(dir => path.resolve(dir)),
    path.resolve(settings.imageDir),
    path.resolve(settings.memoryDir),
    path.resolve(settings.sessionDir),
    path.resolve(tmpdir()),
  ];
  
  // 添加常见系统临时目录（跨平台兼容）
  // macOS 的 tmpdir() 返回 /var/folders/...，但 /tmp 和 /private/tmp 也常用
  if (process.platform === 'darwin') {
    dirs.push('/tmp', '/private/tmp');
  } else if (process.platform === 'linux') {
    dirs.push('/tmp', '/var/tmp');
  } else if (process.platform === 'win32') {
    // Windows 临时目录
    const winTemp = process.env.TEMP || process.env.TMP;
    if (winTemp) dirs.push(path.resolve(winTemp));
    dirs.push('C:\\Windows\\Temp', 'C:\\Temp');
  }
  
  return dirs;
}

/**
 * 检查文件路径是否在允许的范围内
 * 
 * 允许访问以下目录及其子目录：
 * - 工作目录 (workspaceDir)
 * - Python 脚本目录 (scriptDir)
 * - Skill 目录 (skillDirs)
 * - 图片生成目录 (imageDir)
 * 
 * @param filePath - 文件路径（支持 ~ 开头）
 * @returns 是否允许访问
 */
export function isPathAllowed(filePath: string): boolean {
  // Docker 模式下跳过路径检查（容器内目录已固定，无需限制）
  if (isDockerMode()) return true;

  // 展开 ~ 为用户主目录
  const expandedPath = expandHomePath(filePath);
  
  // 解析为绝对路径并规范化
  const resolvedPath = path.resolve(expandedPath);
  const normalizedPath = path.normalize(resolvedPath);
  
  // 获取所有允许的目录
  const allowedDirs = getAllowedDirectories();
  
  // 检查是否在任一允许的目录内
  return allowedDirs.some(allowedDir => {
    const normalizedAllowedDir = path.normalize(allowedDir);
    // 确保目录路径以分隔符结尾，避免部分匹配
    const dirWithSep = normalizedAllowedDir.endsWith(path.sep) 
      ? normalizedAllowedDir 
      : normalizedAllowedDir + path.sep;
    
    return normalizedPath.startsWith(dirWithSep) || normalizedPath === normalizedAllowedDir;
  });
}

/**
 * 断言文件路径在允许的范围内（不允许则抛出异常）
 * 
 * @param filePath - 文件路径
 * @throws 如果路径不在允许的范围内
 */
export function assertPathAllowed(filePath: string): void {
  if (!isPathAllowed(filePath)) {
    const store = SystemConfigStore.getInstance();
    const settings = store.getWorkspaceSettings();
    
    // 展开路径用于错误消息
    const expandedPath = expandHomePath(filePath);
    const resolvedPath = path.resolve(expandedPath);
    
    // Docker 模式用 /data/db，Electron 模式用 ~/.deepbot
    const extraDir = getDbDir();

    const isEn = SystemConfigStore.getInstance().getAppSetting('language') === 'en';

    throw new Error(
      isEn
        ? `Security restriction: Can only access files within configured directories\n` +
          `Allowed directories:\n` +
          `  - Default workspace: ${extraDir}\n` +
          `  - Workspace directories: ${settings.workspaceDirs.join(', ')}\n` +
          `  - Script directory: ${settings.scriptDir}\n` +
          `  - Skill directories: ${settings.skillDirs.join(', ')}\n` +
          `  - Image directory: ${settings.imageDir}\n` +
          `  - Memory directory: ${settings.memoryDir}\n` +
          `  - Session directory: ${settings.sessionDir}\n` +
          `  - Temp directory: ${tmpdir()}\n` +
          `Requested path: ${resolvedPath}\n` +
          `Tip: Configure workspace directory in Settings`
        : `安全限制：只能访问配置的目录及其子目录内的文件\n` +
          `允许的目录：\n` +
          `  - 默认工作目录: ${extraDir}\n` +
          `  - 工作目录: ${settings.workspaceDirs.join(', ')}\n` +
          `  - 脚本目录: ${settings.scriptDir}\n` +
          `  - Skill 目录: ${settings.skillDirs.join(', ')}\n` +
          `  - 图片目录: ${settings.imageDir}\n` +
          `  - 记忆目录: ${settings.memoryDir}\n` +
          `  - 会话目录: ${settings.sessionDir}\n` +
          `  - 临时目录: ${tmpdir()}\n` +
          `请求路径: ${resolvedPath}\n` +
          `提示：请在系统设置中配置工作目录`
    );
  }
}
