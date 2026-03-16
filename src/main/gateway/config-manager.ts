/**
 * 配置管理器 - 负责配置重新加载和 SessionManager 管理
 */

import type { SessionManager } from '../session/session-manager';
import { getErrorMessage } from '../../shared/utils/error-handler';

export class ConfigManager {
  private sessionManager: SessionManager | null = null;

  /**
   * 初始化 SessionManager
   */
  async initializeSessionManager(): Promise<void> {
    try {
      const { SystemConfigStore } = await import('../database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      const { SessionManager } = await import('../session/session-manager');
      this.sessionManager = new SessionManager(settings.sessionDir);
      await this.sessionManager.initialize();
      
      console.log('[ConfigManager] ✅ SessionManager 已初始化');
    } catch (error) {
      console.error('[ConfigManager] ❌ 初始化 SessionManager 失败:', getErrorMessage(error));
    }
  }

  /**
   * 重新加载模型配置
   */
  async reloadModelConfig(destroyAllRuntimes: () => void, checkAndSendWelcomeMessage: () => Promise<void>): Promise<void> {
    console.log('[ConfigManager] 🔄 重新加载模型配置...');
    
    // 清除 AI 连接缓存
    const { clearAICache } = await import('../utils/ai-client');
    clearAICache();
    
    // 销毁所有现有的 AgentRuntime
    destroyAllRuntimes();
    
    console.log('[ConfigManager] ✅ 模型配置已重新加载');
    
    // 检查是否需要发送欢迎消息
    checkAndSendWelcomeMessage().catch((error: any) => {
      console.error('[ConfigManager] ❌ 检查欢迎消息失败:', getErrorMessage(error));
    });
  }

  /**
   * 重新加载工作目录配置
   */
  async reloadWorkspaceConfig(destroyAllRuntimes: () => void): Promise<void> {
    console.log('[ConfigManager] 🔄 重新加载工作目录配置...');
    
    // 重新加载 SessionManager
    await this.reloadSessionManager();
    
    // 销毁所有现有的 AgentRuntime
    destroyAllRuntimes();
    
    console.log('[ConfigManager] ✅ 工作目录配置已重新加载，AgentRuntime 已重置');
  }

  /**
   * 重新加载 SessionManager
   */
  async reloadSessionManager(): Promise<void> {
    console.log('[ConfigManager] 🔄 重新加载 SessionManager...');
    
    try {
      // 重新初始化 SessionManager
      await this.initializeSessionManager();
      
      console.log('[ConfigManager] ✅ SessionManager 已重新加载');
    } catch (error) {
      console.error('[ConfigManager] ❌ 重新加载 SessionManager 失败:', getErrorMessage(error));
      throw error;
    }
  }

  /**
   * 重新加载系统提示词
   */
  async reloadSystemPrompts(getAgentRuntimes: () => Map<string, any>): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('[ConfigManager] 🔄 重新加载所有会话的系统提示词...');
    
    const agentRuntimes = getAgentRuntimes();
    console.log('[ConfigManager] 活跃会话数量:', agentRuntimes.size);
    console.log('='.repeat(80));
    
    const reloadPromises: Promise<void>[] = [];
    
    for (const [sessionId, runtime] of agentRuntimes.entries()) {
      console.log(`[ConfigManager] 📝 重新加载会话: ${sessionId}`);
      reloadPromises.push(runtime.reloadSystemPrompt());
    }
    
    await Promise.all(reloadPromises);
    
    console.log('='.repeat(80));
    console.log('[ConfigManager] ✅ 所有会话的系统提示词已重新加载');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 重新加载单个会话的系统提示词
   */
  async reloadSessionSystemPrompt(sessionId: string, getAgentRuntime: (sessionId: string) => any): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log(`[ConfigManager] 🔄 重新加载会话 ${sessionId} 的系统提示词...`);
    console.log('='.repeat(80));

    const runtime = getAgentRuntime(sessionId);

    if (!runtime) {
      console.warn(`[ConfigManager] ⚠️ 会话 ${sessionId} 不存在，无法重新加载系统提示词`);
      return;
    }

    await runtime.reloadSystemPrompt();

    console.log('='.repeat(80));
    console.log(`[ConfigManager] ✅ 会话 ${sessionId} 的系统提示词已重新加载`);
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 获取 SessionManager 实例
   */
  getSessionManager(): SessionManager | null {
    return this.sessionManager;
  }
}