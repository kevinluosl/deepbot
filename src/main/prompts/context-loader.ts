/**
 * 上下文文件加载器
 * 
 * 
 * 职责：
 * - 从 templates 目录加载上下文文件（SOUL.md, TOOLS.md 等）
 * - 替换模板变量（{{scriptDir}}, {{imageDir}} 等）
 * - 处理文件内容截断
 * - 提供错误处理
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContextFile } from '../../types/prompt';
import type { WorkspaceSettings } from '../database/system-config-store';

/** 默认最大字符数 */
const DEFAULT_MAX_CHARS = 50_000;

/** 截断时保留头部的比例 */
const HEAD_RATIO = 0.7;

/** 截断时保留尾部的比例 */
const TAIL_RATIO = 0.2;

/** 默认加载的文件列表 */
const DEFAULT_BOOTSTRAP_FILES = [
  'SOUL.md',
  'TOOLS.md',
  'TOOLS-BASIC.md',
  'task-execution.md',
  'MEMORY-TRIGGER.md',
];

/**
 * 替换模板变量
 * 
 * @param content 模板内容
 * @param settings 工作区配置
 * @returns 替换后的内容
 */
function replaceTemplateVariables(
  content: string,
  settings: WorkspaceSettings
): string {
  return content
    .replace(/\{\{scriptDir\}\}/g, settings.scriptDir)
    .replace(/\{\{defaultSkillDir\}\}/g, settings.defaultSkillDir)
    .replace(/\{\{imageDir\}\}/g, settings.imageDir);
}

/**
 * 截断文件内容
 */
function truncateContent(
  content: string,
  fileName: string,
  maxChars: number
): { content: string; truncated: boolean; originalLength: number } {
  const trimmed = content.trimEnd();
  
  if (trimmed.length <= maxChars) {
    return {
      content: trimmed,
      truncated: false,
      originalLength: trimmed.length,
    };
  }

  // 计算头部和尾部保留的字符数
  const headChars = Math.floor(maxChars * HEAD_RATIO);
  const tailChars = Math.floor(maxChars * TAIL_RATIO);
  
  const head = trimmed.slice(0, headChars);
  const tail = trimmed.slice(-tailChars);

  // 添加截断标记
  const marker = [
    '',
    `[...已截断，请使用工具读取 ${fileName} 查看完整内容...]`,
    `（已截断 ${fileName}: 保留了前 ${headChars} 字符 + 后 ${tailChars} 字符，共 ${trimmed.length} 字符）`,
    '',
  ].join('\n');

  return {
    content: [head, marker, tail].join('\n'),
    truncated: true,
    originalLength: trimmed.length,
  };
}

/**
 * 从 templates 目录加载模板文件
 */
function loadTemplate(
  fileName: string,
  maxChars: number,
  settings: WorkspaceSettings
): ContextFile {
  try {
    // __dirname 指向编译后的 dist-electron/main/prompts/
    const templatePath = join(__dirname, 'templates', fileName);
    let content = readFileSync(templatePath, 'utf-8');
    
    // 替换模板变量
    content = replaceTemplateVariables(content, settings);
    
    const result = truncateContent(content, fileName, maxChars);
    
    if (result.truncated) {
      console.log(
        `⚠️  ${fileName} 文件过大 (${result.originalLength} 字符)，已截断到 ${maxChars} 字符`
      );
    }
    
    return {
      path: fileName,
      content: result.content,
      truncated: result.truncated,
      originalLength: result.originalLength,
    };
  } catch (error) {
    console.error(`❌ 加载模板文件失败: ${fileName}`, error);
    throw new Error(`Failed to load template: ${fileName}`);
  }
}

/**
 * 加载上下文文件
 * 
 * @param settings 工作区配置
 * @param maxChars 最大字符数（默认 20,000）
 * @returns 上下文文件列表
 */
export function loadContextFiles(
  settings: WorkspaceSettings,
  maxChars: number = DEFAULT_MAX_CHARS
): ContextFile[] {
  const files: ContextFile[] = [];

  console.log('📂 加载上下文文件...');

  // 加载默认文件
  for (const fileName of DEFAULT_BOOTSTRAP_FILES) {
    try {
      const file = loadTemplate(fileName, maxChars, settings);
      files.push(file);
      console.log(`   ✅ ${fileName} (${file.content.length} 字符)`);
    } catch (error) {
      console.error(`   ❌ ${fileName} 加载失败`);
    }
  }

  console.log(`📂 共加载 ${files.length} 个上下文文件`);

  return files;
}
