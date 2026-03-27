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

  useEffect(() => {
    // 初始化时读取已有的更新信息
    const existing = getPendingUpdate();
    if (existing) {
      setHasUpdate(true);
      setPendingUpdateInfo(existing);
    }
    // 监听后续的更新通知
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
          <h2 className="settings-title">系统设置</h2>
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
                onClick={() => setActiveTab('tools')}
                className={`settings-nav-item ${activeTab === 'tools' ? 'active' : ''}`}
              >
                工具配置
              </button>
              <button
                onClick={() => setActiveTab('workspace')}
                className={`settings-nav-item ${activeTab === 'workspace' ? 'active' : ''}`}
              >
                工作目录
              </button>
              <button
                onClick={() => setActiveTab('connectors')}
                className={`settings-nav-item ${activeTab === 'connectors' ? 'active' : ''}`}
              >
                外部通讯
              </button>
              <button
                onClick={() => { setActiveTab('version'); setHasUpdate(false); clearPendingUpdate(); }}
                className={`settings-nav-item ${activeTab === 'version' ? 'active' : ''}`}
                style={{ position: 'relative' }}
              >
                系统版本
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
            {activeTab === 'quickstart' && <QuickStart onClose={onClose} />}
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
