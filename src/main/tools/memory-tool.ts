/**
 * 记忆管理工具（插件）
 * 
 * 功能：
 * 1. 读取核心记忆文件（memory.md）
 * 2. 更新核心记忆（通过大模型提炼）
 * 3. 自动分类管理记忆
 * 
 * 记忆文件结构：
 * - 角色：智能体的特定专业角色
 * - 用户习惯：用户的偏好、使用习惯、工作流程
 * - 错误总结：之前遇到的错误和解决方案
 * - 备忘事项：其他重要信息
 * 
 * 配置文件位置：
 * - 记忆文件：从数据库配置读取（默认 ~/.deepbot/memory/memory.md）
 * 
 * 最大长度：5000 字符
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TOOL_NAMES } from './tool-names';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { callAI } from '../utils/ai-client';
import { SystemConfigStore } from '../database/system-config-store';
import type { Gateway } from '../gateway';

// ==================== 常量定义 ====================

/** 记忆文件最大长度 */
const MAX_MEMORY_LENGTH = 20000;

/** 记忆文件模板 */
const MEMORY_TEMPLATE = `# DeepBot 核心记忆

## 角色
（暂无记录）

**说明**：智能体的特定专业角色（如法律专家、数据挖掘专家、前端开发专家等）。

## 用户习惯
（暂无记录）

**说明**：用户的偏好、使用习惯、工作流程、常用的 skill 或 tool 及其使用方式、用户需要的交互方式等。

## 错误总结
（暂无记录）

**说明**：之前遇到的错误和解决方案、Agent 出错并纠正后的经验教训。请避免重复相同的错误。

## 备忘事项
（暂无记录）

**说明**：用户希望记住的其他任何事物（不属于上述分类）。
`;

// ==================== 参数 Schema ====================

/**
 * 记忆工具参数 Schema
 */
const MemoryToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal('read', { description: '读取记忆内容' }),
    Type.Literal('update', { description: '更新记忆内容（需要 userMessage 参数）' }),
    Type.Literal('merge', { description: '合并指定 Tab 的记忆到当前 Tab' }),
  ]),
  
  userMessage: Type.Optional(Type.String({
    description: '用户消息（用于 update 操作）',
  })),
  
  context: Type.Optional(Type.String({
    description: '执行上下文（用于 update 操作，可选）',
  })),
  
  updateMainMemory: Type.Optional(Type.Boolean({
    description: '是否同时更新主记忆（用于 update 操作，默认 false）。设为 true 时会同时更新当前 Tab 记忆和主记忆',
    default: false,
  })),
  
  sourceTabName: Type.Optional(Type.String({
    description: '源 Tab 名称（用于 merge 操作）。不指定时默认合并主记忆（memory.md）',
  })),
});

// ==================== Gateway 实例管理 ====================

let gatewayInstance: Gateway | null = null;

/**
 * 设置 Gateway 实例
 */
export function setGatewayForMemoryTool(gateway: Gateway): void {
  gatewayInstance = gateway;
  console.info('[Memory Tool] Gateway 实例已设置');
}

/**
 * 获取 Gateway 实例
 */
function getGatewayInstance(): Gateway | null {
  return gatewayInstance;
}

/**
 * 为新 Tab 创建 memory 文件（继承主 memory 内容）
 * @param tabId - Tab ID
 * @param memoryFileName - memory 文件名（如 memory-tab-1.md）
 */
export async function createTabMemoryFile(tabId: string, memoryFileName: string): Promise<void> {
  try {
    console.log(`[Memory Tool] 🔄 为 Tab ${tabId} 创建 memory 文件: ${memoryFileName}`);
    
    // 读取主 memory 内容
    const mainMemoryContent = await readMemory();
    
    // 获取新 Tab 的 memory 文件路径
    const configStore = SystemConfigStore.getInstance();
    const settings = configStore.getWorkspaceSettings();
    const memoryDir = settings.memoryDir;
    const newMemoryFile = path.join(memoryDir, memoryFileName);
    
    // 确保目录存在
    await fs.mkdir(memoryDir, { recursive: true });
    
    // 写入继承的内容
    await fs.writeFile(newMemoryFile, mainMemoryContent, 'utf-8');
    
    console.log(`[Memory Tool] ✅ Tab ${tabId} 的 memory 文件已创建并继承主 memory 内容`);
  } catch (error) {
    console.error(`[Memory Tool] ❌ 创建 Tab ${tabId} 的 memory 文件失败:`, error);
    throw error;
  }
}

