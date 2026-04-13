/**
 * AI Agent Runtime（重构版）
 * 
 * 职责：
 * - 协调各个模块
 * - 管理 Agent 生命周期
 * - 提供统一的对外接口
 * 
 */

import type { Model } from '@mariozechner/pi-ai';
import { getConfig } from '../config';
import { SystemConfigStore } from '../database/system-config-store';
import { OperationTracker, wrapToolWithDuplicateDetection } from '../tools/tool-abort';
import type { AgentRuntimeConfig, AgentStateInfo, AgentInstanceManager } from './types';
import { AgentInitializer } from './agent-initializer';
import { MessageHandler } from './message-handler';
import { StepTracker } from './step-tracker';
import { AgentMessageProcessor } from './agent-message-processor';
import { callAI } from '../utils/ai-client';
import { getErrorMessage } from '../../shared/utils/error-handler';
import type { TaskPlan } from '../../types/task-plan';

/**
 * Agent Runtime 类
 */
export class AgentRuntime {
  private config: ReturnType<typeof getConfig>;
  private runtimeConfig: AgentRuntimeConfig;
  private systemPrompt: string = '';
  private initPromise: Promise<void> | null = null;
  private systemPromptInitializing: boolean = false; // 防止重复初始化系统提示词
  
  // 模块实例
  private initializer: AgentInitializer;
  private messageHandler: MessageHandler;
  private stepTracker: StepTracker;
  private messageProcessor: AgentMessageProcessor;
  
  // Agent 实例管理
  private instanceManager: AgentInstanceManager = {
    agent: null,
  };
  
  // 工具列表（缓存）
  private tools: any[] = [];
  private originalTools: any[] = []; // 原始工具列表（不带重复检测）
  
  // 重复检测
  private lastResponsePart: string = '';
  private repeatCount: number = 0;
  
  // 操作追踪器
  private operationTracker = new OperationTracker();
  
  // 跳过历史记录标志（用于欢迎消息等不需要记录的场景）
  private skipHistory: boolean = false;

  /**
   * 创建 AgentRuntime 实例
   * 
   * @param workspaceDir - 工作区目录路径（必须提供，不应使用默认值）
   * @param sessionId - 会话 ID（可选，默认为 'default'）
   */
  constructor(workspaceDir: string, sessionId?: string) {
    this.config = getConfig();
    
    // 🔥 从数据库获取完整的模型配置（包括 contextWindow）
    let contextWindow: number | undefined;
    try {
      const store = SystemConfigStore.getInstance();
      const modelConfig = store.getModelConfig();
      if (modelConfig && modelConfig.contextWindow) {
        contextWindow = modelConfig.contextWindow;
        console.log('✅ 从数据库获取上下文窗口:', contextWindow);
      }
    } catch (error) {
      console.warn('⚠️ 从数据库获取上下文窗口失败，将使用推断值');
    }
    
    // 如果数据库中没有，使用模型 ID 推断
    if (!contextWindow) {
      const { getContextWindowFromModelId } = require('../utils/model-info-fetcher');
      contextWindow = getContextWindowFromModelId(this.config.modelId);
      console.log('✅ 从模型 ID 推断上下文窗口:', contextWindow);
    }
    
    // 🔥 添加配置调试信息
    console.log('🔧 AgentRuntime 配置调试:');
    console.log('   原始配置:', {
      apiKey: this.config.apiKey ? `${this.config.apiKey.substring(0, 8)}...` : 'none',
      baseUrl: this.config.baseUrl,
      modelId: this.config.modelId,
      modelName: this.config.modelName,
      providerName: this.config.providerName,
      apiType: this.config.apiType,
      modelId2: this.config.modelId2,
      contextWindow,
    });
    
    // 🔥 根据配置的 apiType 创建正确的模型对象
    let model: Model<'openai-completions' | 'google-generative-ai'>;
    
    // 计算合理的 maxTokens（通常是 contextWindow 的 1/4 到 1/2）
    const maxTokens = Math.floor((contextWindow || 64000) / 2)
    
    if (this.config.apiType === 'google-generative-ai') {
      model = {
        api: 'google-generative-ai',
        id: this.config.modelId,
        name: this.config.modelName,
        provider: this.config.providerName,
        input: ['text', 'image'],
        reasoning: false,
        baseUrl: this.config.baseUrl,
        contextWindow: contextWindow || 32000,
        maxTokens: maxTokens,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      } as Model<'google-generative-ai'>;
    } else {
      model = {
        api: 'openai-completions',
        id: this.config.modelId,
        name: this.config.modelName,
        provider: this.config.providerName,
        input: ['text'],
        reasoning: false,
        baseUrl: this.config.baseUrl,
        contextWindow: contextWindow || 32000,
        maxTokens: maxTokens,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      } as Model<'openai-completions'>;
    }
    
    // 构建运行时配置
    this.runtimeConfig = {
      workspaceDir: workspaceDir, // 必须提供工作目录，不使用默认值
      sessionId: sessionId || 'default',
      model: model,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      maxConcurrentSubAgents: 8,
    };
    
    console.log('✅ AgentRuntime 构造函数完成');
    console.log('   模型:', this.runtimeConfig.model.id);
    console.log('   API 类型:', this.runtimeConfig.model.api);
    console.log('   提供商:', this.runtimeConfig.model.provider);
    console.log('   Base URL:', this.runtimeConfig.baseUrl);
    console.log('   输入类型:', this.runtimeConfig.model.input.join(', '));
    console.log('   API Key 状态:', this.runtimeConfig.apiKey ? '已配置' : '未配置');
    console.log('   工作区:', this.runtimeConfig.workspaceDir);
    console.log('   会话ID:', this.runtimeConfig.sessionId);
    
    // 初始化模块
    this.initializer = new AgentInitializer(
      this.runtimeConfig.workspaceDir,
      this.runtimeConfig.sessionId,
      this.runtimeConfig.model,
      this.runtimeConfig.apiKey
    );
    
    this.messageHandler = new MessageHandler(null);
    this.stepTracker = new StepTracker();
    
    // 初始化消息处理器（稍后在 initialize 中设置依赖）
    this.messageProcessor = new AgentMessageProcessor(
      this.messageHandler,
      this.instanceManager,
      this.runtimeConfig,
      this.systemPrompt,
      this.tools,
      this.operationTracker
    );
    
    // 异步初始化（不阻塞构造函数）
    this.initPromise = this.initialize();
  }

