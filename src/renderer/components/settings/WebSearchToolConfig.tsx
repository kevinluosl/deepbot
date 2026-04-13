/**
 * Web Search 工具配置页面
 */

import React, { useState, useEffect } from 'react';
import { 
  WEB_SEARCH_PROVIDER_PRESETS 
} from '../../../shared/config/default-configs';
import { api } from '../../api';
import { showToast } from '../../utils/toast';
import { ApiKeyHelpModal } from './ApiKeyHelpModal';
import { getLanguage } from '../../i18n';

interface WebSearchToolConfig {
  provider: 'deepbot' | 'qwen' | 'gemini';
  model: string;
  apiUrl: string;
  apiKey: string;
}

interface WebSearchToolConfigProps {
  onClose?: () => void;
}

export function WebSearchToolConfig({ onClose }: WebSearchToolConfigProps) {
  const lang = getLanguage();
  const [config, setConfig] = useState<WebSearchToolConfig>({
    provider: 'deepbot',
    model: WEB_SEARCH_PROVIDER_PRESETS.deepbot.defaultModelId,
    apiUrl: WEB_SEARCH_PROVIDER_PRESETS.deepbot.baseUrl,
    apiKey: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKeyHelp, setShowApiKeyHelp] = useState(false);
  const hasLoadedRef = React.useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await api.getWebSearchToolConfig();
      if (result.success && result.config) {
        setConfig(result.config);
      }
    } catch (error) {
      console.error('加载 Web Search 工具配置失败:', error);
    }
  };

  const handleProviderChange = (newProvider: 'deepbot' | 'qwen' | 'gemini') => {
    const preset = WEB_SEARCH_PROVIDER_PRESETS[newProvider];
    setConfig({
      ...config,
      provider: newProvider,
      apiUrl: preset.baseUrl,
      model: preset.defaultModelId,
    });
  };

  const handleSave = async () => {
    if (!config.apiUrl) { showToast('error', lang === 'zh' ? '请输入 API 地址' : 'Please enter API URL'); return; }
    if (!config.model) { showToast('error', lang === 'zh' ? '请输入模型 ID' : 'Please enter Model ID'); return; }
    if (!config.apiKey) { showToast('error', lang === 'zh' ? '请输入 API Key' : 'Please enter API Key'); return; }

    setIsSaving(true);
    try {
      const result = await api.saveWebSearchToolConfig(config);
      if (result.success) {
        showToast('success', lang === 'zh' ? '✅ 保存成功！' : '✅ Saved successfully!');
      } else {
        showToast('error', result.error || (lang === 'zh' ? '保存失败' : 'Save failed'));
      }
    } catch (error) {
      console.error('保存 Web Search 工具配置失败:', error);
      showToast('error', lang === 'zh' ? '保存失败，请重试' : 'Save failed, please retry');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-base font-medium text-gray-900 mb-2">
          {lang === 'zh' ? 'Web Search 工具配置' : 'Web Search Tool Config'}
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          {lang === 'zh'
            ? '配置网络搜索能力，获取最新的网络信息、新闻、天气等实时数据。如需调用其他提供商，可通过安装 Skill 扩展。'
            : 'Configure web search to get real-time data such as news, weather, etc. Install a Skill to use other providers.'}
          <span style={{ color: 'var(--settings-accent)' }}>
            {lang === 'zh' ? '推荐：Tavily Search Skill' : 'Recommended: Tavily Search Skill'}
          </span>
        </p>
      </div>

      {/* 提供商选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {lang === 'zh' ? '提供商' : 'Provider'}
        </label>
        <select
          value={config.provider}
          onChange={(e) => handleProviderChange(e.target.value as 'deepbot' | 'qwen' | 'gemini')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="deepbot">DeepBot（Gemini 3）</option>
          <option value="qwen">Qwen</option>
        </select>
      </div>

      {/* API 地址 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {lang === 'zh' ? 'API 地址' : 'API URL'} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.apiUrl}
          onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          {config.provider === 'deepbot' && (lang === 'zh' ? '无需魔法，直连 Gemini 3' : 'Direct connection to Gemini 3, no proxy needed')}
          {config.provider === 'qwen' && (lang === 'zh' ? '预设提供商的 API 地址（可修改）' : 'Preset provider API URL (editable)')}
          {config.provider === 'gemini' && (lang === 'zh' ? '预设提供商的 API 地址（可修改）' : 'Preset provider API URL (editable)')}
        </p>
      </div>

      {/* 模型 ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {lang === 'zh' ? '模型 ID' : 'Model ID'} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
          disabled={config.provider === 'deepbot'}
          placeholder={config.provider === 'qwen' ? 'qwen3.5-plus' : 'gemini-3-flash-preview'}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-gray-500">
          {config.provider === 'qwen' && (lang === 'zh'
            ? '默认: qwen3.5-plus（可选: qwen-plus, qwen-turbo, qwen-max 等）'
            : 'Default: qwen3.5-plus (options: qwen-plus, qwen-turbo, qwen-max, etc.)')}
          {(config.provider === 'gemini' || config.provider === 'deepbot') && (lang === 'zh'
            ? '默认: gemini-3-flash-preview'
            : 'Default: gemini-3-flash-preview')}
        </p>
      </div>

      {/* API Key */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium text-gray-700">API Key <span className="text-red-500">*</span></label>
          <span
            onClick={() => setShowApiKeyHelp(true)}
            style={{ fontSize: '11px', color: 'var(--settings-accent)', cursor: 'pointer' }}
          >
            {lang === 'zh' ? '如何获取？' : 'How to get?'}
          </span>
        </div>
        <input
          type="password"
          value={config.apiKey}
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          {config.provider === 'deepbot' && (lang === 'zh'
            ? '点击「如何获取」获得 API Key，或使用自己的 Gemini API Key'
            : 'Click "How to get" for an API Key, or use your own Gemini API Key')}
          {config.provider === 'qwen' && (lang === 'zh'
            ? 'Qwen API Key（可以与主模型使用相同的 Key）'
            : 'Qwen API Key (can reuse the same key as the main model)')}
          {config.provider === 'gemini' && (lang === 'zh'
            ? 'Google Gemini API Key'
            : 'Google Gemini API Key')}
        </p>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end pt-4 border-t">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
        >
          {isSaving
            ? (lang === 'zh' ? '保存中...' : 'Saving...')
            : (lang === 'zh' ? '保存配置' : 'Save Config')}
        </button>
      </div>

      {/* 如何获取 API Key 模态框 */}
      {showApiKeyHelp && <ApiKeyHelpModal onClose={() => setShowApiKeyHelp(false)} />}
    </div>
  );
}