// ==================== 辅助函数 ====================

/**
 * 获取记忆文件路径（从数据库读取配置）
 * @param tabId - Tab ID（可选），如果提供则返回 Tab 独立的 memory 文件
 */
function getMemoryFilePath(tabId?: string): { memoryDir: string; memoryFile: string } {
  const configStore = SystemConfigStore.getInstance();
  const settings = configStore.getWorkspaceSettings();
  const memoryDir = settings.memoryDir;
  
  // 如果提供了 tabId，检查是否有独立的 memory 文件配置
  if (tabId) {
    const tabConfig = configStore.getTabConfig(tabId);
    if (tabConfig?.memoryFile) {
      // 使用 Tab 独立的 memory 文件
      const memoryFile = path.join(memoryDir, tabConfig.memoryFile);
      return { memoryDir, memoryFile };
    }
  }
  
  // 默认使用全局 memory.md
  const memoryFile = path.join(memoryDir, 'memory.md');
  return { memoryDir, memoryFile };
}

/**
 * 确保记忆目录和文件存在
 * @param tabId - Tab ID（可选）
 */
async function ensureMemoryFile(tabId?: string): Promise<void> {
  try {
    const { memoryDir, memoryFile } = getMemoryFilePath(tabId);
    await fs.mkdir(memoryDir, { recursive: true });
    
    try {
      await fs.access(memoryFile);
    } catch {
      // 文件不存在，创建默认文件
      await fs.writeFile(memoryFile, MEMORY_TEMPLATE, 'utf-8');
      console.log('[Memory Tool] 创建默认记忆文件:', memoryFile);
    }
  } catch (error) {
    console.error('[Memory Tool] 创建记忆文件失败:', error);
    throw error;
  }
}

/**
 * 读取记忆文件
 * @param tabId - Tab ID（可选）
 */
async function readMemory(tabId?: string): Promise<string> {
  await ensureMemoryFile(tabId);
  
  try {
    const { memoryFile } = getMemoryFilePath(tabId);
    const content = await fs.readFile(memoryFile, 'utf-8');
    return content;
  } catch (error) {
    console.error('[Memory Tool] 读取记忆文件失败:', error);
    return MEMORY_TEMPLATE;
  }
}

/**
 * 写入记忆文件
 * @param content - 记忆内容
 * @param tabId - Tab ID（可选）
 */
async function writeMemory(content: string, tabId?: string): Promise<void> {
  await ensureMemoryFile(tabId);
  
  // 限制长度
  let finalContent = content;
  if (content.length > MAX_MEMORY_LENGTH) {
    console.warn(`[Memory Tool] 记忆内容超过限制 (${content.length} > ${MAX_MEMORY_LENGTH})，将被截断`);
    finalContent = content.slice(0, MAX_MEMORY_LENGTH);
  }
  
  try {
    const { memoryFile } = getMemoryFilePath(tabId);
    await fs.writeFile(memoryFile, finalContent, 'utf-8');
    console.log('[Memory Tool] 记忆文件已更新');
  } catch (error) {
    console.error('[Memory Tool] 写入记忆文件失败:', error);
    throw error;
  }
}

/**
 * 使用大模型合并两个记忆文件
 */
