/**
 * 模型配置页面
 * 
 * 简化版：直接配置 API 地址和模型 ID
 */

import React, { useState, useEffect } from 'react';

// 默认配置
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL_ID = 'qwen3.5-plus';

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
  const [config, setConfig] = useState<ModelConfig>({
    providerId: 'qwen',
    providerName: '通义千问',
    baseUrl: DEFAULT_BASE_URL,
    modelId: DEFAULT_MODEL_ID,
    modelName: DEFAULT_MODEL_ID,
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
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success && actualResult.config) {
        setConfig(actualResult.config);
      }
    } catch (error) {
      console.error('加载模型配置失败:', error);
    }
  };

  const handleSave = async () => {
    // 验证配置
    if (!config.baseUrl) {
      setSaveMessage({ type: 'error', text: '请输入 API 地址' });
      return;
    }

    if (!config.modelId) {
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
      const result = await window.electron.ipcRenderer.invoke('model-config:save', { config });
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success) {
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
      } else {
        setSaveMessage({ type: 'error', text: actualResult.error || '保存失败' });
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
                <p>请配置 API 地址和密钥后才能使用 DeepBot。</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">模型配置</h3>
        <p className="text-sm text-gray-600 mb-6">
          配置 AI 模型 API 地址和密钥（默认为通义千问）
        </p>
      </div>

      {/* API 地址 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          API 地址
        </label>
        <input
          type="text"
          value={config.baseUrl}
          onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
          placeholder={DEFAULT_BASE_URL}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          默认为通义千问地址，可修改为其他兼容 OpenAI API 格式的地址
        </p>
      </div>

      {/* 模型 ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          模型 ID
        </label>
        <input
          type="text"
          value={config.modelId}
          onChange={(e) => setConfig({ ...config, modelId: e.target.value, modelName: e.target.value })}
          placeholder={DEFAULT_MODEL_ID}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          输入模型 ID（如 qwen3.5-plus）
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
          API 密钥将加密存储在本地
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
