/**
 * 模型配置 IPC 处理器
 */

import type {
  GetModelConfigResponse,
  SaveModelConfigRequest,
  SaveModelConfigResponse,
  TestModelConfigRequest,
  TestModelConfigResponse,
} from '../../types/ipc';
import type { Gateway } from '../gateway';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { registerIpcHandler } from '../../shared/utils/ipc-utils';
import { SystemConfigStore } from '../database/system-config-store';

let configStore: SystemConfigStore | null = null;
let gatewayInstance: Gateway | null = null;

/**
 * 设置 Gateway 实例
 */
export function setGatewayForModelConfig(gateway: Gateway): void {
  gatewayInstance = gateway;
}

/**
 * 获取配置存储实例
 */
function getConfigStore(): SystemConfigStore {
  if (!configStore) {
    configStore = SystemConfigStore.getInstance();
  }
  return configStore;
}

/**
 * 注册模型配置 IPC 处理器
 */
export function registerModelConfigHandlers(): void {
  // 获取模型配置
  registerIpcHandler<void, GetModelConfigResponse>(
    'model-config:get',
    async (): Promise<GetModelConfigResponse> => {
      try {
        const store = getConfigStore();
        const config = store.getModelConfig();
        
        return {
          success: true,
          config: config || undefined,
        };
      } catch (error) {
        console.error('[ModelConfigHandler] 获取模型配置失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );

  // 保存模型配置
  registerIpcHandler<SaveModelConfigRequest, SaveModelConfigResponse>(
    'model-config:save',
    async (_event, request): Promise<SaveModelConfigResponse> => {
      try {
        const store = getConfigStore();
        store.saveModelConfig(request.config);
        
        // 🔥 重新加载 Gateway 的模型配置
        if (gatewayInstance) {
          console.log('[ModelConfigHandler] 通知 Gateway 重新加载配置...');
          await gatewayInstance.reloadModelConfig();
        } else {
          console.warn('[ModelConfigHandler] Gateway 实例未设置，无法重新加载配置');
        }
        
        return {
          success: true,
        };
      } catch (error) {
        console.error('[ModelConfigHandler] 保存模型配置失败:', error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );

  // 测试模型配置
  registerIpcHandler<TestModelConfigRequest, TestModelConfigResponse>(
    'model-config:test',
    async (_event, request): Promise<TestModelConfigResponse> => {
      try {
        console.log('[ModelConfigHandler] 测试模型配置，收到参数:', {
          providerId: request.config.providerId,
          baseUrl: request.config.baseUrl,
          modelId: request.config.modelId,
          hasApiKey: !!request.config.apiKey,
          apiKeyLength: request.config.apiKey?.length,
        });

        // 验证必要参数
        if (!request.config.apiKey) {
          throw new Error('API Key 不能为空');
        }

        if (!request.config.baseUrl) {
          throw new Error('API 地址不能为空');
        }

        if (!request.config.modelId) {
          throw new Error('模型 ID 不能为空');
        }

        // 动态导入 pi-ai（ESM 模块）
        // eslint-disable-next-line no-eval
        const piAI = await eval('import("@mariozechner/pi-ai")');
        
        // 创建测试模型
        const model = {
          api: 'openai-completions' as const,
          id: request.config.modelId,
          name: request.config.modelName,
          provider: request.config.providerId,
          input: ['text'] as const,
          reasoning: false,
          baseUrl: request.config.baseUrl,
          contextWindow: 8192,
          maxTokens: 8192,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        };

        console.log('[ModelConfigHandler] 创建的模型配置:', model);
        
        // 发送测试请求
        const response = await piAI.complete({
          model,
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          temperature: 0.7,
          apiKey: request.config.apiKey, // 直接传递 apiKey，而不是 getApiKey 函数
        });
        
        // 读取响应（验证连接）
        let hasContent = false;
        for await (const chunk of response) {
          if (typeof chunk === 'string' && chunk.length > 0) {
            hasContent = true;
            console.log('[ModelConfigHandler] 收到响应内容，长度:', chunk.length);
            break;
          }
        }
        
        if (!hasContent) {
          throw new Error('API 返回空响应');
        }
        
        console.log('[ModelConfigHandler] ✅ 测试连接成功');
        return {
          success: true,
        };
      } catch (error) {
        console.error('[ModelConfigHandler] 测试模型配置失败:', error);
        
        let errorMessage = '连接测试失败';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        
        return {
          success: false,
          error: errorMessage,
        };
      }
    }
  );

  console.info('[ModelConfigHandler] ✅ 模型配置 IPC 处理器已注册');
}
