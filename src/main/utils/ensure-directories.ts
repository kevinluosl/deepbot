/**
 * 目录初始化工具
 * 
 * 确保所有必需的目录存在
 */

import { existsSync, mkdirSync } from 'node:fs';
import { SystemConfigStore } from '../database/system-config-store';

/**
 * 确保所有工作目录存在
 * 
 * 在应用启动时调用，确保所有配置的目录都已创建
 */
export function ensureWorkspaceDirectories(): void {
  try {
    const store = SystemConfigStore.getInstance();
    const settings = store.getWorkspaceSettings();
    
    const directories = [
      { path: settings.workspaceDir, name: '工作目录' },
      { path: settings.scriptDir, name: 'Python 脚本目录' },
      { path: settings.defaultSkillDir, name: '默认 Skill 目录' },
      { path: settings.imageDir, name: '图片生成目录' },
      { path: settings.memoryDir, name: '记忆管理目录' },
    ];
    
    console.log('🔧 检查工作目录...');
    
    for (const dir of directories) {
      if (!existsSync(dir.path)) {
        mkdirSync(dir.path, { recursive: true });
        console.log(`   ✅ 已创建 ${dir.name}: ${dir.path}`);
      } else {
        console.log(`   ✓ ${dir.name}已存在: ${dir.path}`);
      }
    }
    
    // 确保所有 Skill 目录都存在
    for (const skillDir of settings.skillDirs) {
      if (!existsSync(skillDir)) {
        mkdirSync(skillDir, { recursive: true });
        console.log(`   ✅ 已创建 Skill 目录: ${skillDir}`);
      }
    }
    
    console.log('🔧 工作目录检查完成');
  } catch (error) {
    console.error('❌ 创建工作目录失败:', error);
    throw error;
  }
}
