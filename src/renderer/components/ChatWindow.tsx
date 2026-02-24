/**
 * 终端风格聊天窗口
 */

import React, { useEffect, useRef, useState } from 'react';
import { Message } from '../../types/message';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import type { AgentTab } from '../../types/agent-tab';

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
  isLoading?: boolean;
  onOpenSkillManager?: () => void;
  onOpenScheduledTaskManager?: () => void;
  onOpenSystemSettings?: () => void;
  isLocked?: boolean; // 是否锁定（只读）
  // Tab 相关
  tabs?: AgentTab[];
  activeTabId?: string;
  onTabClick?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onTabCreate?: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = React.memo(({
  messages,
  onSendMessage,
  onStopGeneration,
  isLoading = false,
  onOpenSkillManager,
  onOpenScheduledTaskManager,
  onOpenSystemSettings,
  isLocked = false,
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabCreate,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [agentName, setAgentName] = useState('matrix');
  const [userName, setUserName] = useState('user');
  const [isInitializing, setIsInitializing] = useState(true);

  // 加载名字配置
  useEffect(() => {
    const loadNameConfig = async () => {
      try {
        const result = await window.deepbot.getNameConfig();
        if (result.success && result.config) {
          setAgentName(result.config.agentName);
          setUserName(result.config.userName);
        }
      } catch (error) {
        console.error('加载名字配置失败:', error);
      }
    };
    
    loadNameConfig();
    
    // 🔥 监听名字配置变化事件（事件驱动，不使用轮询）
    const handleNameConfigUpdate = (config: { agentName: string; userName: string }) => {
      console.log('[ChatWindow] 收到名字配置更新事件:', config);
      setAgentName(config.agentName);
      setUserName(config.userName);
    };
    
    window.deepbot.onNameConfigUpdate(handleNameConfigUpdate);
    
    // 清理监听器
    return () => {
      // Electron IPC 监听器清理（如果有提供 removeListener 方法）
      // 注意：需要在 preload.ts 中实现 removeListener
    };
  }, []);

  // 监听消息变化，收到第一条消息时关闭初始化状态
  useEffect(() => {
    if (messages.length > 0 && isInitializing) {
      setIsInitializing(false);
    }
  }, [messages.length, isInitializing]);

  // 自动滚动到底部 - 监听消息变化（包括内容更新）
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]); // 监听整个 messages 数组的变化

  return (
    <div className="terminal-container flex flex-col h-screen">
      {/* 窗口控制栏 - 为系统原生按钮预留空间 */}
      <div className="window-titlebar">
        {/* 系统原生的三色按钮会显示在这里 */}
      </div>

      {/* 顶部栏 */}
      <div className="terminal-header">
        <div className="terminal-title">DeepBot Terminal</div>
        
        <div className="terminal-controls">
          {onOpenSkillManager && (
            <button
              onClick={onOpenSkillManager}
              className="terminal-control-button"
              title="Skill 管理器"
            >
              [SKILLS]
            </button>
          )}
          
          {onOpenScheduledTaskManager && (
            <button
              onClick={onOpenScheduledTaskManager}
              className="terminal-control-button"
              title="定时任务"
            >
              [TASKS]
            </button>
          )}
          
          {onOpenSystemSettings && (
            <button
              onClick={onOpenSystemSettings}
              className="terminal-control-button"
              title="系统设置"
            >
              [CONFIG]
            </button>
          )}
        </div>
      </div>

      {/* Tab 栏 - 放在 banner 下面 */}
      {tabs && activeTabId && onTabClick && onTabClose && onTabCreate && (
        <div className="agent-tabs-wrapper">
          <div className="agent-tabs-container">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`agent-tab ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => onTabClick(tab.id)}
              >
                <span className="agent-tab-title">{tab.title}</span>
                {tab.id !== 'default' && (
                  <button
                    className="agent-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose(tab.id);
                    }}
                    title="关闭窗口"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            
            {tabs.length < 10 && (
              <button
                className="agent-tab-create"
                onClick={onTabCreate}
                title="新建窗口"
              >
                +
              </button>
            )}
          </div>
        </div>
      )}

      {/* 消息列表区域 */}
      <div className="terminal-content flex-1">
        {isInitializing ? (
          // 初始化提示 - 显示在提示符后面
          <div className="terminal-line" style={{ display: 'block' }}>
            <span className="terminal-prompt agent">{agentName}@deepbot:~&gt;</span>
            <span className="terminal-message system">正在初始化系统...</span>
          </div>
        ) : messages.length === 0 ? (
          // 🔥 空状态：显示等待提示符和闪烁光标
          <>
            <div className="terminal-line" style={{ display: 'block' }}>
              <span className="terminal-prompt agent">{agentName}@deepbot:~&gt;</span>
              <span className="terminal-cursor" style={{ display: 'inline-block' }} />
            </div>
          </>
        ) : (
          // 消息列表
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} agentName={agentName} userName={userName} />
            ))}

            {/* 加载指示器 - 只在加载时显示，不显示提示符 */}
            {isLoading && (
              <div className="terminal-line">
                <span className="terminal-message" style={{ marginLeft: '0' }}>
                  Processing
                  <span className="terminal-loading">
                    <span className="terminal-loading-dot" />
                    <span className="terminal-loading-dot" />
                    <span className="terminal-loading-dot" />
                  </span>
                </span>
              </div>
            )}

            {/* 等待提示符 - 只在完全空闲时显示 */}
            {!isLoading && messages.length > 0 && !messages.some(msg => msg.isStreaming) && (
              <div className="terminal-line" style={{ display: 'block' }}>
                <span className="terminal-prompt agent">{agentName}@deepbot:~&gt;</span>
                <span className="terminal-cursor" style={{ display: 'inline-block' }} />
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 输入框 */}
      <MessageInput 
        onSend={onSendMessage} 
        onStop={onStopGeneration} 
        disabled={isLoading || isLocked || isInitializing} 
        isGenerating={isLoading}
        userName={userName}
        disableStop={isLocked}
      />
    </div>
  );
});

// 设置 displayName 以便调试
ChatWindow.displayName = 'ChatWindow';
