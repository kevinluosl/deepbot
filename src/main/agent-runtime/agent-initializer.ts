/**
 * Agent 初始化器
 * 
 * 职责：初始化 Agent、加载工具、构建系统提示词
 */

import type { Agent } from '@mariozechner/pi-agent-core';
import type { Model } from '@mariozechner/pi-ai';
import { getFileTools } from '../tools/file-tool';
import { getExecTools } from '../tools/exec-tool';
import { createBrowserTool } from '../tools/browser-tool';
import { getCalendarTools } from '../tools/calendar-tool';
import { createSkillManagerTool } from '../tools/skill-manager-tool';
import { createScheduledTaskTool } from '../tools/scheduled-task-tool';
import { createEnvironmentCheckTool } from '../tools/environment-check-tool';
import { createImageGenerationTool } from '../tools/image-generation-tool';
import { createWebSearchTool } from '../tools/web-search-tool';
import { createMemoryTool } from '../tools/memory-tool';
import { startBrowserControlServer, stopBrowserControlServer } from '../browser/server';
import { buildSystemPrompt, loadContextFiles, buildRuntimeParams } from '../prompts';
import type { SystemPromptParams } from '../../types/prompt';
import { SystemConfigStore } from '../database/system-config-store';

/**
 * Agent 初始化器类
 */
export class AgentInitializer {
  private workspaceDir: string;
  private sessionId: string;
  private model: Model<'openai-completions'>;
  private apiKey: string;
  private configStore: SystemConfigStore;

  constructor(
    workspaceDir: string,
    sessionId: string,
    model: Model<'openai-completions'>,
    apiKey: string
  ) {
    this.workspaceDir = workspaceDir;
    this.sessionId = sessionId;
    this.model = model;
    this.apiKey = apiKey;
    this.configStore = SystemConfigStore.getInstance();
  }

  /**
   * 初始化 Agent
   * 
   * @returns Agent 实例和工具列表
   */
  async initialize(): Promise<{ agent: Agent; tools: any[] }> {
    console.log('🔄 开始异步初始化 Agent...');
    
    // 启动 Browser Control Server
    console.log('🔄 启动 Browser Control Server...');
    await startBrowserControlServer();
    console.log('✅ Browser Control Server 已启动');
    
    // 动态加载 ESM 模块（pi-agent-core）
    // eslint-disable-next-line no-eval
    const piAgentCore = await eval('import("@mariozechner/pi-agent-core")');
    const { Agent } = piAgentCore;
    
    // 获取所有工具
    const tools = await this.loadTools();
    
    console.log('   工具数量:', tools.length);
    console.log('   工具列表:', tools.map(t => t.name).join(', '));
    
    // 创建 Agent 实例
    const agent = new Agent({
      initialState: {
        systemPrompt: '', // 稍后异步设置
        model: this.model,
        thinkingLevel: 'off',
        tools,
        messages: [],
      },
      getApiKey: async () => this.apiKey,
    });
    
    console.log('✅ Agent 实例创建完成');
    
    return { agent, tools };
  }

  /**
   * 加载所有工具
   */
  private async loadTools(): Promise<any[]> {
    const fileTools = await getFileTools(this.workspaceDir);
    const execTools = await getExecTools(this.workspaceDir);
    const browserTool = createBrowserTool();
    const calendarTools = getCalendarTools();
    const skillManagerTool = createSkillManagerTool();
    const scheduledTaskTool = createScheduledTaskTool();
    const environmentCheckTool = createEnvironmentCheckTool();
    const imageGenerationTool = createImageGenerationTool(this.configStore);
    const webSearchTool = createWebSearchTool(this.configStore);
    const memoryTool = createMemoryTool();
    
    return [...fileTools, ...execTools, browserTool, ...calendarTools, skillManagerTool, scheduledTaskTool, environmentCheckTool, imageGenerationTool, webSearchTool, memoryTool];
  }

