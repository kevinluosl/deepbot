/**
 * Skill Manager 常量定义
 */

import { expandUserPath } from '../../../shared/utils/path-utils';
import { getDefaultSkillPath } from '../../config/skill-paths';
import { isDockerMode } from '../../../shared/utils/docker-utils';

/**
 * Skill 存储目录（使用默认路径）
 */
export const getSkillsDir = () => getDefaultSkillPath();

/**
 * Skill 数据库路径
 * Docker 模式：放在 /data/skills/ 目录下（随 skills volume 持久化）
 * 普通模式：~/.agents/skills.db
 */
export const SKILLS_DB_PATH = isDockerMode()
  ? '/data/skills/skills.db'
  : expandUserPath('~/.agents/skills.db');

/**
 * ClawHub 搜索 API
 * 返回格式：{ results: [{ slug, displayName, summary, score, version, updatedAt }] }
 */
export const CLAWHUB_SEARCH_API = 'https://clawhub.ai/api/search';

/**
 * ClawHub 下载 API
 * 用法：${CLAWHUB_DOWNLOAD_API}?slug={slug}
 * 返回：zip 文件
 */
export const CLAWHUB_DOWNLOAD_API = 'https://wry-manatee-359.convex.site/api/v1/download';
