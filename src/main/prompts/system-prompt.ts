/**
 * 系统提示词构建器
 * 
 * 职责：
 * - 构建完整的系统提示词
 * - 支持 extraSystemPrompt 注入
 * - 集成核心记忆
 */

import type { SystemPromptParams } from '../../types/prompt';
import { buildTimeSection } from './sections/time';
import { buildContextSection } from './sections/context';
import { buildRuntimeSection } from './sections/runtime';
import { getMemoryContent } from '../tools/memory-tool';
import { listInstalledSkills } from '../tools/skill-manager/manage';
import { initDatabase } from '../tools/skill-manager/database';

/**
 * 构建系统提示词
 * 
 * @param params 提示词参数
 * @param sessionId 会话 ID（用于加载对应的 memory）
 * @returns 完整的系统提示词
 */
export async function buildSystemPrompt(params: SystemPromptParams, sessionId?: string): Promise<string> {
  const lines: string[] = [];

  // 1. 名字配置（最优先）
  const { SystemConfigStore } = await import('../database/system-config-store');
  const configStore = SystemConfigStore.getInstance();
  const nameConfig = configStore.getNameConfig();
  
  // 🔥 检查是否有 Tab 独立的 Agent 名字
  let agentName = nameConfig.agentName;
  if (sessionId && sessionId !== 'default') {
    const tabConfig = configStore.getTabConfig(sessionId);
    if (tabConfig?.agentName) {
      agentName = tabConfig.agentName;
    }
  }
  
  lines.push('## 身份信息', '');
  lines.push(`你的名字: ${agentName}`);
  lines.push(`用户称呼: ${nameConfig.userName}`);
  lines.push('');
  
  // 工作目录信息（实时从数据库读取，确保配置修改后立即生效）
  const settings = configStore.getWorkspaceSettings();
  lines.push('## 工作目录', '');
  lines.push(`- 工作目录: ${settings.workspaceDirs.join(', ')}`);
  lines.push(`- 脚本目录: ${settings.scriptDir}`);
  lines.push(`- 图片目录: ${settings.imageDir}`);
  lines.push(`- 记忆目录: ${settings.memoryDir}`);
  if (settings.skillDirs && settings.skillDirs.length > 0) {
    lines.push(`- Skill 目录: ${settings.skillDirs.join(', ')}`);
  }
  lines.push('');
  // lines.push('注意：如果用户要求修改你的名字或用户称呼，使用 memory 工具更新记忆，系统会自动同步到数据库和提示符。');
  lines.push('');

  // 2. 时间信息（已移至每条用户消息的 systemHint 动态注入，保持系统提示词静态可 cache）

  // 3. 项目上下文（AGENT.md, TOOLS.md, MEMORY-TRIGGER.md 等）
  if (params.contextFiles && params.contextFiles.length > 0) {
    lines.push(...buildContextSection(params.contextFiles));
  }

  // 5. 核心记忆（从 memory.md 或 memory-{tabId}.md 加载）
  try {
    const memoryContent = await getMemoryContent(sessionId);
    
    if (memoryContent && memoryContent.trim().length > 0) {
      lines.push(
        '## 核心记忆',
        '',
        '**重要提示**：以下是你与用户长期互动中积累的重要信息。请在对话中主动使用这些记忆：',
        '- 使用用户的名字和你的名字',
        '- 遵循用户的习惯和偏好',
        '- 避免重复之前的错误',
        '- 体现你对用户的了解和关注',
        '',
        memoryContent,
        ''
      );
    }
  } catch (error) {
    console.warn('⚠️ 加载核心记忆失败:', error);
  }

  // 5. 额外提示（动态注入点）
  if (params.extraSystemPrompt) {
    lines.push('## 额外指导', '', params.extraSystemPrompt, '');
  }

  // 6. 运行时信息（已移至每条用户消息的 systemHint 动态注入，保持系统提示词静态可 cache）

  // 7. 已安装的 Skills（放在最后，框架会在此之后追加 ## Tools）
  try {
    const db = initDatabase();
    const skills = listInstalledSkills(db, { enabled: true });
    if (skills.length > 0) {
      lines.push('## Skills', '');
      lines.push('```json');
      lines.push(JSON.stringify(
        skills.map(s => ({ name: s.name, description: s.description || '', type: 'skill' })),
        null, 2
      ));
    }
  } catch (error) {
    // Skills 加载失败不影响主流程
  }

  const prompt = lines.filter(Boolean).join('\n');

  return prompt;
}