async function mergeMemories(
  currentMemory: string,
  sourceMemory: string,
  signal?: AbortSignal
): Promise<string> {
  // 检查是否已被取消
  if (signal?.aborted) {
    const err = new Error('记忆合并操作被取消');
    err.name = 'AbortError';
    throw err;
  }

  const prompt = `你是一个记忆管理助手，负责合并两个记忆文件。

当前 Tab 的记忆：
"""
${currentMemory}
"""

源 Tab 的记忆：
"""
${sourceMemory}
"""

任务：
1. 将两个记忆文件合并为一个完整的记忆文件
2. **解决冲突**：
   - 如果两边有冲突的信息（如角色定义不同），保留当前 Tab 的信息（优先级更高）
   - 如果信息互补，合并两边的信息
   - 如果信息重复，只保留一条（选择表达更清晰的）
3. **去重**：
   - 检查整个合并后的记忆中是否有语义相同或重复的条目
   - 只保留一条（选择表达更清晰的）
4. **分类整理**：
   - 将合并后的信息按照正确的分类整理：
     * 角色：智能体的特定专业角色
     * 用户习惯：用户的偏好、使用习惯、工作流程
     * 错误总结：之前遇到的错误和解决方案
     * 备忘事项：其他重要信息
5. 保持记忆文件的结构和格式
6. 确保总长度不超过 20000 字符
7. **严格禁止记录任何名字相关信息**

冲突处理规则：
- 当前 Tab 记忆优先级 > 源 Tab 记忆优先级
- 如果当前 Tab 有明确的角色定义，保留当前 Tab 的角色
- 如果当前 Tab 有明确的用户习惯，保留当前 Tab 的习惯
- 源 Tab 的信息作为补充，不覆盖当前 Tab 的核心信息

直接输出合并后的完整记忆文件内容，不要解释。`;

  try {
    const response = await callAI([
      {
        role: 'system',
        content: '你是一个记忆管理助手，负责合并两个记忆文件并解决冲突。输出格式必须是 Markdown。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], {
      temperature: 0.3,
      maxTokens: 20000, // 🔥 两个记忆文件最多 40000 字符，需要足够的输出空间
      signal,
      useFastModel: true,
    });
    
    return response.content.trim();
  } catch (error) {
    console.error('[Memory Tool] 大模型合并记忆失败:', error);
    throw error;
  }
}

/**
 * 使用大模型提炼记忆
 */
async function refineMemory(
  userMessage: string,
  context: string | undefined,
  currentMemory: string,
  signal?: AbortSignal
): Promise<string> {
  // 检查是否已被取消
  if (signal?.aborted) {
    const err = new Error('记忆提炼操作被取消');
    err.name = 'AbortError';
    throw err;
  }

  const prompt = `你是一个记忆管理助手，负责提炼和更新用户的核心记忆。

当前记忆内容：
"""
${currentMemory}
"""

用户说：
"""
${userMessage}
"""

${context ? `执行结果：\n"""\n${context}\n"""\n` : ''}

任务：
1. 分析用户的意图，判断需要记住什么
2. 将新信息提炼为简洁的记忆点（不超过 50 字）
3. **检查冲突**：仔细检查新信息是否与现有记忆冲突
   - 如果冲突：用新信息替换旧信息
   - 如果补充：合并信息
   - 如果重复：不要重复添加
4. 将记忆点添加到合适的分类下：
   - 角色：智能体的特定专业角色（如法律专家、数据挖掘专家、前端开发专家）
   - 用户习惯：用户的个人偏好、使用习惯、常用操作、工作流程、常用的 skill 或 tool 及其使用方式
   - 错误总结：之前遇到的错误和解决方案、Agent 出错并纠正后的经验教训
   - 备忘事项：用户希望记住的其他任何事物（不属于上述分类）

5. 保持记忆文件的结构和格式
6. 确保总长度不超过 5000 字符
7. **严格禁止记录任何名字相关信息**：
   - ❌ 禁止记录智能体的名字（如"我叫xxx"、"我的名字是xxx"）
   - ❌ 禁止记录用户的名字（如"用户叫xxx"、"用户名字：xxx"）
   - ⚠️ 名字由 api_set_name 工具管理，不在 memory 中记录

8. **分类示例**：
   - "你是法律专家" → "角色"部分
   - "你是数据挖掘专家" → "角色"部分
   - "我喜欢用 VS Code" → "用户习惯"部分
   - "我通常用 weather skill 查天气" → "用户习惯"部分
   - "记住这个错误：不要用 rm -rf" → "错误总结"部分
   - "项目截止日期是下周五" → "备忘事项"部分

9. **冲突处理示例**：
   - 旧记忆："角色是法律专家"
   - 新信息："你是数据挖掘专家"
   - 正确处理：替换为"角色是数据挖掘专家"（或根据上下文合并）
   - 错误处理：同时保留两条冲突的信息

10. **全局去重检查**（在输出前必须执行）：
   - 检查整个记忆文件中是否有语义相同或重复的条目
   - 如果发现重复：只保留一条（选择表达更清晰的）
   - 如果发现冲突：根据最新信息决定保留哪一条，或合并

直接输出更新后的完整记忆文件内容，不要解释。`;

  try {
    const response = await callAI([
      {
        role: 'system',
        content: '你是一个记忆管理助手，负责提炼和更新核心记忆。输出格式必须是 Markdown。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ], {
      temperature: 0.3,
      maxTokens: 20000,
      signal,
      useFastModel: true, // 🔥 使用快速模型（记忆提炼是轻量级任务）
    });
    
    return response.content.trim();
  } catch (error) {
    console.error('[Memory Tool] 大模型提炼记忆失败:', error);
    throw error;
  }
}

// ==================== 工具插件 ====================

/**
 * 记忆工具插件
 */
export const memoryToolPlugin: ToolPlugin = {
  metadata: {
    id: 'memory-tool',
    name: TOOL_NAMES.MEMORY,
    version: '1.0.0',
    description: '管理智能体的核心记忆。支持读取和更新记忆，自动提炼和分类信息',
    author: 'DeepBot',
    category: 'system',
    tags: ['memory', 'context', 'learning'],
    requiresConfig: false,
  },
  
  create: (options: ToolCreateOptions) => {
    // 🔥 从 options 中获取 sessionId
    const sessionId = options.sessionId || 'default';
    
    // 🔥 根据 sessionId 决定使用哪个 memory 文件
    // - default：使用 memory.md
    // - 其他 Tab：检查是否有独立配置，有则使用 memory-{tabId}.md
    let tabId: string | undefined = undefined;
    
    if (sessionId !== 'default') {
      const configStore = SystemConfigStore.getInstance();
      const tabConfig = configStore.getTabConfig(sessionId);
      
      if (tabConfig?.memoryFile) {
        // 有独立配置，使用 tabId
        tabId = sessionId;
      }
    }
    
    return [
      {
        name: TOOL_NAMES.MEMORY,
        label: '记忆管理',
        description: `管理智能体的核心记忆。

功能：
- read: 读取当前记忆内容
- update: 更新记忆（自动提炼用户消息和执行结果）
- merge: 合并指定 Tab 的记忆到当前 Tab

记忆分类：
- 角色：智能体的特定专业角色（如法律专家、数据挖掘专家、前端开发专家）
- 用户习惯：用户的个人偏好、使用习惯、工作流程、常用的 skill 或 tool 及其使用方式
- 错误总结：之前遇到的错误和解决方案、Agent 出错并纠正后的经验教训
- 备忘事项：用户希望记住的其他任何事物（不属于上述分类）

分类示例：
- "你是法律专家" → 角色
- "我喜欢用 VS Code" → 用户习惯
- "我通常用 weather skill 查天气" → 用户习惯
- "记住这个错误：不要用 rm -rf" → 错误总结

主记忆更新：
- 默认只更新当前 Tab 的记忆
- 设置 updateMainMemory=true 可同时更新主记忆和当前 Tab 记忆
- 主记忆只影响默认 Tab，其他 Tab 使用独立记忆文件

记忆合并：
- 使用 merge 操作将指定 Tab 的记忆合并到当前 Tab
- 不指定 sourceTabName 时，默认合并主记忆（memory.md）
- 合并时会自动解决冲突（当前 Tab 记忆优先级更高）
- 合并后会自动去重和分类整理

注意：
- 记忆文件最大 20000 字符
- 更新时会自动提炼和分类
- 避免重复记录相似信息
- ⚠️ 严格禁止记录任何名字相关信息（名字由 api_set_name 工具管理）`,
        
        parameters: MemoryToolSchema,
        
        execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
          const params = args as {
            action: 'read' | 'update' | 'merge';
            userMessage?: string;
            context?: string;
            updateMainMemory?: boolean;
            sourceTabName?: string;
          };
          
          try {
            // 检查是否已被取消（执行前）
            if (signal?.aborted) {
              const err = new Error('记忆操作被取消');
              err.name = 'AbortError';
              throw err;
            }

            const { action, userMessage, context, updateMainMemory = false, sourceTabName } = params;
            
            console.log(`[Memory Tool] 执行操作: ${action}, Tab ID: ${tabId || 'default'}, 更新主记忆: ${updateMainMemory}`);
            
            if (action === 'read') {
              // 读取记忆（使用当前 Tab 的 memory 文件）
              const memory = await readMemory(tabId);
              
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `记忆内容：\n\n${memory}`,
                  },
                ],
                details: {
                  memory,
                  length: memory.length,
                  tabId: tabId || 'default',
                },
              };
            }
            
            if (action === 'merge') {
              // 合并记忆
              console.log('\n' + '='.repeat(80));
              console.log('[Memory Tool] 🔄 开始合并记忆');
              console.log('='.repeat(80));
              
              // 1. 确定源 Tab ID
              let sourceTabId: string | undefined = undefined;
              
              if (sourceTabName) {
                // 通过 Tab 名称查找 Tab ID
                const gateway = getGatewayInstance();
                if (!gateway) {
                  throw new Error('Gateway 实例未设置，无法查找 Tab');
                }
                
                const allTabs = gateway.getAllTabs();
                const sourceTab = allTabs.find(tab => tab.title === sourceTabName);
                
                if (!sourceTab) {
                  throw new Error(`未找到名为 "${sourceTabName}" 的 Tab`);
                }
                
                // 检查源 Tab 是否有独立的 memory 配置
                const configStore = SystemConfigStore.getInstance();
                const sourceTabConfig = configStore.getTabConfig(sourceTab.id);
                
                if (sourceTabConfig?.memoryFile) {
                  sourceTabId = sourceTab.id;
                  console.log(`[Memory Tool] 📂 源 Tab: ${sourceTabName} (ID: ${sourceTabId})`);
                } else {
                  console.log(`[Memory Tool] 📂 源 Tab "${sourceTabName}" 使用主记忆，将合并主记忆`);
                }
              } else {
                console.log('[Memory Tool] 📂 未指定源 Tab，将合并主记忆（memory.md）');
              }
              
              // 2. 读取当前 Tab 的记忆
              const currentMemory = await readMemory(tabId);
              console.log('[Memory Tool] 📥 当前 Tab 记忆内容:');
              console.log(currentMemory);
              console.log('='.repeat(80));
              
              // 3. 读取源记忆
              const sourceMemory = await readMemory(sourceTabId);
              console.log(`[Memory Tool] 📥 源记忆内容 (${sourceTabName || '主记忆'}):`);
              console.log(sourceMemory);
              console.log('='.repeat(80));
              
              // 4. 检查是否已被取消
              if (signal?.aborted) {
                const err = new Error('记忆合并操作被取消');
                err.name = 'AbortError';
                throw err;
              }
              
              // 5. 调用 AI 合并记忆
              console.log('[Memory Tool] 🤖 使用大模型合并记忆...');
              const mergedMemory = await mergeMemories(currentMemory, sourceMemory, signal);
              
              console.log('\n' + '='.repeat(80));
              console.log('[Memory Tool] 📤 合并后的记忆内容:');
              console.log(mergedMemory);
              console.log('='.repeat(80));
              
              // 6. 写入当前 Tab
              await writeMemory(mergedMemory, tabId);
              const { memoryFile } = getMemoryFilePath(tabId);
              console.log('[Memory Tool] ✅ 合并后的记忆已写入:', memoryFile);
              
              // 7. 重新加载当前 Tab 的系统提示词
              const gateway = getGatewayInstance();
              if (gateway) {
                console.log('\n' + '='.repeat(80));
                console.log(`[Memory Tool] 🔄 触发当前 Tab (${sessionId}) 系统提示词重新加载...`);
                console.log('='.repeat(80));
                await gateway.reloadSessionSystemPrompt(sessionId);
                console.log('='.repeat(80));
                console.log(`[Memory Tool] ✅ Tab ${sessionId} 系统提示词已重新加载`);
                console.log('='.repeat(80) + '\n');
              } else {
                console.warn('[Memory Tool] ⚠️ Gateway 实例未设置，无法重新加载系统提示词');
              }
              
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `记忆已合并。已将 ${sourceTabName || '主记忆'} 的内容合并到当前 Tab。`,
                  },
                ],
                details: {
                  success: true,
                  sourceTabName: sourceTabName || '主记忆',
                  sourceTabId: sourceTabId || 'default',
                  currentTabId: tabId || sessionId,
                  oldLength: currentMemory.length,
                  newLength: mergedMemory.length,
                },
              };
            }
            
            if (action === 'update') {
              // 更新记忆
              if (!userMessage) {
                throw new Error('update 操作需要提供 userMessage 参数');
              }
              
              // 检查是否已被取消（更新前）
              if (signal?.aborted) {
                const err = new Error('记忆操作被取消');
                err.name = 'AbortError';
                throw err;
              }
              
              // 🔥 根据 updateMainMemory 参数决定更新策略
              if (updateMainMemory) {
                console.log('\n' + '='.repeat(80));
                console.log('[Memory Tool] 🔄 同时更新主记忆和当前 Tab 记忆');
                console.log('='.repeat(80));
                
                // 1. 更新主记忆（memory.md）
                const mainMemory = await readMemory(); // 不传 tabId，读取主记忆
                console.log('[Memory Tool] 📥 当前主记忆内容:');
                console.log(mainMemory);
                console.log('='.repeat(80));
                
                console.log('[Memory Tool] 🤖 使用大模型提炼主记忆...');
                const updatedMainMemory = await refineMemory(userMessage, context, mainMemory, signal);
                
                console.log('\n' + '='.repeat(80));
                console.log('[Memory Tool] 📤 更新后的主记忆内容:');
                console.log(updatedMainMemory);
                console.log('='.repeat(80));
                
                await writeMemory(updatedMainMemory); // 不传 tabId，写入主记忆
                console.log('[Memory Tool] ✅ 主记忆文件已更新');
                
                // 2. 如果当前 Tab 有独立记忆，也同步更新
                if (tabId) {
                  console.log('\n' + '='.repeat(80));
                  console.log(`[Memory Tool] 🔄 同步更新当前 Tab (${tabId}) 记忆`);
                  console.log('='.repeat(80));
                  
                  const currentTabMemory = await readMemory(tabId);
                  console.log('[Memory Tool] 📥 当前 Tab 记忆内容:');
                  console.log(currentTabMemory);
                  console.log('='.repeat(80));
                  
                  console.log('[Memory Tool] 🤖 使用大模型提炼 Tab 记忆...');
                  const updatedTabMemory = await refineMemory(userMessage, context, currentTabMemory, signal);
                  
                  console.log('\n' + '='.repeat(80));
                  console.log('[Memory Tool] 📤 更新后的 Tab 记忆内容:');
                  console.log(updatedTabMemory);
                  console.log('='.repeat(80));
                  
                  await writeMemory(updatedTabMemory, tabId);
                  console.log(`[Memory Tool] ✅ Tab ${tabId} 记忆文件已更新`);
                }
                
                // 3. 重新加载默认 Tab 的系统提示词（因为主记忆更新了）
                const gateway = getGatewayInstance();
                if (gateway) {
                  console.log('\n' + '='.repeat(80));
                  console.log('[Memory Tool] 🔄 触发默认 Tab 系统提示词重新加载...');
                  console.log('='.repeat(80));
                  await gateway.reloadSessionSystemPrompt('default');
                  console.log('='.repeat(80));
                  console.log('[Memory Tool] ✅ 默认 Tab 系统提示词已重新加载');
                  console.log('='.repeat(80) + '\n');
                } else {
                  console.warn('[Memory Tool] ⚠️ Gateway 实例未设置，无法重新加载系统提示词');
                }
                
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: '记忆已更新（同时更新了主记忆和当前 Tab 记忆）。',
                    },
                  ],
                  details: {
                    success: true,
                    updatedMainMemory: true,
                    updatedTabMemory: !!tabId,
                    tabId: tabId || 'default',
                  },
                };
              } else {
                // 🔥 只更新当前 Tab 记忆（原有逻辑）
                const currentMemory = await readMemory(tabId);
                
                console.log('\n' + '='.repeat(80));
                console.log(`[Memory Tool] 📝 更新当前 Tab 记忆 (Tab: ${tabId || 'default'})`);
                console.log('='.repeat(80));
                console.log('[Memory Tool] 📥 当前记忆内容:');
                console.log(currentMemory);
                console.log('='.repeat(80));
                
                console.log('[Memory Tool] 🤖 使用大模型提炼记忆...');
                const updatedMemory = await refineMemory(userMessage, context, currentMemory, signal);
                
                console.log('\n' + '='.repeat(80));
                console.log('[Memory Tool] 📤 更新后的记忆内容:');
                console.log(updatedMemory);
                console.log('='.repeat(80) + '\n');
                
                await writeMemory(updatedMemory, tabId);
                const { memoryFile } = getMemoryFilePath(tabId);
                console.log('[Memory Tool] ✅ 记忆文件已写入:', memoryFile);
                
                // 🔥 只重新加载当前 Tab 的系统提示词
                const gateway = getGatewayInstance();
                if (gateway) {
                  console.log('\n' + '='.repeat(80));
                  console.log(`[Memory Tool] 🔄 触发当前 Tab (${sessionId}) 系统提示词重新加载...`);
                  console.log('='.repeat(80));
                  await gateway.reloadSessionSystemPrompt(sessionId);
                  console.log('='.repeat(80));
                  console.log(`[Memory Tool] ✅ Tab ${sessionId} 系统提示词已重新加载`);
                  console.log('='.repeat(80) + '\n');
                } else {
                  console.warn('[Memory Tool] ⚠️ Gateway 实例未设置，无法重新加载系统提示词');
                }
                
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: '记忆已更新。',
                    },
                  ],
                  details: {
                    success: true,
                    oldLength: currentMemory.length,
                    newLength: updatedMemory.length,
                    tabId: tabId || 'default',
                    updatedMainMemory: false,
                  },
                };
              }
            }
            
            throw new Error(`未知操作: ${action}`);
          } catch (error) {
            const errorMessage = getErrorMessage(error);
            console.error('[Memory Tool] 执行失败:', errorMessage);
            
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `记忆操作失败: ${errorMessage}`,
                },
              ],
              details: {
                error: errorMessage,
              },
            };
          }
        },
      },
    ];
  },
};