  /**
   * 初始化系统提示词
   * 
   * @param agent - Agent 实例
   * @param tools - 工具列表
   * @returns 系统提示词
   */
  async initializeSystemPrompt(agent: Agent, tools: any[]): Promise<string> {
    try {
      // 从数据库读取完整的工作区配置
      const settings = this.configStore.getWorkspaceSettings();
      
      // 加载上下文文件（从 templates 目录），并替换模板变量
      const contextFiles = loadContextFiles(settings);
      
      // 构建运行时参数
      const runtimeParams = buildRuntimeParams({
        agentId: 'main',
        model: this.model.id,
        sessionId: this.sessionId,
      });
      
      // 获取工具名称列表
      const toolNames = tools.map(t => t.name);
      
      // 构建系统提示词参数
      const promptParams: SystemPromptParams = {
        workspaceDir: this.workspaceDir,
        scriptDir: settings.scriptDir,
        skillDirs: settings.skillDirs,
        defaultSkillDir: settings.defaultSkillDir,
        imageDir: settings.imageDir,
        memoryDir: settings.memoryDir,
        agentId: 'main',
        promptMode: 'full',
        toolNames,
        runtimeInfo: runtimeParams.runtimeInfo,
        userTimezone: runtimeParams.userTimezone,
        userTime: runtimeParams.userTime,
        contextFiles,
      };
      
      // 构建系统提示词
      const systemPrompt = await buildSystemPrompt(promptParams);
      
      // 🔍 调试：打印完整的系统提示词
      if (process.env.DEBUG_SYSTEM_PROMPT === 'true') {
        console.log('\n' + '='.repeat(80));
        console.log('📋 完整系统提示词:');
        console.log('='.repeat(80));
        console.log(systemPrompt);
        console.log('='.repeat(80) + '\n');
      }
      
      // 🔍 调试：打印系统提示词的关键部分（前 500 字符 + 后 500 字符）
      console.log('\n📋 系统提示词预览:');
      console.log('   前 500 字符:', systemPrompt.substring(0, 500));
      console.log('   ...');
      console.log('   后 500 字符:', systemPrompt.substring(systemPrompt.length - 500));
      console.log('');
      
      // 🔍 检查是否包含关键规则
      const hasTaskExecution = systemPrompt.includes('任务执行规则');
      const hasStepByStep = systemPrompt.includes('逐步执行');
      const hasNoAutoSkill = systemPrompt.includes('只有用户明确要求时才使用 Skill');
      
      console.log('📊 关键规则检查:');
      console.log('   ✅ 包含"任务执行规则":', hasTaskExecution);
      console.log('   ✅ 包含"逐步执行":', hasStepByStep);
      console.log('   ✅ 包含"只有用户明确要求时才使用 Skill":', hasNoAutoSkill);
      console.log('');
      
      // 更新 Agent 的系统提示词
      agent.setSystemPrompt(systemPrompt);
      
      console.log('✅ 系统提示词初始化完成');
      console.log('   提示词长度:', systemPrompt.length, '字符');
      console.log('   会话ID:', this.sessionId);
      
      return systemPrompt;
    } catch (error) {
      console.error('❌ 系统提示词初始化失败:', error);
      
      // 使用最小提示词作为降级
      const fallbackPrompt = '你是 DEEPBOT MATRIX TERMINAL，一个运行在桌面的 AI 助手。';
      agent.setSystemPrompt(fallbackPrompt);
      
      return fallbackPrompt;
    }
  }

  /**
   * 重新创建 Agent 实例
   * 
   * @param oldAgent - 旧的 Agent 实例
   * @param tools - 工具列表
   * @param systemPrompt - 系统提示词
   * @returns 新的 Agent 实例
   */
  async recreateAgent(
    oldAgent: Agent | null,
    tools: any[],
    systemPrompt: string
  ): Promise<Agent> {
    // 动态导入 Agent 类
    // eslint-disable-next-line no-eval
    const piAgentCore = await eval('import("@mariozechner/pi-agent-core")');
    const { Agent } = piAgentCore;
    
    // 保存旧的消息历史
    const oldMessages = oldAgent?.state.messages || [];
    
    // 创建新的 Agent 实例
    const agent = new Agent({
      initialState: {
        systemPrompt: systemPrompt || '',
        model: this.model,
        thinkingLevel: 'off',
        tools,
        messages: oldMessages, // 保留消息历史
      },
      getApiKey: async () => this.apiKey,
    });
    
    console.log('✅ Agent 实例已重新创建');
    
    return agent;
  }

  /**
   * 停止 Browser Control Server
   */
  async cleanup(): Promise<void> {
    console.log('🔄 停止 Browser Control Server...');
    await stopBrowserControlServer();
    console.log('✅ Browser Control Server 已停止');
  }
}
