/**
 * 消息处理器
 * 
 * 职责：处理消息发送、流式输出、生成控制、收集执行步骤
 */

import type { Agent } from '@mariozechner/pi-agent-core';
import { isAbortError } from '../../shared/utils/error-handler';
import { TIMEOUTS } from '../config/timeouts';
import { generateStepId } from '../../shared/utils/id-generator';
import type { ExecutionStep, ExecutionStepStatus } from '../../types/message';

/**
 * 消息处理器类
 */
export class MessageHandler {
  private agent: Agent | null = null;
  private isGenerating: boolean = false;
  private abortController: AbortController | null = null;
  private userAborted: boolean = false; // 🔥 记录是否被用户主动停止
  private currentGenerationId: number = 0;
  private executionSteps: ExecutionStep[] = []; // 当前消息的执行步骤
  private onExecutionStepUpdate?: (steps: ExecutionStep[]) => void; // 执行步骤更新回调
  private onAbortControllerCreated?: (controller: AbortController) => void; // AbortController 创建回调
  
  // Thinking 状态管理
  private isInThinking: boolean = false; // 是否正在 thinking 状态
  private thinkingBuffer: string = ''; // thinking 内容缓冲区
  
  // 当前正在流式输出的内容
  private currentStreamingContent = '';

  constructor(agent: Agent | null) {
    this.agent = agent;
  }

  /**
   * 更新 Agent 实例
   */
  setAgent(agent: Agent | null): void {
    this.agent = agent;
  }

  /**
   * 设置执行步骤更新回调
   */
  setExecutionStepCallback(callback: (steps: ExecutionStep[]) => void): void {
    this.onExecutionStepUpdate = callback;
  }

  /**
   * 设置 AbortController 创建回调
   * 
   * 用于在 AbortController 创建后立即通知外部（例如包装工具）
   */
  setOnAbortControllerCreated(callback: (controller: AbortController) => void): void {
    this.onAbortControllerCreated = callback;
  }

  /**
   * 添加执行步骤
   */
  private addExecutionStep(step: ExecutionStep): void {
    this.executionSteps.push(step);
    console.log(`📋 添加执行步骤: ${step.toolLabel || step.toolName} (${step.status})`);
    this.onExecutionStepUpdate?.(this.executionSteps);
  }

  /**
   * 更新执行步骤
   */
  private updateExecutionStep(stepId: string, updates: Partial<ExecutionStep>): void {
    const step = this.executionSteps.find(s => s.id === stepId);
    if (step) {
      Object.assign(step, updates);
      if (updates.status) {
        step.duration = Date.now() - step.timestamp;
      }
      console.log(`📋 更新执行步骤: ${step.toolLabel || step.toolName} (${step.status})`);
      this.onExecutionStepUpdate?.(this.executionSteps);
    }
  }

  /**
   * 完成 thinking 过程
   */
  private completeThinking(thinkingContent: string, currentToolStepId: string | null): void {
    console.log('✅ Thinking 完成 (文本解析模拟)');
    if (currentToolStepId) {
      this.updateExecutionStep(currentToolStepId, {
        result: thinkingContent,
        status: 'success',
      });
    }
    this.isInThinking = false;
    this.thinkingBuffer = '';
  }

  /**
   * 重置 thinking 状态
   */
  private resetThinkingState(): void {
    this.isInThinking = false;
    this.thinkingBuffer = '';
  }

