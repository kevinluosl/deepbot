/**
 * Skill Manager 安装功能
 */

import * as path from 'path';
import { getErrorMessage } from '../../../shared/utils/error-handler';
import * as fs from 'fs';
import type Database from 'better-sqlite3';
import type { InstallResult, InstalledSkill } from './types';
import { getSkillsDir, GITHUB_API_BASE } from './constants';
import { ensureDirectoryExists, isFile, safeRemove, isDirectory } from '../../../shared/utils/fs-utils';
import { safeWriteFile } from '../../../shared/utils/fs-utils';
import { parseSkillMetadata } from './utils';

/**
 * 检查是否为本地仓库
 */
function isLocalRepository(repository: string): boolean {
  return repository.startsWith('file://') || 
         repository.startsWith('/') || 
         repository.startsWith('~') ||
         repository.startsWith('./') ||
         repository.startsWith('../');
}

/**
 * 解析本地路径
 */
function parseLocalPath(repository: string): string {
  // 移除 file:// 前缀
  let localPath = repository.replace(/^file:\/\//, '');
  
  // 处理 ~ 开头的路径
  if (localPath.startsWith('~')) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    localPath = localPath.replace(/^~/, homeDir);
  }
  
  // 解析为绝对路径
  return path.resolve(localPath);
}

/**
 * 注册本地 Skill（不复制文件，直接使用现有目录）
 */
async function registerLocalSkill(
  repository: string,
  targetDir: string,
  skillName: string
): Promise<void> {
  const sourcePath = parseLocalPath(repository);
  
  console.info(`[Skill Manager] 注册本地 Skill: ${sourcePath}`);
  
  // 1. 检查源目录是否存在
  if (!isDirectory(sourcePath)) {
    throw new Error(`本地 Skill 目录不存在: ${sourcePath}`);
  }
  
  // 2. 检查是否为目录
  const stats = fs.statSync(sourcePath);
  if (!stats.isDirectory()) {
    throw new Error(`路径不是目录: ${sourcePath}`);
  }
  
  // 3. 检查是否包含 SKILL.md
  const skillMdPath = path.join(sourcePath, 'SKILL.md');
  if (!isFile(skillMdPath)) {
    throw new Error(`目录中缺少 SKILL.md 文件: ${sourcePath}`);
  }
  
  // 4. 如果源路径已经在 skills 目录中，直接使用
  const SKILLS_DIR = getSkillsDir();
  const normalizedSource = path.normalize(sourcePath);
  const normalizedTarget = path.normalize(targetDir);
  
  if (normalizedSource === normalizedTarget) {
    console.info(`[Skill Manager] Skill 已在正确位置，无需移动: ${sourcePath}`);
    return;
  }
  
  // 5. 如果源路径在 skills 目录中但名称不同，创建符号链接
  if (normalizedSource.startsWith(path.normalize(SKILLS_DIR))) {
    console.info(`[Skill Manager] 创建符号链接: ${normalizedSource} -> ${normalizedTarget}`);
    
    // 如果目标已存在，先删除
    safeRemove(normalizedTarget);
    
    // 创建符号链接
    fs.symlinkSync(normalizedSource, normalizedTarget, 'dir');
    return;
  }
  
  // 6. 如果源路径不在 skills 目录中，复制文件
  console.info(`[Skill Manager] 复制 Skill 文件: ${sourcePath} -> ${targetDir}`);
  
  // 如果目标已存在，先删除
  safeRemove(targetDir);
  
  // 递归复制目录
  copyDirectory(sourcePath, targetDir);
  
  console.info(`[Skill Manager] ✅ 本地 Skill 注册完成: ${targetDir}`);
}

/**
 * 递归复制目录
 */
