/**
 * Skill Manager 管理功能（列表、卸载、详情）
 */

import * as path from 'path';
import * as fs from 'fs';
import type Database from '../../../shared/utils/sqlite-adapter';
import type { InstalledSkill, SkillInfo } from './types';
import { getAllSkillPaths } from '../../config/skill-paths';
import { parseSkillMetadata, scanDirectory } from './utils';
import { isDirectory, isFile, safeReadFile, safeRemove } from '../../../shared/utils/fs-utils';
import { safeJsonParse } from '../../../shared/utils/json-utils';

/**
 * 列出已安装的 Skill
 */
export function listInstalledSkills(
  db: Database.Database,
  filter?: { enabled?: boolean }
): InstalledSkill[] {
  // 从所有配置的路径扫描 Skills
  const allPaths = getAllSkillPaths();
  const allSkills: InstalledSkill[] = [];
  
  for (const skillPath of allPaths) {
    if (!isDirectory(skillPath)) {
      console.warn(`[Skill Manager] 路径不存在: ${skillPath}`);
      continue;
    }
    
    try {
      const dirs = fs.readdirSync(skillPath);
      
      for (const dir of dirs) {
        const fullPath = path.join(skillPath, dir);
        const stat = fs.statSync(fullPath);
        
        if (!stat.isDirectory()) {
          continue;
        }
        
        // 检查是否有 SKILL.md
        const skillMdPath = path.join(fullPath, 'SKILL.md');
        if (!isFile(skillMdPath)) {
          continue;
        }
        
        // 从数据库获取信息（如果存在）
        const row = db.prepare('SELECT * FROM skills WHERE name = ?').get(dir) as any;
        
        if (row) {
          // 数据库中有记录
          allSkills.push({
            name: row.name,
            version: row.version,
            enabled: Boolean(row.enabled),
            installedAt: new Date(row.installed_at),
            lastUsed: row.last_used ? new Date(row.last_used) : undefined,
            usageCount: row.usage_count,
            repository: row.repository,
          });
        } else {
          // 数据库中没有记录，创建新记录
          try {
            const metadata = parseSkillMetadata(fullPath);
            
            const stmt = db.prepare(`
              INSERT INTO skills (name, version, enabled, repository, metadata)
              VALUES (?, ?, 1, ?, ?)
            `);
            
            stmt.run(
              dir,
              metadata.version || '1.0.0',
              metadata.repository || '',
              JSON.stringify(metadata)
            );
            
            allSkills.push({
              name: dir,
              version: metadata.version || '1.0.0',
              enabled: true,
              installedAt: new Date(),
              usageCount: 0,
              repository: metadata.repository || '',
            });
            
            console.log(`[Skill Manager] 自动注册 Skill: ${dir}`);
          } catch (error) {
            console.warn(`[Skill Manager] 无法解析 Skill: ${dir}`, error);
          }
        }
      }
    } catch (error) {
      console.error(`[Skill Manager] 扫描路径失败: ${skillPath}`, error);
    }
  }
  
  // 应用过滤条件
  let filteredSkills = allSkills;
  
  if (filter?.enabled !== undefined) {
    filteredSkills = allSkills.filter(s => s.enabled === filter.enabled);
  }
  
  // 按使用次数和安装时间排序
  filteredSkills.sort((a, b) => {
    if (a.usageCount !== b.usageCount) {
      return b.usageCount - a.usageCount;
    }
    return b.installedAt.getTime() - a.installedAt.getTime();
  });
  
  return filteredSkills;
}

/**
 * 卸载 Skill
 */
