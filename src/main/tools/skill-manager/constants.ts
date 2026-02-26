/**
 * Skill Manager 常量定义
 */

import { expandUserPath } from '../../../shared/utils/path-utils';
import { getDefaultSkillPath } from '../../config/skill-paths';

/**
 * Skill 存储目录（使用默认路径）
 */
export const getSkillsDir = () => getDefaultSkillPath();

/**
 * Skill 数据库路径
 */
export const SKILLS_DB_PATH = expandUserPath('~/.deepbot/skills.db');

/**
 * GitHub API 基础 URL
 */
export const GITHUB_API_BASE = 'https://api.github.com';

/**
 * GitHub 搜索 topic
 */
export const SKILL_TOPIC = 'deepbot-skill';

/**
 * Awesome OpenClaw Skills README URL
 * 
 * 这个 README.md 包含了 700+ 精选 Skills 的列表和链接
 */
export const AWESOME_SKILLS_README_URL = 'https://raw.githubusercontent.com/VoltAgent/awesome-openclaw-skills/main/README.md';
