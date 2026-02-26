/**
 * 工具加载器
 * 
 * 负责加载内置工具（src/main/tools/）
 * 配置文件在工具执行时动态读取
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { getToolRegistry, ToolRegistry } from './tool-registry';
import type { ToolConfig } from './tool-interface';
import { safeJsonParse } from '../../../shared/utils/json-utils';

// 导入内置工具
import { getFileTools } from '../file-tool';
import { getExecTools } from '../exec-tool';
import { createBrowserTool } from '../browser-tool';
import { getCalendarTools } from '../calendar-tool';
import { createSkillManagerTool } from '../skill-manager-tool';
import { createScheduledTaskTool } from '../scheduled-task-tool';
import { createEnvironmentCheckTool } from '../environment-check-tool';
import { createImageGenerationTool } from '../image-generation-tool';
import { createWebSearchTool } from '../web-search-tool';
import { createMemoryTool } from '../memory-tool';
import { emailToolPlugin } from '../email-tool';
import { connectorToolPlugin } from '../connector-tool';

/**
 * 工具加载器类
 */
export class ToolLoader {
  private registry: ToolRegistry;
  private workspaceDir: string;
  private sessionId: string;
  
  constructor(workspaceDir: string, sessionId: string) {
    this.registry = getToolRegistry();
    this.workspaceDir = workspaceDir;
    this.sessionId = sessionId;
  }
  
  /**
   * 加载所有工具
   * 
   * @param configStore - 系统配置存储
   * @returns 工具数组
   */
  async loadAllTools(configStore?: any): Promise<AgentTool[]> {
    console.log('📦 开始加载工具...');
    
    // 1. 加载工具配置（可选，用于启用/禁用工具）
    this.loadToolConfigs();
    
    // 2. 加载内置工具
    const builtinTools = await this.loadBuiltinTools(configStore);
    console.log(`✅ 内置工具: ${builtinTools.length} 个`);
    
    console.log(`📦 工具加载完成: 共 ${builtinTools.length} 个工具`);
    console.log(`   工具列表: ${builtinTools.map(t => t.name).join(', ')}`);
    
    return builtinTools;
  }
  
  /**
   * 加载工具配置（可选）
   * 用于启用/禁用特定工具
   */
  private loadToolConfigs(): void {
    const configPaths = [
      join(homedir(), '.deepbot', 'tools-config.json'),
      join(this.workspaceDir, '.deepbot', 'tools-config.json'),
    ];
    
    for (const configPath of configPaths) {
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf-8');
          const configs = safeJsonParse<Record<string, ToolConfig>>(content, {});
          
          for (const [id, config] of Object.entries(configs)) {
            this.registry.setToolConfig(id, config);
          }
          
          console.log(`✅ 加载工具配置: ${configPath}`);
        } catch (error) {
          console.error(`❌ 加载工具配置失败: ${configPath}`, error);
        }
      }
    }
  }
  
  /**
   * 加载内置工具
   * 所有工具都在 src/main/tools/ 中定义
   * 工具的配置文件在执行时动态读取
   * 
   * @param configStore - 系统配置存储
   * @returns 工具数组
   */
  private async loadBuiltinTools(configStore?: any): Promise<AgentTool[]> {
    const tools: AgentTool[] = [];
    
    try {
      // 文件工具
      const fileTools = await getFileTools(this.workspaceDir);
      tools.push(...fileTools);
      
      // 执行工具
      const execTools = await getExecTools(this.workspaceDir);
      tools.push(...execTools);
      
      // 浏览器工具
      const browserTool = createBrowserTool();
      tools.push(browserTool);
      
      // 日历工具
      const calendarTools = getCalendarTools();
      tools.push(...calendarTools);
      
      // Skill 管理工具
      const skillManagerTool = createSkillManagerTool();
      tools.push(skillManagerTool);
      
      // 定时任务工具
      const scheduledTaskTool = createScheduledTaskTool();
      tools.push(scheduledTaskTool);
      
      // 环境检查工具
      const environmentCheckTool = createEnvironmentCheckTool();
      tools.push(environmentCheckTool);
      
      // 图片生成工具
      if (configStore) {
        const imageGenerationTool = createImageGenerationTool(configStore);
        tools.push(imageGenerationTool);
      }
      
      // 网络搜索工具
      if (configStore) {
        const webSearchTool = createWebSearchTool(configStore);
        tools.push(webSearchTool);
      }
      
      // 记忆工具
      const memoryTool = createMemoryTool();
      tools.push(memoryTool);
      
      // 邮件工具
      // 配置文件在工具执行时从 ~/.deepbot/tools/email-tool/config.json 读取
      const emailToolsResult = emailToolPlugin.create({
        workspaceDir: this.workspaceDir,
        sessionId: this.sessionId,
        configStore,
      });
      
      // 处理可能的 Promise 返回值
      const emailTools = emailToolsResult instanceof Promise 
        ? await emailToolsResult 
        : emailToolsResult;
      
      if (Array.isArray(emailTools)) {
        tools.push(...emailTools);
      } else {
        tools.push(emailTools);
      }
      
      // 连接器工具
      // 用于在连接器会话中发送图片和文件
      const connectorToolsResult = connectorToolPlugin.create({
        workspaceDir: this.workspaceDir,
        sessionId: this.sessionId,
        configStore,
      });
      
      // 处理可能的 Promise 返回值
      const connectorTools = connectorToolsResult instanceof Promise 
        ? await connectorToolsResult 
        : connectorToolsResult;
      
      if (Array.isArray(connectorTools)) {
        tools.push(...connectorTools);
      } else {
        tools.push(connectorTools);
      }
    } catch (error) {
      console.error('❌ 加载内置工具失败:', error);
    }
    
    return tools;
  }
  
  /**
   * 获取工具注册表
   * 
   * @returns 工具注册表
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }
}