function copyDirectory(source: string, target: string): void {
  // 创建目标目录
  ensureDirectoryExists(target);
  
  // 读取源目录
  const entries = fs.readdirSync(source, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    
    if (entry.isDirectory()) {
      // 递归复制子目录
      copyDirectory(sourcePath, targetPath);
    } else {
      // 复制文件
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

/**
 * 安装 Skill
 */
export async function installSkill(
  name: string,
  repository: string,
  db: Database.Database
): Promise<InstallResult> {
  try {
    console.info(`[Skill Manager] 开始安装 Skill: ${name}`);
    
    // 1. 检查是否已安装
    const existing = db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
    if (existing) {
      throw new Error(`Skill "${name}" 已安装`);
    }
    
    // 2. 确保 skills 目录存在
    const SKILLS_DIR = getSkillsDir();
    ensureDirectoryExists(SKILLS_DIR);
    
    // 3. 安装 Skill（根据 repository 类型选择安装方式）
    const skillDir = path.join(SKILLS_DIR, name);
    
    if (isLocalRepository(repository)) {
      // 本地安装：直接注册已存在的 Skill
      await registerLocalSkill(repository, skillDir, name);
    } else {
      // 远程安装：从 GitHub 下载
      await downloadSkillFromGitHub(repository, skillDir);
    }
    
    // 4. 解析 SKILL.md
    const metadata = parseSkillMetadata(skillDir);
    
    // 5. 保存到数据库
    const stmt = db.prepare(`
      INSERT INTO skills (name, version, enabled, repository, metadata)
      VALUES (?, ?, 1, ?, ?)
    `);
    
    stmt.run(
      name,
      metadata.version || '1.0.0',
      repository,
      JSON.stringify(metadata)
    );
    
    // 6. 返回结果
    const skill: InstalledSkill = {
      name,
      version: metadata.version || '1.0.0',
      enabled: true,
      installedAt: new Date(),
      usageCount: 0,
      repository,
    };
    
    console.info(`[Skill Manager] ✅ Skill 安装成功: ${name}`);
    
    return {
      success: true,
      skill,
      message: `Skill "${name}" 安装成功`,
      installPath: skillDir,
      dependencies: metadata.requires?.dependencies,
    };
  } catch (error) {
    console.error(`[Skill Manager] Skill 安装失败: ${name}`, error);
    throw new Error(`安装失败: ${getErrorMessage(error)}`);
  }
}

/**
 * 从 GitHub 下载 Skill
 */
async function downloadSkillFromGitHub(repository: string, targetDir: string): Promise<void> {
  // 解析仓库 URL
  const match = repository.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
  if (!match) {
    throw new Error(`无效的 GitHub 仓库 URL: ${repository}`);
  }
  
  const [, owner, repo, branch, skillPath] = match;
  
  console.info(`[Skill Manager] 下载 Skill: ${owner}/${repo}/${skillPath}`);
  
  // 1. 使用 GitHub API 获取 Skill 目录的文件列表
  const apiUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${skillPath}?ref=${branch}`;
  
  console.info(`[Skill Manager] 获取文件列表: ${apiUrl}`);
  
  const { httpGet } = await import('../../../shared/utils/http-utils');
  const response = await httpGet(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'DeepBot-Skill-Manager',
    },
  });
  
  if (!response.ok) {
    throw new Error(`获取文件列表失败: ${response.status} ${response.statusText}`);
  }
  
  const contents = response.data as any[];
  
  console.info(`[Skill Manager] 找到 ${contents.length} 个文件/目录`);
  
  // 2. 创建目标目录
  ensureDirectoryExists(targetDir);
  
  // 3. 递归下载所有文件
  await downloadDirectory(owner, repo, branch, skillPath, targetDir, contents);
  
  console.info(`[Skill Manager] ✅ Skill 下载完成: ${targetDir}`);
}

/**
 * 递归下载目录中的所有文件
 */
async function downloadDirectory(
  owner: string,
  repo: string,
  branch: string,
  remotePath: string,
  localPath: string,
  contents: any[]
): Promise<void> {
  for (const item of contents) {
    const itemLocalPath = path.join(localPath, item.name);
    
    if (item.type === 'file') {
      // 下载文件
      console.info(`[Skill Manager] 下载文件: ${item.name}`);
      
      // 使用 Raw URL 下载文件
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${remotePath}/${item.name}`;
      
      try {
        const { httpGet } = await import('../../../shared/utils/http-utils');
        const response = await httpGet(rawUrl);
        
        if (!response.ok) {
          console.warn(`[Skill Manager] 下载文件失败: ${item.name} (${response.status})`);
          continue;
        }
        
        const fileContent = response.data as ArrayBuffer;
        safeWriteFile(itemLocalPath, Buffer.from(fileContent));
      } catch (error) {
        console.warn(`[Skill Manager] 下载文件失败: ${item.name}`, error);
      }
    } else if (item.type === 'dir') {
      // 递归下载子目录
      console.info(`[Skill Manager] 进入目录: ${item.name}`);
      
      // 创建子目录
      ensureDirectoryExists(itemLocalPath);
      
      // 获取子目录的文件列表
      const subApiUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${remotePath}/${item.name}?ref=${branch}`;
      
      try {
        const { httpGet } = await import('../../../shared/utils/http-utils');
        const response = await httpGet(subApiUrl, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'DeepBot-Skill-Manager',
          },
        });
        
        if (!response.ok) {
          console.warn(`[Skill Manager] 获取子目录失败: ${item.name} (${response.status})`);
          continue;
        }
        
        const subContents = response.data as any[];
        
        // 递归下载
        await downloadDirectory(owner, repo, branch, `${remotePath}/${item.name}`, itemLocalPath, subContents);
      } catch (error) {
        console.warn(`[Skill Manager] 处理子目录失败: ${item.name}`, error);
      }
    }
  }
}
