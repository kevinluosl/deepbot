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
import { onToast } from '../utils/toast';
import { QuickStart } from './settings/QuickStart';
import { ModelConfig } from './settings/ModelConfig';
import { EnvironmentConfig } from './settings/EnvironmentConfig';
import { WorkspaceConfig } from './settings/WorkspaceConfig';
import { ToolConfig } from './settings/ToolConfig';
import { ConnectorConfig } from './settings/ConnectorConfig';
import { AppVersion } from './settings/AppVersion';
import { t } from '../i18n';
import '../styles/settings.css';

type SettingsTab = 'quickstart' | 'model' | 'environment' | 'workspace' | 'tools' | 'connectors' | 'version';

interface SystemSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  activeTabId?: string; // 当前选中的 Tab ID
}

export function SystemSettings({ isOpen, onClose, activeTabId }: SystemSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('quickstart');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [pendingUpdateInfo, setPendingUpdateInfo] = useState<{ version: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // 订阅全局 Toast 事件
  useEffect(() => {
    const unsub = onToast(({ type, text }) => {
      setToast({ type, text });
      setTimeout(() => setToast(null), 3000);
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-container" style={{ position: 'relative' }}>
        {/* 悬浮 Toast 提示 */}
        {toast && (
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            backgroundColor: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: toast.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${toast.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          }}>
            {toast.text}
          </div>
        )}
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
            </nav>
            
            {/* 版本号显示 */}
            {APP_VERSION && (
              <div className="settings-footer">
                <span className="text-text-tertiary" style={{ fontSize: '12px' }}>
                  v{APP_VERSION}
                </span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
