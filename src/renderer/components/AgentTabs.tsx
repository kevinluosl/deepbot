/**
 * Agent Tabs 组件
 * 
 * 多 Agent 窗口的 Tab 栏
 */

import React from 'react';
import type { AgentTab } from '../../types/agent-tab';
import { MAX_TABS } from '../../shared/constants/version';
import { getLanguage } from '../i18n';

interface AgentTabsProps {
  tabs: AgentTab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabCreate: () => void;
}

export const AgentTabs: React.FC<AgentTabsProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabCreate,
}) => {
  const lang = getLanguage();
  return (
    <div className="agent-tabs">
      <div className="tabs-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isLocked ? 'locked' : ''}`}
            onClick={() => onTabClick(tab.id)}
            title={tab.isLocked ? (lang === 'zh' ? '定时任务专属窗口（只读）' : 'Task-only tab (read-only)') : undefined}
          >
            <span className="tab-title">{tab.title}</span>
            {tab.id !== 'default' && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                title={tab.isLocked ? (lang === 'zh' ? '关闭窗口（将暂停任务）' : 'Close tab (will pause task)') : (lang === 'zh' ? '关闭窗口' : 'Close tab')}
              >
                ×
              </button>
            )}
          </div>
        ))}
        
        {tabs.length < MAX_TABS && (
          <button
            className="tab-create"
            onClick={onTabCreate}
            title={lang === 'zh' ? '新建窗口' : 'New tab'}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
};