  /**
   * 异步初始化
   */
  private async initialize(): Promise<void> {
    try {
      // 初始化 Agent
      const { agent, tools } = await this.initializer.initialize();
      this.instanceManager.agent = agent;
      
      // 保存原始工具列表（用于 Skill Manager 等不需要重复检测的场景）
      this.originalTools = tools;
      
      // 包装工具添加重复检测和 Tab 名称注入
      this.tools = tools.map(tool => {
        // 先添加重复检测
        const toolWithDuplicateDetection = wrapToolWithDuplicateDetection(tool, this.operationTracker);
        
        // 如果是 cross_tab_call 工具，再包装一层注入 senderTabName
        if (tool.name === 'cross_tab_call') {
          return this.wrapToolWithTabNameInjection(toolWithDuplicateDetection);
        }
        
        return toolWithDuplicateDetection;
      });
      
      // 更新 MessageHandler 的 Agent 引用
      this.messageHandler.setAgent(agent);
      
      // 🔥 加载历史消息到 Agent 上下文（最近 50 轮，其中 10 轮完整，其余精简）
      await this.loadHistoryToContext();
      
      // 异步初始化系统提示词（不阻塞）
      void this.initializeSystemPrompt();
      
      console.log('✅ AgentRuntime 初始化完成');
    } catch (error) {
      console.error('❌ AgentRuntime 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 从 Session 加载历史消息到 Agent 上下文
   * 
   * 加载最近 50 轮对话，最近 10 轮保留完整工具信息，其余只保留文本
   */
  private async loadHistoryToContext(): Promise<void> {
      try {
        // 从 Gateway 获取 SessionManager
        const { getGatewayInstance } = await import('../gateway');
        const gateway = getGatewayInstance();

        if (!gateway) {
          console.warn('[AgentRuntime] Gateway 未初始化，跳过历史消息加载');
          return;
        }

        const sessionManager = gateway.getSessionManager();

        if (!sessionManager) {
          console.warn('[AgentRuntime] SessionManager 未初始化，跳过历史消息加载');
          return;
        }

        // 检查 session 是否存在
        const exists = await sessionManager.sessionExists(this.runtimeConfig.sessionId);
        if (!exists) {
          console.log('[AgentRuntime] Session 不存在，跳过历史消息加载');
          return;
        }

        // 加载最近 50 轮对话（按用户消息计算）
        const contextMessages = await sessionManager.loadContextMessages(this.runtimeConfig.sessionId);

        if (contextMessages.length === 0) {
          console.log('[AgentRuntime] 没有历史消息，跳过加载');
          return;
        }

        console.log(`[AgentRuntime] 📚 加载历史消息: ${contextMessages.length} 条`);

        // 转换为 Agent 消息格式并按轮次组织
        const agentMessages = this.convertSessionMessagesToAgentMessages(contextMessages);

        // 添加到 Agent 的消息列表
        if (this.instanceManager.agent) {
          this.instanceManager.agent.state.messages.push(...agentMessages);

          // 🔥 确保消息队列不超过 50 轮用户对话
          this.maintainMessageQueue();

          // 🔥 使用现有的上下文压缩功能
          const { manageContext } = await import('../context/context-manager');
          const result = manageContext({
            messages: this.instanceManager.agent.state.messages,
            modelId: this.runtimeConfig.model.id,
            systemPrompt: this.systemPrompt,
            tools: this.tools,
          });

          if (result.compressed) {
            console.info(
              `[AgentRuntime] 📊 历史消息压缩: ` +
              `${result.stats.messagesBefore} → ${result.stats.messagesAfter} 条消息, ` +
              `${result.stats.tokensBefore} → ${result.stats.tokensAfter} tokens`
            );

            // 更新 Agent 的消息列表
            this.instanceManager.agent.state.messages = result.messages;
          }

          const userMessageCount = this.instanceManager.agent.state.messages.filter(m => m.role === 'user').length;
          console.log(`[AgentRuntime] ✅ 历史消息已加载到上下文: ${this.instanceManager.agent.state.messages.length} 条消息，${userMessageCount} 轮用户对话`);
        }
      } catch (error) {
        console.error('[AgentRuntime] ❌ 加载历史消息失败:', getErrorMessage(error));
        // 不抛出错误，允许继续初始化
      }
    }
  /**
   * 将 SessionMessage 转换为 Agent 消息格式
   *
   * @param sessionMessages - Session 消息列表
   * @returns Agent 消息列表
   */
  private convertSessionMessagesToAgentMessages(sessionMessages: any[]): any[] {
    const agentMessages: any[] = [];

    for (const msg of sessionMessages) {
      if (msg.role === 'user') {
        // 🔥 用户消息必须使用数组格式，与 agent.prompt() 保持一致
        agentMessages.push({
          role: 'user',
          content: [{ type: 'text', text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        // Assistant 消息：检查是否有工具调用
        const assistantContent: any[] = [{ type: 'text', text: msg.content }];

        // 如果有执行步骤，添加 toolCall 到 content 中
        if (msg.executionSteps && msg.executionSteps.length > 0) {
          for (const step of msg.executionSteps) {
            assistantContent.push({
              type: 'toolCall',
              id: step.id,
              name: step.toolName,
              arguments: step.params || {},
            });
          }
        }

        agentMessages.push({
          role: 'assistant',
          content: assistantContent,
          api: 'openai-completions',
          provider: 'openai',
          model: this.runtimeConfig.model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          finishReason: 'stop',
          stopReason: 'stop',
          timestamp: msg.timestamp,
        });

        // 为每个执行步骤创建 toolResult 消息
        if (msg.executionSteps && msg.executionSteps.length > 0) {
          for (const step of msg.executionSteps) {
            agentMessages.push({
              role: 'toolResult',
              content: [{
                type: 'text',
                text: step.error || step.result || '工具执行完成'
              }],
              toolCallId: step.id,
              toolName: step.toolName,
              isError: !!step.error,
            });
          }
        }
      }
    }

    return agentMessages;
  }

  /**
   * 维护消息队列，确保不超过 50 轮用户对话
   * 
   * 最近 10 轮：保留完整消息（包含工具调用和结果）
   * 第 11-50 轮：只保留 user 和 assistant 文本消息，去掉工具信息
   */
  private maintainMessageQueue(): void {
    if (!this.instanceManager.agent) {
      return;
    }

    const messages = this.instanceManager.agent.state.messages;
    const maxUserRounds = 50;
    const fullDetailRounds = 10;

    // 找到所有用户消息的索引
    const userMessageIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        userMessageIndices.push(i);
      }
    }

    // 如果用户消息数量超过 50 轮，删除最老的轮次
    if (userMessageIndices.length > maxUserRounds) {
      const excessRounds = userMessageIndices.length - maxUserRounds;
      const deleteEndIndex = userMessageIndices[excessRounds];
      messages.splice(0, deleteEndIndex);

      console.log(`[AgentRuntime] 🗑️ 删除了 ${excessRounds} 轮旧对话，保留最近 ${maxUserRounds} 轮`);
    }

    // 重新计算用户消息索引
    const updatedUserIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        updatedUserIndices.push(i);
      }
    }

    // 对第 11-50 轮（即最早的那些轮次），精简消息：去掉 toolCall 内容和 toolResult 消息
    if (updatedUserIndices.length > fullDetailRounds) {
      const simplifyBeforeIndex = updatedUserIndices[updatedUserIndices.length - fullDetailRounds];
      const removeIndices = new Set<number>();
      let simplified = 0;

      for (let i = 0; i < simplifyBeforeIndex; i++) {
        const msg = messages[i];
        
        // 标记 toolResult 消息待删除
        if (msg.role === 'toolResult') {
          removeIndices.add(i);
          simplified++;
          continue;
        }

        // assistant 消息：只保留文本，去掉 toolCall
        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          const textOnly = msg.content.filter((block: any) => block.type === 'text');
          if (textOnly.length < msg.content.length) {
            msg.content = textOnly;
            simplified++;
          }
        }
      }

      // 批量删除 toolResult 消息
      if (removeIndices.size > 0) {
        const filtered = messages.filter((_: any, idx: number) => !removeIndices.has(idx));
        messages.length = 0;
        messages.push(...filtered);
      }
      
      if (simplified > 0) {
        console.log(`[AgentRuntime] 📋 精简了 ${simplified} 条旧轮次的工具信息`);
      }
    }

    console.log(`[AgentRuntime] 📊 当前消息队列: ${messages.length} 条消息，${messages.filter(m => m.role === 'user').length} 轮用户对话`);
  }

  /**
   * 检查并修复 Agent 状态
   * 
   * 在发送消息前调用，确保 Agent 处于可用状态
   */
  private async ensureAgentReady(): Promise<void> {
    // 确保 Agent 已初始化
    if (this.initPromise) {
      await this.initPromise;
    }
    
    if (!this.instanceManager.agent) {
      throw new Error('Agent 未初始化');
    }
    
    // 🔥 检查 Agent 是否处于异常状态
    const agent = this.instanceManager.agent;
    
    // 检查是否卡在 streaming 状态
    if (agent.state.isStreaming) {
      console.warn('[AgentRuntime] ⚠️ 检测到 Agent 卡在 streaming 状态，重置...');
      agent.reset();
    }
    
    // 🔥 如果 MessageHandler 认为还在生成，但实际上可能已经卡住了
    if (this.messageHandler.isCurrentlyGenerating()) {
      console.warn('[AgentRuntime] ⚠️ 检测到 MessageHandler 卡在生成状态，重置...');
      this.messageHandler.forceReset();
    }
    
    console.log('[AgentRuntime] ✅ Agent 状态检查完成');
  }

  /**
   * 初始化系统提示词
   */
  private async initializeSystemPrompt(): Promise<void> {
    // 🔥 如果正在初始化，等待完成
    if (this.systemPromptInitializing) {
      console.log('⏳ 系统提示词正在初始化中，等待完成...');
      // 轮询等待初始化完成（最多等待 30 秒）
      const { waitUntil } = await import('../../shared/utils/async-utils');
      const { TIMEOUTS } = await import('../config/timeouts');
      const success = await waitUntil(
        () => !this.systemPromptInitializing,
        { timeout: TIMEOUTS.AGENT_MESSAGE_TIMEOUT, interval: 100 }
      );
      
      if (!success) {
        console.error('❌ 等待系统提示词初始化超时（30秒）');
        throw new Error('系统提示词初始化超时');
      }
      
      console.log('✅ 系统提示词初始化完成（等待）');
      return;
    }
    
    if (this.systemPrompt) {
      console.log('✅ 系统提示词已初始化，跳过重复调用');
      return;
    }
    
    this.systemPromptInitializing = true;
    
    try {
      // 确保 Agent 已初始化
      if (this.initPromise) {
        await this.initPromise;
      }
      
      if (!this.instanceManager.agent) {
        console.error('❌ Agent 未初始化，无法构建系统提示词');
        throw new Error('Agent 未初始化');
      }
      
      this.systemPrompt = await this.initializer.initializeSystemPrompt(
        this.instanceManager.agent,
        this.tools
      );
      
      console.log('✅ 系统提示词初始化成功，长度:', this.systemPrompt.length);
    } finally {
      this.systemPromptInitializing = false;
    }
  }

  /**
   * 重新加载系统提示词
   * 
   * 用于在记忆更新后重新加载系统提示词
   */
  async reloadSystemPrompt(): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('[AgentRuntime] 🔄 重新加载系统提示词...');
    console.log('   会话ID:', this.runtimeConfig.sessionId);
    console.log('='.repeat(80));
    
    // 清空现有提示词，允许重新初始化
    this.systemPrompt = '';
    this.systemPromptInitializing = false;
    
    await this.initializeSystemPrompt();
    
    console.log('='.repeat(80));
    console.log('[AgentRuntime] ✅ 系统提示词已重新加载');
    console.log('   新提示词长度:', this.systemPrompt.length, '字符');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 销毁 AgentRuntime 实例
   */
  async destroy(): Promise<void> {
    // 🔥 强制停止当前生成（如果有）
    if (this.messageHandler.isCurrentlyGenerating()) {
      console.log('[AgentRuntime] 🛑 强制停止当前生成...');
      this.messageHandler.stopGeneration();
    }
    
    // 🔥 重置 Agent 实例状态（解决状态残留问题）
    if (this.instanceManager.agent) {
      try {
        // 清空消息历史，重置内部状态
        this.instanceManager.agent.state.messages = [];
        this.instanceManager.agent.reset();
        
        console.log('[AgentRuntime] 🔄 Agent 状态已重置');
      } catch (error) {
        console.warn('[AgentRuntime] ⚠️ Agent 状态重置失败:', error);
      }
      
      // 清空 Agent 引用
      this.instanceManager.agent = null;
    }
    
    // 停止 Browser Control Server
    await this.initializer.cleanup();
    
    console.log(`✅ AgentRuntime 已销毁: ${this.runtimeConfig.sessionId}`);
  }



  /**
   * 设置会话 ID
   */
  async setSessionId(sessionId: string): Promise<void> {
    const oldSessionId = this.runtimeConfig.sessionId;
    
    if (oldSessionId === sessionId) {
      return;
    }
    
    console.info(`[AgentRuntime] 切换会话: ${oldSessionId} -> ${sessionId}`);
    
    // 更新配置
    this.runtimeConfig.sessionId = sessionId;
    
    // 确保 Agent 已初始化
    if (this.initPromise) {
      await this.initPromise;
    }
    
    if (!this.instanceManager.agent) {
      throw new Error('Agent 未初始化');
    }
    
    // 重新创建 Agent（使用新的 sessionId）
    this.instanceManager.agent = await this.initializer.recreateAgent(
      this.instanceManager.agent,
      this.tools,
      this.systemPrompt
    );
    
    // 更新 MessageHandler 的 Agent 引用
    this.messageHandler.setAgent(this.instanceManager.agent);
    
    console.info(`[AgentRuntime] Agent 已重新创建，工具数量: ${this.tools.length}`);
    
    // 重新初始化系统提示词
    await this.initializeSystemPrompt();
  }

  /**
   * 获取当前会话 ID
   */
  getSessionId(): string {
    return this.runtimeConfig.sessionId;
  }

  /**
   * 清空消息历史
   * 
   * 用于定时任务场景，避免历史消息干扰
   */
  async clearMessageHistory(): Promise<void> {
    // 确保 Agent 已初始化
    if (this.initPromise) {
      await this.initPromise;
    }
    
    if (this.instanceManager.agent) {
      const messages = this.instanceManager.agent.state.messages;
      const messageCount = messages.length;
      
      if (messageCount === 0) return;
      
      // 保留上一轮对话作为上下文（最后一条用户消息 + 对应的 AI 回复和工具结果）
      // 从后往前找最后一条用户消息
      let lastUserIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if ((messages[i] as any).role === 'user') {
          lastUserIdx = i;
          break;
        }
      }
      
      if (lastUserIdx >= 0) {
        // 保留从最后一条用户消息到末尾的所有消息
        const kept = messages.slice(lastUserIdx);
        this.instanceManager.agent.state.messages = kept;
        console.log(`[AgentRuntime] 🗑️ 清理历史消息：${messageCount} → ${kept.length}（保留上一轮上下文）`);
      } else {
        this.instanceManager.agent.state.messages = [];
        console.log(`[AgentRuntime] 🗑️ 已清空 ${messageCount} 条历史消息`);
      }
    }
  }

  /**
   * 设置是否跳过历史记录
   *
   * @param skip - 是否跳过历史记录
   */
  setSkipHistory(skip: boolean): void {
    this.skipHistory = skip;
    console.log(`[AgentRuntime] ${skip ? '🚫' : '✅'} ${skip ? '跳过' : '恢复'}历史记录模式`);
  }

  /**
   * 获取是否跳过历史记录
   */
  getSkipHistory(): boolean {
    return this.skipHistory;
  }

  /**
   * 发送消息并获取流式响应
   * 
   * @param content - 消息内容
   * @param autoContinue - 是否自动继续
   * @param maxContinuations - 最大自动继续次数
   * @param isAutoContinue - 是否为自动继续调用（内部使用）
   */
  /**
   * 发送消息（委托给 messageProcessor）
   */
  async *sendMessage(
    content: string, 
    autoContinue: boolean = true, 
    maxContinuations: number = 100,
    isAutoContinue: boolean = false
  ): AsyncGenerator<string, void, unknown> {
    // 🔥 确保系统提示词已初始化
    if (!this.systemPrompt || this.systemPrompt.trim().length === 0) {
      console.log('⏳ 系统提示词未初始化，等待初始化完成...');
      await this.initializeSystemPrompt();
    }
    
    // 更新 messageProcessor 的依赖
    this.messageProcessor.updateSystemPrompt(this.systemPrompt);
    this.messageProcessor.updateTools(this.tools);
    
    // 设置维护消息队列回调
    this.messageProcessor.setMaintainMessageQueueCallback(this.maintainMessageQueue.bind(this));
    
    // 委托给 messageProcessor
    yield* this.messageProcessor.sendMessage(
      content,
      autoContinue,
      maxContinuations,
      isAutoContinue,
      this.ensureAgentReady.bind(this)
    );
  }

  /**
   * 包装工具以注入 Tab 名称（用于 cross_tab_call）
   */
  private wrapToolWithTabNameInjection(tool: any): any {
    const originalExecute = tool.execute;
    
    return {
      ...tool,
      execute: async (toolCallId: string, args: any, signal?: AbortSignal, extensionContext?: any) => {
        // 注入 senderTabName：通过当前 sessionId 查找对应 Tab 的标题
        const { getGatewayInstance } = await import('../gateway');
        const gateway = getGatewayInstance();
        const sessionId = this.runtimeConfig.sessionId;
        
        if (gateway) {
          const tabs = gateway.getAllTabs();
          const currentTab = tabs.find(t => t.id === sessionId);
          
          if (currentTab) {
            args = { ...args, senderTabName: currentTab.title };
            console.log('[AgentRuntime] 🏷️ 注入 senderTabName:', currentTab.title);
          } else {
            // 找不到 Tab 时打印所有 Tab 便于排查
            console.warn(
              `[AgentRuntime] ⚠️ 找不到 sessionId="${sessionId}" 对应的 Tab，` +
              `当前所有 Tab: [${tabs.map(t => `${t.id}(${t.title})`).join(', ')}]`
            );
          }
        } else {
          console.warn('[AgentRuntime] ⚠️ Gateway 实例为 null，无法注入 senderTabName');
        }
        
        // 调用原始 execute
        return originalExecute(toolCallId, args, signal, extensionContext);
      },
    };
  }

  /**
   * 停止当前的生成
   */
  async stopGeneration(): Promise<void> {
    this.messageHandler.stopGeneration();
    
    // 重新创建 Agent 实例（解决 "already processing" 问题）
    if (this.instanceManager.agent) {
      console.log('🔄 重新创建 Agent 实例...');
      this.instanceManager.agent = await this.initializer.recreateAgent(
        this.instanceManager.agent,
        this.tools,
        this.systemPrompt
      );
      this.messageHandler.setAgent(this.instanceManager.agent);
    }
  }

  /**
   * 检查是否正在生成
   */
  isCurrentlyGenerating(): boolean {
    return this.messageHandler.isCurrentlyGenerating();
  }

  /**
   * 获取当前系统提示词
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * 设置执行步骤更新回调
   */
  setExecutionStepCallback(callback: (steps: any[]) => void): void {
    this.messageHandler.setExecutionStepCallback(callback);
  }

  /**
   * 获取当前的执行步骤
   */
  getExecutionSteps(): any[] {
    return this.messageHandler.getExecutionSteps();
  }

  /**
   * 设置任务计划更新回调
   */
  setTaskPlanCallback(callback: (plan: TaskPlan) => void): void {
    this.stepTracker.setOnPlanUpdate(callback);
  }

  /**
   * 获取当前任务计划
   */
  getCurrentTaskPlan(): TaskPlan | null {
    return this.stepTracker.getCurrentPlan();
  }

  /**
   * 获取 Agent 状态
   */
  getAgentState(): AgentStateInfo {
    if (!this.instanceManager.agent) {
      return {
        isStreaming: false,
        messageCount: 0,
        toolCount: 0,
        tools: [],
      };
    }
    
    return {
      isStreaming: this.instanceManager.agent.state.isStreaming,
      messageCount: this.instanceManager.agent.state.messages.length,
      toolCount: this.instanceManager.agent.state.tools.length,
      tools: this.instanceManager.agent.state.tools.map(t => ({
        name: t.name,
        label: t.label,
        description: t.description,
      })),
    };
  }

  /**
   * 获取当前正在流式输出的内容
   */
  getCurrentStreamingContent(): string {
    return this.messageHandler.getCurrentStreamingContent();
  }

  /**
   * 处理 Skill Manager 请求
   * 
   * @param request - Skill Manager 请求
   * @returns 处理结果
   */
  async handleSkillManagerRequest(request: any): Promise<any> {
    console.log('[AgentRuntime] 处理 Skill Manager 请求:', request);
    
    // 等待初始化完成
    if (this.initPromise) {
      console.log('[AgentRuntime] 等待 AgentRuntime 初始化完成...');
      await this.initPromise;
      console.log('[AgentRuntime] AgentRuntime 初始化完成');
    }
    
    // 使用原始工具列表（不带重复检测），因为 Skill Manager 的操作应该允许重复调用
    const skillManagerTool = this.originalTools.find((tool) => tool.name === 'skill_manager');
    
    if (!skillManagerTool) {
      console.error('[AgentRuntime] Skill Manager Tool 未找到');
      console.error('[AgentRuntime] 可用工具列表:', this.originalTools.map(t => t.name));
      return {
        success: false,
        error: 'Skill Manager Tool 未找到',
      };
    }
    
    console.log('[AgentRuntime] 找到 Skill Manager Tool，准备调用...');
    
    try {
      // 调用 Skill Manager Tool
      // Tool.execute 签名: (toolCallId, params, signal, onUpdate)
      const { generateExecutionId } = await import('../../shared/utils/id-generator');
      const toolCallId = generateExecutionId('skill-manager');
      console.log('[AgentRuntime] 调用 Tool.execute:', { toolCallId, params: request });
      
      const result = await skillManagerTool.execute(
        toolCallId,
        request, // params
        undefined, // signal
        undefined  // onUpdate
      );
      
      console.log('[AgentRuntime] Tool 执行完成，结果:', result);
      
      // Tool 返回格式: { content: [...], details: actualData }
      // 我们需要从 details 中提取实际数据
      if (result.isError) {
        console.error('[AgentRuntime] Tool 返回错误:', result.details);
        return {
          success: false,
          error: result.details?.error || '未知错误',
        };
      }
      
      // 对于 list 操作，details 是数组，需要包装成 { skills: [...] }
      if (request.action === 'list' && Array.isArray(result.details)) {
        console.log('[AgentRuntime] 返回 Skill 列表，数量:', result.details.length);
        return {
          success: true,
          skills: result.details,
        };
      }
      
      // 对于 info 操作，details 是 SkillInfo 对象，需要包装成 { skill: {...} }
      if (request.action === 'info') {
        console.log('[AgentRuntime] 返回 Skill 详情:', result.details);
        return {
          success: true,
          skill: result.details,
        };
      }
      
      // 对于其他操作，直接返回 details
      console.log('[AgentRuntime] 返回操作结果:', result.details);
      return {
        success: true,
        ...result.details,
      };
    } catch (error) {
      console.error('[AgentRuntime] Skill Manager 请求失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }
}
