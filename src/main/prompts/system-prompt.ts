/**
 * 系统提示词构建器
 * 
 * 
 * 职责：
 * - 构建完整的系统提示词
 * - 根据模式（full/minimal）动态组装 Section
 * - 支持 extraSystemPrompt 注入
 * - 集成核心记忆
 */

import type { SystemPromptParams } from '../../types/prompt';
import { buildWorkspaceSection } from './sections/workspace';
import { buildTimeSection } from './sections/time';
import { buildContextSection } from './sections/context';
import { buildRuntimeSection } from './sections/runtime';
import { getMemoryContent } from '../tools/memory-tool';

/**
 * 构建系统提示词
 * 
 * @param params 提示词参数
 * @returns 完整的系统提示词
 */
export async function buildSystemPrompt(params: SystemPromptParams): Promise<string> {
  const promptMode = params.promptMode || 'full';
  const isMinimal = promptMode === 'minimal';

  const lines: string[] = [];

  // 0. 名字配置（最优先）
  const { SystemConfigStore } = await import('../database/system-config-store');
  const configStore = SystemConfigStore.getInstance();
  const nameConfig = configStore.getNameConfig();
  
  lines.push('## 身份信息', '');
  lines.push(`你的名字: ${nameConfig.agentName}`);
  lines.push(`用户称呼: ${nameConfig.userName}`);
  lines.push('');
  lines.push('注意：如果用户要求修改你的名字或用户称呼，使用 memory 工具更新记忆，系统会自动同步到数据库和提示符。');
  lines.push('');

  // 1. 工作区
  lines.push(...buildWorkspaceSection({
    workspaceDir: params.workspaceDir,
    scriptDir: params.scriptDir,
    skillDirs: params.skillDirs,
    defaultSkillDir: params.defaultSkillDir,
    imageDir: params.imageDir,
    memoryDir: params.memoryDir,
  }));

  // 2. 时间信息（minimal 模式下可选）
  if (!isMinimal || (params.userTimezone && params.userTime)) {
    lines.push(
      ...buildTimeSection({
        userTimezone: params.userTimezone,
        userTime: params.userTime,
      })
    );
  }

  // 3. 项目上下文（SOUL.md, TOOLS.md 等）
  // 🔥 修改：minimal 模式也需要加载 TOOLS.md（包含工具使用规则）
  if (params.contextFiles && params.contextFiles.length > 0) {
    // minimal 模式只加载 TOOLS.md，full 模式加载所有文件
    const filesToLoad = isMinimal
      ? params.contextFiles.filter(f => f.path.endsWith('TOOLS.md'))
      : params.contextFiles;
    
    if (filesToLoad.length > 0) {
      lines.push(...buildContextSection(filesToLoad));
    }
  }

  // 4. 核心记忆（从 memory.md 加载）
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🧠 [buildSystemPrompt] 开始加载核心记忆...');
    console.log('='.repeat(80));
    
    const memoryContent = await getMemoryContent();
    
    if (memoryContent && memoryContent.trim().length > 0) {
      lines.push('## 核心记忆', '', memoryContent, '');
      
      console.log('🧠 [buildSystemPrompt] ✅ 核心记忆加载成功');
      console.log('   长度:', memoryContent.length, '字符');
      console.log('   内容:');
      console.log('   ' + '-'.repeat(76));
      // 打印完整的记忆内容，每行缩进
      memoryContent.split('\n').forEach(line => {
        console.log('   ' + line);
      });
      console.log('   ' + '-'.repeat(76));
      console.log('='.repeat(80) + '\n');
    } else {
      console.warn('⚠️ [buildSystemPrompt] 核心记忆为空');
      console.log('='.repeat(80) + '\n');
    }
  } catch (error) {
    console.warn('⚠️ [buildSystemPrompt] 加载核心记忆失败:', error);
    console.log('='.repeat(80) + '\n');
  }

  // 5. 额外提示（动态注入点）
  if (params.extraSystemPrompt) {
    lines.push('## 额外指导', '', params.extraSystemPrompt, '');
  }

  // 6. 运行时信息
  lines.push(...buildRuntimeSection(params.runtimeInfo));

  const prompt = lines.filter(Boolean).join('\n');

  console.log('🧠 系统提示词构建完成');
  console.log('   总长度:', prompt.length, '字符');
  console.log('   总行数:', lines.length, '行');
  console.log('   名字配置:', nameConfig);

  return prompt;
}
