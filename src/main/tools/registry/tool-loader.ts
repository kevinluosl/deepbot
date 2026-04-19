/**
 * 工具加载器
 * 
 * 负责加载所有工具（统一使用 ToolPlugin 接口）
 * 工具的配置在执行时动态读取
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { getToolRegistry, ToolRegistry } from './tool-registry';
import type { ToolConfig } from './tool-interface';
import { safeJsonParse } from '../../../shared/utils/json-utils';
import { TOOL_NAMES } from '../tool-names';

// 导入内置工具
import { fileToolPlugin } from '../file-tool';
import { execToolPlugin } from '../exec-tool';
import { browserToolPlugin } from '../browser-tool';
import { calendarToolPlugin } from '../calendar-tool';
import { skillManagerToolPlugin } from '../skill-manager';
import { scheduledTaskToolPlugin } from '../scheduled-task-tool';
import { environmentCheckToolPlugin } from '../environment-check-tool';
import { imageGenerationToolPlugin } from '../image-generation-tool';
import { webSearchToolPlugin } from '../web-search-tool';
import { webFetchToolPlugin } from '../web-fetch-tool';
import { memoryToolPlugin } from '../memory-tool';
import { chatToolPlugin } from '../chat-tool';
import { emailToolPlugin } from '../email-tool';
import { apiToolPlugin } from '../api-tool';
import { connectorToolPlugin } from '../connector-tool';
import { crossTabCallToolPlugin } from '../cross-tab-call-tool';
import { commandToolPlugin } from '../command-tool';
import { feishuDocToolPlugin } from '../feishu-doc-tool';

/**
 * 解析 plugin.create() 的返回值，统一处理 Promise 和数组/单个工具
 */
async function resolvePluginTools(
  result: AgentTool | AgentTool[] | Promise<AgentTool | AgentTool[]>
): Promise<AgentTool[]> {
  const resolved = result instanceof Promise ? await result : result;
  return Array.isArray(resolved) ? resolved : [resolved];
}

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
    
    // 2. 加载工具
    const builtinTools = await this.loadTools(configStore);
    console.log(`✅ 工具: ${builtinTools.length} 个`);
    
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
   * 加载所有工具
   * 统一使用 ToolPlugin 接口加载
   * 
   * @param configStore - 系统配置存储
   * @returns 工具数组
   */
  private async loadTools(configStore?: any): Promise<AgentTool[]> {
    const tools: AgentTool[] = [];
    
    // 获取禁用工具列表
    const disabledTools = new Set<string>(configStore ? configStore.getDisabledTools() : []);
    const isEnabled = (name: string) => !disabledTools.has(name);
    
    try {
      // 统一使用 plugin 模式加载所有工具
      const pluginOpts = { workspaceDir: this.workspaceDir, sessionId: this.sessionId, configStore };

      // 文件工具（read, write, edit）
      tools.push(...await resolvePluginTools(fileToolPlugin.create(pluginOpts)));
      
      // 执行工具（bash）
      tools.push(...await resolvePluginTools(execToolPlugin.create(pluginOpts)));
      
      // 浏览器工具
      if (isEnabled(TOOL_NAMES.BROWSER)) {
        tools.push(...await resolvePluginTools(browserToolPlugin.create(pluginOpts)));
      }

      // 日历工具
      if (isEnabled(TOOL_NAMES.CALENDAR_GET_EVENTS) || isEnabled(TOOL_NAMES.CALENDAR_CREATE_EVENT)) {
        const calendarTools = await resolvePluginTools(calendarToolPlugin.create(pluginOpts));
        for (const t of calendarTools) {
          if (isEnabled(t.name)) tools.push(t);
        }
      }
      
      // Skill 管理工具
      tools.push(...await resolvePluginTools(skillManagerToolPlugin.create(pluginOpts)));
      
      // 定时任务工具
      tools.push(...await resolvePluginTools(scheduledTaskToolPlugin.create(pluginOpts)));
      
      // 环境检查工具
      tools.push(...await resolvePluginTools(environmentCheckToolPlugin.create(pluginOpts)));
      
      // 图片生成工具
      if (configStore && isEnabled(TOOL_NAMES.IMAGE_GENERATION)) {
        tools.push(...await resolvePluginTools(imageGenerationToolPlugin.create(pluginOpts)));
      }
      
      // 网络搜索工具
      if (configStore && isEnabled(TOOL_NAMES.WEB_SEARCH)) {
        tools.push(...await resolvePluginTools(webSearchToolPlugin.create(pluginOpts)));
      }
      
      // Web 内容获取工具
      tools.push(...await resolvePluginTools(webFetchToolPlugin.create(pluginOpts)));
      
      // 记忆工具
      tools.push(...await resolvePluginTools(memoryToolPlugin.create(pluginOpts)));
      
      // Chat 工具（AI 对话）
      if (configStore) {
        tools.push(...await resolvePluginTools(chatToolPlugin.create(pluginOpts)));
      }
      
      // 邮件工具（已屏蔽，推荐使用 imap-smtp-email-chinese skill 代替）
      // tools.push(...await resolvePluginTools(emailToolPlugin.create(pluginOpts)));
      
      // API 工具（系统配置访问）
      tools.push(...await resolvePluginTools(apiToolPlugin.create(pluginOpts)));
      
      // 连接器工具（在连接器会话中发送图片和文件）
      tools.push(...await resolvePluginTools(connectorToolPlugin.create(pluginOpts)));
      
      // 跨 Tab 调用工具（多 Agent 协作）
      tools.push(...await resolvePluginTools(crossTabCallToolPlugin.create(pluginOpts)));
      
      // 系统指令工具（/new 等系统级指令）
      tools.push(...await resolvePluginTools(commandToolPlugin.create(pluginOpts)));

      // 飞书云文档工具
      tools.push(...await resolvePluginTools(feishuDocToolPlugin.create(pluginOpts)));

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