  /**
   * 发送消息并获取流式响应
   * 
   * @param content - 用户消息内容
   * @param keepExecutionSteps - 是否保留之前的执行步骤（用于 autoContinue）
   * @returns 异步生成器，逐块返回 AI 响应
   */
  async *sendMessage(content: string, keepExecutionSteps = false): AsyncGenerator<string, void, unknown> {
    // console.log('📤 发送消息到 AI:', content.substring(0, 50));

    // 清空执行步骤（除非是 autoContinue）
    if (!keepExecutionSteps) {
      this.executionSteps = [];
    }

    // 重置 thinking 状态
    this.resetThinkingState();

    // 🔥 重置用户停止标志
    this.userAborted = false;

    // 标记为正在生成，并创建新的 AbortController
    this.isGenerating = true;
    this.abortController = new AbortController();
    
    // 生成新的 ID，用于标识这次生成
    const generationId = ++this.currentGenerationId;
    // console.log(`🆔 生成 ID: ${generationId}`);
    
    // 🔥 立即通知外部：AbortController 已创建，可以包装工具了
    if (this.onAbortControllerCreated) {
      this.onAbortControllerCreated(this.abortController);
    }

    if (!this.agent) {
      throw new Error('Agent 未初始化');
    }

    console.log('📤 AI 调用:', content.substring(0, 50) + (content.length > 50 ? '...' : ''));
    
    // 重置当前流式输出内容
    this.currentStreamingContent = '';
    
    try {
      // 订阅 Agent 事件，并实现真正的流式输出
      let fullResponse = '';
      let wasCancelled = false;
      let currentToolStepId: string | null = null; // 当前工具调用的步骤 ID（thinking 用）
      const toolCallStepMap = new Map<string, string>(); // toolCallId → stepId 映射
      
      // 用于统计
      let toolCallCount = 0;
      
      // 创建一个 Promise 来等待 Agent 完成
      let resolvePrompt: (() => void) | null = null;
      let rejectPrompt: ((error: Error) => void) | null = null;
      const promptPromise = new Promise<void>((resolve, reject) => {
        resolvePrompt = resolve;
        rejectPrompt = reject;
      });
      
      const unsubscribe = this.agent.subscribe((event) => {
        // 检查是否已取消或已废弃
        if (this.abortController?.signal.aborted || generationId !== this.currentGenerationId) {
          wasCancelled = true;
          return;
        }
        
        // 🔥 添加更多事件类型的调试信息
        if (event.type === 'agent_start') {
          console.log('🚀 Agent 开始执行');
        }
        
        if (event.type === 'agent_end') {
          console.log('🏁 Agent 执行完成');
          console.log(`   最终消息数量: ${event.messages?.length || 0}`);
          console.log(`   最终响应长度: ${fullResponse.length} 字符`);
        }
        
        // 只处理 message_update 事件中的 text_delta
        if (event.type === 'message_update' && event.assistantMessageEvent) {
          const assistantEvent = event.assistantMessageEvent;
          
          if (assistantEvent.type === 'text_delta' && assistantEvent.delta) {
            // 实现基于文本解析的 thinking 模拟（因为 MiniMax 不支持原生 thinking 事件）
            let rawDelta = assistantEvent.delta;
            let filteredDelta = rawDelta;
            
            // 状态机：处理跨多个 delta 的 thinking 内容
            if (!this.isInThinking) {
              // 不在 thinking 状态，检查是否开始 thinking
              const thinkStartIndex = rawDelta.indexOf('<think>');
              if (thinkStartIndex !== -1) {
                // 发现 thinking 开始标签
                console.log('🧠 Thinking 开始 (文本解析模拟)');
                this.isInThinking = true;
                this.thinkingBuffer = '';
                
                // 创建 thinking 执行步骤
                const stepId = generateStepId();
                currentToolStepId = stepId;
                this.addExecutionStep({
                  id: stepId,
                  toolName: 'thinking',
                  toolLabel: '思考过程',
                  status: 'running',
                  timestamp: Date.now(),
                });
                
                // 分离 thinking 前的内容和 thinking 内容
                const beforeThinking = rawDelta.substring(0, thinkStartIndex);
                const afterThinkStart = rawDelta.substring(thinkStartIndex + 7); // 跳过 '<think>'
                
                // thinking 前的内容加入主消息流
                filteredDelta = beforeThinking;
                
                // thinking 内容加入缓冲区
                this.thinkingBuffer += afterThinkStart;
                
                // 检查是否在同一个 delta 中就结束了
                const thinkEndIndex = this.thinkingBuffer.indexOf('</think>');
                if (thinkEndIndex !== -1) {
                  // 在同一个 delta 中结束
                  const thinkingContent = this.thinkingBuffer.substring(0, thinkEndIndex);
                  const afterThinking = this.thinkingBuffer.substring(thinkEndIndex + 8); // 跳过 '</think>'
                  
                  // 完成 thinking
                  this.completeThinking(thinkingContent, currentToolStepId);
                  currentToolStepId = null;
                  
                  // 剩余内容加入主消息流
                  filteredDelta += afterThinking;
                }
              }
            } else {
              // 正在 thinking 状态，所有内容都是 thinking 内容
              this.thinkingBuffer += rawDelta;
              filteredDelta = ''; // 不输出到主消息流
              
              // 检查是否结束 thinking
              const thinkEndIndex = this.thinkingBuffer.indexOf('</think>');
              if (thinkEndIndex !== -1) {
                // 发现 thinking 结束标签
                const thinkingContent = this.thinkingBuffer.substring(0, thinkEndIndex);
                const afterThinking = this.thinkingBuffer.substring(thinkEndIndex + 8); // 跳过 '</think>'
                
                // 完成 thinking
                this.completeThinking(thinkingContent, currentToolStepId);
                currentToolStepId = null;
                
                // 剩余内容加入主消息流
                filteredDelta = afterThinking;
              } else {
                // 更新 thinking 内容
                const step = this.executionSteps.find(s => s.id === currentToolStepId);
                if (step) {
                  step.result = this.thinkingBuffer;
                  this.onExecutionStepUpdate?.(this.executionSteps);
                }
              }
            }
            
            // 输出过滤后的内容到主消息流
            if (filteredDelta) {
              fullResponse += filteredDelta;
              this.currentStreamingContent = fullResponse; // 更新当前流式输出内容
            }
          }
          return;
        }
        
        // 处理工具调用事件 - 收集执行步骤
        if (event.type === 'tool_execution_start') {
          toolCallCount++;
          console.log(`🔧 工具调用 ${toolCallCount}: ${event.toolName} (${event.toolCallId})`);
          
          // 使用 toolCallId 作为步骤 ID，确保并行调用不会错位
          const stepId = event.toolCallId || generateStepId();
          toolCallStepMap.set(event.toolCallId, stepId);
          this.addExecutionStep({
            id: stepId,
            toolName: event.toolName,
            toolLabel: event.toolName,
            params: event.args,
            status: 'running',
            timestamp: Date.now(),
          });
        }
        
        if (event.type === 'tool_execution_update') {
          // 通过 toolCallId 找到对应的步骤
          const stepId = toolCallStepMap.get(event.toolCallId);
          if (stepId) {
            const resultText = this.extractResultText(event.partialResult);
            this.updateExecutionStep(stepId, {
              result: resultText,
            });
          }
        }
        
        if (event.type === 'tool_execution_end') {
          console.log(`✅ 工具完成 ${toolCallCount}: ${event.toolName} (${event.toolCallId})`);
          
          // 通过 toolCallId 找到对应的步骤
          const stepId = toolCallStepMap.get(event.toolCallId);
          if (stepId) {
            const resultText = this.extractResultText(event.result);
            const hasError = this.detectErrorInResult(resultText);
            
            this.updateExecutionStep(stepId, {
              result: resultText,
              status: hasError ? 'error' : 'success',
              error: hasError ? resultText : undefined,
            });
            
            toolCallStepMap.delete(event.toolCallId);
          }
        }
        
        // 监听 Turn 事件（Agent 的每一轮思考）
        if (event.type === 'turn_start') {
          console.log(`🔄 Agent 开始新的 Turn（思考轮次）`);
          console.log(`   当前消息数: ${this.agent?.state.messages.length || 0}`);
        }
        
        if (event.type === 'turn_end') {
          console.log(`✅ Agent 完成一轮 Turn`);
          console.log(`   工具调用数: ${event.toolResults?.length || 0}`);
          if (event.toolResults && event.toolResults.length > 0) {
            console.log(`   工具列表: ${event.toolResults.map((r: any) => r.toolName).join(', ')}`);
          }
        }
        
        // 其他事件类型（已注释，减少日志输出）
        // if (event.type === 'turn_start') {
        //   console.log(`🔄 新的 Turn 开始`);
        // }
        
        // if (event.type === 'turn_end') {
        //   console.log(`✅ Turn 结束`);
        // }
        
        // if (event.type === 'agent_start') {
        //   console.log(`🚀 Agent 开始执行`);
        // }
        
        // if (event.type === 'agent_end') {
        //   console.log(`🏁 Agent 执行完成`);
        //   console.log(`   最终消息数量: ${event.messages?.length || 0}`);
        // }
        
        // if (event.type === 'message_start') {
        //   console.log(`📨 消息开始: role=${(event as any).message?.role}`);
        // }
        
        // if (event.type === 'message_end') {
        //   console.log(`📭 消息结束: role=${(event as any).message?.role}`);
        // }
      });

      try {
        // Agent 状态（已注释，减少日志输出）
        // console.log(`📊 Agent 当前状态:`);
        // console.log(`   消息数量: ${this.agent.state.messages.length}`);
        // console.log(`   工具数量: ${this.agent.state.tools.length}`);
        // console.log(`   最近3条消息:`);
        // this.agent.state.messages.slice(-3).forEach((msg, idx) => {
        //   console.log(`   [${idx}] role=${msg.role}, content=${JSON.stringify(msg.content).substring(0, 100)}...`);
        // });
        
        // 启动 Agent.prompt()（不等待完成）
        // Agent 内部会自动处理工具调用循环，直到完成
        // console.log(`🚀 调用 agent.prompt() with maxTurns=15`);
        console.log(`🚀 调用 agent.prompt()，等待 Agent 完成...`);
        
        // 🔥 添加 Agent 配置调试信息
        console.log(`📊 Agent 配置信息:`);
        console.log(`   模型 API: ${this.agent.state.model?.api || 'unknown'}`);
        console.log(`   模型 ID: ${this.agent.state.model?.id || 'unknown'}`);
        console.log(`   模型 Provider: ${this.agent.state.model?.provider || 'unknown'}`);
        console.log(`   模型 BaseURL: ${this.agent.state.model?.baseUrl || 'unknown'}`);
        
        // 添加超时保护
        const TIMEOUT_MS = TIMEOUTS.AGENT_MESSAGE_TIMEOUT;
        const startTime = Date.now();
        
        // 启动 Agent.prompt()
        // Agent 内部会自动处理工具调用循环，直到完成
        
        // 添加进度监控定时器
        let progressTimer: NodeJS.Timeout | null = null;
        let elapsedSeconds = 0;
        
        progressTimer = setInterval(() => {
          elapsedSeconds += 5;
          console.log(`⏳ Agent 正在处理... 已耗时 ${elapsedSeconds} 秒`);
          
          // 如果超过 30 秒，输出警告
          if (elapsedSeconds >= 30 && elapsedSeconds % 10 === 0) {
            console.warn(`⚠️ Agent 处理时间较长 (${elapsedSeconds}秒)，可能在处理大量数据或等待 AI 响应`);
          }
        }, 5000);
        
        void this.agent.prompt(content).then(() => {
          // 清除进度定时器
          if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          
          const duration = Date.now() - startTime;
          console.log(`✅ agent.prompt() 完成，耗时: ${duration}ms`);
          console.log(`📊 Agent 最终状态:`);
          console.log(`   消息总数: ${this.agent?.state.messages.length || 0}`);
          console.log(`   工具调用数: ${toolCallCount}`);
          console.log(`   最终响应长度: ${fullResponse.length} 字符`);
          console.log(`   最终响应预览: ${fullResponse.substring(0, 200)}...`);
          
          // 🔥 如果响应为空，检查最后一条消息
          if (fullResponse.trim().length === 0 && this.agent) {
            const messages = this.agent.state.messages;
            const lastMessage = messages[messages.length - 1];
            console.error('⚠️ Agent 完成但响应为空，检查最后一条消息:');
            console.error('   最后消息角色:', lastMessage?.role);
            console.error('   最后消息内容类型:', Array.isArray(lastMessage?.content) ? 'array' : typeof lastMessage?.content);
            
            if (lastMessage?.role === 'assistant' && Array.isArray(lastMessage.content)) {
              console.error('   Assistant 消息内容项数:', lastMessage.content.length);
              lastMessage.content.forEach((item, index) => {
                if (typeof item === 'object' && item && 'type' in item) {
                  console.error(`   [${index}] type: ${item.type}`);
                  if (item.type === 'text') {
                    console.error(`   [${index}] text: "${(item as any).text || ''}"`);
                  }
                } else {
                  console.error(`   [${index}] raw: ${JSON.stringify(item)}`);
                }
              });
            }
          }
          
          console.log(`🎯 agent.prompt() 完成，准备返回结果...`);
          resolvePrompt?.();
        }).catch((error) => {
          // 清除进度定时器
          if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
          }
          
          console.error(`❌ agent.prompt() 失败:`, error);
          console.error(`   错误类型: ${error?.constructor?.name || 'unknown'}`);
          console.error(`   错误消息: ${error?.message || 'no message'}`);
          console.error(`   错误堆栈: ${error?.stack || 'no stack'}`);
          
          // 🔥 检查是否是 Gemini 相关的错误
          if (this.agent?.state.model?.api === 'google-generative-ai') {
            console.error(`🔍 Gemini 模型调试信息:`);
            console.error(`   模型 ID: ${this.agent.state.model.id}`);
            console.error(`   Base URL: ${this.agent.state.model.baseUrl}`);
            console.error(`   Provider: ${this.agent.state.model.provider}`);
          }
          
          rejectPrompt?.(error);
        });
        
        // 流式输出：定期检查 fullResponse 并 yield 新内容
        let isPromptDone = false;
        let lastYieldedLength = 0;
        
        console.log(`🔄 开始流式输出循环...`);
        
        // 使用 Promise.race 来检测 prompt 是否完成
        const checkInterval = 50; // 每 50ms 检查一次
        
        while (!isPromptDone) {
          // 检查超时（只保留总超时保护）
          if (Date.now() - startTime > TIMEOUT_MS) {
            console.error(`⏱️ Agent 执行超时（${TIMEOUT_MS}ms），强制停止`);
            this.abortController?.abort();
            yield '\n\n[执行超时，已停止]';
            break;
          }
          
          // 检查是否已废弃
          if (generationId !== this.currentGenerationId) {
            // console.log(`🗑️ 生成 ${generationId} 已被废弃，不返回结果`);
            return;
          }
          
          // 检查是否被取消
          if (wasCancelled || this.abortController?.signal.aborted) {
            console.log('⏹️ 生成已被用户停止');
            if (fullResponse.length > lastYieldedLength) {
              yield fullResponse.substring(lastYieldedLength);
            }
            yield '\n\n[生成已停止]';
            break;
          }
          
          // 如果有新内容，yield 出去
          if (fullResponse.length > lastYieldedLength) {
            const newContent = fullResponse.substring(lastYieldedLength);
            yield newContent;
            lastYieldedLength = fullResponse.length;
          }
          
          // 等待一小段时间或 prompt 完成
          const raceResult = await Promise.race([
            promptPromise.then(() => 'done'),
            new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), checkInterval)),
          ]);
          
