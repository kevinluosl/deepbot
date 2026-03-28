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
import { api } from '../../api';

// 可供用户禁用的工具列表
const TOGGLEABLE_TOOLS: Array<{ name: string; label: string; description: string }> = [
  { name: 'image_generation', label: '图片生成', description: '内置 Gemini/Qwen 图片生成工具' },
  { name: 'web_search', label: '网络搜索', description: '内置网络搜索工具' },
  { name: 'browser', label: '浏览器控制', description: '通过 Chrome 远程调试控制浏览器' },
  { name: 'calendar_get_events', label: '日历读取', description: '读取 macOS 日历事件' },
  { name: 'calendar_create_event', label: '日历创建', description: '在 macOS 日历中创建事件' },
];

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
  const [activeTab, setActiveTab] = useState<'image' | 'websearch' | 'email' | 'browser' | 'manage'>('image');
  const [imageGenConfig, setImageGenConfig] = useState<ImageGenerationConfig>({
    provider: DEFAULT_IMAGE_GENERATION_CONFIG.provider,
    model: DEFAULT_IMAGE_GENERATION_CONFIG.model,
    apiUrl: DEFAULT_IMAGE_GENERATION_CONFIG.apiUrl,
    apiKey: DEFAULT_IMAGE_GENERATION_CONFIG.apiKey,
  });
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set());
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
      const [imageConfig, disabledResult] = await Promise.all([
        api.getImageGenerationToolConfig(),
        api.getDisabledTools(),
      ]);
      if (imageConfig) {
        // 兼容旧配置格式，添加默认 provider 字段
        let provider: 'gemini' | 'qwen' = 'gemini';
        if ((imageConfig as any).provider) {
          provider = (imageConfig as any).provider;
        } else if (imageConfig.model && imageConfig.model.includes('qwen-image')) {
          provider = 'qwen';
        }
        setImageGenConfig({
          provider,
          model: imageConfig.model,
          apiUrl: imageConfig.apiUrl,
          apiKey: imageConfig.apiKey,
        });
      }
      if (disabledResult.success && disabledResult.disabledTools) {
        setDisabledTools(new Set(disabledResult.disabledTools));
      }
    } catch (error) {
      console.error('加载工具配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTool = (toolName: string, currentlyDisabled: boolean) => {
    setDisabledTools(prev => {
      const next = new Set(prev);
      if (currentlyDisabled) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  };

  const handleSaveToolManage = async () => {
    setSaving(true);
    try {
      const result = await api.saveDisabledTools(Array.from(disabledTools));
      if (result.success) {
        showMessage('success', '已保存，Agent 将在下次对话时使用新工具配置');
      } else {
        showMessage('error', result.error || '保存失败');
      }
    } catch (error) {
      showMessage('error', '保存失败');
    } finally {
      setSaving(false);
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
      await api.saveImageGenerationToolConfig(imageGenConfig);
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
          <button
            onClick={() => setActiveTab('manage')}
            className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'manage'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            工具管理
          </button>
        </nav>
      </div>

      {/* 图片生成工具配置 */}
      {activeTab === 'image' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-base font-medium text-gray-900 mb-2">图片生成工具配置</h4>
            <p className="text-sm text-gray-600 mb-4">
              系统内置 Gemini 和 Qwen 两个图片生成提供商，可在下方切换。如需调用其他提供商，可通过安装 Skill 扩展。
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
              <option value="gemini">Google Gemini (nana banana pro)</option>
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
            <h4 className="text-base font-medium text-gray-900 mb-2">邮件收发工具</h4>
            <p className="text-sm text-gray-600 mb-4">
              推荐使用 <strong>imap-smtp-email-chinese</strong> Skill，支持 IMAP 收件、SMTP 发件，兼容 Gmail、Outlook、163、QQ 等主流邮箱。
            </p>
          </div>

          {/* 安装 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-blue-900 mb-2">📦 安装</h5>
            <p className="text-sm text-blue-800 mb-2">
              打开聊天界面的 <code className="bg-blue-100 px-1 rounded">[skill]</code> 按钮，搜索「imap-smtp-email-chinese」，点击安装。
            </p>
          </div>

          {/* 配置 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">⚙️ 配置</h5>
            <p className="text-sm text-gray-700 mb-3">
              三种方式任选其一：
            </p>
            <div className="space-y-2 mb-3">
              <div className="text-sm text-gray-700">
                <strong>方式一：</strong>直接告诉 DeepBot 配置信息，它会自动写入 .env 文件
              </div>
              <div className="bg-white border border-gray-200 rounded p-2 text-xs font-mono text-gray-800">
                帮我配置 imap-smtp-email-chinese skill，邮箱是 your@163.com，授权码是 xxxx，使用 163 邮箱
              </div>
              <div className="text-sm text-gray-700 mt-2">
                <strong>方式二：</strong>在 Skill 管理器中点击「环境变量」按钮编辑，配置会保存到 Skill 目录下的 <code className="bg-gray-200 px-1 rounded">.env</code> 文件
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-2">
              .env 文件格式参考：
            </p>
            <pre className="bg-gray-800 text-gray-100 px-3 py-2 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`# IMAP 收件配置
IMAP_HOST=imap.163.com
IMAP_PORT=993
IMAP_USER=your@163.com
IMAP_PASS=your_auth_code
IMAP_TLS=true

# SMTP 发件配置
SMTP_HOST=smtp.163.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@163.com
SMTP_PASS=your_auth_code
SMTP_FROM=your@163.com`}
            </pre>
          </div>

          {/* 常见邮箱服务器 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-3">📮 常见邮箱服务器</h5>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="text-left p-2 border border-gray-300">邮箱</th>
                    <th className="text-left p-2 border border-gray-300">IMAP 服务器</th>
                    <th className="text-left p-2 border border-gray-300">SMTP 服务器</th>
                    <th className="text-left p-2 border border-gray-300">SMTP 端口</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  {[
                    ['163.com', 'imap.163.com', 'smtp.163.com', '465'],
                    ['126.com', 'imap.126.com', 'smtp.126.com', '465'],
                    ['QQ Mail', 'imap.qq.com', 'smtp.qq.com', '587'],
                    ['腾讯企业邮', 'imap.exmail.qq.com', 'smtp.exmail.qq.com', '465'],
                    ['Gmail', 'imap.gmail.com', 'smtp.gmail.com', '587'],
                    ['Outlook', 'outlook.office365.com', 'smtp.office365.com', '587'],
                  ].map(([name, imap, smtp, port]) => (
                    <tr key={name} className="border-b border-gray-200">
                      <td className="p-2 border border-gray-300 font-medium">{name}</td>
                      <td className="p-2 border border-gray-300 font-mono">{imap}</td>
                      <td className="p-2 border border-gray-300 font-mono">{smtp}</td>
                      <td className="p-2 border border-gray-300">{port}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 使用示例 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">💬 使用示例</h5>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">发送邮件给 xxx@163.com，主题"会议纪要"，内容是今天的会议记录</div>
              <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">检查收件箱最新 10 封未读邮件</div>
              <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">搜索来自 boss@company.com 的邮件</div>
              <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">发送邮件并附上 /path/to/report.pdf</div>
            </div>
          </div>

          {/* 安全提示 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-yellow-900 mb-2">🔒 安全提示</h5>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>163/QQ 邮箱需使用<strong>授权码</strong>，不是登录密码</li>
              <li>Gmail 需开启两步验证并使用<strong>应用专用密码</strong></li>
              <li>配置保存在 Skill 目录的 .env 文件中，请妥善保管</li>
            </ul>
          </div>
        </div>
      )}
      {/* 工具管理 */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-base font-medium text-gray-900 mb-1">工具管理</h4>
            <p className="text-sm text-gray-500">
              勾选表示启用，取消勾选表示禁用。点击保存后立即生效，Agent 将重新加载工具列表。如果你已安装对应功能的 Skill，可以关闭内置工具，优先使用 Skill。
            </p>
          </div>
          <div className="space-y-2">
            {TOGGLEABLE_TOOLS.map(tool => {
              const isDisabled = disabledTools.has(tool.name);
              return (
                <label
                  key={tool.name}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={!isDisabled}
                    onChange={() => handleToggleTool(tool.name, isDisabled)}
                    className="w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{tool.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{tool.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end pt-4 border-t">
            <button
              onClick={handleSaveToolManage}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
          </div>
          {message && (
            <div className={`p-3 rounded-md text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
