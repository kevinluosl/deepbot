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
  // lines.push('注意：如果用户要求修改你的名字或用户称呼，使用 memory 工具更新记忆，系统会自动同步到数据库和提示符。');
  lines.push('');

  // 2. 时间信息
  if (params.userTimezone && params.userTime) {
    lines.push(
      ...buildTimeSection({
        userTimezone: params.userTimezone,
        userTime: params.userTime,
      })
    );
  }

  // 3. 项目上下文（AGENT.md, TOOLS.md, MEMORY-TRIGGER.md 等）
  if (params.contextFiles && params.contextFiles.length > 0) {
    lines.push(...buildContextSection(params.contextFiles));
  }

  // 4. 核心记忆（从 memory.md 或 memory-{tabId}.md 加载）
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

  // 6. 运行时信息
  lines.push(...buildRuntimeSection(params.runtimeInfo));

  const prompt = lines.filter(Boolean).join('\n');

  return prompt;
}
