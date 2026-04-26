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
import { showToast } from '../../utils/toast';
import { ApiKeyHelpModal } from './ApiKeyHelpModal';
import { getLanguage } from '../../i18n';

// 可供用户禁用的工具列表
const TOGGLEABLE_TOOLS_ZH: Array<{ name: string; label: string; description: string }> = [
  { name: 'image_generation', label: '图片生成', description: '内置图片生成工具' },
  { name: 'web_search', label: '网络搜索', description: '内置网络搜索工具' },
  { name: 'browser', label: '浏览器控制', description: '通过 Chrome 远程调试控制浏览器' },
  { name: 'calendar_get_events', label: '日历读取', description: '读取 macOS 日历事件' },
  { name: 'calendar_create_event', label: '日历创建', description: '在 macOS 日历中创建事件' },
];

const TOGGLEABLE_TOOLS_EN: Array<{ name: string; label: string; description: string }> = [
  { name: 'image_generation', label: 'Image Generation', description: 'Built-in image generation tool' },
  { name: 'web_search', label: 'Web Search', description: 'Built-in web search tool' },
  { name: 'browser', label: 'Browser Control', description: 'Control browser via Chrome remote debugging' },
  { name: 'calendar_get_events', label: 'Calendar Read', description: 'Read macOS calendar events' },
  { name: 'calendar_create_event', label: 'Calendar Create', description: 'Create events in macOS calendar' },
];

interface ToolConfigProps {
  onClose: () => void;
}

interface ImageGenerationConfig {
  provider: 'deepbot' | 'gemini' | 'qwen';
  model: string;
  apiUrl: string;
  apiKey: string;
}

