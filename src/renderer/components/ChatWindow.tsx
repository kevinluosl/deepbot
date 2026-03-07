/**
 * 终端风格聊天窗口
 */

import React, { useEffect, useRef, useState } from 'react';
import { Message } from '../../types/message';
import { MessageBubble } from './MessageBubble';
import { MessageInput, MessageInputRef } from './MessageInput'; // 🔥 导入 MessageInputRef
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
  const messageInputRef = useRef<MessageInputRef>(null); // 🔥 添加输入框引用
  const messagesContainerRef = useRef<HTMLDivElement>(null); // 🔥 消息容器引用
  const [agentName, setAgentName] = useState('matrix');
  const [userName, setUserName] = useState('user');
  const [isInitializing, setIsInitializing] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true); // 🔥 是否自动滚动
  const isUserScrollingRef = useRef(false); // 🔥 用户是否正在手动滚动
  
  // 🔥 获取当前 Tab 类型
  const currentTab = tabs?.find(t => t.id === activeTabId);
  const isConnectorTab = currentTab?.type === 'connector';

  // 🔥 加载 Tab 的 Agent 名字（考虑继承）
  useEffect(() => {
    const loadTabAgentName = async () => {
      try {
        const result = await window.deepbot.getTabAgentName(activeTabId || 'default');
        if (result.success) {
          setAgentName(result.agentName);
          setUserName(result.userName);
        }
      } catch (error) {
        console.error('加载 Tab Agent 名字失败:', error);
      }
    };
    
    loadTabAgentName();
    
    // 🔥 切换 Tab 后聚焦到输入框
    if (messageInputRef.current) {
      messageInputRef.current.focus();
    }
    
    // 🔥 监听名字配置变化事件（全局更新时也需要刷新）
    const handleNameConfigUpdate = (config: any) => {
      // 🔥 优化：只在与当前 Tab 相关时才重新加载
      // 1. 如果是全局更新（没有 tabId），所有 Tab 都需要更新
      // 2. 如果是特定 Tab 更新（有 tabId），只更新对应的 Tab
      const currentTabId = activeTabId || 'default';
      
      if (!config.tabId || config.tabId === currentTabId) {
        // 直接使用事件中的数据，避免重复查询
        if (config.agentName) {
          setAgentName(config.agentName);
        }
        if (config.userName) {
          setUserName(config.userName);
        }
      }
    };
    
    window.deepbot.onNameConfigUpdate(handleNameConfigUpdate);
    
    // 清理监听器
    return () => {
      // Electron IPC 监听器清理（如果有提供 removeListener 方法）
      // 注意：需要在 preload.ts 中实现 removeListener
    };
  }, [activeTabId]); // 🔥 当 activeTabId 变化时重新加载
  
  // 🔥 监听历史消息加载事件（在 App.tsx 中处理）
  useEffect(() => {
    const handleHistoryLoaded = (data: { tabId: string; messages: Message[] }) => {
      // 只处理当前 Tab 的历史消息
      if (data.tabId === (activeTabId || 'default')) {
        console.log(`[ChatWindow] 📖 收到历史消息: ${data.messages.length} 条`);
        // 历史消息在 App.tsx 中处理，这里只记录日志
      }
    };
    
    const cleanup = window.deepbot.onTabHistoryLoaded(handleHistoryLoaded);
    
    // 清理监听器
    return cleanup;
  }, [activeTabId]);

  // 监听消息变化，收到第一条消息时关闭初始化状态
  useEffect(() => {
    if (messages.length > 0 && isInitializing) {
      setIsInitializing(false);
    }
  }, [messages.length, isInitializing]);

  // 🔥 检测用户手动滚动
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    let lastScrollTop = container.scrollTop;

    const handleScroll = () => {
      const currentScrollTop = container.scrollTop;
      
      // 🔥 只有当 scrollTop 发生变化，且不是程序滚动时，才认为是用户手动滚动
      if (currentScrollTop !== lastScrollTop && !isUserScrollingRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10; // 10px 容差

        // 如果用户滚动到底部，恢复自动滚动
        if (isAtBottom && !autoScroll) {
          console.log('[ChatWindow] 用户滚动到底部，恢复自动滚动');
          setAutoScroll(true);
        }
        // 如果用户向上滚动（离开底部），暂停自动滚动
        else if (!isAtBottom && autoScroll) {
          console.log('[ChatWindow] 用户向上滚动，暂停自动滚动');
          setAutoScroll(false);
        }
      }
      
      lastScrollTop = currentScrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [autoScroll]);

  // 🔥 自动滚动到底部 - 只在 autoScroll 为 true 时执行
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      isUserScrollingRef.current = true; // 标记为程序滚动
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      // 滚动完成后重置标记
      setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 500); // smooth 滚动大约需要 500ms
    }
  }, [messages, autoScroll]);

  // 🔥 发送消息时恢复自动滚动
  const handleSendMessage = (content: string) => {
    setAutoScroll(true);
    onSendMessage(content);
  };

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
      <div ref={messagesContainerRef} className="terminal-content flex-1">
        {isInitializing ? (
          // 初始化提示 - 显示在提示符后面
          <div className="terminal-line" style={{ display: 'block' }}>
            <span className="terminal-prompt agent">{agentName}@deepbot:~&gt;</span>
            <span className="terminal-message system">正在初始化系统...</span>
          </div>
        ) : messages.length === 0 ? (
          // 🔥 空状态：显示等待提示符（不显示光标）
          <>
            <div className="terminal-line" style={{ display: 'block' }}>
              <span className="terminal-prompt agent">{agentName}@deepbot:~&gt;</span>
            </div>
          </>
        ) : (
          // 消息列表
          <>
            {messages.map((message) => (
              <MessageBubble 
                key={message.id} 
                message={message} 
                agentName={agentName} 
                userName={userName}
                isConnectorTab={isConnectorTab}
              />
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

            {/* 等待提示符 - 只在完全空闲时显示（不显示光标） */}
            {!isLoading && messages.length > 0 && !messages.some(msg => msg.isStreaming) && (
              <div className="terminal-line" style={{ display: 'block' }}>
                <span className="terminal-prompt agent">{agentName}@deepbot:~&gt;</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 输入框 - 连接器 Tab 不显示输入框 */}
      {tabs && activeTabId && tabs.find(t => t.id === activeTabId)?.type === 'connector' ? null : (
        <MessageInput 
          ref={messageInputRef}
          onSend={handleSendMessage}
          onStop={onStopGeneration} 
          disabled={isLoading || isLocked || isInitializing} 
          isGenerating={isLoading}
          userName={userName}
          disableStop={isLocked}
        />
      )}
    </div>
  );
});

// 设置 displayName 以便调试
ChatWindow.displayName = 'ChatWindow';