          if (raceResult === 'done') {
            isPromptDone = true;
            console.log(`✅ 流式输出循环完成，Agent 已完成`);
          }
        }
        
        console.log(`📝 确保所有内容都已 yield...`);
        
        // 确保所有内容都已 yield
        if (fullResponse.length > lastYieldedLength) {
          yield fullResponse.substring(lastYieldedLength);
        }
        
        console.log(`✅ 流式输出完成，总长度: ${fullResponse.length} 字符`);
        
        // 流式输出完成后，清空当前流式输出内容
        this.currentStreamingContent = '';
        
        // console.log(`✅ AI 响应完成，总长度: ${fullResponse.length} 字符`);
        // console.log(`📝 AI 响应内容: ${fullResponse.substring(0, 200)}...`);
      } catch (error) {
        // 检查是否已废弃
        if (generationId !== this.currentGenerationId) {
          // console.log(`🗑️ 生成 ${generationId} 已被废弃（执行中出错）`);
          return;
        }
        
        // 检查是否是 AbortError
        const isAbort = isAbortError(error);
        
        // 检查是否是 "already processing" 错误
        const isAlreadyProcessing = error instanceof Error && 
          error.message.includes('already processing');
        
        // 如果是因为取消导致的错误，忽略它
        if (isAbort || wasCancelled || this.abortController?.signal.aborted) {
          console.log('⏹️ 生成已被用户停止（Agent 执行被中断）');
          yield fullResponse + '\n\n[生成已停止]';
        } else if (isAlreadyProcessing) {
          // 如果是并发错误，说明有新的生成正在进行，直接返回
          // console.log(`🗑️ 生成 ${generationId} 被新的生成替代`);
          return;
        } else {
          throw error;
        }
      } finally {
        // 取消订阅
        unsubscribe();
      }
    } catch (error) {
      // 检查是否已废弃
      if (generationId !== this.currentGenerationId) {
        // console.log(`🗑️ 生成 ${generationId} 已被废弃（外层出错）`);
        return;
      }
      
      console.error('❌ AI 请求失败:', error);
      throw error;
    } finally {
      // 只有当前生成才清理状态
      if (generationId === this.currentGenerationId) {
        this.isGenerating = false;
        this.abortController = null;
        // console.log(`✅ 生成 ${generationId} 清理完成`);
      } else {
        // console.log(`🗑️ 生成 ${generationId} 已被废弃，跳过清理`);
      }
    }
  }

  /**
   * 停止当前的生成
   */
  stopGeneration(): void {
    if (this.isGenerating) {
      console.log('⏹️ 停止生成...');
      
      // 1. 触发 AbortController，取消所有工具的执行
      if (this.abortController) {
        this.abortController.abort();
        // 🔥 记录用户主动停止
        this.userAborted = true;
      }
      
      // 2. 尝试停止 Agent 执行（pi-agent-core 支持 abort）
      if (this.agent && typeof (this.agent as any).abort === 'function') {
        try {
          (this.agent as any).abort();
        } catch (error) {
          console.warn('   ⚠️ Agent.abort() 失败:', error);
        }
      }
      
      // 3. 递增 generationId，标记当前生成为"已废弃"
      this.currentGenerationId++;
      console.log(`   🆔 新的生成 ID: ${this.currentGenerationId}`);
      
      // 4. 立即清理状态，允许新消息
      this.isGenerating = false;
      this.abortController = null;
      
      console.log('✅ 已停止生成，可以发送新消息');
    } else {
      console.log('⚠️ 没有正在进行的生成');
    }
  }

  /**
   * 检查是否正在生成
   */
  isCurrentlyGenerating(): boolean {
    return this.isGenerating;
  }

  /**
   * 获取 AbortController（用于工具包装）
   */
  getAbortController(): AbortController | null {
    return this.abortController;
  }

  /**
   * 获取是否被用户主动停止
   */
  wasAbortedByUser(): boolean {
    return this.userAborted;
  }

  /**
   * 获取当前的执行步骤
   */
  getExecutionSteps(): ExecutionStep[] {
    return this.executionSteps;
  }

  /**
   * 从工具结果中提取文本
   */
  private extractResultText(result: any): string {
    if (!result) return '';
    
    // 如果是字符串，直接返回
    if (typeof result === 'string') {
      return result;
    }
    
    // 如果有 content 数组
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
    }
    
    // 否则转为 JSON
    return JSON.stringify(result, null, 2);
  }

  /**
   * 强制重置 MessageHandler 状态
   * 
   * 用于解决 Agent 卡在异常状态的问题
   */
  forceReset(): void {
    console.log('[MessageHandler] 🔄 强制重置状态...');
    
    // 停止当前生成（如果有）
    if (this.isGenerating) {
      this.stopGeneration();
    }
    
    // 重置所有状态
    this.isGenerating = false;
    this.abortController = null;
    this.userAborted = false;
    this.currentGenerationId++;
    this.executionSteps = [];
    
    console.log('[MessageHandler] ✅ 状态重置完成');
  }

  /**
   * 检测结果中是否有错误
   */
  private detectErrorInResult(resultText: string): boolean {
    // 如果结果为空，不算错误
    if (!resultText || resultText.trim() === '') {
      return false;
    }
    
    // 🔥 优化：更精确的错误检测，减少误判
    const errorPatterns = [
      // 1. 明确的错误标识（行首或换行后）
      /^Error:/i,                    // 行首的 Error:
      /\nError:/i,                   // 换行后的 Error:
      /^错误[:：]/,                   // 行首的中文错误
      /\n错误[:：]/,                  // 换行后的中文错误
      
      // 2. 系统级错误（通常是真正的错误）
      /permission denied/i,          // 权限被拒绝
      /权限被拒绝/,
      /command not found/i,          // 命令未找到
      /命令未找到/,
      /ENOENT/,                      // 文件不存在错误码
      /EACCES/,                      // 权限错误码
      /EPERM/,                       // 操作不允许
      
      // 3. 命令执行失败（退出码非 0）
      /exited with code [1-9]/i,     // 命令退出码非 0
      
      // 4. 抛出异常的明确标识
      /^Traceback \(most recent call last\)/m,  // Python 异常
      /^    at .+:\d+:\d+/m,                    // JavaScript 堆栈跟踪
      /^Fatal error:/i,                         // 致命错误
      /^Uncaught /i,                            // 未捕获的异常
      
      // 5. 安全检查失败（DeepBot 特有）
      /^命令安全检查失败/,
      /^工作目录安全检查失败/,
      /^安全限制：/,
      /^命令被拦截：/,
    ];
    
    return errorPatterns.some(pattern => pattern.test(resultText));
  }

  /**
   * 获取当前正在流式输出的内容
   */
  getCurrentStreamingContent(): string {
    return this.currentStreamingContent;
  }
}
