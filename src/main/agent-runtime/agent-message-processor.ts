/**
 * Agent Message Processor - 消息发送和处理
 * 
 * 职责：
 * - 处理消息发送逻辑
 * - 管理消息队列
 * - 检测未完成意图
 * - 自动继续执行
 */

import { callAI } from '../utils/ai-client';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { estimateTextTokens } from '../utils/token-estimator';
import type { AgentRuntimeConfig, AgentInstanceManager } from './types';
import { MessageHandler } from './message-handler';
import { wrapToolWithAbortSignal, OperationTracker } from '../tools/tool-abort';
import { sendLoadingStatus } from '../utils/loading-status';
import { SystemConfigStore } from '../database/system-config-store';

/**
 * Message Processor 类
 */
export class AgentMessageProcessor {
  private messageHandler: MessageHandler;
  private instanceManager: AgentInstanceManager;
  private runtimeConfig: AgentRuntimeConfig;
  private systemPrompt: string;
  private tools: any[];
  private operationTracker: OperationTracker;
  
  // 回调函数
  private maintainMessageQueueFn: (() => void) | null = null;
  
  constructor(
    messageHandler: MessageHandler,
    instanceManager: AgentInstanceManager,
    runtimeConfig: AgentRuntimeConfig,
    systemPrompt: string,
    tools: any[],
    operationTracker: OperationTracker
  ) {
    this.messageHandler = messageHandler;
    this.instanceManager = instanceManager;
    this.runtimeConfig = runtimeConfig;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.operationTracker = operationTracker;
  }
  
  /**
   * 设置维护消息队列回调
   */
  setMaintainMessageQueueCallback(callback: () => void): void {
    this.maintainMessageQueueFn = callback;
  }
  