export function uninstallSkill(name: string, db: Database.Database): void {
  // 1. 从数据库删除
  const stmt = db.prepare('DELETE FROM skills WHERE name = ?');
  const result = stmt.run(name);
  
  if (result.changes === 0) {
    throw new Error(`Skill "${name}" 不存在`);
  }
  
  // 2. 删除文件
  // 从所有路径中查找 Skill
  const allPaths = getAllSkillPaths();
  let skillDir: string | null = null;
  
  for (const basePath of allPaths) {
    const candidatePath = path.join(basePath, name);
    if (fs.existsSync(candidatePath)) {
      skillDir = candidatePath;
      break;
    }
  }
  
  if (skillDir) {
    safeRemove(skillDir);
  }
  
  console.info(`[Skill Manager] ✅ Skill 已卸载: ${name}`);
}

/**
 * 获取 Skill 的 .env 文件内容
 */
export function getSkillEnv(name: string): string {
  const allPaths = getAllSkillPaths();
  for (const basePath of allPaths) {
    const envPath = path.join(basePath, name, '.env');
    if (isFile(envPath)) {
      return safeReadFile(envPath, '');
    }
  }
  return '';
}

/**
 * 保存 Skill 的 .env 文件
 */
export function setSkillEnv(name: string, envContent: string): void {
  const allPaths = getAllSkillPaths();
  let skillDir: string | null = null;
  
  for (const basePath of allPaths) {
    const candidatePath = path.join(basePath, name);
    if (isDirectory(candidatePath)) {
      skillDir = candidatePath;
      break;
    }
  }
  
  if (!skillDir) {
    throw new Error(`Skill "${name}" 的目录不存在`);
  }
  
  const envPath = path.join(skillDir, '.env');
  fs.writeFileSync(envPath, envContent, 'utf-8');
  console.info(`[Skill Manager] ✅ Skill "${name}" 环境变量已保存: ${envPath}`);
}

/**
 * 读取所有已安装 Skill 的 .env 文件，合并为环境变量 Map
 */
export function getAllSkillEnvVars(): Map<string, string> {
  const allEnv = new Map<string, string>();
  const allPaths = getAllSkillPaths();
  
  for (const basePath of allPaths) {
    if (!isDirectory(basePath)) continue;
    
    try {
      const dirs = fs.readdirSync(basePath);
      for (const dir of dirs) {
        const envPath = path.join(basePath, dir, '.env');
        if (!isFile(envPath)) continue;
        
        const content = safeReadFile(envPath, '');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          // 支持 KEY=VALUE 和 export KEY=VALUE 格式
          const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=["']?([^"']*)["']?$/);
          if (match) {
            const [, key, value] = match;
            if (key && value !== undefined) {
              allEnv.set(key, value);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[Skill Manager] 读取 Skill 环境变量失败: ${basePath}`, error);
    }
  }
  
  return allEnv;
}


export function getSkillInfo(name: string, db: Database.Database): SkillInfo {
  // 1. 从数据库获取基本信息
  const row = db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
  
  if (!row) {
    throw new Error(`Skill "${name}" 不存在`);
  }
  
  const metadata = safeJsonParse<any>(row.metadata, {});
  
  // 2. 读取 README
  // 从所有路径中查找 Skill
  const allPaths = getAllSkillPaths();
  let skillDir: string | null = null;
  
  for (const basePath of allPaths) {
    const candidatePath = path.join(basePath, name);
    if (isDirectory(candidatePath)) {
      skillDir = candidatePath;
      break;
    }
  }
  
  if (!skillDir) {
    throw new Error(`Skill "${name}" 的文件不存在`);
  }
  
  const readmePath = path.join(skillDir, 'SKILL.md');
  const readme = safeReadFile(readmePath, '无说明');
  
  // 3. 扫描文件
  const files = {
    scripts: scanDirectory(path.join(skillDir, 'scripts')),
    references: scanDirectory(path.join(skillDir, 'references')),
    assets: scanDirectory(path.join(skillDir, 'assets')),
  };
  
  return {
    name: row.name,
    description: metadata.description,
    version: row.version,
    author: metadata.author || 'unknown',
    repository: row.repository,
    installPath: skillDir,
    readme,
    requires: {
      tools: metadata.requires?.tools || [],
      dependencies: metadata.requires?.dependencies || [],
    },
    files,
  };
}
