/**
 * Skill Manager 安装功能
 * 从 ClawHub 下载 zip 并解压到 skill 目录
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getErrorMessage } from '../../../shared/utils/error-handler';
import { downloadFile } from '../../../shared/utils/http-utils';
import type Database from '../../../shared/utils/sqlite-adapter';
import type { InstallResult, InstalledSkill } from './types';
import { getSkillsDir, CLAWHUB_DOWNLOAD_API } from './constants';
import { ensureDirectoryExists, safeRemove } from '../../../shared/utils/fs-utils';
import { parseSkillMetadata } from './utils';

/**
 * 安装 Skill（从 ClawHub 下载 zip）
 * @param name - skill slug（如 "youtube-watcher"）
 * @param db - 数据库实例
 */
export async function installSkill(
  name: string,
  db: Database.Database
): Promise<InstallResult> {
  try {
    console.info(`[Skill Manager] 开始安装 Skill: ${name}`);

    // 1. 检查是否已安装
    const SKILLS_DIR = getSkillsDir();
    const skillDir = path.join(SKILLS_DIR, name);
    const existing = db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as any;
    
    if (existing) {
      // 数据库有记录，检查文件系统是否真的存在
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        throw new Error(`Skill "${name}" 已安装`);
      }
      // 文件系统不存在，清理数据库中的残留记录
      console.warn(`[Skill Manager] ⚠️ 数据库有 "${name}" 记录但文件不存在，清理残留记录`);
      db.prepare('DELETE FROM skills WHERE name = ?').run(name);
    } else {
      // 数据库无记录，但文件系统可能已存在（手动放入的 skill）
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        throw new Error(`Skill "${name}" 已存在于 ${skillDir}，无需安装`);
      }
    }

    // 2. 确保 skills 目录存在
    ensureDirectoryExists(SKILLS_DIR);

    // 3. 从 ClawHub 下载 zip
    await downloadSkillFromClawHub(name, skillDir);

    // 4. 解析 SKILL.md
    const metadata = parseSkillMetadata(skillDir);

    // 5. 保存到数据库
    db.prepare(`
      INSERT INTO skills (name, version, enabled, repository, metadata)
      VALUES (?, ?, 1, ?, ?)
    `).run(
      name,
      metadata.version || '1.0.0',
      `https://clawhub.ai/skills/${name}`,
      JSON.stringify(metadata)
    );

    const skill: InstalledSkill = {
      name,
      version: metadata.version || '1.0.0',
      enabled: true,
      installedAt: new Date(),
      usageCount: 0,
      repository: `https://clawhub.ai/skills/${name}`,
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
 * 从 ClawHub 下载 zip 并解压到目标目录
 */
async function downloadSkillFromClawHub(slug: string, targetDir: string): Promise<void> {
  const downloadUrl = `${CLAWHUB_DOWNLOAD_API}?slug=${encodeURIComponent(slug)}`;
  console.info(`[Skill Manager] 下载 Skill zip: ${downloadUrl}`);

  // 1. 使用统一的 downloadFile 工具下载
  const tmpFile = path.join(os.tmpdir(), `deepbot-skill-${slug}-${Date.now()}.zip`);

  try {
    const buffer = await downloadFile(downloadUrl, {
      headers: { 'User-Agent': 'DeepBot-Skill-Manager' },
      timeout: 60000,
    });

    if (!buffer) {
      throw new Error(`下载失败: 无法获取文件内容`);
    }

    fs.writeFileSync(tmpFile, buffer);
    console.info(`[Skill Manager] zip 下载完成: ${tmpFile} (${buffer.byteLength} bytes)`);

    // 2. 解压到目标目录
    await extractZip(tmpFile, targetDir);

    console.info(`[Skill Manager] ✅ 解压完成: ${targetDir}`);
  } finally {
    // 清理临时文件
    safeRemove(tmpFile);
  }
}

/**
 * 解压 zip 文件到目标目录（跨平台，使用 adm-zip）
 * zip 内部结构通常是 {slug}-{version}/ 或直接是文件
 */
async function extractZip(zipPath: string, targetDir: string): Promise<void> {
  const AdmZip = (await import('adm-zip')).default;

  // 创建临时解压目录
  const tmpExtractDir = path.join(os.tmpdir(), `deepbot-skill-extract-${Date.now()}`);
  ensureDirectoryExists(tmpExtractDir);

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmpExtractDir, true);

    // 找到解压后的根目录（可能是 {slug}-{version}/ 这样的子目录）
    const entries = fs.readdirSync(tmpExtractDir);
    let sourceDir = tmpExtractDir;

    if (entries.length === 1 && fs.statSync(path.join(tmpExtractDir, entries[0])).isDirectory()) {
      // zip 内只有一个子目录，使用该子目录作为 skill 根目录
      sourceDir = path.join(tmpExtractDir, entries[0]);
    }

    // 如果目标目录已存在，先删除
    safeRemove(targetDir);

    // 移动到目标位置（使用 cpSync + rmSync 替代 renameSync，避免跨文件系统 EXDEV 错误）
    fs.cpSync(sourceDir, targetDir, { recursive: true });
    safeRemove(sourceDir);
  } finally {
    // 清理临时解压目录（如果还存在）
    safeRemove(tmpExtractDir);
  }
}
