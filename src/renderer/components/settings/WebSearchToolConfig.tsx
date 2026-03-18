/**
 * Web Search 工具配置页面
 * 
 * 配置 Qwen Web Search 工具
 */

import React, { useState, useEffect } from 'react';
import { 
  WEB_SEARCH_PROVIDER_PRESETS 
} from '../../../shared/config/default-configs';

interface WebSearchToolConfig {
  provider: 'qwen' | 'gemini';  // 提供商类型（仅支持 Qwen 和 Gemini）
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
    model: WEB_SEARCH_PROVIDER_PRESETS.qwen.defaultModelId,
    apiUrl: WEB_SEARCH_PROVIDER_PRESETS.qwen.baseUrl,
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
  const handleProviderChange = (newProvider: 'qwen' | 'gemini') => {
    const preset = WEB_SEARCH_PROVIDER_PRESETS[newProvider];

    setConfig({
      ...config,
      provider: newProvider,
      apiUrl: preset.baseUrl,
      model: preset.defaultModelId,
    });
  };

  const handleSave = async () => {
    // 验证配置
    if (!config.apiUrl) {
      setSaveMessage({ type: 'error', text: '请输入 API 地址' });
      return;
    }

    if (!config.model) {
      setSaveMessage({ type: 'error', text: '请输入模型 ID' });
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
        <h3 className="text-lg font-medium text-gray-900 mb-2">Web Search 工具配置</h3>
        <p className="text-sm text-gray-500">
          配置 Web Search 工具，支持 Qwen 和 Google Gemini 的网络搜索能力
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
                <p className="mt-1">• Qwen: 使用 Qwen 的网络搜索能力 (enable_search)</p>
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
          onChange={(e) => handleProviderChange(e.target.value as 'qwen' | 'gemini')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="qwen">Qwen</option>
          <option value="gemini">Google Gemini</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">
          选择支持网络搜索的 AI 提供商
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
          placeholder="https://api.example.com/v1"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          预设提供商的 API 地址（可修改）
        </p>
      </div>

      {/* 模型 ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          模型 ID
        </label>
        <input
          type="text"
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          placeholder={
            config.provider === 'qwen' 
              ? 'qwen3.5-plus' 
              : 'gemini-3-flash-preview'
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          {config.provider === 'qwen' && '默认: qwen3.5-plus（可选: qwen-plus, qwen-turbo, qwen-max 等）'}
          {config.provider === 'gemini' && '默认: gemini-3-flash-preview（可选: gemini-2.5-flash, gemini-2.5-pro 等）'}
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
            ? 'Qwen API Key（可以与主模型使用相同的 Key）'
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

      {/* 保存按钮 */}
      <div className="flex justify-end pt-4 border-t">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
        >
          {isSaving ? '保存中...' : '保存配置'}
        </button>
      </div>
    </div>
  );
}
