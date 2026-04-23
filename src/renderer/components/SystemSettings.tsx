/**
 * 系统设置页面
 * 
 * 左右布局：
 * - 左侧：菜单列表
 * - 右侧：设置内容
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { APP_VERSION } from '../../shared/constants/version';
import { getPendingUpdate, onPendingUpdateChange, clearPendingUpdate } from '../utils/update-store';
import { QuickStart } from './settings/QuickStart';
import { ModelConfig } from './settings/ModelConfig';
import { EnvironmentConfig } from './settings/EnvironmentConfig';
import { WorkspaceConfig } from './settings/WorkspaceConfig';
import { ToolConfig } from './settings/ToolConfig';
import { ConnectorConfig } from './settings/ConnectorConfig';
import { AppVersion } from './settings/AppVersion';
import { Subscription } from './settings/Subscription';
import { t, getLanguage, setLanguage as saveLanguage, type Language } from '../i18n';
import { api } from '../api';
import '../styles/settings.css';

type SettingsTab = 'quickstart' | 'model' | 'environment' | 'workspace' | 'tools' | 'connectors' | 'version' | 'subscription';

interface SystemSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  activeTabId?: string; // 当前选中的 Tab ID
}

// 语言快速切换组件
function LanguageToggle() {
  const [lang, setLang] = useState<Language>(getLanguage);
  
  const handleSwitch = (next: Language) => {
    if (next === lang) return;
    setLang(next);
    saveLanguage(next);
    document.documentElement.setAttribute('data-lang', next);
    api.saveAppSetting('language', next).catch(() => {});
    // 强制刷新整个设置页面以切换语言
    window.dispatchEvent(new Event('deepbot-lang-change'));
  };
  
  return (
    <div style={{ display: 'flex', gap: '2px', border: '1px solid var(--settings-border)', borderRadius: '4px', overflow: 'hidden' }}>
      <button
        onClick={() => handleSwitch('zh')}
        style={{
          background: lang === 'zh' ? 'var(--settings-accent)' : 'transparent',
          color: lang === 'zh' ? '#fff' : 'var(--settings-text-dim)',
          border: 'none',
          padding: '2px 8px',
          fontSize: '11px',
          cursor: 'pointer',
          fontWeight: lang === 'zh' ? '600' : '400',
          transition: 'all 0.15s',
        }}
      >
        中
      </button>
      <button
        onClick={() => handleSwitch('en')}
        style={{
          background: lang === 'en' ? 'var(--settings-accent)' : 'transparent',
          color: lang === 'en' ? '#fff' : 'var(--settings-text-dim)',
          border: 'none',
          padding: '2px 8px',
          fontSize: '11px',
          cursor: 'pointer',
          fontWeight: lang === 'en' ? '600' : '400',
          transition: 'all 0.15s',
        }}
      >
        EN
      </button>
    </div>
  );
}

export function SystemSettings({ isOpen, onClose, activeTabId }: SystemSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('quickstart');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [pendingUpdateInfo, setPendingUpdateInfo] = useState<{ version: string } | null>(null);
  const [, forceUpdate] = useState(0);

  // 监听语言切换事件，强制刷新界面
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1);
    window.addEventListener('deepbot-lang-change', handler);
    return () => window.removeEventListener('deepbot-lang-change', handler);
  }, []);

  useEffect(() => {
    const existing = getPendingUpdate();
    if (existing) {
      setHasUpdate(true);
      setPendingUpdateInfo(existing);
    }
    const unsub = onPendingUpdateChange((info) => {
      setHasUpdate(true);
      setPendingUpdateInfo(info);
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-container">
        {/* 标题栏 */}
        <div className="settings-header">
          <h2 className="settings-title">{t('settings.title')}</h2>
          <button onClick={onClose} className="settings-close-button">
            <X size={20} />
          </button>
        </div>

        {/* 主内容区域 */}
        <div className="settings-content">
          {/* 左侧菜单 */}
          <div className="settings-sidebar">
            <nav className="settings-nav">
              <button
                onClick={() => setActiveTab('quickstart')}
                className={`settings-nav-item ${activeTab === 'quickstart' ? 'active' : ''}`}
              >
                {t('settings.quickstart')}
              </button>
              <button
                onClick={() => setActiveTab('model')}
                className={`settings-nav-item ${activeTab === 'model' ? 'active' : ''}`}
              >
                {t('settings.model')}
              </button>
              <button
                onClick={() => setActiveTab('environment')}
                className={`settings-nav-item ${activeTab === 'environment' ? 'active' : ''}`}
              >
                {t('settings.environment')}
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={`settings-nav-item ${activeTab === 'tools' ? 'active' : ''}`}
              >
                {t('settings.tools')}
              </button>
              <button
                onClick={() => setActiveTab('workspace')}
                className={`settings-nav-item ${activeTab === 'workspace' ? 'active' : ''}`}
              >
                {t('settings.workspace')}
              </button>
              <button
                onClick={() => setActiveTab('connectors')}
                className={`settings-nav-item ${activeTab === 'connectors' ? 'active' : ''}`}
              >
                {t('settings.connectors')}
              </button>
              <button
                onClick={() => { setActiveTab('version'); setHasUpdate(false); clearPendingUpdate(); }}
                className={`settings-nav-item ${activeTab === 'version' ? 'active' : ''}`}
                style={{ position: 'relative' }}
              >
                {t('settings.version')}
                {hasUpdate && (
                  <span style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--settings-accent)',
                  }} />
                )}
              </button>
              <button
                onClick={() => setActiveTab('subscription')}
                className={`settings-nav-item ${activeTab === 'subscription' ? 'active' : ''}`}
              >
                {t('settings.subscription')}
              </button>
            </nav>
            
            {/* 版本号 + 语言切换 */}
            {APP_VERSION && (
              <div className="settings-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-text-tertiary" style={{ fontSize: '12px' }}>
                  v{APP_VERSION}
                </span>
                <LanguageToggle />
              </div>
            )}
          </div>

          {/* 右侧内容 */}
          <div className="settings-panel">
            {activeTab === 'quickstart' && <QuickStart onClose={onClose} onNavigate={(tab) => setActiveTab(tab as SettingsTab)} />}
            {activeTab === 'model' && <ModelConfig onClose={onClose} />}
            {activeTab === 'environment' && <EnvironmentConfig onClose={onClose} activeTabId={activeTabId} />}
            {activeTab === 'tools' && <ToolConfig onClose={onClose} />}
            {activeTab === 'workspace' && <WorkspaceConfig onClose={onClose} />}
            {activeTab === 'connectors' && <ConnectorConfig onClose={onClose} />}
            {activeTab === 'version' && <AppVersion initialUpdateInfo={pendingUpdateInfo} />}
            {activeTab === 'subscription' && <Subscription />}
          </div>
        </div>
      </div>
    </div>
  );
}
