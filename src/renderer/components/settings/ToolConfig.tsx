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
import { MediaAnalysisToolConfig } from './MediaAnalysisToolConfig';
import { DocAnalysisToolConfig } from './DocAnalysisToolConfig';
import { api } from '../../api';
import { showToast } from '../../utils/toast';
import { ApiKeyHelpModal } from './ApiKeyHelpModal';
import { getLanguage } from '../../i18n';

// 可供用户禁用的工具列表
const TOGGLEABLE_TOOLS_ZH: Array<{ name: string; label: string; description: string }> = [
  { name: 'image_generation', label: '图片生成', description: '内置图片生成工具' },
  { name: 'web_search', label: '网络搜索', description: '内置网络搜索工具' },
  { name: 'media_analysis', label: '图片/视频分析', description: '图片/视频内容分析（仅 DeepBot 供应商）' },
  { name: 'doc_analysis', label: '文档分析', description: '使用 markitdown 读取 PDF/Word/Excel/PPT 等文档' },
  { name: 'browser', label: '浏览器控制', description: '通过 Chrome 远程调试控制浏览器' },
  { name: 'calendar_get_events', label: '日历读取', description: '读取 macOS 日历事件' },
  { name: 'calendar_create_event', label: '日历创建', description: '在 macOS 日历中创建事件' },
];

const TOGGLEABLE_TOOLS_EN: Array<{ name: string; label: string; description: string }> = [
  { name: 'image_generation', label: 'Image Generation', description: 'Built-in image generation tool' },
  { name: 'web_search', label: 'Web Search', description: 'Built-in web search tool' },
  { name: 'media_analysis', label: 'Image/Video Analysis', description: 'Image/video content analysis (DeepBot provider only)' },
  { name: 'doc_analysis', label: 'Document Analysis', description: 'Read PDF/Word/Excel/PPT documents using markitdown' },
  { name: 'browser', label: 'Browser Control', description: 'Control browser via Chrome remote debugging' },
  { name: 'calendar_get_events', label: 'Calendar Read', description: 'Read macOS calendar events' },
  { name: 'calendar_create_event', label: 'Calendar Create', description: 'Create events in macOS calendar' },
];

interface ToolConfigProps {
  onClose: () => void;
}

interface ImageGenerationConfig {
  provider: 'deepbot' | 'deepbot-gpt' | 'gemini' | 'qwen';
  model: string;
  apiUrl: string;
  apiKey: string;
}

export function ToolConfig({ onClose }: ToolConfigProps) {
  const lang = getLanguage();
  const [activeTab, setActiveTab] = useState<'image' | 'websearch' | 'media' | 'doc' | 'browser' | 'manage'>('image');
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
        let provider: 'deepbot' | 'deepbot-gpt' | 'gemini' | 'qwen' = 'gemini';
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
            onClick={() => setActiveTab('media')}
            className={`settings-tab ${activeTab === 'media' ? 'active' : ''}`}
          >
            {lang === 'zh' ? '图片/视频分析' : 'Image/Video Analysis'}
          </button>
          <button
            onClick={() => setActiveTab('doc')}
            className={`settings-tab ${activeTab === 'doc' ? 'active' : ''}`}
          >
            {lang === 'zh' ? '文档分析' : 'Doc Analysis'}
          </button>
          <button
            onClick={() => setActiveTab('browser')}
            className={`settings-tab ${activeTab === 'browser' ? 'active' : ''}`}
          >
            {lang === 'zh' ? '浏览器' : 'Browser'}
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
              {imageGenConfig.provider === 'deepbot' && (lang === 'zh' ? '点击「如何获取」获得 API Key' : 'Click "How to get" for an API Key')}
              {imageGenConfig.provider === 'deepbot-gpt' && (lang === 'zh' ? '点击「如何获取」获得 API Key' : 'Click "How to get" for an API Key')}
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

      {/* 多媒体分析工具配置 */}
      {activeTab === 'media' && (
        <MediaAnalysisToolConfig onClose={onClose} />
      )}

      {/* 文档分析工具配置 */}
      {activeTab === 'doc' && (
        <DocAnalysisToolConfig onClose={onClose} />
      )}

      {/* 浏览器工具配置 */}
      {activeTab === 'browser' && (
        <BrowserToolConfig onClose={onClose} />
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
