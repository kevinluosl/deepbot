/**
 * Skill Manager 类型定义
 */

/**
 * Skill 搜索结果（来自 clawhub API）
 */
export interface SkillSearchResult {
  name: string;          // slug，用于安装
  displayName: string;   // 展示名称
  description: string;
  version: string;
  author: string;
  stars: number;
  downloads: number;
  tags: string[];
  lastUpdated: Date;
  // 兼容旧字段
  repository: string;
}

/**
 * 已安装 Skill
 */
export interface InstalledSkill {
  name: string;
  version: string;
  enabled: boolean;
  installedAt: Date;
  lastUsed?: Date;
  usageCount: number;
  repository: string;
}

/**
 * 安装结果
 */
export interface InstallResult {
  success: boolean;
  skill: InstalledSkill;
  message: string;
  installPath: string;
  dependencies?: string[];
}

/**
 * Skill 详情
 */
export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  repository: string;
  installPath: string;
  readme: string;
  requires: {
    tools: string[];
    dependencies: string[];
  };
  files: {
    scripts: string[];
    references: string[];
    assets: string[];
  };
}

/**
 * Skill 元数据（从 SKILL.md 解析）
 */
export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  repository?: string;
  tags?: string[];
  requires?: {
    tools?: string[];
    dependencies?: string[];
  };
}
