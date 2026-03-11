/**
 * 工作目录配置管理
 */

import type Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getKeyValueBatch, setKeyValue } from '../../shared/utils/db-utils';
import { safeJsonParse, safeJsonStringify } from '../../shared/utils/json-utils';
import type { WorkspaceSettings } from './config-types';

/**
 * 获取默认工作目录配置（绝对路径）
 */
export function getDefaultWorkspaceSettings(): WorkspaceSettings {
  return {
    workspaceDir: homedir(), // 默认工作目录为用户主目录
    scriptDir: join(homedir(), '.deepbot', 'scripts'),
    skillDirs: [join(homedir(), '.agents', 'skills')],
    defaultSkillDir: join(homedir(), '.agents', 'skills'),
    imageDir: join(homedir(), '.deepbot', 'generated-images'),
    memoryDir: join(homedir(), '.deepbot', 'memory'),
    sessionDir: join(homedir(), '.deepbot', 'sessions'), // 🔥 新增：session 目录
  };
}

/**
 * 获取工作目录配置
 */
export function getWorkspaceSettings(db: Database.Database): WorkspaceSettings {
  const defaultSettings = getDefaultWorkspaceSettings();

  try {
    const values = getKeyValueBatch(db, 'workspace_settings', [
      'workspaceDir',
      'scriptDir',
      'skillDirs',
      'defaultSkillDir',
      'imageDir',
      'memoryDir',
      'sessionDir' // 🔥 新增
    ]);

    // 解析 skillDirs（JSON 数组）
    const skillDirs = values.skillDirs
      ? safeJsonParse<string[]>(values.skillDirs, defaultSettings.skillDirs)
      : defaultSettings.skillDirs;

    return {
      workspaceDir: values.workspaceDir || defaultSettings.workspaceDir,
      scriptDir: values.scriptDir || defaultSettings.scriptDir,
      skillDirs,
      defaultSkillDir: values.defaultSkillDir || defaultSettings.defaultSkillDir,
      imageDir: values.imageDir || defaultSettings.imageDir,
      memoryDir: values.memoryDir || defaultSettings.memoryDir,
      sessionDir: values.sessionDir || defaultSettings.sessionDir, // 🔥 新增
    };
  } catch (error) {
    console.error('获取工作目录配置失败:', error);
    return defaultSettings;
  }
}

/**
 * 保存工作目录配置（同时保存所有配置）
 */
export function saveWorkspaceSettings(db: Database.Database, settings: WorkspaceSettings): void {
  saveWorkspaceDir(db, settings.workspaceDir);
  saveScriptDir(db, settings.scriptDir);
  saveSkillDirs(db, settings.skillDirs);
  saveDefaultSkillDir(db, settings.defaultSkillDir);
  saveImageDir(db, settings.imageDir);
  saveMemoryDir(db, settings.memoryDir);
  saveSessionDir(db, settings.sessionDir); // 🔥 新增
}

/**
 * 保存默认工作目录
 */
function saveWorkspaceDir(db: Database.Database, workspaceDir: string): void {
  setKeyValue(db, 'workspace_settings', 'workspaceDir', workspaceDir);
  console.info('[SystemConfigStore] ✅ 默认工作目录已保存:', workspaceDir);
}

/**
 * 保存 Python 脚本目录配置
 */
export function saveScriptDir(db: Database.Database, scriptDir: string): void {
  setKeyValue(db, 'workspace_settings', 'scriptDir', scriptDir);
  console.info('[SystemConfigStore] ✅ Python 脚本目录已保存:', scriptDir);
}

/**
 * 保存 Skill 目录列表
 */
export function saveSkillDirs(db: Database.Database, skillDirs: string[]): void {
  setKeyValue(db, 'workspace_settings', 'skillDirs', safeJsonStringify(skillDirs));
  console.info('[SystemConfigStore] ✅ Skill 目录列表已保存:', skillDirs);
}

/**
 * 保存默认 Skill 目录
 */
export function saveDefaultSkillDir(db: Database.Database, defaultSkillDir: string): void {
  setKeyValue(db, 'workspace_settings', 'defaultSkillDir', defaultSkillDir);
  console.info('[SystemConfigStore] ✅ 默认 Skill 目录已保存:', defaultSkillDir);
}

/**
 * 保存图片生成目录配置
 */
export function saveImageDir(db: Database.Database, imageDir: string): void {
  setKeyValue(db, 'workspace_settings', 'imageDir', imageDir);
  console.info('[SystemConfigStore] ✅ 图片生成目录已保存:', imageDir);
}

/**
 * 保存记忆管理目录配置
 */
export function saveMemoryDir(db: Database.Database, memoryDir: string): void {
  setKeyValue(db, 'workspace_settings', 'memoryDir', memoryDir);
  console.info('[SystemConfigStore] ✅ 记忆管理目录已保存:', memoryDir);
}

/**
 * 保存 session 目录配置
 */
export function saveSessionDir(db: Database.Database, sessionDir: string): void {
  setKeyValue(db, 'workspace_settings', 'sessionDir', sessionDir);
  console.info('[SystemConfigStore] ✅ Session 目录已保存:', sessionDir);
}

/**
 * 添加 Skill 目录
 */
export function addSkillDir(db: Database.Database, newDir: string): WorkspaceSettings {
  const settings = getWorkspaceSettings(db);
  
  // 检查是否已存在
  if (settings.skillDirs.includes(newDir)) {
    throw new Error(`Skill 目录已存在: ${newDir}`);
  }
  
  // 添加新目录
  settings.skillDirs.push(newDir);
  saveSkillDirs(db, settings.skillDirs);
  
  return settings;
}

/**
 * 删除 Skill 目录
 */
export function removeSkillDir(db: Database.Database, dirToRemove: string): WorkspaceSettings {
  const settings = getWorkspaceSettings(db);
  
  // 检查是否是默认目录
  if (dirToRemove === settings.defaultSkillDir) {
    throw new Error('不能删除默认 Skill 目录，请先设置其他目录为默认目录');
  }
  
  // 检查是否存在
  const index = settings.skillDirs.indexOf(dirToRemove);
  if (index === -1) {
    throw new Error(`Skill 目录不存在: ${dirToRemove}`);
  }
  
  // 删除目录
  settings.skillDirs.splice(index, 1);
  saveSkillDirs(db, settings.skillDirs);
  
  return settings;
}

/**
 * 设置默认 Skill 目录
 */
export function setDefaultSkillDir(db: Database.Database, newDefaultDir: string): WorkspaceSettings {
  const settings = getWorkspaceSettings(db);
  
  // 检查是否在列表中
  if (!settings.skillDirs.includes(newDefaultDir)) {
    throw new Error(`Skill 目录不在列表中: ${newDefaultDir}`);
  }
  
  // 设置默认目录
  settings.defaultSkillDir = newDefaultDir;
  saveDefaultSkillDir(db, newDefaultDir);
  
  return settings;
}
