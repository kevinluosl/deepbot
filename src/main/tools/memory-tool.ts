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

## 姓名和性格
- 我是 matrix
- 用户名字：user

## 用户习惯
（暂无记录）

## 错误总结
（暂无记录）

## 其他重要信息
（暂无记录）
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
  currentMemory: string
): Promise<string> {
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
3. 将记忆点添加到合适的分类下：
   - 姓名和性格：智能体的名字、性格特征、角色定位、说话风格，以及用户的名字
   - 用户习惯：用户的个人偏好、使用习惯、常用操作、工作流程
   - 错误总结：之前遇到的错误和解决方案
   - 其他重要信息：其他需要长期记住的信息

4. 如果某个分类下已有类似信息，更新而不是重复添加
5. 保持记忆文件的结构和格式
6. 确保总长度不超过 5000 字符
7. 特别注意分类规则：
   - 智能体的名字（如"你叫xxx"、"叫你xxx"）→ "姓名和性格"部分，格式："我的名字是 xxx"
   - 用户的名字（如"我叫xxx"、"叫我xxx"、"称呼我xxx"）→ "姓名和性格"部分，格式："用户名字：xxx"
   - 智能体的性格（如"你是温柔的"、"你要幽默一点"）→ "姓名和性格"部分
   - 用户的偏好（如"我喜欢用VS Code"、"我通常早上工作"）→ "用户习惯"部分

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
    });
    
    return response.content.trim();
  } catch (error) {
    console.error('[Memory Tool] 大模型提炼记忆失败:', error);
    throw error;
  }
}

/**
 * 从记忆内容中提取用户名字
 * 
 * @param memoryContent - 记忆内容
 * @returns 用户名字，如果没有找到返回 null
 */
function extractUserNameFromMemory(memoryContent: string): string | null {
  // 匹配多种格式：
  // - "用户姓名：xxx"
  // - "用户名字：xxx"
  // - "用户叫 xxx"
  // - "用户是 xxx"
  
  // 尝试匹配 "用户姓名：xxx" 或 "用户名字：xxx"
  let nameMatch = memoryContent.match(/用户(?:姓名|名字)[：:]\s*([^\n，。,.\s、]+)/);
  if (nameMatch && nameMatch[1]) {
    const name = nameMatch[1].trim();
    console.log('[Memory Tool] 提取到用户名字（格式1）:', name);
    return name;
  }
  
  // 尝试匹配 "用户叫 xxx" 或 "用户是 xxx"
  nameMatch = memoryContent.match(/用户(?:叫|是)\s*([^\n，。,.\s、]+)/);
  if (nameMatch && nameMatch[1]) {
    const name = nameMatch[1].trim();
    console.log('[Memory Tool] 提取到用户名字（格式2）:', name);
    return name;
  }
  
  console.log('[Memory Tool] 未能提取到用户名字');
  return null;
}

/**
 * 从记忆内容中提取智能体名字
 * 
 * @param memoryContent - 记忆内容
 * @returns 智能体名字，如果没有找到返回 null
 */
function extractAgentNameFromMemory(memoryContent: string): string | null {
  // 匹配多种格式：
  // - "我的名字是 xxx"
  // - "我叫 xxx"
  // - "我是 xxx，一个智能助手"
  // - "我是 xxx"
  
  // 先尝试匹配 "我的名字是 xxx" 或 "我叫 xxx"
  let nameMatch = memoryContent.match(/(?:我的名字是|我叫)\s*([^\n，。,.\s、]+)/);
  if (nameMatch && nameMatch[1]) {
    const name = nameMatch[1].trim();
    console.log('[Memory Tool] 提取到名字（格式1）:', name);
    return name;
  }
  
  // 尝试匹配 "我是 xxx，一个智能助手" 或 "我是 xxx"
  nameMatch = memoryContent.match(/我是\s*([^\n，。,.\s、]+)(?:，|,|\s|$)/);
  if (nameMatch && nameMatch[1]) {
    const name = nameMatch[1].trim();
    // 排除一些通用词
    if (name !== 'DeepBot' && name !== '智能助手' && name !== 'AI' && name !== 'assistant') {
      console.log('[Memory Tool] 提取到名字（格式2）:', name);
      return name;
    }
  }
  
  console.log('[Memory Tool] 未能提取到名字');
  return null;
}

/**
 * 创建 Memory Tool
 */
