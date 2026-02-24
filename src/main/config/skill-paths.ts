/**
 * Skill 路径配置管理
 * 
 * 从 SystemConfigStore 读取 Skill 路径配置
 * 与工作目录配置统一管理
 * 支持多个 Skill 路径
 */

import * as path from 'path';
import * as os from 'os';
import { SystemConfigStore } from '../database/system-config-store';

/**
 * 展开路径中的 ~ 为实际的用户目录
 */
function expandPath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * 获取默认 Skill 路径（展开 ~ 为实际路径）
 */
export function getDefaultSkillPath(): string {
  try {
    const store = SystemConfigStore.getInstance();
    const settings = store.getWorkspaceSettings();
    
    return expandPath(settings.defaultSkillDir);
  } catch (error) {
    console.error('[Skill Paths] 读取配置失败，使用默认路径:', error);
    return path.join(os.homedir(), '.deepbot', 'skills');
  }
}

/**
 * 获取所有 Skill 路径（展开 ~ 为实际路径）
 */
export function getAllSkillPaths(): string[] {
  try {
    const store = SystemConfigStore.getInstance();
    const settings = store.getWorkspaceSettings();
    
    return settings.skillDirs.map(expandPath);
  } catch (error) {
    console.error('[Skill Paths] 读取配置失败，使用默认路径:', error);
    return [path.join(os.homedir(), '.deepbot', 'skills')];
  }
}

/**
 * 添加 Skill 路径
 */
export function addSkillPath(newPath: string): void {
  const store = SystemConfigStore.getInstance();
  store.addSkillDir(newPath);
  console.info('[Skill Paths] ✅ 已添加 Skill 路径:', newPath);
}

/**
 * 删除 Skill 路径
 */
export function removeSkillPath(pathToRemove: string): void {
  const store = SystemConfigStore.getInstance();
  store.removeSkillDir(pathToRemove);
  console.info('[Skill Paths] ✅ 已删除 Skill 路径:', pathToRemove);
}

/**
 * 设置默认 Skill 路径
 */
export function setDefaultSkillPath(newDefaultPath: string): void {
  const store = SystemConfigStore.getInstance();
  store.setDefaultSkillDir(newDefaultPath);
  console.info('[Skill Paths] ✅ 已设置默认 Skill 路径:', newDefaultPath);
}
