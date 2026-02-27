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
      this.onExecutionStepUpdate?.(this.executionSteps);
    }
  }

  /**
   * 发送消息并获取流式响应
   * 
   * @param content - 用户消息内容
   * @returns 异步生成器，逐块返回 AI 响应
   */
  async *sendMessage(content: string): AsyncGenerator<string, void, unknown> {
    // console.log('📤 发送消息到 AI:', content.substring(0, 50));

    // 清空执行步骤
    this.executionSteps = [];

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
    
    try {
      // 订阅 Agent 事件，并实现真正的流式输出
      let fullResponse = '';
      let wasCancelled = false;
      let currentToolStepId: string | null = null; // 当前工具调用的步骤 ID
      
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
        
        // 只处理 message_update 事件中的 text_delta
        if (event.type === 'message_update' && event.assistantMessageEvent) {
          const assistantEvent = event.assistantMessageEvent;
          if (assistantEvent.type === 'text_delta' && assistantEvent.delta) {
            // 过滤掉 <think> 和 </think> 标签
            const filteredDelta = assistantEvent.delta
              .replace(/<think>/g, '')
              .replace(/<\/think>/g, '');
            fullResponse += filteredDelta;
          }
          return;
        }
        
        // 处理工具调用事件 - 收集执行步骤
        if (event.type === 'tool_execution_start') {
          toolCallCount++;
          console.log(`🔧 工具调用 ${toolCallCount}: ${event.toolName}`);
          
          // 创建执行步骤
          const stepId = generateStepId();
          currentToolStepId = stepId;
          this.addExecutionStep({
            id: stepId,
            toolName: event.toolName,
            toolLabel: event.toolName, // 可以后续优化为更友好的名称
            params: event.args,
            status: 'running',
            timestamp: Date.now(),
          });
        }
        
        if (event.type === 'tool_execution_update') {
          // console.log(`🔧 工具执行进度:`, event.partialResult);
          
          // 更新执行步骤的部分结果
          if (currentToolStepId) {
            const resultText = this.extractResultText(event.partialResult);
            this.updateExecutionStep(currentToolStepId, {
              result: resultText,
            });
          }
        }
        
        if (event.type === 'tool_execution_end') {
          console.log(`✅ 工具完成 ${toolCallCount}: ${event.toolName}`);
          
          // 更新执行步骤为成功
          if (currentToolStepId) {
            const resultText = this.extractResultText(event.result);
            const hasError = this.detectErrorInResult(resultText);
            
            this.updateExecutionStep(currentToolStepId, {
              result: resultText,
              status: hasError ? 'error' : 'success',
              error: hasError ? resultText : undefined,
            });
            
            currentToolStepId = null;
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
        
        // 添加超时保护
        const TIMEOUT_MS = TIMEOUTS.AGENT_MESSAGE_TIMEOUT;
        const startTime = Date.now();
        
        // 启动 Agent.prompt()
        // Agent 内部会自动处理工具调用循环，直到完成
        void this.agent.prompt(content).then(() => {
          const duration = Date.now() - startTime;
          console.log(`✅ agent.prompt() 完成，耗时: ${duration}ms`);
          console.log(`📊 Agent 最终状态:`);
          console.log(`   消息总数: ${this.agent?.state.messages.length || 0}`);
          console.log(`   工具调用数: ${toolCallCount}`);
          console.log(`   最终响应长度: ${fullResponse.length} 字符`);
          console.log(`   最终响应预览: ${fullResponse.substring(0, 200)}...`);
          resolvePrompt?.();
        }).catch((error) => {
          console.error(`❌ agent.prompt() 失败:`, error);
          rejectPrompt?.(error);
        });
        
        // 流式输出：定期检查 fullResponse 并 yield 新内容
        let isPromptDone = false;
        let lastYieldedLength = 0;
        
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
            new Promise<'timeout'>((resolve) => {
              const timer = setTimeout(() => resolve('timeout'), checkInterval);
              return () => clearTimeout(timer);
            }),
          ]);
          
          if (raceResult === 'done') {
            isPromptDone = true;
          }
        }
        
        // 确保所有内容都已 yield
        if (fullResponse.length > lastYieldedLength) {
          yield fullResponse.substring(lastYieldedLength);
        }
        
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
   * 检测结果中是否有错误
   */
  private detectErrorInResult(resultText: string): boolean {
    const errorPatterns = [
      /Error:/i,
      /error:/i,
      /错误/,
      /permission denied/i,
      /权限被拒绝/,
      /command not found/i,
      /命令未找到/,
      /module not found/i,
      /模块未找到/,
      /cannot find/i,
      /找不到/,
      /failed to/i,
      /失败/,
      /ENOENT/,
      /EACCES/,
      /exited with code [1-9]/i, // 命令退出码非 0
    ];
    
    return errorPatterns.some(pattern => pattern.test(resultText));
  }
}
