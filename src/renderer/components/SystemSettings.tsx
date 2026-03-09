/**
 * 系统设置页面
 * 
 * 左右布局：
 * - 左侧：菜单列表
 * - 右侧：设置内容
 */

import React, { useState, useEffect } from 'react';
import { QuickStart } from './settings/QuickStart';
import { ModelConfig } from './settings/ModelConfig';
import { EnvironmentConfig } from './settings/EnvironmentConfig';
import { WorkspaceConfig } from './settings/WorkspaceConfig';
import { ToolConfig } from './settings/ToolConfig';
import { ConnectorConfig } from './settings/ConnectorConfig';
import '../styles/settings.css';

type SettingsTab = 'quickstart' | 'model' | 'environment' | 'workspace' | 'tools' | 'connectors';

interface SystemSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  activeTabId?: string; // 当前选中的 Tab ID
}

export function SystemSettings({ isOpen, onClose, activeTabId }: SystemSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('quickstart');
  const [appVersion, setAppVersion] = useState<string>('');

  // 获取应用版本号
  useEffect(() => {
    if (isOpen) {
      window.deepbot.getAppVersion().then((result: any) => {
        if (result.success && result.version) {
          setAppVersion(result.version);
        }
      }).catch((error: any) => {
        console.error('获取应用版本失败:', error);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-container">
        {/* 标题栏 */}
        <div className="settings-header">
          <h2 className="settings-title">系统设置</h2>
          <button onClick={onClose} className="settings-close-button">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
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
                快速入门
              </button>
              <button
                onClick={() => setActiveTab('model')}
                className={`settings-nav-item ${activeTab === 'model' ? 'active' : ''}`}
              >
                模型配置
              </button>
              <button
                onClick={() => setActiveTab('environment')}
                className={`settings-nav-item ${activeTab === 'environment' ? 'active' : ''}`}
              >
                环境配置
              </button>
              <button
                onClick={() => setActiveTab('workspace')}
                className={`settings-nav-item ${activeTab === 'workspace' ? 'active' : ''}`}
              >
                工作目录
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={`settings-nav-item ${activeTab === 'tools' ? 'active' : ''}`}
              >
                工具配置
              </button>
              <button
                onClick={() => setActiveTab('connectors')}
                className={`settings-nav-item ${activeTab === 'connectors' ? 'active' : ''}`}
              >
                外部通讯
              </button>
            </nav>
            
            {/* 版本号显示 */}
            {appVersion && (
              <div className="settings-footer">
                <span className="text-text-tertiary" style={{ fontSize: '12px' }}>
                  v{appVersion}
                </span>
              </div>
            )}
          </div>

          {/* 右侧内容 */}
          <div className="settings-panel">
            {activeTab === 'quickstart' && <QuickStart onClose={onClose} />}
            {activeTab === 'model' && <ModelConfig onClose={onClose} />}
            {activeTab === 'environment' && <EnvironmentConfig onClose={onClose} activeTabId={activeTabId} />}
            {activeTab === 'workspace' && <WorkspaceConfig onClose={onClose} />}
            {activeTab === 'tools' && <ToolConfig onClose={onClose} />}
            {activeTab === 'connectors' && <ConnectorConfig onClose={onClose} />}
          </div>
        </div>
      </div>
    </div>
  );
}
