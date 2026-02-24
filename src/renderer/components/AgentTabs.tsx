/**
 * Agent Tabs 组件
 * 
 * 多 Agent 窗口的 Tab 栏
 */

import React from 'react';
import type { AgentTab } from '../../types/agent-tab';

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
  return (
    <div className="agent-tabs">
      <div className="tabs-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isLocked ? 'locked' : ''}`}
            onClick={() => onTabClick(tab.id)}
            title={tab.isLocked ? '定时任务专属窗口（只读）' : undefined}
          >
            <span className="tab-title">{tab.title}</span>
            {tab.id !== 'default' && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                title={tab.isLocked ? '关闭窗口（将暂停任务）' : '关闭窗口'}
              >
                ×
              </button>
            )}
          </div>
        ))}
        
        {tabs.length < 10 && (
          <button
            className="tab-create"
            onClick={onTabCreate}
            title="新建窗口"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
};
