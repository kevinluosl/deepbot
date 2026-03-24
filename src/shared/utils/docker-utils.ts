/**
 * Docker 环境工具函数
 */

import path from 'path';

/**
 * 判断是否为 Docker 模式
 */
export function isDockerMode(): boolean {
  return process.env.DEEPBOT_DOCKER === 'true';
}

/**
 * 获取数据库目录
 * Docker 模式：/data/db（或环境变量 DB_DIR）
 * 普通模式：~/.deepbot
 */
export function getDbDir(): string {
  if (isDockerMode()) {
    return process.env.DB_DIR || '/data/db';
  }
  return path.join(process.env.HOME || process.env.USERPROFILE || '~', '.deepbot');
}
