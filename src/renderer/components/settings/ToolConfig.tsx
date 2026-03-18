/**
 * 工具配置组件
 * 
 * 配置系统工具的参数（如图片生成工具、Web Search 工具）
 */

import React, { useState } from 'react';
import { 
  DEFAULT_IMAGE_GENERATION_CONFIG,
  IMAGE_GENERATION_PROVIDER_PRESETS 
} from '../../../shared/config/default-configs';
import { WebSearchToolConfig } from './WebSearchToolConfig';
import { BrowserToolConfig } from './BrowserToolConfig';

interface ToolConfigProps {
  onClose: () => void;
}

interface ImageGenerationConfig {
  provider: 'gemini' | 'qwen';
  model: string;
  apiUrl: string;
  apiKey: string;
}

export function ToolConfig({ onClose }: ToolConfigProps) {
  const [activeTab, setActiveTab] = useState<'image' | 'websearch' | 'email' | 'browser'>('image');
  const [imageGenConfig, setImageGenConfig] = useState<ImageGenerationConfig>({
    provider: DEFAULT_IMAGE_GENERATION_CONFIG.provider,
    model: DEFAULT_IMAGE_GENERATION_CONFIG.model,
    apiUrl: DEFAULT_IMAGE_GENERATION_CONFIG.apiUrl,
    apiKey: DEFAULT_IMAGE_GENERATION_CONFIG.apiKey,
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
        // 兼容旧配置格式，添加默认 provider 字段
        let provider: 'gemini' | 'qwen' = 'gemini';
        
        // 根据模型名称或已有的 provider 字段判断提供商
        if ((config as any).provider) {
          provider = (config as any).provider;
        } else if (config.model && config.model.includes('qwen-image')) {
          provider = 'qwen';
        }
        
        const configWithProvider = {
          provider,
          model: config.model,
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
        };
        setImageGenConfig(configWithProvider);
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

  // 当提供商改变时，更新默认 API 地址和模型
  const handleImageProviderChange = (newProvider: 'gemini' | 'qwen') => {
    const preset = IMAGE_GENERATION_PROVIDER_PRESETS[newProvider];

    setImageGenConfig({
      ...imageGenConfig,
      provider: newProvider,
      apiUrl: preset.baseUrl,
      model: preset.defaultModelId,
    });
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
          <button
            onClick={() => setActiveTab('browser')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'browser'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            浏览器
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'email'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            邮件发送
          </button>
        </nav>
      </div>

      {/* 图片生成工具配置 */}
      {activeTab === 'image' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-base font-medium text-gray-900 mb-2">图片生成工具配置</h4>
            <p className="text-sm text-gray-600 mb-4">
              配置图片生成工具使用的模型和 API 连接
            </p>
          </div>

          {/* 提供商选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              提供商
            </label>
            <select
              value={imageGenConfig.provider}
              onChange={(e) => handleImageProviderChange(e.target.value as 'gemini' | 'qwen')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="gemini">Google Gemini</option>
              <option value="qwen">Qwen Image</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              选择预设提供商
            </p>
          </div>

          {/* API 地址 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API 地址 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={imageGenConfig.apiUrl}
              onChange={(e) => setImageGenConfig({ ...imageGenConfig, apiUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              {imageGenConfig.provider === 'qwen'
                ? 'Qwen Image 图片生成 API 地址'
                : '预设提供商的 API 地址（可修改）'}
            </p>
          </div>

          {/* 模型 ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              模型 ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={imageGenConfig.model}
              onChange={(e) => setImageGenConfig({ ...imageGenConfig, model: e.target.value })}
              placeholder={
                imageGenConfig.provider === 'gemini' 
                  ? 'gemini-3-pro-image-preview' 
                  : 'qwen-image-2.0-pro'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              {imageGenConfig.provider === 'gemini' && '默认: gemini-3-pro-image-preview（可选: gemini-2.5-flash 等）'}
              {imageGenConfig.provider === 'qwen' && '推荐: qwen-image-2.0-pro（可选: qwen-image-2.0, qwen-image-max, qwen-image-plus）'}
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={imageGenConfig.apiKey}
              onChange={(e) => setImageGenConfig({ ...imageGenConfig, apiKey: e.target.value })}
              placeholder="输入 API Key"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              {imageGenConfig.provider === 'gemini' && '用于访问 Gemini API 的密钥'}
              {imageGenConfig.provider === 'qwen' && '用于访问 Qwen API 的密钥（DashScope API Key）'}
            </p>
          </div>

          {/* 保存按钮 */}
          <div className="flex justify-end pt-4 border-t">
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

      {/* 浏览器工具配置 */}
      {activeTab === 'browser' && (
        <BrowserToolConfig onClose={onClose} />
      )}

      {/* 邮件工具配置 */}
      {activeTab === 'email' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-base font-medium text-gray-900 mb-2">邮件发送工具配置</h4>
            <p className="text-sm text-gray-600 mb-4">
              邮件工具需要通过配置文件进行设置。你可以直接告诉 Agent 配置信息，它会帮你创建配置文件。
            </p>
          </div>

          {/* 配置说明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-blue-900 mb-2">📝 配置方法</h5>
            <p className="text-sm text-blue-800 mb-3">
              直接在聊天中告诉 Agent 你的邮箱配置信息，例如：
            </p>
            <div className="bg-white border border-blue-200 rounded p-3 text-sm font-mono text-gray-800">
              帮我配置邮件工具：<br/>
              - 邮箱：your-email@qq.com<br/>
              - 授权码：your-authorization-code<br/>
              - SMTP服务器：smtp.qq.com<br/>
              - 端口：465<br/>
              - 使用SSL：是<br/>
              - 发件人名称：你的名字
            </div>
          </div>

          {/* 配置文件位置 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">📂 配置文件位置</h5>
            <p className="text-sm text-gray-700 mb-2">
              配置文件将保存在：
            </p>
            <code className="block bg-gray-800 text-gray-100 px-3 py-2 rounded text-xs font-mono">
              ~/.deepbot/tools/email-tool/config.json
            </code>
          </div>

          {/* 配置文件格式 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">📋 配置文件格式</h5>
            <pre className="bg-gray-800 text-gray-100 px-3 py-2 rounded text-xs font-mono overflow-x-auto">
{`{
  "user": "your-email@example.com",
  "password": "your-password-or-auth-code",
  "smtpServer": "smtp.example.com",
  "smtpPort": 465,
  "useSsl": true,
  "fromName": "Your Name"
}`}
            </pre>
          </div>

          {/* 常见邮箱配置 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-3">📮 常见邮箱配置</h5>
            <div className="space-y-3">
              {/* QQ 邮箱 */}
              <details className="bg-white border border-gray-200 rounded p-3">
                <summary className="text-sm font-medium text-gray-900 cursor-pointer">QQ 邮箱</summary>
                <div className="mt-2 text-xs text-gray-700 space-y-1">
                  <p>• SMTP服务器：smtp.qq.com</p>
                  <p>• 端口：465</p>
                  <p>• 使用SSL：是</p>
                  <p className="text-orange-600">⚠️ 密码必须使用授权码，不是QQ密码</p>
                  <p className="text-blue-600">💡 获取授权码：QQ邮箱设置 → 账户 → POP3/IMAP/SMTP服务 → 生成授权码</p>
                </div>
              </details>

              {/* Gmail */}
              <details className="bg-white border border-gray-200 rounded p-3">
                <summary className="text-sm font-medium text-gray-900 cursor-pointer">Gmail</summary>
                <div className="mt-2 text-xs text-gray-700 space-y-1">
                  <p>• SMTP服务器：smtp.gmail.com</p>
                  <p>• 端口：465</p>
                  <p>• 使用SSL：是</p>
                  <p className="text-orange-600">⚠️ 需要开启两步验证并使用应用专用密码</p>
                </div>
              </details>

              {/* 163 邮箱 */}
              <details className="bg-white border border-gray-200 rounded p-3">
                <summary className="text-sm font-medium text-gray-900 cursor-pointer">163 邮箱</summary>
                <div className="mt-2 text-xs text-gray-700 space-y-1">
                  <p>• SMTP服务器：smtp.163.com</p>
                  <p>• 端口：465</p>
                  <p>• 使用SSL：是</p>
                  <p className="text-orange-600">⚠️ 密码必须使用授权码</p>
                </div>
              </details>

              {/* Outlook */}
              <details className="bg-white border border-gray-200 rounded p-3">
                <summary className="text-sm font-medium text-gray-900 cursor-pointer">Outlook / Hotmail</summary>
                <div className="mt-2 text-xs text-gray-700 space-y-1">
                  <p>• SMTP服务器：smtp-mail.outlook.com</p>
                  <p>• 端口：587</p>
                  <p>• 使用SSL：否（使用STARTTLS）</p>
                </div>
              </details>
            </div>
          </div>

          {/* 安全提示 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-yellow-900 mb-2">🔒 安全提示</h5>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>使用授权码而非邮箱登录密码</li>
              <li>配置文件会保存在本地，请妥善保管</li>
              <li>定期更换授权码以提高安全性</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
