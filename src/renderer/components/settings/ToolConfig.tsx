/**
 * 工具配置组件
 * 
 * 配置系统工具的参数（如图片生成工具、Web Search 工具）
 */

import React, { useState } from 'react';
import { WebSearchToolConfig } from './WebSearchToolConfig';

interface ToolConfigProps {
  onClose: () => void;
}

interface ImageGenerationConfig {
  model: string;
  apiUrl: string;
  apiKey: string;
}

export function ToolConfig({ onClose }: ToolConfigProps) {
  const [activeTab, setActiveTab] = useState<'image' | 'websearch'>('image');
  const [imageGenConfig, setImageGenConfig] = useState<ImageGenerationConfig>({
    model: 'gemini-3-pro-image-preview',
    apiUrl: 'https://www.im-director.com/api/gemini-proxy',
    apiKey: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const hasLoadedRef = React.useRef(false);

  // 加载配置（防止 Strict Mode 重复执行）
  React.useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const config = await window.deepbot.getImageGenerationToolConfig();
      if (config) {
        setImageGenConfig(config);
      }
    } catch (error) {
      console.error('加载工具配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSave = async () => {
    if (!imageGenConfig.model.trim()) {
      showMessage('error', '请输入模型名称');
      return;
    }
    if (!imageGenConfig.apiUrl.trim()) {
      showMessage('error', '请输入 API 地址');
      return;
    }
    if (!imageGenConfig.apiKey.trim()) {
      showMessage('error', '请输入 API Key');
      return;
    }

    setSaving(true);

    try {
      await window.deepbot.saveImageGenerationToolConfig(imageGenConfig);
      showMessage('success', '配置保存成功');
    } catch (error) {
      showMessage('error', `保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">工具配置</h3>
        <p className="text-sm text-gray-500">
          配置系统工具的参数和连接信息
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1">
          <button
            onClick={() => setActiveTab('image')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'image'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            图片生成
          </button>
          <button
            onClick={() => setActiveTab('websearch')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'websearch'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            网络搜索
          </button>
        </nav>
      </div>

      {/* 图片生成工具配置 */}
      {activeTab === 'image' && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            图片生成工具
          </label>
          <p className="text-xs text-gray-500 mb-2">
            配置图片生成工具使用的模型和 API 连接
          </p>

          {/* 模型选择 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              模型 <span className="text-red-500">*</span>
            </label>
            <select
              value={imageGenConfig.model}
              onChange={(e) => setImageGenConfig({ ...imageGenConfig, model: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image Preview</option>
            </select>
            <p className="text-xs text-gray-500">
              选择用于图片生成的模型
            </p>
          </div>

          {/* API 地址 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              API 地址 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={imageGenConfig.apiUrl}
              onChange={(e) => setImageGenConfig({ ...imageGenConfig, apiUrl: e.target.value })}
              placeholder="https://www.im-director.com/api/gemini-proxy"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500">
              Gemini API 代理地址
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={imageGenConfig.apiKey}
              onChange={(e) => setImageGenConfig({ ...imageGenConfig, apiKey: e.target.value })}
              placeholder="输入 API Key"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500">
              用于访问 Gemini API 的密钥
            </p>
          </div>

          {/* 保存按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>

          {/* 消息提示 */}
          {message && (
            <div className={`p-4 rounded-md ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      )}

      {/* Web Search 工具配置 */}
      {activeTab === 'websearch' && (
        <WebSearchToolConfig onClose={onClose} />
      )}
    </div>
  );
}
