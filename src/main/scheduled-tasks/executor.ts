/**
 * 任务执行器
 * 
 * 负责执行任务，创建新 Tab 执行
 */

import type { ScheduledTask, TaskExecution } from './types';
import { getErrorMessage } from '../../shared/utils/error-handler';

// Gateway 实例（由 scheduled-task-tool 设置）
let gatewayInstance: any = null;

export function setGatewayForExecutor(gateway: any): void {
  gatewayInstance = gateway;
}

export class TaskExecutor {
  /**
   * 执行任务
   */
  async execute(task: ScheduledTask): Promise<TaskExecution> {
    const startTime = new Date();
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    console.log(`[TaskExecutor] ========================================`);
    console.log(`[TaskExecutor] 🚀 开始执行任务: ${task.name}`);
    console.log(`[TaskExecutor] 📝 任务描述: ${task.description}`);
    console.log(`[TaskExecutor] 🆔 任务 ID: ${task.id}`);
    console.log(`[TaskExecutor] 🆔 执行 ID: ${executionId}`);
    console.log(`[TaskExecutor] ⏰ 开始时间: ${startTime.toISOString()}`);
    console.log(`[TaskExecutor] ========================================`);

    try {
      // 创建新 Tab 执行任务
      const result = await this.executeInNewTab(task);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      console.log(`[TaskExecutor] ========================================`);
      console.log(`[TaskExecutor] ✅ 任务执行成功: ${task.name}`);
      console.log(`[TaskExecutor] ⏱️  执行时长: ${duration}ms`);
      console.log(`[TaskExecutor] 📊 执行结果: ${result}`);
      console.log(`[TaskExecutor] ========================================`);

      return {
        id: executionId,
        taskId: task.id,
        taskName: task.name,
        startTime,
        endTime,
        duration,
        status: 'success',
        result: result,
      };
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const errorMessage = getErrorMessage(error);

      console.error(`[TaskExecutor] ========================================`);
      console.error(`[TaskExecutor] ❌ 任务执行失败: ${task.name}`);
      console.error(`[TaskExecutor] ⏱️  执行时长: ${duration}ms`);
      console.error(`[TaskExecutor] 🔥 错误信息: ${errorMessage}`);
      console.error(`[TaskExecutor] ========================================`);

      return {
        id: executionId,
        taskId: task.id,
        taskName: task.name,
        startTime,
        endTime,
        duration,
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * 在任务专属 Tab 中执行任务
   * 
   * 获取或创建任务专属 Tab（锁定状态），将任务命令发送到该 Tab 执行
   */
  private async executeInNewTab(task: ScheduledTask): Promise<string> {
    if (!gatewayInstance) {
      throw new Error('Gateway 实例未设置');
    }

    console.log(`[TaskExecutor] 📂 获取或创建任务专属 Tab...`);

    // 获取或创建任务专属 Tab（复用同一个 Tab）
    const tab = gatewayInstance.getOrCreateTaskTab(task.id, task.name);
    console.log(`[TaskExecutor] 📂 使用 Tab: ${tab.id} (${tab.title})`);

    // 🔥 检查窗口是否正在执行，如果正在执行则等待
    const tabSessionId = tab.id;
    const isExecuting = gatewayInstance.isSessionExecuting(tabSessionId);
    
    if (isExecuting) {
      console.log(`[TaskExecutor] ⏳ Tab ${tab.id} 正在执行任务，等待空闲...`);
      
      // 等待窗口空闲（最多等待 5 分钟）
      const maxWaitTime = 5 * 60 * 1000; // 5 分钟
      const startTime = Date.now();
      const checkInterval = 1000; // 每秒检查一次
      
      while (gatewayInstance.isSessionExecuting(tabSessionId)) {
        // 检查是否超时
        if (Date.now() - startTime > maxWaitTime) {
          throw new Error(`等待窗口空闲超时（5分钟），任务执行失败`);
        }
        
        // 等待 1 秒后再检查
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        
        // 每 10 秒打印一次等待状态
        if ((Date.now() - startTime) % 10000 < checkInterval) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          console.log(`[TaskExecutor] ⏳ 已等待 ${elapsed} 秒...`);
        }
      }
      
      const waitTime = Math.floor((Date.now() - startTime) / 1000);
      console.log(`[TaskExecutor] ✅ 窗口已空闲，等待了 ${waitTime} 秒`);
    }

    // 构建任务命令（包含系统前缀，给 AI 看）
    const taskCommand = this.buildTaskCommand(task);
    console.log(`[TaskExecutor] 📝 任务命令（AI）: "${taskCommand}"`);
    
    // 🔥 原始任务内容（给用户看，显示在前端）
    const displayContent = task.description;
    console.log(`[TaskExecutor] 📝 显示内容（用户）: "${displayContent}"`);

    // 等待一小段时间，确保前端已收到 Tab 创建通知（仅首次创建时需要）
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`[TaskExecutor] 📤 发送命令到 Tab ${tab.id}...`);
    
    // 🔥 将命令发送到任务 Tab 执行，同时传递显示内容和清空历史标志
    // taskCommand: 给 AI 看的完整命令（包含系统前缀）
    // displayContent: 给用户看的原始任务内容（显示在前端消息气泡中）
    // clearHistory: true - 清空历史消息，避免干扰定时任务执行
    await gatewayInstance.handleSendMessage(taskCommand, tab.id, displayContent, true);

    console.log(`[TaskExecutor] ✅ 任务已提交到 Tab ${tab.id} 执行`);
    return `任务已在专属窗口中执行（Tab: ${tab.id}）`;
  }

  /**
   * 构建任务命令
   * 
   * 注意：
   * 1. 命令必须非常明确，避免 Agent 误解为"创建定时任务"
   * 2. 前缀用于 AI 理解，但用户消息显示原始任务内容
   */
  private buildTaskCommand(task: ScheduledTask): string {
    // 🔥 添加"这是一个定时任务"前缀，让 AI 明确知道这是定时任务
    // 避免 AI 认为同样的任务不应该执行多次
    // 
    // 注意：这个前缀只是给 AI 看的系统提示，用户消息气泡会显示原始任务内容
    return `这是定时任务的其中一次执行，严格执行下面任务，不要任何周期性的指令，不要创建定时任务，只执行任务内容，工具必须执行：${task.description}`;
  }
}
