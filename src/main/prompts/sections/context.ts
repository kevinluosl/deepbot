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

  // 检查是否有 AGENT.md
  const hasAgentFile = contextFiles.some((file) => {
    const fileName = file.path.toLowerCase();
    return fileName === 'agent.md';
  });

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