// ==================== 导出辅助函数 ====================

/**
 * 导出读取记忆的辅助函数（用于系统提示词）
 * @param sessionId - 会话 ID（可选），用于加载对应 Tab 的 memory
 */
export async function getMemoryContent(sessionId?: string): Promise<string> {
  try {
    // 🔥 根据 sessionId 决定使用哪个 memory 文件
    // - default 或未提供：使用 memory.md
    // - 其他 Tab：使用 memory-{tabId}.md（如果配置了独立 memory）
    let tabId: string | undefined = undefined;
    
    if (sessionId && sessionId !== 'default') {
      // 检查是否有 Tab 独立的 memory 配置
      const configStore = SystemConfigStore.getInstance();
      const tabConfig = configStore.getTabConfig(sessionId);
      
      if (tabConfig?.memoryFile) {
        // 有独立配置，使用 tabId
        tabId = sessionId;
      }
      // 否则使用默认的 memory.md（tabId 保持 undefined）
    }
    
    return await readMemory(tabId);
  } catch (error) {
    console.error('[Memory Tool] 读取记忆失败:', error);
    return MEMORY_TEMPLATE;
  }
}

/**
 * 删除 Tab 的 memory 文件
 * @param tabId - Tab ID
 * @param memoryFileName - memory 文件名（可选，如果不提供则从数据库读取）
 */
