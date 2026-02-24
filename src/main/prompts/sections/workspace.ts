/**
 * 工作区 Section
 */

export interface WorkspaceConfig {
  workspaceDir: string;
  scriptDir: string;
  skillDirs: string[];
  defaultSkillDir: string;
  imageDir: string;
  memoryDir: string;
}

export function buildWorkspaceSection(config: WorkspaceConfig): string[] {
  return [
    '## 工作区',
    '',
    `当前工作目录: ${config.workspaceDir}`,
    '请将此目录作为所有文件操作的基准目录。',
    '',
    `Python 脚本目录: ${config.scriptDir}`,
    '所有 Python 脚本应保存到此目录。',
    '',
    `Skill 目录: ${config.skillDirs.join(', ')}`,
    `默认 Skill 目录: ${config.defaultSkillDir}`,
    'Skill 相关操作使用这些目录。',
    '',
    `图片生成目录: ${config.imageDir}`,
    '图片生成工具的默认输出目录。',
    '',
    `记忆管理目录: ${config.memoryDir}`,
    '记忆文件的存储目录。',
    '',
  ];
}
