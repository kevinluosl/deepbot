/**
 * Agent 初始化器
 * 
 * 职责：初始化 Agent、加载工具、构建系统提示词
 */

import type { Agent, AgentMessage } from '@mariozechner/pi-agent-core';
import type { Model } from '@mariozechner/pi-ai';
import { ToolLoader } from '../tools/registry/tool-loader';
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
    
    // 动态加载 ESM 模块（pi-agent-core）
    // eslint-disable-next-line no-eval
    const piAgentCore = await eval('import("@mariozechner/pi-agent-core")');
    const { Agent } = piAgentCore;
    
    // 获取所有工具
    const tools = await this.loadTools();
    
    // 创建 Agent 实例（历史消息由 AgentRuntime 加载）
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
    const toolLoader = new ToolLoader(this.workspaceDir, this.sessionId);
    return await toolLoader.loadAllTools(this.configStore);
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
        toolNames,
        runtimeInfo: runtimeParams.runtimeInfo,
        userTimezone: runtimeParams.userTimezone,
        userTime: runtimeParams.userTime,
        contextFiles,
      };
      
      // 构建系统提示词
      const systemPrompt = await buildSystemPrompt(promptParams, this.sessionId);
      
      // 更新 Agent 的系统提示词
      agent.setSystemPrompt(systemPrompt);
      
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
   * 清理资源
   */
  async cleanup(): Promise<void> {
    console.log('✅ Agent 资源清理完成');
  }
}