export function createMemoryTool(): AgentTool {
  const configStore = SystemConfigStore.getInstance();
  
  return {
    name: TOOL_NAMES.MEMORY,
    label: '记忆管理',
    description: `管理智能体的核心记忆。

功能：
- read: 读取当前记忆内容
- update: 更新记忆（自动提炼用户消息和执行结果）

记忆分类：
- 姓名和性格：智能体的名字、性格特征、角色定位、说话风格，以及用户的名字（名字会自动同步到数据库）
- 用户习惯：用户的个人偏好、使用习惯、常用操作、工作流程
- 错误总结：之前遇到的错误和解决方案
- 其他重要信息：其他需要长期记住的信息

分类示例：
- "你是温柔的助手" → 姓名和性格
- "我喜欢用 VS Code" → 用户习惯
- "我通常早上 9 点工作" → 用户习惯

注意：
- 记忆文件最大 5000 字符
- 更新时会自动提炼和分类
- 避免重复记录相似信息
- 名字变化会自动同步到数据库和提示符`,
    
    parameters: MemoryToolSchema,
    
    execute: async (_toolCallId: string, args: any) => {
      const params = args as MemoryToolParams;
      try {
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
          
          const currentMemory = await readMemory();
          
          console.log('\n' + '='.repeat(80));
          console.log('[Memory Tool] 📝 开始更新记忆');
          console.log('='.repeat(80));
          console.log('[Memory Tool] 📥 当前记忆内容:');
          console.log(currentMemory);
          console.log('='.repeat(80));
          
          console.log('[Memory Tool] 🤖 使用大模型提炼记忆...');
          const updatedMemory = await refineMemory(userMessage, context, currentMemory);
          
          console.log('\n' + '='.repeat(80));
          console.log('[Memory Tool] 📤 更新后的记忆内容:');
          console.log(updatedMemory);
          console.log('='.repeat(80) + '\n');
          
          await writeMemory(updatedMemory);
          const { memoryFile } = getMemoryFilePath();
          console.log('[Memory Tool] ✅ 记忆文件已写入:', memoryFile);
          
          // 检查是否更新了智能体名字和用户名字
          const newAgentName = extractAgentNameFromMemory(updatedMemory);
          const newUserName = extractUserNameFromMemory(updatedMemory);
          const currentConfig = configStore.getNameConfig();
          
          let nameChanged = false;
          
          // 更新智能体名字
          if (newAgentName && newAgentName !== currentConfig.agentName) {
            console.log(`[Memory Tool] 🔄 检测到智能体名字变更: ${currentConfig.agentName} -> ${newAgentName}`);
            try {
              configStore.saveAgentName(newAgentName);
              console.log('[Memory Tool] ✅ 已同步智能体名字到数据库');
              nameChanged = true;
            } catch (error) {
              const errorMsg = getErrorMessage(error);
              console.error('[Memory Tool] ❌ 保存智能体名字失败:', errorMsg);
              // 继续执行，不中断流程
            }
          } else if (newAgentName) {
            console.log(`[Memory Tool] ℹ️  智能体名字未变更，保持为: ${newAgentName}`);
          }
          
          // 更新用户名字
          if (newUserName && newUserName !== currentConfig.userName) {
            console.log(`[Memory Tool] 🔄 检测到用户名字变更: ${currentConfig.userName} -> ${newUserName}`);
            try {
              configStore.saveUserName(newUserName);
              console.log('[Memory Tool] ✅ 已同步用户名字到数据库');
              nameChanged = true;
            } catch (error) {
              const errorMsg = getErrorMessage(error);
              console.error('[Memory Tool] ❌ 保存用户名字失败:', errorMsg);
              // 继续执行，不中断流程
            }
          } else if (newUserName) {
            console.log(`[Memory Tool] ℹ️  用户名字未变更，保持为: ${newUserName}`);
          }
          
          // 🔥 如果名字有变化，发送事件到前端
          if (nameChanged) {
            const { BrowserWindow } = require('electron');
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (mainWindow) {
              const updatedConfig = configStore.getNameConfig();
              mainWindow.webContents.send('name-config:updated', updatedConfig);
              console.log('[Memory Tool] 📤 已发送名字配置更新事件到前端:', updatedConfig);
            }
          }
          
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
          
          // 构建返回消息
          let resultMessage = '记忆已更新。';
          if (newAgentName || newUserName) {
            resultMessage += '\n\n';
            if (newAgentName) {
              resultMessage += `✅ 智能体名字已更新为: ${newAgentName}（已同步到数据库和提示符）\n`;
            }
            if (newUserName) {
              resultMessage += `✅ 用户名字已更新为: ${newUserName}（已同步到数据库和提示符）`;
            }
          }
          
          return {
            content: [
              {
                type: 'text' as const,
                text: resultMessage,
              },
            ],
            details: {
              success: true,
              oldLength: currentMemory.length,
              newLength: updatedMemory.length,
              nameUpdated: nameChanged,
              newAgentName,
              newUserName,
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
