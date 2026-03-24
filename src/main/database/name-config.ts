/**
 * 名字配置管理
 */

import type Database from '../../shared/utils/sqlite-adapter';

/**
 * 获取名字配置
 */
export function getNameConfig(db: Database.Database): { agentName: string; userName: string } {
  try {
    const stmt = db.prepare(`
      SELECT agent_name, user_name FROM name_config WHERE id = 1
    `);
    const row = stmt.get() as any;
    
    console.log('[SystemConfigStore] getNameConfig 查询结果:', row);
    
    if (!row) {
      // 返回默认值
      console.log('[SystemConfigStore] 未找到名字配置，返回默认值');
      return {
        agentName: 'matrix',
        userName: 'user',
      };
    }

    const result = {
      agentName: row.agent_name,
      userName: row.user_name,
    };
    console.log('[SystemConfigStore] 返回名字配置:', result);
    return result;
  } catch (error) {
    console.error('[SystemConfigStore] 获取名字配置失败:', error);
    return {
      agentName: 'matrix',
      userName: 'user',
    };
  }
}

/**
 * 保存智能体名字
 */
export function saveAgentName(db: Database.Database, agentName: string): void {
  // 限制长度不超过 10 个字符
  const trimmedName = agentName.trim();
  if (trimmedName.length > 10) {
    throw new Error(`智能体名字过长（${trimmedName.length} 字符），最多 10 个字符`);
  }
  
  if (trimmedName.length === 0) {
    throw new Error('智能体名字不能为空');
  }
  
  // 先确保记录存在
  const existing = db.prepare('SELECT id FROM name_config WHERE id = 1').get();
  
  if (!existing) {
    // 插入默认记录
    db.prepare(`
      INSERT INTO name_config (id, agent_name, user_name)
      VALUES (1, ?, 'user')
    `).run(trimmedName);
  } else {
    // 更新
    db.prepare(`
      UPDATE name_config SET agent_name = ? WHERE id = 1
    `).run(trimmedName);
  }

  console.info('[SystemConfigStore] ✅ 智能体名字已保存:', trimmedName);
}

/**
 * 保存用户称呼
 */
export function saveUserName(db: Database.Database, userName: string): void {
  // 限制长度不超过 10 个字符
  const trimmedName = userName.trim();
  if (trimmedName.length > 10) {
    throw new Error(`用户名字过长（${trimmedName.length} 字符），最多 10 个字符`);
  }
  
  if (trimmedName.length === 0) {
    throw new Error('用户名字不能为空');
  }
  
  // 先确保记录存在
  const existing = db.prepare('SELECT id FROM name_config WHERE id = 1').get();
  
  if (!existing) {
    // 插入默认记录
    db.prepare(`
      INSERT INTO name_config (id, agent_name, user_name)
      VALUES (1, 'matrix', ?)
    `).run(trimmedName);
  } else {
    // 更新
    db.prepare(`
      UPDATE name_config SET user_name = ? WHERE id = 1
    `).run(trimmedName);
  }

  console.info('[SystemConfigStore] ✅ 用户称呼已保存:', trimmedName);
}

/**
 * 保存名字配置（同时保存智能体名字和用户称呼）
 */
export function saveNameConfig(db: Database.Database, agentName: string, userName: string): void {
  // 限制长度不超过 10 个字符
  const trimmedAgentName = agentName.trim();
  const trimmedUserName = userName.trim();
  
  if (trimmedAgentName.length > 10) {
    throw new Error(`智能体名字过长（${trimmedAgentName.length} 字符），最多 10 个字符`);
  }
  
  if (trimmedUserName.length > 10) {
    throw new Error(`用户名字过长（${trimmedUserName.length} 字符），最多 10 个字符`);
  }
  
  if (trimmedAgentName.length === 0) {
    throw new Error('智能体名字不能为空');
  }
  
  if (trimmedUserName.length === 0) {
    throw new Error('用户名字不能为空');
  }
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO name_config (id, agent_name, user_name)
    VALUES (1, ?, ?)
  `);
  stmt.run(trimmedAgentName, trimmedUserName);
  console.info('[SystemConfigStore] ✅ 名字配置已保存:', { agentName: trimmedAgentName, userName: trimmedUserName });
}
