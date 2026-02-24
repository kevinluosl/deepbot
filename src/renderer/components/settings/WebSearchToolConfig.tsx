/**
 * Web Search 工具配置页面
 * 
 * 配置 Qwen Web Search 工具
 */

import React, { useState, useEffect } from 'react';

// Qwen 模型列表（支持 Web Search）
const QWEN_MODELS = [
  { id: 'qwen-plus', name: 'Qwen Plus' },
  { id: 'qwen-max', name: 'Qwen Max' },
  { id: 'qwen-turbo', name: 'Qwen Turbo' },
];

// Gemini 模型列表（支持 Grounding with Google Search）
const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (推荐)' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash-8b', name: 'Gemini 2.5 Flash 8B' },
];

// 提供商列表
const PROVIDERS = [
  { id: 'qwen', name: '通义千问 (Qwen)', defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'gemini', name: 'Google Gemini', defaultUrl: 'https://www.im-director.com/api/gemini-proxy' },
];

interface WebSearchToolConfig {
  provider: string;      // 提供商 ID
  model: string;
  apiUrl: string;
  apiKey: string;
}

interface WebSearchToolConfigProps {
  onClose?: () => void;
}

export function WebSearchToolConfig({ onClose }: WebSearchToolConfigProps) {
  const [config, setConfig] = useState<WebSearchToolConfig>({
    provider: 'qwen',
    model: 'qwen-plus',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
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
      const result = await window.electron.ipcRenderer.invoke('tool-config:web-search:get');
      if (result.success && result.config) {
        setConfig(result.config);
      }
    } catch (error) {
      console.error('加载 Web Search 工具配置失败:', error);
    }
  };

  // 当提供商改变时，更新默认 API 地址和模型
  const handleProviderChange = (newProvider: string) => {
    const provider = PROVIDERS.find(p => p.id === newProvider);
    if (!provider) return;

    // 获取该提供商的模型列表
    const models = newProvider === 'qwen' ? QWEN_MODELS : GEMINI_MODELS;
    const defaultModel = models[0]?.id || '';

    setConfig({
      ...config,
      provider: newProvider,
      apiUrl: provider.defaultUrl,
      model: defaultModel,
    });
  };

  // 获取当前提供商的模型列表
  const getCurrentModels = () => {
    return config.provider === 'qwen' ? QWEN_MODELS : GEMINI_MODELS;
  };

  const handleSave = async () => {
    // 验证配置
    if (!config.apiUrl) {
      setSaveMessage({ type: 'error', text: '请输入 API 地址' });
      return;
    }

    if (!config.model) {
      setSaveMessage({ type: 'error', text: '请选择模型' });
      return;
    }

    if (!config.apiKey) {
      setSaveMessage({ type: 'error', text: '请输入 API Key' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const result = await window.electron.ipcRenderer.invoke('tool-config:web-search:save', { config });
      
      if (result.success) {
        setSaveMessage({ 
          type: 'success', 
          text: '✅ 保存成功！' 
        });
        
        // 等待 500ms 让用户看到成功消息
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 关闭设置窗口
        if (onClose) {
          onClose();
        }
      } else {
        setSaveMessage({ type: 'error', text: result.error || '保存失败' });
      }
    } catch (error) {
      console.error('保存 Web Search 工具配置失败:', error);
      setSaveMessage({ type: 'error', text: '保存失败，请重试' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">Web Search 工具配置</h3>
        <p className="text-sm text-gray-600 mb-6">
          配置 Web Search 工具，支持通义千问 (Qwen) 和 Google Gemini 的网络搜索能力
        </p>
      </div>

      {/* 提示信息 */}
      {!config.apiKey && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                关于 Web Search
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>Web Search 工具可以获取最新的网络信息、新闻、天气等实时数据。</p>
                <p className="mt-1">• Qwen: 使用通义千问的网络搜索能力 (enable_search)</p>
                <p className="mt-1">• Gemini: 使用 Google Search Grounding (google_search_retrieval)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 提供商选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          提供商
        </label>
        <select
          value={config.provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PROVIDERS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          选择 Web Search 提供商
        </p>
      </div>

      {/* API 地址 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          API 地址
        </label>
        <input
          type="text"
          value={config.apiUrl}
          onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
          placeholder={config.provider === 'qwen' 
            ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
            : 'https://generativelanguage.googleapis.com/v1beta'}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          {config.provider === 'qwen' ? '通义千问 API 地址' : 'Google Gemini API 地址'}
        </p>
      </div>

      {/* 模型选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          模型
        </label>
        <select
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {getCurrentModels().map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          {config.provider === 'qwen' 
            ? '选择支持 Web Search 的 Qwen 模型'
            : '选择支持 Grounding with Google Search 的 Gemini 模型'}
        </p>
      </div>

      {/* API Key */}
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
          {config.provider === 'qwen' 
            ? '通义千问 API Key（可以与主模型使用相同的 Key）'
            : 'Google Gemini API Key'}
        </p>
      </div>

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
      <div className="flex justify-end gap-3 pt-4 border-t">
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            取消
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