export async function deleteTabMemoryFile(tabId: string, memoryFileName?: string): Promise<void> {
  try {
    console.log(`[Memory Tool] 🗑️ 删除 Tab ${tabId} 的 memory 文件...`);
    
    // 确定 memory 文件名
    let memoryFile = memoryFileName;
    
    if (!memoryFile) {
      // 尝试从数据库读取
      const configStore = SystemConfigStore.getInstance();
      const tabConfig = configStore.getTabConfig(tabId);
      memoryFile = tabConfig?.memoryFile;
    }
    
    // 如果没有独立的 memory 文件配置，直接返回
    if (!memoryFile) {
      console.log(`[Memory Tool] ℹ️ Tab ${tabId} 没有独立的 memory 文件，跳过删除`);
      return;
    }
    
    // 获取完整路径
    const configStore = SystemConfigStore.getInstance();
    const settings = configStore.getWorkspaceSettings();
    const memoryDir = settings.memoryDir;
    const memoryFilePath = path.join(memoryDir, memoryFile);
    
    console.log(`[Memory Tool] 📂 Memory 文件路径: ${memoryFilePath}`);
    
    // 检查文件是否存在
    try {
      await fs.access(memoryFilePath);
    } catch {
      console.log(`[Memory Tool] ℹ️ Memory 文件不存在: ${memoryFilePath}`);
      return;
    }
    
    // 删除文件
    await fs.unlink(memoryFilePath);
    console.log(`[Memory Tool] ✅ 已删除 memory 文件: ${memoryFilePath}`);
  } catch (error) {
    console.error(`[Memory Tool] ❌ 删除 Tab ${tabId} 的 memory 文件失败:`, getErrorMessage(error));
    // 不抛出错误，避免影响 Tab 关闭流程
  }
}