export function ToolConfig({ onClose }: ToolConfigProps) {
  const lang = getLanguage();
  const [activeTab, setActiveTab] = useState<'image' | 'websearch' | 'email' | 'browser' | 'manage'>('image');
  const [showApiKeyHelp, setShowApiKeyHelp] = useState(false);
  const [imageGenConfig, setImageGenConfig] = useState<ImageGenerationConfig>({
    provider: DEFAULT_IMAGE_GENERATION_CONFIG.provider,
    model: DEFAULT_IMAGE_GENERATION_CONFIG.model,
    apiUrl: DEFAULT_IMAGE_GENERATION_CONFIG.apiUrl,
    apiKey: DEFAULT_IMAGE_GENERATION_CONFIG.apiKey,
  });
  const [disabledTools, setDisabledTools] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const hasLoadedRef = React.useRef(false);

  const TOGGLEABLE_TOOLS = lang === 'zh' ? TOGGLEABLE_TOOLS_ZH : TOGGLEABLE_TOOLS_EN;

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
        let provider: 'deepbot' | 'gemini' | 'qwen' = 'gemini';
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
        showToast('success', lang === 'zh' ? '已保存，Agent 将在下次对话时使用新工具配置' : 'Saved. Agent will use the new tool config in the next conversation');
      } else {
        showToast('error', result.error || (lang === 'zh' ? '保存失败' : 'Save failed'));
      }
    } catch (error) {
      showToast('error', lang === 'zh' ? '保存失败' : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // 当提供商改变时，更新默认 API 地址和模型
  const handleImageProviderChange = (newProvider: 'deepbot' | 'deepbot-gpt' | 'qwen') => {
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
      showToast('error', lang === 'zh' ? '请输入模型名称' : 'Please enter model name');
      return;
    }
    if (!imageGenConfig.apiUrl.trim()) {
      showToast('error', lang === 'zh' ? '请输入 API 地址' : 'Please enter API URL');
      return;
    }
    if (!imageGenConfig.apiKey.trim()) {
      showToast('error', lang === 'zh' ? '请输入 API Key' : 'Please enter API Key');
      return;
    }

    setSaving(true);

    try {
      await api.saveImageGenerationToolConfig(imageGenConfig);
      showToast('success', lang === 'zh' ? '配置保存成功' : 'Configuration saved');
    } catch (error) {
      showToast('error', lang === 'zh'
        ? `保存失败: ${error instanceof Error ? error.message : '未知错误'}`
        : `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{lang === 'zh' ? '加载中...' : 'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{lang === 'zh' ? '工具配置' : 'Tool Configuration'}</h3>
        <p className="text-sm text-gray-500">
          {lang === 'zh' ? '配置系统工具的参数和连接信息' : 'Configure tool parameters and connection settings'}
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1">
          <button
            onClick={() => setActiveTab('image')}
            className={`settings-tab ${activeTab === 'image' ? 'active' : ''}`}
          >
            {lang === 'zh' ? '图片生成' : 'Image Generation'}
          </button>
          <button
            onClick={() => setActiveTab('websearch')}
            className={`settings-tab ${activeTab === 'websearch' ? 'active' : ''}`}
          >
            {lang === 'zh' ? '网络搜索' : 'Web Search'}
          </button>
          <button
            onClick={() => setActiveTab('browser')}
            className={`settings-tab ${activeTab === 'browser' ? 'active' : ''}`}
          >
            {lang === 'zh' ? '浏览器' : 'Browser'}
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`settings-tab ${activeTab === 'email' ? 'active' : ''}`}
          >
            {lang === 'zh' ? '邮件发送' : 'Email'}
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`settings-tab ${activeTab === 'manage' ? 'active' : ''}`}
          >
            {lang === 'zh' ? '工具管理' : 'Tool Management'}
          </button>
        </nav>
      </div>

      {/* 图片生成工具配置 */}
      {activeTab === 'image' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-base font-medium text-gray-900 mb-2">{lang === 'zh' ? '图片生成工具配置' : 'Image Generation Tool Config'}</h4>
            <p className="text-sm text-gray-600 mb-4">
              {lang === 'zh'
                ? '配置 AI 图片生成能力，支持根据文字描述或参考图生成图片。如需调用其他提供商，可通过安装 Skill 扩展。'
                : 'Configure AI image generation. Supports generating images from text descriptions or reference images. Install Skills to use other providers.'}
            </p>
          </div>

          {/* 提供商选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {lang === 'zh' ? '提供商' : 'Provider'}
            </label>
            <select
              value={imageGenConfig.provider}
              onChange={(e) => handleImageProviderChange(e.target.value as 'deepbot' | 'deepbot-gpt' | 'qwen')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="deepbot">DeepBot（Nano banana 2）</option>
              <option value="deepbot-gpt">DeepBot（GPT Image 2）</option>
              <option value="qwen">Qwen Image</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {lang === 'zh' ? '选择预设提供商' : 'Select a preset provider'}
            </p>
          </div>

          {/* API 地址 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {lang === 'zh' ? 'API 地址' : 'API URL'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={imageGenConfig.apiUrl}
              onChange={(e) => setImageGenConfig({ ...imageGenConfig, apiUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              {imageGenConfig.provider === 'deepbot' && (lang === 'zh' ? '无需魔法，直连 Nano Banana 2' : 'Direct connection to Nano Banana 2, no proxy needed')}
              {imageGenConfig.provider === 'deepbot-gpt' && (lang === 'zh' ? '无需魔法，直连 GPT Image 2' : 'Direct connection to GPT Image 2, no proxy needed')}
              {imageGenConfig.provider === 'qwen' && (lang === 'zh' ? 'Qwen Image 图片生成 API 地址' : 'Qwen Image generation API URL')}
            </p>
          </div>

          {/* 模型 ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {lang === 'zh' ? '模型 ID' : 'Model ID'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={imageGenConfig.model}
              onChange={(e) => setImageGenConfig({ ...imageGenConfig, model: e.target.value })}
              disabled={imageGenConfig.provider === 'deepbot' || imageGenConfig.provider === 'deepbot-gpt'}
              placeholder={
                imageGenConfig.provider === 'qwen'
                  ? 'qwen-image-2.0-pro'
                  : 'gemini-3.1-flash-image-preview'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500">
              {imageGenConfig.provider === 'deepbot' && (lang === 'zh' ? '默认: gemini-3.1-flash-image-preview' : 'Default: gemini-3.1-flash-image-preview')}
              {imageGenConfig.provider === 'deepbot-gpt' && (lang === 'zh' ? '默认: openai/gpt-image-2' : 'Default: openai/gpt-image-2')}
              {imageGenConfig.provider === 'qwen' && (lang === 'zh' ? '推荐: qwen-image-2.0-pro（可选: qwen-image-2.0, qwen-image-max, qwen-image-plus）' : 'Recommended: qwen-image-2.0-pro (options: qwen-image-2.0, qwen-image-max, qwen-image-plus)')}
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
              value={imageGenConfig.apiKey}
              onChange={(e) => setImageGenConfig({ ...imageGenConfig, apiKey: e.target.value })}
              placeholder={lang === 'zh' ? '输入 API Key' : 'Enter API Key'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              {imageGenConfig.provider === 'deepbot' && (lang === 'zh' ? '点击「如何获取」获得 API Key，或使用自己的 Gemini API Key' : 'Click "How to get" for an API Key, or use your own Gemini API Key')}
              {imageGenConfig.provider === 'deepbot-gpt' && (lang === 'zh' ? '点击「如何获取」获得 API Key，或使用自己的 AtlasCloud API Key' : 'Click "How to get" for an API Key, or use your own AtlasCloud API Key')}
              {imageGenConfig.provider === 'qwen' && (lang === 'zh' ? '用于访问 Qwen API 的密钥（DashScope API Key）' : 'Key for accessing Qwen API (DashScope API Key)')}
            </p>
          </div>

          {/* 保存按钮 */}
          <div className="flex justify-end pt-4 border-t">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
            >
              {saving ? (lang === 'zh' ? '保存中...' : 'Saving...') : (lang === 'zh' ? '保存配置' : 'Save Config')}
            </button>
          </div>
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
            <h4 className="text-base font-medium text-gray-900 mb-2">{lang === 'zh' ? '邮件收发工具' : 'Email Tool'}</h4>
            <p className="text-sm text-gray-600 mb-4">
              {lang === 'zh'
                ? <>推荐使用 <strong>imap-smtp-email-chinese</strong> Skill，支持 IMAP 收件、SMTP 发件，兼容 Gmail、Outlook、163、QQ 等主流邮箱。</>
                : <>Recommended: <strong>imap-smtp-email-chinese</strong> Skill. Supports IMAP receive and SMTP send, compatible with Gmail, Outlook, 163, QQ and more.</>}
            </p>
          </div>

          {/* 安装 */}
          <div className="settings-alert settings-alert-info">
            <h5 className="text-sm font-semibold text-blue-900 mb-2">{lang === 'zh' ? '📦 安装' : '📦 Install'}</h5>
            <p className="text-sm text-blue-800 mb-2">
              {lang === 'zh'
                ? <>打开聊天界面的 <code className="bg-blue-100 px-1 rounded">[skill]</code> 按钮，搜索「imap-smtp-email-chinese」，点击安装。</>
                : <>Open the <code className="bg-blue-100 px-1 rounded">[skill]</code> button in the chat interface, search for "imap-smtp-email-chinese", and click Install.</>}
            </p>
          </div>

          {/* 配置 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">{lang === 'zh' ? '⚙️ 配置' : '⚙️ Configuration'}</h5>
            <p className="text-sm text-gray-700 mb-3">
              {lang === 'zh' ? '三种方式任选其一：' : 'Choose one of three methods:'}
            </p>
            <div className="space-y-2 mb-3">
              <div className="text-sm text-gray-700">
                {lang === 'zh'
                  ? <><strong>方式一：</strong>直接告诉 DeepBot 配置信息，它会自动写入 .env 文件</>
                  : <><strong>Method 1:</strong> Tell DeepBot the config info directly, it will write to the .env file automatically</>}
              </div>
              <div className="bg-white border border-gray-200 rounded p-2 text-xs font-mono text-gray-800">
                {lang === 'zh'
                  ? '帮我配置 imap-smtp-email-chinese skill，邮箱是 your@163.com，授权码是 xxxx，使用 163 邮箱'
                  : 'Configure imap-smtp-email-chinese skill, email is your@163.com, auth code is xxxx, using 163 mail'}
              </div>
              <div className="text-sm text-gray-700 mt-2">
                {lang === 'zh'
                  ? <><strong>方式二：</strong>在 Skill 管理器中点击「环境变量」按钮编辑，配置会保存到 Skill 目录下的 <code className="bg-gray-200 px-1 rounded">.env</code> 文件</>
                  : <><strong>Method 2:</strong> Click the "Environment Variables" button in Skill Manager to edit. Config is saved to the <code className="bg-gray-200 px-1 rounded">.env</code> file in the Skill directory</>}
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-2">
              {lang === 'zh' ? '.env 文件格式参考：' : '.env file format reference:'}
            </p>
            <pre className="bg-gray-800 text-gray-100 px-3 py-2 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{lang === 'zh'
  ? `# IMAP 收件配置
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
SMTP_FROM=your@163.com`
  : `# IMAP receive config
IMAP_HOST=imap.163.com
IMAP_PORT=993
IMAP_USER=your@163.com
IMAP_PASS=your_auth_code
IMAP_TLS=true

# SMTP send config
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
            <h5 className="text-sm font-semibold text-gray-900 mb-3">{lang === 'zh' ? '📮 常见邮箱服务器' : '📮 Common Email Servers'}</h5>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="text-left p-2 border border-gray-300">{lang === 'zh' ? '邮箱' : 'Email'}</th>
                    <th className="text-left p-2 border border-gray-300">{lang === 'zh' ? 'IMAP 服务器' : 'IMAP Server'}</th>
                    <th className="text-left p-2 border border-gray-300">{lang === 'zh' ? 'SMTP 服务器' : 'SMTP Server'}</th>
                    <th className="text-left p-2 border border-gray-300">{lang === 'zh' ? 'SMTP 端口' : 'SMTP Port'}</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  {[
                    ['163.com', 'imap.163.com', 'smtp.163.com', '465'],
                    ['126.com', 'imap.126.com', 'smtp.126.com', '465'],
                    ['QQ Mail', 'imap.qq.com', 'smtp.qq.com', '587'],
                    [lang === 'zh' ? '腾讯企业邮' : 'Tencent Biz Mail', 'imap.exmail.qq.com', 'smtp.exmail.qq.com', '465'],
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
            <h5 className="text-sm font-semibold text-gray-900 mb-2">{lang === 'zh' ? '💬 使用示例' : '💬 Usage Examples'}</h5>
            <div className="space-y-2 text-sm text-gray-700">
              {lang === 'zh' ? (
                <>
                  <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">发送邮件给 xxx@163.com，主题"会议纪要"，内容是今天的会议记录</div>
                  <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">检查收件箱最新 10 封未读邮件</div>
                  <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">搜索来自 boss@company.com 的邮件</div>
                  <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">发送邮件并附上 /path/to/report.pdf</div>
                </>
              ) : (
                <>
                  <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">Send an email to xxx@163.com, subject "Meeting Notes", content is today's meeting summary</div>
                  <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">Check the latest 10 unread emails in inbox</div>
                  <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">Search for emails from boss@company.com</div>
                  <div className="bg-white border border-gray-200 rounded p-2 font-mono text-xs">Send an email with attachment /path/to/report.pdf</div>
                </>
              )}
            </div>
          </div>

          {/* 安全提示 */}
          <div className="settings-alert settings-alert-warning">
            <h5 className="text-sm font-semibold text-yellow-900 mb-2">{lang === 'zh' ? '🔒 安全提示' : '🔒 Security Tips'}</h5>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              {lang === 'zh' ? (
                <>
                  <li>163/QQ 邮箱需使用<strong>授权码</strong>，不是登录密码</li>
                  <li>Gmail 需开启两步验证并使用<strong>应用专用密码</strong></li>
                  <li>配置保存在 Skill 目录的 .env 文件中，请妥善保管</li>
                </>
              ) : (
                <>
                  <li>163/QQ Mail requires an <strong>authorization code</strong>, not your login password</li>
                  <li>Gmail requires 2-step verification and an <strong>app-specific password</strong></li>
                  <li>Config is saved in the .env file in the Skill directory — keep it safe</li>
                </>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* 工具管理 */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-base font-medium text-gray-900 mb-2">{lang === 'zh' ? '工具管理' : 'Tool Management'}</h4>
            <p className="text-sm text-gray-600 mb-4">
              {lang === 'zh'
                ? '勾选表示启用，取消勾选表示禁用。保存后立即生效。如果你已安装对应功能的 Skill，可以关闭内置工具，优先使用 Skill。'
                : 'Check to enable, uncheck to disable. Changes take effect after saving. If you have installed a Skill with the same functionality, you can disable the built-in tool and use the Skill instead.'}
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
              {saving ? (lang === 'zh' ? '保存中...' : 'Saving...') : (lang === 'zh' ? '保存配置' : 'Save Config')}
            </button>
          </div>
        </div>
      )}
      {/* 如何获取 API Key 模态框 */}
      {showApiKeyHelp && <ApiKeyHelpModal onClose={() => setShowApiKeyHelp(false)} />}
    </div>
  );
}
