/**
 * Memory Tool - 记忆管理工具
 * 
 * 功能：
 * 1. 读取核心记忆文件（memory.md）
 * 2. 更新核心记忆（通过大模型提炼）
 * 3. 自动分类管理记忆
 * 4. 管理智能体名字和用户称呼（同步到数据库和 memory.md）
 * 
 * 记忆文件结构：
 * - 姓名和性格
 * - 用户习惯
 * - 错误总结
 * - 其他重要信息
 * 
 * 最大长度：5000 字符
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TOOL_NAMES } from './tool-names';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { callAI } from '../utils/ai-client';
import { MemoryToolSchema, type MemoryToolParams } from './memory-tool.schema';
import { SystemConfigStore } from '../database/system-config-store';
import type { Gateway } from '../gateway';

/**
 * 记忆文件路径（已废弃，改为动态获取）
 */
const MAX_MEMORY_LENGTH = 5000; // 最大 5000 字符

/**
 * 获取记忆文件路径（从数据库读取配置）
 */
function getMemoryFilePath(): { memoryDir: string; memoryFile: string } {
  const configStore = SystemConfigStore.getInstance();
  const settings = configStore.getWorkspaceSettings();
  const memoryDir = settings.memoryDir;
  const memoryFile = path.join(memoryDir, 'memory.md');
  return { memoryDir, memoryFile };
}

// ==================== Gateway 实例管理 ====================

let gatewayInstance: Gateway | null = null;

/**
 * 设置 Gateway 实例
 * 
 * @param gateway - Gateway 实例
 */
export function setGatewayForMemoryTool(gateway: Gateway): void {
  gatewayInstance = gateway;
  console.info('[Memory Tool] Gateway 实例已设置');
}

/**
 * 获取 Gateway 实例
 * 
 * @returns Gateway 实例，如果未设置则返回 null
 */
function getGatewayInstance(): Gateway | null {
  return gatewayInstance;
}

/**
 * 记忆文件模板
 */
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

/**
 * 确保记忆目录和文件存在
 */
async function ensureMemoryFile(): Promise<void> {
  try {
    const { memoryDir, memoryFile } = getMemoryFilePath();
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
 */
async function readMemory(): Promise<string> {
  await ensureMemoryFile();
  
  try {
    const { memoryFile } = getMemoryFilePath();
    const content = await fs.readFile(memoryFile, 'utf-8');
    return content;
  } catch (error) {
    console.error('[Memory Tool] 读取记忆文件失败:', error);
    return MEMORY_TEMPLATE;
  }
}

/**
 * 写入记忆文件
 */
async function writeMemory(content: string): Promise<void> {
  await ensureMemoryFile();
  
  // 限制长度
  let finalContent = content;
  if (content.length > MAX_MEMORY_LENGTH) {
    console.warn(`[Memory Tool] 记忆内容超过限制 (${content.length} > ${MAX_MEMORY_LENGTH})，将被截断`);
    finalContent = content.slice(0, MAX_MEMORY_LENGTH);
  }
  
  try {
    const { memoryFile } = getMemoryFilePath();
    await fs.writeFile(memoryFile, finalContent, 'utf-8');
    console.log('[Memory Tool] 记忆文件已更新');
  } catch (error) {
    console.error('[Memory Tool] 写入记忆文件失败:', error);
    throw error;
  }
}

/**
 * 使用大模型提炼记忆
 * 
 * @param userMessage - 用户消息
 * @param context - 执行上下文（可选）
 * @param currentMemory - 当前记忆内容
 * @returns 提炼后的记忆更新
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
      maxTokens: 2000,
      signal,
    });
    
    return response.content.trim();
  } catch (error) {
    console.error('[Memory Tool] 大模型提炼记忆失败:', error);
    throw error;
  }
}

/**
 * 创建 Memory Tool
 */
export function createMemoryTool(): AgentTool {
  return {
    name: TOOL_NAMES.MEMORY,
    label: '记忆管理',
    description: `管理智能体的核心记忆。

功能：
- read: 读取当前记忆内容
- update: 更新记忆（自动提炼用户消息和执行结果）

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

注意：
- 记忆文件最大 5000 字符
- 更新时会自动提炼和分类
- 避免重复记录相似信息
- ⚠️ 严格禁止记录任何名字相关信息（名字由 api_set_name 工具管理）`,
    
    parameters: MemoryToolSchema,
    
    execute: async (_toolCallId: string, args: any, signal?: AbortSignal) => {
      const params = args as MemoryToolParams;
      try {
        // 检查是否已被取消（执行前）
        if (signal?.aborted) {
          const err = new Error('记忆操作被取消');
          err.name = 'AbortError';
          throw err;
        }

        const { action, userMessage, context } = params as MemoryToolParams;
        
        console.log(`[Memory Tool] 执行操作: ${action}`);
        
        if (action === 'read') {
          // 读取记忆
          const memory = await readMemory();
          
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
          
          const currentMemory = await readMemory();
          
          console.log('\n' + '='.repeat(80));
          console.log('[Memory Tool] 📝 开始更新记忆');
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
          
          await writeMemory(updatedMemory);
          const { memoryFile } = getMemoryFilePath();
          console.log('[Memory Tool] ✅ 记忆文件已写入:', memoryFile);
          
          // 🔥 重新加载系统提示词（确保下一次对话使用新记忆）
          const gateway = getGatewayInstance();
          if (gateway) {
            console.log('\n' + '='.repeat(80));
            console.log('[Memory Tool] 🔄 触发系统提示词重新加载...');
            console.log('='.repeat(80));
            await gateway.reloadSystemPrompts();
            console.log('='.repeat(80));
            console.log('[Memory Tool] ✅ 系统提示词已重新加载');
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
            },
          };
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
  };
}

/**
 * 导出读取记忆的辅助函数（用于系统提示词）
 */
export async function getMemoryContent(): Promise<string> {
  try {
    return await readMemory();
  } catch (error) {
    console.error('[Memory Tool] 读取记忆失败:', error);
    return MEMORY_TEMPLATE;
  }
}
