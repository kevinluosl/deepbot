/**
 * 模型配置页面
 * 
 * 支持主流 AI 模型厂商的配置
 */

import React, { useState, useEffect } from 'react';
import { WELCOME_MESSAGE } from '../../../shared/constants/welcome-message';

// 模型提供商预设
interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: Array<{
    id: string;
    name: string;
  }>;
  requiresApiKey: boolean;
  description?: string;
}

const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: 'qwen',
    name: '通义千问 (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
    ],
    requiresApiKey: true,
    description: '阿里云通义千问大模型',
  },
  {
    id: 'moonshot',
    name: 'Kimi (Moonshot AI)',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K' },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K' },
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K' },
    ],
    requiresApiKey: true,
    description: 'Moonshot AI 大模型',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    ],
    requiresApiKey: true,
    description: 'OpenAI 官方模型',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
    ],
    requiresApiKey: true,
    description: 'Anthropic Claude 模型',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-coder', name: 'DeepSeek Coder' },
    ],
    requiresApiKey: true,
    description: 'DeepSeek 大模型',
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4', name: 'GLM-4' },
      { id: 'glm-4-plus', name: 'GLM-4 Plus' },
      { id: 'glm-3-turbo', name: 'GLM-3 Turbo' },
    ],
    requiresApiKey: true,
    description: '智谱 AI 大模型',
  },
  {
    id: 'custom',
    name: '自定义 (OpenAI 兼容)',
    baseUrl: '',
    models: [],
    requiresApiKey: true,
    description: '支持任何 OpenAI 兼容的 API',
  },
];

interface ModelConfig {
  providerId: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
  modelName: string;
  apiKey: string;
}

interface ModelConfigProps {
  onClose: () => void;
}

export function ModelConfig({ onClose }: ModelConfigProps) {
  const [selectedProvider, setSelectedProvider] = useState<ModelProvider | null>(null);
  const [config, setConfig] = useState<ModelConfig>({
    providerId: '',
    providerName: '',
    baseUrl: '',
    modelId: '',
    modelName: '',
    apiKey: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const hasLoadedRef = React.useRef(false);

  // 加载当前配置（防止 Strict Mode 重复执行）
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('model-config:get');
      if (result.success && result.config) {
        setConfig(result.config);
        
        // 查找对应的提供商
        const provider = MODEL_PROVIDERS.find(p => p.id === result.config.providerId);
        if (provider) {
          setSelectedProvider(provider);
        }
      }
    } catch (error) {
      console.error('加载模型配置失败:', error);
    }
  };

  const handleProviderChange = (providerId: string) => {
    const provider = MODEL_PROVIDERS.find(p => p.id === providerId);
    if (!provider) return;

    setSelectedProvider(provider);
    setConfig({
      ...config,
      providerId: provider.id,
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      modelId: provider.models[0]?.id || '',
      modelName: provider.models[0]?.name || '',
    });
  };

  const handleModelChange = (modelId: string) => {
    if (!selectedProvider) return;

    const model = selectedProvider.models.find(m => m.id === modelId);
    if (!model) return;

    setConfig({
      ...config,
      modelId: model.id,
      modelName: model.name,
    });
  };

  const handleSave = async () => {
    // 验证配置
    if (!config.providerId) {
      setSaveMessage({ type: 'error', text: '请选择模型提供商' });
      return;
    }

    if (!config.baseUrl) {
      setSaveMessage({ type: 'error', text: '请输入 API 地址' });
      return;
    }

    if (!config.modelId) {
      setSaveMessage({ type: 'error', text: '请选择模型' });
      return;
    }

    if (selectedProvider?.requiresApiKey && !config.apiKey) {
      setSaveMessage({ type: 'error', text: '请输入 API Key' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const result = await window.electron.ipcRenderer.invoke('model-config:save', { config });
      
      if (result.success) {
        setSaveMessage({ 
          type: 'success', 
          text: '✅ 保存成功！正在测试配置...' 
        });
        
        // 等待 500ms 让用户看到成功消息
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 关闭设置窗口
        if (onClose) {
          onClose();
        }
        
        // 发送欢迎消息到主 Agent（不要等待，避免阻塞）
        window.deepbot.sendMessage(WELCOME_MESSAGE).catch(error => {
          console.error('发送欢迎消息失败:', error);
        });
      } else {
        setSaveMessage({ type: 'error', text: result.error || '保存失败' });
      }
    } catch (error) {
      console.error('保存模型配置失败:', error);
      setSaveMessage({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部提示 */}
      {!config.apiKey && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                模型未配置
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>请选择 AI 模型提供商并配置 API 密钥后才能使用 DeepBot。</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">模型配置</h3>
        <p className="text-sm text-gray-600 mb-6">
          选择 AI 模型提供商并配置 API 密钥
        </p>
      </div>

      {/* 提供商选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          模型提供商
        </label>
        <select
          value={config.providerId}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">请选择提供商</option>
          {MODEL_PROVIDERS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        {selectedProvider?.description && (
          <p className="mt-1 text-xs text-gray-500">{selectedProvider.description}</p>
        )}
      </div>

      {/* API 地址 */}
      {selectedProvider && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API 地址
          </label>
          <input
            type="text"
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            可以修改为自定义的 API 地址（需兼容 OpenAI API 格式）
          </p>
        </div>
      )}

      {/* 模型选择 */}
      {selectedProvider && selectedProvider.models.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            模型
          </label>
          <select
            value={config.modelId}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">请选择模型</option>
            {selectedProvider.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 自定义模型 ID（仅自定义提供商） */}
      {selectedProvider?.id === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            模型 ID
          </label>
          <input
            type="text"
            value={config.modelId}
            onChange={(e) => setConfig({ ...config, modelId: e.target.value, modelName: e.target.value })}
            placeholder="gpt-4o"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* API Key */}
      {selectedProvider?.requiresApiKey && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key
          </label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            API 密钥将加密存储在本地
          </p>
        </div>
      )}

      {/* 保存消息 */}
      {saveMessage && (
        <div
          className={`p-3 rounded-md ${
            saveMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {saveMessage.text}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex justify-end pt-4 border-t">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '保存并测试...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
