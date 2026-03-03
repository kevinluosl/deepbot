/**
 * AI Agent Runtime（重构版）
 * 
 * 职责：
 * - 协调各个模块
 * - 管理 Agent 生命周期
 * - 提供统一的对外接口
 * 
 */

import { getConfig } from '../config';
import { wrapToolWithAbortSignal, OperationTracker, wrapToolWithDuplicateDetection } from '../tools/tool-abort';
import type { AgentRuntimeConfig, AgentStateInfo, AgentInstanceManager } from './types';
import { AgentInitializer } from './agent-initializer';
import { MessageHandler } from './message-handler';
import { StepTracker } from './step-tracker';
import type { TaskPlan } from './step-tracker';
import { callAI } from '../utils/ai-client';
import { getErrorMessage } from '../../shared/utils/error-handler';

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
    
    // 构建运行时配置
    this.runtimeConfig = {
      workspaceDir: workspaceDir, // 必须提供工作目录，不使用默认值
      sessionId: sessionId || 'default',
      model: {
        api: 'openai-completions',
        id: this.config.modelId,
        name: this.config.modelName,
        provider: this.config.providerName,
        input: ['text'],
        reasoning: false,
        baseUrl: this.config.baseUrl,
        contextWindow: 8192,
        maxTokens: 8192,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
      maxConcurrentSubAgents: 8,
    };
    
    console.log('✅ AgentRuntime 构造函数完成');
    console.log('   模型:', this.runtimeConfig.model.id);
    console.log('   提供商:', this.runtimeConfig.model.provider);
    console.log('   Base URL:', this.runtimeConfig.baseUrl);
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
      
      // 包装工具添加重复检测
      this.tools = tools.map(tool => 
        wrapToolWithDuplicateDetection(tool, this.operationTracker)
      );
      
      // 更新 MessageHandler 的 Agent 引用
      this.messageHandler.setAgent(agent);
      
      // 🔥 加载历史消息到 Agent 上下文（最近 10 轮）
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
   * 加载最近 10 轮对话，如果超出上下文限制，使用现有的压缩规则压缩
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
      
      // 加载最近 10 轮对话
      const contextMessages = await sessionManager.loadContextMessages(this.runtimeConfig.sessionId);
      
      if (contextMessages.length === 0) {
        console.log('[AgentRuntime] 没有历史消息，跳过加载');
        return;
      }
      
      console.log(`[AgentRuntime] 📚 加载历史消息: ${contextMessages.length} 条`);
      
      // 转换为 Agent 消息格式
      const agentMessages = contextMessages.map((msg: any) => {
        if (msg.role === 'user') {
          return {
            role: 'user',
            content: msg.content,
          };
        } else {
          // assistant 消息需要更完整的结构，content 必须是数组
          return {
            role: 'assistant',
            content: [{ type: 'text', text: msg.content }],
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
          };
        }
      });
      
      // 添加到 Agent 的消息列表
      if (this.instanceManager.agent) {
        this.instanceManager.agent.state.messages.push(...agentMessages as any);
        
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
        
        console.log(`[AgentRuntime] ✅ 历史消息已加载到上下文: ${this.instanceManager.agent.state.messages.length} 条`);
      }
    } catch (error) {
      console.error('[AgentRuntime] ❌ 加载历史消息失败:', getErrorMessage(error));
      // 不抛出错误，允许继续初始化
    }
  }

  /**
   * 确保 Agent 已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    
    if (!this.instanceManager.agent) {
      throw new Error('Agent 未初始化');
    }
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
      await this.ensureInitialized();
      
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
    await this.ensureInitialized();
    
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
   * 使用 AI 判断响应的语义，决定是否需要继续执行
   * 
   * 直接调用大模型 API 进行语义判断，不使用关键字匹配
   * 
   * @param response - AI 的完整响应
   * @param hasToolCalls - 本轮是否有工具调用
   * @returns 是否有未完成的意图
   */
  private async detectUnfinishedIntent(response: string, hasToolCalls: boolean): Promise<boolean> {
    console.log('🔍 [detectUnfinishedIntent] 开始检测...');
    console.log(`   hasToolCalls: ${hasToolCalls}`);
    console.log(`   response 长度: ${response.length} 字符`);
    console.log(`   response 最后 100 字符: ${response.slice(-100)}`);
    
    // 🔥 检查是否已被用户停止
    const abortController = this.messageHandler.getAbortController();
    if (abortController?.signal.aborted) {
      console.log('⏹️ [detectUnfinishedIntent] 检测到用户停止，返回 false（不继续）');
      return false;
    }
    
    // 🔥 从 Agent 的最后一条消息中提取纯文本内容（排除工具返回结果）
    let agentTextOnly = '';
    if (this.instanceManager.agent) {
      const messages = this.instanceManager.agent.state.messages;
      const lastMessage = messages[messages.length - 1];
      
      if (lastMessage?.role === 'assistant' && Array.isArray(lastMessage.content)) {
        // 只提取 text 类型的内容，忽略 toolResult
        const textParts = lastMessage.content
          .filter(c => typeof c === 'object' && 'type' in c && c.type === 'text')
          .map(c => (c as any).text || '')
          .join('\n');
        
        agentTextOnly = textParts.trim();
        console.log(`   Agent 纯文本长度: ${agentTextOnly.length} 字符`);
        console.log(`   Agent 纯文本最后 100 字符: ${agentTextOnly.slice(-100)}`);
      }
    }
    
    // 如果提取到了 Agent 的纯文本，使用它；否则使用原始 response
    const textToAnalyze = agentTextOnly || response;
    
    // 提取最后 400 字符作为判断依据（增加上下文）
    const lastPart = textToAnalyze.slice(-200).trim();
    
    // 1. 检测重复响应
    console.log('🔍 [detectUnfinishedIntent] 检查重复响应...');
    if (this.lastResponsePart && this.lastResponsePart === lastPart) {
      this.repeatCount++;
      console.log(`⚠️ [detectUnfinishedIntent] 检测到重复响应 (第 ${this.repeatCount} 次)，返回 false（停止继续）`);
      console.log(`   重复内容: ${lastPart.substring(0, 50)}...`);
      return false;
    }
    
    // 更新重复检测状态
    this.lastResponsePart = lastPart;
    this.repeatCount = 0;
    
    try {
      console.log('🤖 使用 AI 判断语义...');
      
      const judgmentPrompt = `分析以下 AI 助手的回复结尾，判断是否需要继续执行任务。

回复结尾：
"""
${lastPart}
"""

判断标准（两个维度）：

**维度1：执行状态**
- 正在执行中："→ 正在..."、"正在生成..."、"正在发送..." → YES
- 准备执行："我将..."、"我接下来会..."、"即将..." → YES
- 已完成："✅ 已完成"、"✅ 成功"、"已发送" → 看维度2

**维度2：任务进度**
- 中间步骤："第 X 位"、"接下来处理"、"继续处理" → YES
- 最后步骤："全部完成"、"任务结束"、"所有员工" → NO
- 等待用户："请告诉我"、"需要什么帮助"、"想让我做什么" → NO
- 询问用户：以"？"结尾的问句 → NO

**综合判断**：
- 如果执行状态是"正在执行"或"准备执行" → YES
- 如果执行状态是"已完成"，但任务进度是"中间步骤" → YES
- 如果执行状态是"已完成"，且任务进度是"最后步骤"或"等待用户" → NO

只回答 YES 或 NO，不要解释。`;

      // 使用公共 AI 客户端（🔥 使用快速模型）
      const response = await callAI([
        {
          role: 'system',
          content: '你是一个判断助手，只回答 YES 或 NO，不要解释。',
        },
        {
          role: 'user',
          content: judgmentPrompt,
        },
      ], {
        temperature: 0.1,
        maxTokens: 10,
        useFastModel: true, // 🔥 使用快速模型（modelId2）
      });
      
      // 🔥 AI 调用返回后，再次检查是否已被用户停止
      if (abortController?.signal.aborted) {
        console.log('⏹️ [detectUnfinishedIntent] AI 调用返回后检测到用户停止，返回 false');
        return false;
      }
      
      const answer = response.content.trim().toUpperCase();
      
      const shouldContinue = answer.includes('YES');
      
      console.log(`🤖 [detectUnfinishedIntent] AI 判断结果: ${answer}`);
      console.log(`   shouldContinue: ${shouldContinue}`);
      
      if (shouldContinue) {
        console.log('🔍 [detectUnfinishedIntent] AI 判断：需要继续执行，返回 true');
        console.log(`   判断依据: ${lastPart.substring(0, 50)}...`);
      } else {
        console.log('✅ [detectUnfinishedIntent] AI 判断：任务完成或等待用户输入，返回 false');
      }
      
      return shouldContinue;
    } catch (error) {
      console.error('❌ [detectUnfinishedIntent] AI 判断失败:', error);
      console.log('   使用默认策略：不继续（返回 false）');
      return false;
    }
  }

  /**
   * 清空消息历史
   * 
   * 用于定时任务场景，避免历史消息干扰
   */
  async clearMessageHistory(): Promise<void> {
    await this.ensureInitialized();
    
    if (this.instanceManager.agent) {
      const messageCount = this.instanceManager.agent.state.messages.length;
      this.instanceManager.agent.state.messages = [];
      console.log(`[AgentRuntime] 🗑️ 已清空 ${messageCount} 条历史消息`);
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
  async *sendMessage(
    content: string, 
    autoContinue: boolean = true, 
    maxContinuations: number = 100,
    isAutoContinue: boolean = false
  ): AsyncGenerator<string, void, unknown> {
    // 🔥 设置当前 sessionId 供 connector-tool 使用
    const { setConnectorToolSessionId } = await import('../tools/connector-tool');
    setConnectorToolSessionId(this.runtimeConfig.sessionId);
    
    // 🔥 只在非自动继续时清空操作追踪器
    // 自动继续时保留 tracker，以便检测重复操作
    if (!isAutoContinue) {
      this.operationTracker.clear();
      console.log('🗑️ 清空操作追踪器（新消息）');
    } else {
      console.log('✅ 保留操作追踪器（自动继续）');
    }
    
    console.log('📤 发送消息到 AI:', content.substring(0, 50));

    // 确保 Agent 已初始化
    await this.ensureInitialized();
    
    // 等待系统提示词初始化完成
    if (!this.systemPrompt) {
      console.log('⏳ 等待系统提示词初始化...');
      await this.initializeSystemPrompt();
    }

    console.log('📋 使用系统提示词 (前100字符):', this.systemPrompt.substring(0, 100));
    
    // 🔥 临时测试：捕获完整 prompt 到文件（已禁用，需要时取消注释）
    
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { expandUserPath } = await import('../../shared/utils/path-utils');
      const { ensureDirectoryExists } = await import('../../shared/utils/fs-utils');
      
      const debugDir = expandUserPath('~/.deepbot/debug');
      ensureDirectoryExists(debugDir);
      
      const outputPath = path.join(debugDir, 'captured-prompt.md');
      
      const lines: string[] = [];
      lines.push('# 捕获的 Prompt\n');
      lines.push(`捕获时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
      lines.push('---\n');
      
      // 系统提示词
      lines.push('## 系统提示词 (System Prompt)\n');
      lines.push('```');
      lines.push(this.systemPrompt);
      lines.push('```\n');
      lines.push('---\n');
      
      // 工具定义
      if (this.tools && this.tools.length > 0) {
        lines.push(`## 工具定义 (${this.tools.length} 个工具)\n`);
        
        for (let i = 0; i < this.tools.length; i++) {
          const tool = this.tools[i];
          lines.push(`### ${i + 1}. ${tool.name}\n`);
          lines.push(`**标签**: ${tool.label || '无'}\n`);
          lines.push(`**描述**: ${tool.description || '无描述'}\n`);
          lines.push('**参数 Schema**:\n');
          lines.push('```json');
          lines.push(JSON.stringify(tool.parameters, null, 2));
          lines.push('```\n');
        }
        lines.push('---\n');
      }
      
      // 对话历史
      if (this.instanceManager.agent) {
        const messages = this.instanceManager.agent.state.messages;
        lines.push(`## 对话历史 (${messages.length} 条消息)\n`);
        
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          lines.push(`### 消息 ${i + 1}: ${msg.role}\n`);
          
          if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (typeof part === 'string') {
                lines.push('```');
                lines.push(part);
                lines.push('```\n');
              } else if (typeof part === 'object' && part) {
                const partObj = part as any;
                if (partObj.type === 'text') {
                  lines.push('```');
                  lines.push(partObj.text || '');
                  lines.push('```\n');
                } else {
                  lines.push('```json');
                  lines.push(JSON.stringify(part, null, 2));
                  lines.push('```\n');
                }
              }
            }
          } else if (typeof msg.content === 'string') {
            lines.push('```');
            lines.push(msg.content);
            lines.push('```\n');
          }
        }
        lines.push('---\n');
      }
      
      // 当前用户消息
      lines.push('## 当前用户消息\n');
      lines.push('```');
      lines.push(content);
      lines.push('```\n');
      lines.push('---\n');
      
      // 统计
      const messageCount = this.instanceManager.agent?.state.messages.length || 0;
      const toolCount = this.tools?.length || 0;
      
      // 计算工具定义的字符数
      let toolsCharCount = 0;
      if (this.tools && this.tools.length > 0) {
        for (const tool of this.tools) {
          toolsCharCount += tool.name.length;
          toolsCharCount += (tool.label || '').length;
          toolsCharCount += (tool.description || '').length;
          toolsCharCount += JSON.stringify(tool.parameters).length;
        }
      }
      
      let historyCharCount = 0;
      if (this.instanceManager.agent) {
        for (const msg of this.instanceManager.agent.state.messages) {
          if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (typeof part === 'string') {
                historyCharCount += (part as string).length;
              } else if (typeof part === 'object' && part) {
                historyCharCount += JSON.stringify(part).length;
              }
            }
          } else if (typeof msg.content === 'string') {
            historyCharCount += (msg.content as string).length;
          }
        }
      }
      
      const totalChars = this.systemPrompt.length + toolsCharCount + historyCharCount + content.length;
      
      lines.push('## 统计信息\n');
      lines.push(`- 系统提示词: ${this.systemPrompt.length.toLocaleString()} 字符`);
      lines.push(`- 工具定义: ${toolCount} 个工具，约 ${toolsCharCount.toLocaleString()} 字符`);
      lines.push(`- 对话历史: ${messageCount} 条消息，约 ${historyCharCount.toLocaleString()} 字符`);
      lines.push(`- 当前用户消息: ${content.length} 字符`);
      lines.push(`- **总计: 约 ${totalChars.toLocaleString()} 字符**`);
      lines.push(`- 预估 Token 数: 约 ${Math.ceil(totalChars / 3.5).toLocaleString()} tokens (按 1 token ≈ 3.5 字符估算)\n`);
      
      fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
      console.log(`✅ [Prompt Capture] 已保存到: ${outputPath}`);
    } catch (error) {
      console.error('❌ [Prompt Capture] 保存失败:', error);
    }
  
    
    // ✅ 新增：上下文管理（在发送消息前）
    if (this.instanceManager.agent) {
      // 🔥 步骤 1：在 10 轮对话基础上，进行 token 压缩（裁剪工具结果等）
      const { manageContext } = await import('../context/context-manager');
      const currentMessages = this.instanceManager.agent.state.messages;
      
      const result = manageContext({
        messages: currentMessages,
        modelId: this.runtimeConfig.model.id,
        systemPrompt: this.systemPrompt,
        tools: this.tools,
      });
      
      if (result.compressed) {
        console.info(
          `[Context Manager] 📊 压缩统计: ` +
          `${result.stats.messagesBefore} → ${result.stats.messagesAfter} 条消息, ` +
          `${result.stats.tokensBefore} → ${result.stats.tokensAfter} tokens ` +
          `(${(result.stats.usageRatioBefore * 100).toFixed(1)}% → ${(result.stats.usageRatioAfter * 100).toFixed(1)}%)`
        );
        
        // 更新 Agent 的消息列表
        this.instanceManager.agent.state.messages = result.messages;
      }
    }

    // 收集完整的响应和工具调用信息
    let fullResponse = '';
    let hasToolCalls = false;
    
    try {
      // 🔥 在调用 sendMessage 之前，设置 AbortController 创建回调
      // 这样可以在 AbortController 创建后立即包装工具，确保工具执行前就有 signal
      this.messageHandler.setOnAbortControllerCreated((abortController) => {
        if (this.instanceManager.agent) {
          const toolsWithAbort = this.tools.map(tool => 
            wrapToolWithAbortSignal(tool, abortController.signal)
          );
          
          // 更新 Agent 的工具列表
          this.instanceManager.agent.state.tools = toolsWithAbort as any;
          
          console.log('✅ 已为工具添加取消支持（在 AbortController 创建后立即包装）');
        }
      });
      
      // 使用 MessageHandler 处理消息
      console.log('🔄 开始调用 MessageHandler.sendMessage...');
      // 🔥 自动继续时保留执行步骤历史
      for await (const chunk of this.messageHandler.sendMessage(content, isAutoContinue)) {
        fullResponse += chunk;
        yield chunk;
      }
      console.log('✅ MessageHandler.sendMessage 完成，响应长度:', fullResponse.length);
      console.log('📊 Agent 执行完成后的状态:');
      if (this.instanceManager.agent) {
        console.log(`   消息总数: ${this.instanceManager.agent.state.messages.length}`);
        console.log(`   最后一条消息角色: ${this.instanceManager.agent.state.messages[this.instanceManager.agent.state.messages.length - 1]?.role}`);
      }
      
      // 检查响应是否为空
      // 🔥 如果是用户主动停止（aborted），不抛出错误
      const wasAborted = this.messageHandler.wasAbortedByUser();
      
      if (fullResponse.trim().length === 0 && !wasAborted) {
        throw new Error('AI 返回空响应，可能是 API 配置错误或网络问题');
      }
      
      // 如果是用户主动停止，直接返回（不继续执行）
      if (wasAborted) {
        console.log('⏹️ 用户主动停止生成，结束执行');
        return;
      }
    } catch (error) {
      console.error('❌ MessageHandler.sendMessage 失败:', error);
      
      // 🔥 如果是用户主动停止，不抛出错误
      if (this.messageHandler.wasAbortedByUser()) {
        console.log('⏹️ 用户主动停止生成（捕获异常），结束执行');
        return;
      }
      
      throw error; // 重新抛出其他错误
    }
    
    // 检查本轮是否有工具调用（只检查最后一条消息）
    console.log('🔍 检查最后一条消息是否有工具调用...');
    if (this.instanceManager.agent) {
      const messages = this.instanceManager.agent.state.messages;
      const lastMessage = messages[messages.length - 1];
      
      console.log(`   最后一条消息: role=${lastMessage?.role}, contentType=${Array.isArray(lastMessage?.content) ? 'array' : typeof lastMessage?.content}`);
      
      if (lastMessage?.role === 'assistant' && lastMessage.content) {
        const content = lastMessage.content;
        if (Array.isArray(content)) {
          hasToolCalls = content.some(c => 
            typeof c === 'object' && 'type' in c && c.type === 'toolCall'
          );
          
          // 打印内容类型统计
          const contentTypes = content.map(c => typeof c === 'object' && 'type' in c ? c.type : 'unknown');
          console.log(`   内容类型: ${contentTypes.join(', ')}`);
        }
      }
      
      if (hasToolCalls) {
        console.log('✅ 最后一条消息有工具调用');
      } else {
        console.log('❌ 最后一条消息没有工具调用');
      }
    }
    console.log('🔍 开始检测未完成的意图...');
    console.log(`   autoContinue: ${autoContinue}, maxContinuations: ${maxContinuations}, hasToolCalls: ${hasToolCalls}`);
    
    if (autoContinue && maxContinuations > 0 && this.instanceManager.agent) {
      // 🔥 在检测未完成意图之前，先检查是否已被用户停止
      const abortController = this.messageHandler.getAbortController();
      if (abortController?.signal.aborted) {
        console.log('⏹️ 检测到用户停止，跳过自动继续');
        return;
      }
      
      const hasUnfinishedIntent = await this.detectUnfinishedIntent(fullResponse, hasToolCalls);
      
      console.log(`   detectUnfinishedIntent 返回: ${hasUnfinishedIntent}`);
      
      if (hasUnfinishedIntent) {
        // 🔥 在自动继续之前，再次检查是否已被用户停止
        if (abortController?.signal.aborted) {
          console.log('⏹️ 检测到用户停止，取消自动继续');
          return;
        }
        
        console.log('🔄 检测到未完成的意图，自动继续执行...');
        console.log(`   剩余继续次数: ${maxContinuations - 1}`);
        
        // 发送明确的执行指令，而不是简单的"继续"
        // 🔥 传递 isAutoContinue=true，保留 operationTracker
        yield '\n\n';
        yield* this.sendMessage(
          '立即执行你刚才说的操作。直接调用工具，不要再说明。',
          true,
          maxContinuations - 1,
          true  // 标记为自动继续
        );
      } else {
        console.log('✅ 任务已完成或等待用户输入，不继续');
      }
    } else {
      console.log('⏭️ 跳过未完成意图检测（autoContinue=false 或 maxContinuations=0）');
    }
    
    // 🔥 响应完成后：限制上下文为最近 10 轮对话（20 条消息）
    if (this.instanceManager.agent && this.instanceManager.agent.state.messages.length > 20) {
      const maxMessages = 20;
      const droppedCount = this.instanceManager.agent.state.messages.length - maxMessages;
      this.instanceManager.agent.state.messages = this.instanceManager.agent.state.messages.slice(-maxMessages);
      console.log(`[AgentRuntime] 🗑️ 响应完成后清理：保留最近 10 轮对话，丢弃 ${droppedCount} 条旧消息`);
    }
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