  /**
   * 更新系统提示词
   */
  updateSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
  }
  
  /**
   * 更新工具列表
   */
  updateTools(tools: any[]): void {
    this.tools = tools;
  }
  
  /**
   * 从文本中移除 thinking 内容
   */
  private removeThinkingContent(text: string): string {
    // 移除完整的 <think>...</think> 块
    let filtered = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    
    // 移除不完整的 <think> 开始标签（没有对应的结束标签）
    filtered = filtered.replace(/<think>[\s\S]*$/g, '');
    
    // 移除不完整的 </think> 结束标签（没有对应的开始标签）
    filtered = filtered.replace(/^[\s\S]*?<\/think>/g, '');
    
    return filtered.trim();
  }
  
  /**
   * 检测是否有未完成的意图
   */
  private async detectUnfinishedIntent(response: string, lastRoundHasToolCalls: boolean, anyRoundHasToolCalls: boolean): Promise<boolean> {
    console.log('🔍 [detectUnfinishedIntent] 开始检测...');
    console.log(`   响应长度: ${response.length}`);
    console.log(`   最后一轮工具调用: ${lastRoundHasToolCalls}, 全程工具调用: ${anyRoundHasToolCalls}`);
    
    // 🔥 如果最后一轮有工具调用，说明 Agent 正在执行操作，应该继续
    if (lastRoundHasToolCalls) {
      console.log('✅ [detectUnfinishedIntent] 最后一轮有工具调用，继续执行');
      return true;
    }
    
    // 🔥 没有工具调用，检查响应内容
    const cleanResponse = this.removeThinkingContent(response);
    console.log(`   清理后的响应长度: ${cleanResponse.length}`);
    console.log(`   清理后的响应预览: ${cleanResponse.substring(0, 200)}`);

    // 🔥 假执行检测：响应中包含明确的"开始执行"意图，但全程没有任何工具调用
    const planKeywords = [
      '现在开始执行',
      '开始执行',
      '立即执行',
      '现在执行',
      '按照计划执行',
      '按计划执行',
    ];
    const cleanResponseLower = cleanResponse.toLowerCase();
    const hasPlanKeyword = planKeywords.some(kw => cleanResponseLower.includes(kw));
    if (hasPlanKeyword && !anyRoundHasToolCalls) {
      console.log('⚠️ [detectUnfinishedIntent] 假执行检测命中（有执行计划关键词但全程无工具调用），直接继续执行');
      return true;
    }

    // 🔥 假执行未命中，使用 AI 判断是否需要继续
    console.log('🤖 [detectUnfinishedIntent] 使用 AI 判断是否需要继续...');
    
    try {
      // 只取最后 200 个字符判断，结尾部分最能反映任务状态
      const tailResponse = cleanResponse.slice(-200);
      const prompt = `你是一个任务完成度判断助手。请判断以下 AI 助手的回复结尾是否表明任务已经完成，还是仅仅是说明了意图但还没有执行。

AI 助手的回复结尾：
"""
${tailResponse}
"""

判断规则：
1. 如果回复中包含"我会"、"我将"、"让我"等意图关键词，但没有实际执行结果（如"已完成"、"已创建"、"已修改"等），则判断为"未完成"
2. 如果回复中包含实际执行结果或确认信息，则判断为"已完成"
3. 如果回复中询问用户更多信息，则判断为"已完成"（等待用户输入）
4. 如果回复是问候语、开场白、或在等待用户指令（如"需要我帮你做什么吗"、"随时告诉我"、"有什么可以帮你"），则判断为"已完成"（等待用户输入）
5. 如果回复是对话式的闲聊或自我介绍，没有具体任务要执行，则判断为"已完成"
6. 如果回复表明当前步骤已执行完毕，正在等待外部异步结果（如"已发送消息，等待回复"、"已提交，等待处理"），则判断为"已完成"（当前任务已完成，等待外部响应）
7. 规则 6 优先于规则 1：如果同时包含"我会"等意图词和"已发送/已完成"等完成词，说明当前步骤已完成，判断为"已完成"

请只回复"已完成"或"未完成"，不要有其他内容。`;

      const aiResponse = await callAI([
        {
          role: 'system',
          content: '你是一个判断助手，只回答"已完成"或"未完成"，不要解释。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ], {
        temperature: 0,
        maxTokens: 2000,
        useFastModel: true,
      });
      
      const decision = aiResponse.content.trim().toLowerCase();
      console.log(`   AI 判断结果: ${decision}`);
      
      const shouldContinue = decision.includes('未完成');
      console.log(`   最终决定: ${shouldContinue ? '继续执行' : '任务完成'}`);
      
      return shouldContinue;
    } catch (error) {
      console.error('❌ [detectUnfinishedIntent] AI 判断失败:', getErrorMessage(error));
      // 如果 AI 判断失败，默认不继续（保守策略）
      return false;
    }
  }
  
  /**
   * 保存 captured-prompt 用于调试
   */
  /**
   * 保存完整的 prompt 到文件（用于调试）
   * 在发送给 AI 之前调用，确保保存的内容和实际发送的一致
   */
  private async saveCapturedPrompt(enhancedContent: string): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      const debugDir = path.join(settings.workspaceDir, '.deepbot', 'debug');
      
      // 确保目录存在
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      // 使用 AgentMessageProcessor 中存储的系统提示词和工具（这是最终发送给 AI 的）
      let actualSystemPrompt = this.systemPrompt;
      let actualTools = this.tools;
      
      if (this.instanceManager.agent) {
        // 优先使用 Agent.state 中的系统提示词（如果不为空）
        const stateSystemPrompt = this.instanceManager.agent.state.systemPrompt as string;
        if (stateSystemPrompt && stateSystemPrompt.trim().length > 0) {
          actualSystemPrompt = stateSystemPrompt;
        }
        
        // 优先使用 Agent.state 中的工具列表
        if (this.instanceManager.agent.state.tools && this.instanceManager.agent.state.tools.length > 0) {
          actualTools = this.instanceManager.agent.state.tools as any[];
        }
      }
      
      // 如果还是为空，使用默认值
      if (!actualSystemPrompt || actualSystemPrompt.trim().length === 0) {
        actualSystemPrompt = '[系统提示词未初始化]';
      }
      
      if (!actualTools || actualTools.length === 0) {
        actualTools = [];
      }
      
      // 构建完整的 prompt 内容
      let promptContent = '# Captured Prompt\n\n';
      promptContent += `生成时间: ${new Date().toISOString()}\n`;
      promptContent += `Session ID: ${this.runtimeConfig.sessionId}\n`;
      promptContent += `Model: ${this.runtimeConfig.model.id}\n\n`;
      
      promptContent += '## System Prompt\n\n';
      promptContent += '```\n' + actualSystemPrompt + '\n```\n\n';
      
      promptContent += '## Tools\n\n';
      promptContent += '```json\n' + JSON.stringify(actualTools.map(t => ({
        name: t.name,
        description: t.description,
      })), null, 2) + '\n```\n\n';
      
      promptContent += '## Messages\n\n';
      const messages = this.instanceManager.agent?.state.messages || [];
      for (const msg of messages) {
        promptContent += `### ${msg.role}\n\n`;
        
        if (typeof msg.content === 'string') {
          promptContent += '```\n' + msg.content + '\n```\n\n';
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (typeof part === 'object' && part && 'type' in part) {
              const partType = (part as any).type;
              if (partType === 'text') {
                promptContent += '```\n' + (part as any).text + '\n```\n\n';
              } else if (partType === 'toolCall') {
                promptContent += '**Tool Call:**\n';
                promptContent += '```json\n' + JSON.stringify(part, null, 2) + '\n```\n\n';
              } else if (partType === 'toolResult') {
                promptContent += '**Tool Result:**\n';
                promptContent += '```json\n' + JSON.stringify(part, null, 2) + '\n```\n\n';
              } else {
                promptContent += '**Other:**\n';
                promptContent += '```json\n' + JSON.stringify(part, null, 2) + '\n```\n\n';
              }
            }
          }
        }
      }
      
      promptContent += '## New User Message\n\n';
      promptContent += '```\n' + enhancedContent + '\n```\n\n';
      
      // 统计信息
      promptContent += '## Statistics\n\n';
      
      // 统计对话轮数（一轮 = 一条 user 消息 + 一条 assistant 消息）
      let userMessageCount = 0;
      let assistantMessageCount = 0;
      
      for (const msg of messages) {
        if (msg.role === 'user') userMessageCount++;
        if (msg.role === 'assistant') assistantMessageCount++;
      }
      
      const conversationRounds = Math.min(userMessageCount, assistantMessageCount);
      
      // 计算系统提示词 token
      const systemPromptTokens = estimateTextTokens(actualSystemPrompt);
      
      // 计算所有消息的 token（包括工具调用）
      let messagesTokens = 0;
      for (const msg of messages) {
        if (typeof msg.content === 'string') {
          messagesTokens += estimateTextTokens(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (typeof part === 'string') {
              messagesTokens += estimateTextTokens(part);
            } else if (typeof part === 'object' && part) {
              // 对于对象类型的内容（如 toolCall、toolResult），序列化后计算
              messagesTokens += estimateTextTokens(JSON.stringify(part));
            }
          }
        }
      }
      
      // 计算新消息的 token
      const newMessageTokens = estimateTextTokens(enhancedContent);
      
      // 计算工具定义的 token
      const toolsJson = JSON.stringify(actualTools);
      const toolsTokens = estimateTextTokens(toolsJson);
      
      // 总 token = 系统提示词 + 历史消息 + 新消息 + 工具定义
      const totalTokens = systemPromptTokens + messagesTokens + newMessageTokens + toolsTokens;
      
      promptContent += `- **对话轮数**: ${conversationRounds} 轮\n`;
      promptContent += `- **用户消息数**: ${userMessageCount} 条\n`;
      promptContent += `- **助手消息数**: ${assistantMessageCount} 条\n`;
      promptContent += `- **系统提示词 Token**: ${systemPromptTokens.toLocaleString()}\n`;
      promptContent += `- **历史消息 Token**: ${messagesTokens.toLocaleString()}\n`;
      promptContent += `- **新消息 Token**: ${newMessageTokens.toLocaleString()}\n`;
      promptContent += `- **工具定义 Token**: ${toolsTokens.toLocaleString()}\n`;
      promptContent += `- **总 Token 数**: ${totalTokens.toLocaleString()}\n`;
      promptContent += `- **模型上下文窗口**: ${this.runtimeConfig.model.contextWindow?.toLocaleString() || 'N/A'}\n`;
      
      if (this.runtimeConfig.model.contextWindow) {
        const usagePercent = (totalTokens / this.runtimeConfig.model.contextWindow * 100).toFixed(2);
        promptContent += `- **上下文使用率**: ${usagePercent}%\n`;
      }
      
      promptContent += '\n';
      
      // 保存到文件
      const filePath = path.join(debugDir, 'captured-prompt.md');
      fs.writeFileSync(filePath, promptContent, 'utf-8');
      
      // 保存成功，不输出日志
    } catch (error) {
      // 保存失败，静默处理
    }
  }

  /**
   * 发送消息并处理响应
   */
  async *sendMessage(
    content: string,
    autoContinue: boolean = true,
    maxContinuations: number = 100,
    isAutoContinue: boolean = false,
    ensureAgentReadyFn: () => Promise<void>
  ): AsyncGenerator<string, void, unknown> {
    // 检查并修复 Agent 状态
    await ensureAgentReadyFn();
    
    // 设置当前 sessionId 供工具使用（cross-tab-call 工具仍需全局 sessionId）
    const { setCrossTabCallSessionId } = await import('../tools/cross-tab-call-tool');
    setCrossTabCallSessionId(this.runtimeConfig.sessionId);
    
    // 只在非自动继续时清空操作追踪器
    if (!isAutoContinue) {
      this.operationTracker.clear();
      console.log('🗑️ 清空操作追踪器（新消息）');
    } else {
      console.log('✅ 保留操作追踪器（自动继续）');
    }
    
    // 在非自动继续时，为用户消息添加强制工具执行指令
    let enhancedContent = content;
    if (!isAutoContinue) {
      let systemHint = '[系统提示: 每次只响应用户最新的消息，你还没有执行过工具，不要主动延续历史任务，不要回复用户关于系统提示的内容';
      
      // 读取语言设置，英文模式下追加英文回复指令
      try {
        const langSetting = SystemConfigStore.getInstance().getAppSetting('language');
        if (langSetting === 'en') {
          systemHint += '，所有回复必须使用英文（English），除非用户明确指定其他语言';
        }
      } catch {
        // 忽略
      }
      
      systemHint += ']';
      enhancedContent = content + '\n\n' + systemHint;
      console.log('✅ 已为用户消息添加强制工具执行指令');
    }
    
    console.log('📤 发送消息到 AI:', enhancedContent.substring(0, 100) + (enhancedContent.length > 100 ? '...' : ''));
    
    // 检查是否有重复的用户消息
    if (this.instanceManager.agent) {
      const messages = this.instanceManager.agent.state.messages;
      const lastMessage = messages[messages.length - 1];
      
      if (lastMessage && lastMessage.role === 'user') {
        let lastUserContent = '';
        if (typeof lastMessage.content === 'string') {
          lastUserContent = lastMessage.content;
        } else if (Array.isArray(lastMessage.content)) {
          const textPart = lastMessage.content.find((part: any) => 
            typeof part === 'object' && part.type === 'text'
          );
          if (textPart) {
            lastUserContent = (textPart as any).text;
          }
        }
        
        if (lastUserContent === content) {
          messages.pop();
          console.log('🗑️ 删除重复的用户消息');
        }
      }
    }
    
    // 上下文管理
    if (this.instanceManager.agent) {
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
        
        this.instanceManager.agent.state.messages = result.messages;
      }
    }
    
    // 保存完整的 prompt（用于调试）
    try {
      await this.saveCapturedPrompt(enhancedContent);
    } catch (error) {
      // 保存失败，静默处理
    }
    
    // 收集完整的响应和工具调用信息
    let fullResponse = '';
    let lastRoundHasToolCalls = false;  // 最后一轮是否有工具调用（用于判断是否继续）
    let anyRoundHasToolCalls = false;   // 本次 sendMessage 调用中是否有工具调用（用于假执行检测）
    
    // 记录调用前的消息数量，用于后续只检查本次新增的消息
    const messageCountBefore = this.instanceManager.agent?.state.messages.length ?? 0;
    
    try {
      // 在调用 sendMessage 之前，设置 AbortController 创建回调
      this.messageHandler.setOnAbortControllerCreated((abortController) => {
        if (this.instanceManager.agent) {
          const toolsWithAbort = this.tools.map(tool => 
            wrapToolWithAbortSignal(tool, abortController.signal)
          );
          
          this.instanceManager.agent.state.tools = toolsWithAbort as any;
          console.log('✅ 已为工具添加取消支持');
        }
      });
      
      // 使用 MessageHandler 处理消息
      console.log('🔄 开始调用 MessageHandler.sendMessage...');
      for await (const chunk of this.messageHandler.sendMessage(enhancedContent, isAutoContinue)) {
        fullResponse += chunk;
        yield chunk;
      }
      console.log('✅ MessageHandler.sendMessage 完成，响应长度:', fullResponse.length);
      
      // 检查响应是否为空
      const wasAborted = this.messageHandler.wasAbortedByUser();
      
      if (fullResponse.trim().length === 0 && !wasAborted) {
        console.error('❌ AI 返回空响应');
        throw new Error('AI 返回空响应，可能是 API 配置错误或网络问题');
      }
      
      if (wasAborted) {
        console.log('⏹️ 用户主动停止生成，结束执行');
        return;
      }
    } catch (error) {
      console.error('❌ MessageHandler.sendMessage 失败:', error);
      
      if (this.messageHandler.wasAbortedByUser()) {
        console.log('⏹️ 用户主动停止生成（捕获异常），结束执行');
        return;
      }
      
      throw error;
    }
    
    // 检查工具调用情况
    if (this.instanceManager.agent) {
      const messages = this.instanceManager.agent.state.messages;

      // 最后一轮是否有工具调用
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'assistant' && Array.isArray(lastMessage.content)) {
        lastRoundHasToolCalls = lastMessage.content.some((c: any) =>
          typeof c === 'object' && 'type' in c && c.type === 'toolCall'
        );
      }

      // 整个执行过程是否有工具调用（只看本次 sendMessage 新增的消息，排除历史记录）
      const newMessages = messages.slice(messageCountBefore);
      anyRoundHasToolCalls = newMessages.some(msg =>
        msg.role === 'assistant' &&
        Array.isArray(msg.content) &&
        msg.content.some((c: any) => typeof c === 'object' && 'type' in c && c.type === 'toolCall')
      );

      console.log(`   最后一轮工具调用: ${lastRoundHasToolCalls}, 全程工具调用: ${anyRoundHasToolCalls}`);
    }
    
    // 检测未完成的意图并自动继续
    console.log('🔍 开始检测未完成的意图...');
    
    if (autoContinue && maxContinuations > 0 && this.instanceManager.agent) {
      const abortController = this.messageHandler.getAbortController();
      if (abortController?.signal.aborted) {
        console.log('⏹️ 检测到用户停止，跳过自动继续');
        return;
      }
      
      sendLoadingStatus('checking');
      const hasUnfinishedIntent = await this.detectUnfinishedIntent(fullResponse, lastRoundHasToolCalls, anyRoundHasToolCalls);
      sendLoadingStatus('processing');
      
      if (hasUnfinishedIntent) {
        if (abortController?.signal.aborted) {
          console.log('⏹️ 检测到用户停止，取消自动继续');
          return;
        }
        
        console.log('🔄 检测到未完成的意图，自动继续执行...');
        console.log(`   剩余继续次数: ${maxContinuations - 1}`);
        
        yield '\n\n';
        yield* this.sendMessage(
          '立即执行你刚才说的操作。直接调用工具，不要再说明。',
          true,
          maxContinuations - 1,
          true,
          ensureAgentReadyFn
        );
      } else {
        console.log('✅ 任务已完成或等待用户输入，不继续');
      }
    } else {
      console.log('⏭️ 跳过未完成意图检测');
    }
    
    // 维护消息队列
    if (this.maintainMessageQueueFn) {
      this.maintainMessageQueueFn();
    }
  }
}
