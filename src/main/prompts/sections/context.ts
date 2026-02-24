/**
 * 项目上下文 Section
 * 
 */

import type { ContextFile } from '../../../types/prompt';

/**
 * 构建项目上下文 Section
 */
export function buildContextSection(contextFiles: ContextFile[]): string[] {
  if (contextFiles.length === 0) {
    return [];
  }

  const lines: string[] = [
    '## 项目上下文',
    '',
    '以下项目上下文文件已加载：',
  ];

  // 检查是否有 SOUL.md
  const hasSoulFile = contextFiles.some((file) => {
    const fileName = file.path.toLowerCase();
    return fileName === 'soul.md';
  });

  if (hasSoulFile) {
    lines.push(
      '',
      '如果存在 SOUL.md，请体现其中定义的个性和语气。',
      '避免僵硬、通用的回复；遵循其指导，除非有更高优先级的指令覆盖它。',
    );
  }

  lines.push('');

  // 添加每个文件的内容
  for (const file of contextFiles) {
    lines.push(`### ${file.path}`, '');
    
    if (file.truncated) {
      lines.push(
        `（注意：此文件已被截断，原始长度 ${file.originalLength} 字符）`,
        '',
      );
    }
    
    lines.push(file.content, '');
  }

  return lines;
}
