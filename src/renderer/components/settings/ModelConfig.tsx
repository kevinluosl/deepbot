/**
 * 模型配置页面
 * 
 * 支持选择 Qwen、DeepSeek、Gemini、MiniMax 或自定义提供商
 */

import React, { useState, useEffect } from 'react';
import { PROVIDER_PRESETS } from '../../../shared/config/default-configs';
import { api } from '../../api';
import { showToast } from '../../utils/toast';
import { ApiKeyHelpModal } from './ApiKeyHelpModal';

interface ModelConfig {
  providerType: 'deepbot' | 'qwen' | 'deepseek' | 'gemini' | 'minimax' | 'custom';
  providerId: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
  modelId2?: string;       // 快速模型 ID（可选）
  modelName: string;
  apiType: string;         // API 类型
  apiKey: string;
  contextWindow?: number;  // 上下文窗口大小
  lastFetched?: number;    // 最后获取时间
}

interface ModelConfigProps {
  onClose: () => void;
}

export function ModelConfig({ onClose }: ModelConfigProps) {
  const [config, setConfig] = useState<ModelConfig>({
    providerType: 'qwen',
    providerId: 'qwen',
    providerName: '通义千问',
    baseUrl: PROVIDER_PRESETS.qwen.baseUrl,
    modelId: PROVIDER_PRESETS.qwen.defaultModelId,
    modelId2: PROVIDER_PRESETS.qwen.defaultModelId2,  // 设置快速模型默认值
    modelName: PROVIDER_PRESETS.qwen.defaultModelId,
    apiType: PROVIDER_PRESETS.qwen.apiType,
    apiKey: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const hasLoadedRef = React.useRef(false);
  const [isFirstTimeConfig, setIsFirstTimeConfig] = useState(false);
  const [isFromEnv, setIsFromEnv] = useState(false); // 当前配置是否来自环境变量
  const [showApiKeyHelp, setShowApiKeyHelp] = useState(false); // 显示 API Key 帮助模态框
  const [showModelDropdown, setShowModelDropdown] = useState(false); // DeepBot 模型下拉菜单

  // 加载当前配置（防止 Strict Mode 重复执行）
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await api.getModelConfig();
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success && actualResult.config) {
        // 确保 providerType 和 apiType 字段存在（兼容旧数据）
        const loadedConfig = {
          ...actualResult.config,
          providerType: actualResult.config.providerType || 'qwen',
          apiType: actualResult.config.apiType || 'openai-completions',
        };
        setConfig(loadedConfig);
        
        // 标记是否来自环境变量
        setIsFromEnv(!!actualResult.config.fromEnv);
        // 来自环境变量也算"已配置"，不弹首次配置提示
        setIsFirstTimeConfig(!loadedConfig.apiKey);
      } else {
        setIsFirstTimeConfig(true);
      }
    } catch (error) {
      console.error('加载模型配置失败:', error);
      setIsFirstTimeConfig(true);
    }
  };

  // 处理提供商类型变化
  const handleProviderTypeChange = (providerType: 'deepbot' | 'qwen' | 'deepseek' | 'gemini' | 'minimax' | 'custom') => {
    const preset = PROVIDER_PRESETS[providerType];
    
    setConfig({
      ...config,
      providerType,
      providerId: providerType,
      providerName: preset.name,
      baseUrl: preset.baseUrl,
      modelId: preset.defaultModelId,
      modelId2: preset.defaultModelId2 || undefined,  // 设置快速模型默认值
      modelName: preset.defaultModelId,
      apiType: preset.apiType,
      contextWindow: undefined,  // 清空上下文窗口，让系统自动推断
    });
  };

  const handleSave = async () => {
    // 验证配置
    if (!config.baseUrl) {
      showToast('error', '请输入 API 地址');
      return;
    }

    if (!config.modelId) {
      showToast('error', '请输入模型 ID');
      return;
    }

    if (!config.apiKey) {
      showToast('error', '请输入 API Key');
      return;
    }

    setIsSaving(true);

    try {
      const result = await api.saveModelConfig(config);
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success) {
        showToast('success', '✅ 保存成功！配置已生效');
        
        // 保存成功后重新加载配置，获取后端推断的上下文窗口值
        await loadConfig();
        
        // 🔥 如果是第一次配置，延迟关闭窗口让用户看到初始化过程
        if (isFirstTimeConfig) {
          setTimeout(() => {
            onClose();
          }, 1000); // 延迟 1 秒关闭，让用户看到成功提示
        }
      } else {
        showToast('error', actualResult.error || '保存失败');
      }
    } catch (error) {
      console.error('保存模型配置失败:', error);
      showToast('error', '保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 环境变量配置提示 */}
      {isFromEnv && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                当前使用环境变量配置
              </h3>
              <div className="mt-1 text-sm text-blue-700">
                <p>模型配置来自 <code className="bg-blue-100 px-1 rounded">.env</code> 文件。修改并保存后将优先使用此处的配置。</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <p>请配置 API 地址和密钥后才能使用 DeepBot。</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">模型配置</h3>
        <p className="text-sm text-gray-500">
          选择 AI 模型提供商并配置 API 密钥
        </p>
      </div>

      {/* 提供商选择 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          提供商
        </label>
        <select
          value={config.providerType}
          onChange={(e) => handleProviderTypeChange(e.target.value as 'deepbot' | 'qwen' | 'deepseek' | 'gemini' | 'minimax' | 'custom')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="deepbot">DeepBot（推荐）</option>
          <option value="qwen">Qwen</option>
          <option value="deepseek">DeepSeek</option>
          <option value="gemini">Google Gemini</option>
          <option value="minimax">MiniMax</option>
          <option value="custom">自定义（OpenAI、Claude）</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">
          选择预设提供商或自定义配置
        </p>
      </div>

      {/* API 类型（仅自定义模式显示） */}
      {config.providerType === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API 类型
          </label>
          <select
            value={config.apiType}
            onChange={(e) => setConfig({ ...config, apiType: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="openai-completions">OpenAI 兼容（OpenAI、OpenRouter、Claude、Qwen、DeepSeek 等）</option>
            <option value="google-generative-ai">Google Generative AI（Gemini 原生格式）</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            大多数提供商使用 OpenAI 兼容格式，Google Gemini 原生 API 选第二项
          </p>
        </div>
      )}

      {/* API 地址 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          API 地址 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.baseUrl}
          onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
          placeholder="https://api.example.com/v1"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          {config.providerType === 'custom' 
            ? '输入兼容 OpenAI API 或 Google Generative AI 格式的地址' 
            : '预设提供商的 API 地址（可修改）'}
        </p>
      </div>

      {/* 模型 ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          模型 ID（主模型） <span className="text-red-500">*</span>
        </label>
        {config.providerType === 'deepbot' ? (
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={config.modelId}
              onChange={(e) => setConfig({ ...config, modelId: e.target.value, modelName: e.target.value, contextWindow: undefined })}
              onFocus={() => setShowModelDropdown(true)}
              onBlur={() => setTimeout(() => setShowModelDropdown(false), 150)}
              placeholder="deepseek-v3.2"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showModelDropdown && (
              <ul style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: 'var(--settings-bg, #fff)', border: '1px solid var(--settings-border, #d1d5db)',
                borderTop: 'none', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto',
                listStyle: 'none', margin: 0, padding: '4px 0',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}>
                {['deepseek-v3.2', 'minimax-m2.5', 'minimax-m2.7', 'glm-4.7', 'kimi-k2.5', 'step-3.5-flash', 'qwen3.5-plus-02-15'].map(id => (
                  <li key={id}
                    onMouseDown={() => setConfig({ ...config, modelId: id, modelName: id, contextWindow: undefined })}
                    style={{
                      padding: '6px 12px', cursor: 'pointer', fontSize: '13px',
                      color: config.modelId === id ? 'var(--settings-accent, #3b82f6)' : 'var(--settings-text, #333)',
                      fontWeight: config.modelId === id ? 600 : 400,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--settings-bg-light, rgba(59,130,246,0.08))'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >{id}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <input
            type="text"
            value={config.modelId}
            onChange={(e) => setConfig({ ...config, modelId: e.target.value, modelName: e.target.value, contextWindow: undefined })}
            placeholder={
              config.providerType === 'qwen' 
                ? 'qwen-max' 
                : config.providerType === 'deepseek' 
                  ? 'deepseek-chat' 
                  : config.providerType === 'gemini'
                    ? 'gemini-3-pro-preview'
                    : config.providerType === 'minimax'
                      ? 'MiniMax-M2.5'
                      : 'model-id'
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        <p className="mt-1 text-xs text-gray-500">
          {config.providerType === 'deepbot' && '从列表选择或输入自定义模型 ID'}
          {config.providerType === 'qwen' && '推荐: qwen-max（高质量）或 qwen-plus（平衡）'}
          {config.providerType === 'deepseek' && '推荐: deepseek-chat'}
          {config.providerType === 'gemini' && '推荐: gemini-3-pro-preview（高质量）或 gemini-3-flash-preview（快速）'}
          {config.providerType === 'minimax' && '推荐: MiniMax-M2.5（高质量）或 MiniMax-M2.5-highspeed（快速）'}
          {config.providerType === 'custom' && '输入主模型 ID'}
        </p>
      </div>

      {/* 模型 ID 2（快速模型） */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          模型 ID 2（快速模型，可选）
        </label>
        <input
          type="text"
          value={config.modelId2 || ''}
          onChange={(e) => setConfig({ ...config, modelId2: e.target.value || undefined })}
          placeholder={
            config.providerType === 'qwen' 
              ? 'qwen-plus' 
              : config.providerType === 'deepseek' 
                ? 'deepseek-chat' 
                : config.providerType === 'gemini'
                  ? 'gemini-3-flash-preview'
                  : config.providerType === 'minimax'
                    ? 'MiniMax-M2.5-highspeed'
                    : 'fast-model-id'
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          {config.providerType === 'qwen' && '推荐: qwen-plus（用于轻量级任务，如语义判断）'}
          {config.providerType === 'deepseek' && '推荐: deepseek-chat（与主模型相同）'}
          {config.providerType === 'gemini' && '推荐: gemini-3-flash-preview（用于轻量级任务）'}
          {config.providerType === 'minimax' && '推荐: MiniMax-M2.5-highspeed（用于轻量级任务）'}
          {config.providerType === 'custom' && '输入快速模型 ID（用于轻量级任务）'}
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
            如何获取？
          </span>
        </div>
        <input
          type="password"
          value={config.apiKey}
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
          placeholder={
            config.providerType === 'gemini' 
              ? 'AIza...' 
              : 'sk-...'
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          {config.providerType === 'gemini' 
            ? 'Google AI Studio API Key（以 AIza 开头）将加密存储在本地' 
            : 'API 密钥将加密存储在本地'}
        </p>
      </div>

      {/* 上下文窗口大小（可编辑） */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          上下文窗口
        </label>
        <input
          type="number"
          value={config.contextWindow || ''}
          onChange={(e) => setConfig({ ...config, contextWindow: e.target.value ? parseInt(e.target.value) : undefined })}
          placeholder="自动推断"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          留空则根据模型 ID 自动推断（推荐）。如需精确值，请手动输入
        </p>
      </div>

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

      {/* 如何获取 API Key 模态框 */}
      {showApiKeyHelp && <ApiKeyHelpModal onClose={() => setShowApiKeyHelp(false)} />}
    </div>
  );
}
