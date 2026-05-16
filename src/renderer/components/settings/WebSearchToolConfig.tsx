/**
 * Web Search 工具配置页面（Tavily Search API）
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { showToast } from '../../utils/toast';
import { getLanguage } from '../../i18n';

interface WebSearchToolConfig {
  apiKey: string;
}

interface WebSearchToolConfigProps {
  onClose?: () => void;
}

export function WebSearchToolConfig({ onClose }: WebSearchToolConfigProps) {
  const lang = getLanguage();
  const [config, setConfig] = useState<WebSearchToolConfig>({ apiKey: '' });
  const [isSaving, setIsSaving] = useState(false);
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
        setConfig({ apiKey: result.config.apiKey || '' });
      }
    } catch (error) {
      console.error('加载 Web Search 工具配置失败:', error);
    }
  };

  const handleSave = async () => {
    if (!config.apiKey || !config.apiKey.trim()) {
      showToast('error', lang === 'zh' ? '请输入 Tavily API Key' : 'Please enter Tavily API Key');
      return;
    }

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
      {/* 标题和说明 */}
      <div>
        <h4 className="text-base font-medium text-gray-900 mb-2">
          {lang === 'zh' ? 'Web Search 工具配置' : 'Web Search Tool Config'}
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          {lang === 'zh'
            ? '使用 Tavily Search API 获取实时网络信息、新闻、天气等数据。'
            : 'Use Tavily Search API to get real-time web information, news, weather, and more.'}
        </p>

        {/* 注册说明 */}
        <div style={{
          padding: '12px 14px',
          background: 'rgba(59, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '6px',
          fontSize: '12px',
          color: 'var(--settings-text-dim)',
          lineHeight: '2',
          marginBottom: '16px',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--settings-accent)', marginBottom: '6px' }}>
            {lang === 'zh' ? '💡 如何获取免费 API Key' : '💡 How to get a free API Key'}
          </div>
          {lang === 'zh' ? (
            <>
              1. 访问{' '}
              <a
                href="https://tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--settings-accent)', textDecoration: 'underline' }}
              >
                https://tavily.com
              </a>
              {' '}注册免费账号<br />
              2. 登录后在控制台复制 API Key<br />
              3. 免费套餐每月 1000 次搜索，无需信用卡
            </>
          ) : (
            <>
              1. Visit{' '}
              <a
                href="https://tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--settings-accent)', textDecoration: 'underline' }}
              >
                https://tavily.com
              </a>
              {' '}and sign up for free<br />
              2. Copy your API Key from the dashboard<br />
              3. Free plan: 1,000 searches/month, no credit card required
            </>
          )}
        </div>
      </div>

      {/* API Key 输入 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tavily API Key <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={config.apiKey}
          onChange={(e) => setConfig({ apiKey: e.target.value })}
          placeholder="tvly-..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          {lang === 'zh'
            ? '在 tavily.com 控制台获取，格式通常为 tvly- 开头'
            : 'Get from tavily.com dashboard, usually starts with tvly-'}
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
    </div>
  );
}
