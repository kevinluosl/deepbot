/**
 * Runtime 管理器 - 负责 AgentRuntime 的生命周期管理
 */

import { AgentRuntime } from '../agent-runtime/index';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { sleep } from '../../shared/utils/async-utils';
import type { ResetRuntimeOptions } from './types';

export class RuntimeManager {
  private agentRuntimes: Map<string, AgentRuntime> = new Map();
  private defaultSessionId: string = 'default';

  /**
   * 检查会话是否正在执行
   */
  isSessionExecuting(sessionId: string): boolean {
    const runtime = this.agentRuntimes.get(sessionId);
    if (!runtime) {
      return false;
    }
    return runtime.isCurrentlyGenerating();
  }

  /**
   * 获取或创建 AgentRuntime
   */
  getOrCreateRuntime(sessionId: string): AgentRuntime {
    let runtime = this.agentRuntimes.get(sessionId);
    
    if (!runtime) {
      console.info(`[RuntimeManager] 创建新的 AgentRuntime: ${sessionId}`);
      
      // 从数据库读取工作目录配置
      const { SystemConfigStore } = require('../database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      const workspaceDir = settings.workspaceDir;
      console.info(`[RuntimeManager] 使用工作目录: ${workspaceDir}`);
      
      runtime = new AgentRuntime(workspaceDir, sessionId);
      
      this.agentRuntimes.set(sessionId, runtime);
    }
    
    return runtime;
  }

  /**
   * 销毁指定会话的 Runtime
   */
  async destroySessionRuntime(sessionId: string): Promise<void> {
    const runtime = this.agentRuntimes.get(sessionId);
    
    if (runtime) {
      console.log(`[RuntimeManager] 销毁会话 Runtime: ${sessionId}`);
      await runtime.destroy();
      this.agentRuntimes.delete(sessionId);
      console.log(`[RuntimeManager] ✅ 会话 Runtime 已销毁并移除`);
    } else {
      console.log(`[RuntimeManager] 会话 Runtime 不存在: ${sessionId}`);
    }
  }

  /**
   * 重置会话 Runtime（统一的重置逻辑）
   */
  async resetSessionRuntime(sessionId: string, options: ResetRuntimeOptions = {}): Promise<AgentRuntime | null> {
    const { reason = '未知原因', recreate = true } = options;
    
    console.log(`[RuntimeManager] 🔄 重置会话 Runtime: ${sessionId}`);
    console.log(`[RuntimeManager] 📝 重置原因: ${reason}`);
    console.log(`[RuntimeManager] 🔧 重新创建: ${recreate ? '是' : '否'}`);
    
    // 步骤 1: 停止当前 Runtime 的生成
    const runtime = this.agentRuntimes.get(sessionId);
    if (runtime) {
      console.log('[RuntimeManager] 🛑 停止当前 Runtime 生成...');
      await runtime.stopGeneration();
    }
    
    // 步骤 2: 销毁当前 Runtime
    console.log('[RuntimeManager] 🗑️ 销毁当前 Runtime...');
    await this.destroySessionRuntime(sessionId);
    
    if (!recreate) {
      console.log('[RuntimeManager] ✅ 会话 Runtime 重置完成（仅销毁）');
      return null;
    }
    
    // 步骤 3: 等待一小段时间让 Runtime 完全释放
    await sleep(500);
    
    // 步骤 4: 重新创建 Runtime
    console.log('[RuntimeManager] ✨ 重新创建 Runtime...');
    const newRuntime = this.getOrCreateRuntime(sessionId);
    
    console.log('[RuntimeManager] ✅ 会话 Runtime 重置完成');
    
    return newRuntime;
  }

  /**
   * 销毁所有 AgentRuntime 实例
   */
  destroyAllRuntimes(): void {
    for (const [sessionId, runtime] of this.agentRuntimes.entries()) {
      console.info(`[RuntimeManager] 销毁 AgentRuntime: ${sessionId}`);
      void runtime.destroy();
    }
    this.agentRuntimes.clear();
  }

  /**
   * 获取活跃会话数量
   */
  getActiveSessionCount(): number {
    return this.agentRuntimes.size;
  }

  /**
   * 获取所有会话 ID
   */
  getSessionIds(): string[] {
    return Array.from(this.agentRuntimes.keys());
  }

  /**
   * 获取指定会话的 AgentRuntime 实例
   */
  getAgentRuntime(sessionId?: string): AgentRuntime | null {
    const currentSessionId = sessionId || this.defaultSessionId;
    return this.agentRuntimes.get(currentSessionId) || null;
  }

  /**
   * 销毁 RuntimeManager 并清理所有资源
   */
  destroy(): void {
    console.info('[RuntimeManager] 开始销毁 RuntimeManager...');
    this.destroyAllRuntimes();
    console.info('[RuntimeManager] RuntimeManager 已销毁');
  }
}