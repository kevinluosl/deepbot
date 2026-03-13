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
  onSendMessage: (content: string, images?: import('../../types/message').UploadedImage[], files?: import('../../types/message').UploadedFile[]) => void;
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
  const programScrollingRef = useRef(false); // 🔥 程序是否正在滚动（避免误判）
  const lastScrollHeightRef = useRef(0); // 🔥 记录上次滚动高度
  
  // 🔥 分页加载优化：初始只显示最近 20 条消息
  const [displayCount, setDisplayCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // 🔥 获取当前 Tab 类型
  const currentTab = tabs?.find(t => t.id === activeTabId);
  const isConnectorTab = currentTab?.type === 'connector';
  
  // 🔥 计算要显示的消息（从最新的开始）
  const displayedMessages = messages.slice(-displayCount);
  const hasMoreMessages = messages.length > displayCount;

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
    
    // 🔥 切换 Tab 时，根据 Tab 类型重置初始化状态
    const currentTabId = activeTabId || 'default';
    if (currentTabId === 'default') {
      // default Tab：如果没有消息，显示初始化状态
      setIsInitializing(messages.length === 0);
    } else {
      // 其他 Tab：不显示初始化状态
      setIsInitializing(false);
    }
    
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
        // 历史消息在 App.tsx 中处理，这里只记录日志
      }
    };
    
    const cleanup = window.deepbot.onTabHistoryLoaded(handleHistoryLoaded);
    
    // 清理监听器
    return cleanup;
  }, [activeTabId]);

  // 🔥 监听消息变化，动态控制初始化状态
  useEffect(() => {
    if (messages.length > 0) {
      // 收到消息时，关闭初始化状态
      if (isInitializing) {
        setIsInitializing(false);
      }
    }
  }, [messages.length, isInitializing]);
  
  // 🔥 监听 Tab 消息清除事件，重新显示初始化状态（仅 default Tab）
  useEffect(() => {
    const handleMessagesCleared = (data: { tabId: string }) => {
      const currentTabId = activeTabId || 'default';
      // 只在 default Tab 被清除时，重新显示初始化状态
      if (data.tabId === currentTabId && currentTabId === 'default') {
        setIsInitializing(true);
      }
    };
    
    const cleanup = window.deepbot.onTabMessagesCleared(handleMessagesCleared);
    return cleanup;
  }, [activeTabId]);

  // 🔥 检测用户手动滚动 - 重新设计的逻辑
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    let scrollEndTimer: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      // 🔥 清除之前的定时器
      if (scrollEndTimer) {
        clearTimeout(scrollEndTimer);
      }

      // 🔥 延迟检测，等待滚动完全停止后再判断
      scrollEndTimer = setTimeout(() => {
        // 如果是程序滚动，忽略此事件
        if (programScrollingRef.current) {
          return;
        }

        const { scrollTop, scrollHeight, clientHeight } = container;
        const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10; // 10px 容差
        const isAtTop = scrollTop < 100; // 距离顶部小于 100px

        // 🔥 用户滚动到顶部，加载更多消息
        if (isAtTop && hasMoreMessages && !isLoadingMore) {
          loadMoreMessages();
        }

        // 用户滚动到底部，恢复自动滚动
        if (isAtBottom && !autoScroll) {
          setAutoScroll(true);
        }
        // 用户向上滚动（离开底部），暂停自动滚动
        else if (!isAtBottom && autoScroll) {
          setAutoScroll(false);
        }
      }, 150); // 延迟 150ms，等待滚动完全停止
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollEndTimer) {
        clearTimeout(scrollEndTimer);
      }
    };
  }, [autoScroll, hasMoreMessages, isLoadingMore]);
  
  // 🔥 加载更多消息
  const loadMoreMessages = () => {
    if (isLoadingMore || !hasMoreMessages) return;
    
    setIsLoadingMore(true);
    const container = messagesContainerRef.current;
    const oldScrollHeight = container?.scrollHeight || 0;
    
    // 延迟加载，避免阻塞 UI
    setTimeout(() => {
      setDisplayCount(prev => Math.min(prev + 20, messages.length));
      setIsLoadingMore(false);
      
      // 🔥 保持滚动位置（避免跳动）
      setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - oldScrollHeight;
        }
      }, 0);
    }, 100);
  };
  
  // 🔥 当消息列表变化时，重置显示数量（切换 Tab 或清空消息）
  useEffect(() => {
    setDisplayCount(20);
    setAutoScroll(true); // 🔥 切换 Tab 时恢复自动滚动
  }, [activeTabId]);
  
  // 🔥 当历史消息加载完成后，滚动到底部
  useEffect(() => {
    if (displayedMessages.length > 0 && autoScroll) {
      // 延迟滚动，确保 DOM 已渲染
      setTimeout(() => {
        if (messagesEndRef.current) {
          programScrollingRef.current = true;
          messagesEndRef.current.scrollIntoView({ behavior: 'instant' }); // 🔥 首次加载使用 instant
          setTimeout(() => {
            programScrollingRef.current = false;
          }, 100);
        }
      }, 50);
    }
  }, [displayedMessages.length, activeTabId]); // 🔥 依赖消息数量和 Tab ID

  // 🔥 自动滚动到底部 - 使用 MutationObserver 监听 DOM 变化
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !autoScroll) return;

    // 滚动到底部的函数
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        programScrollingRef.current = true; // 标记为程序滚动
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        
        // 🔥 滚动完成后重置标记（增加延迟确保所有 scroll 事件都被忽略）
        setTimeout(() => {
          programScrollingRef.current = false;
        }, 800); // 增加到 800ms，确保 smooth 滚动完全完成
      }
    };

    // 监听 DOM 变化（消息添加、内容更新）
    const observer = new MutationObserver(() => {
      const { scrollHeight } = container;
      
      // 只有当内容高度真正变化时才滚动（避免重复滚动）
      if (scrollHeight !== lastScrollHeightRef.current) {
        lastScrollHeightRef.current = scrollHeight;
        scrollToBottom();
      }
    });

    observer.observe(container, {
      childList: true, // 监听子节点变化
      subtree: true, // 监听所有后代节点
      characterData: true, // 监听文本内容变化
    });

    return () => {
      observer.disconnect();
    };
  }, [autoScroll]); // 只依赖 autoScroll，不依赖 messages

  // 🔥 发送消息时恢复自动滚动
  const handleSendMessage = (
    content: string, 
    images?: import('../../types/message').UploadedImage[],
    files?: import('../../types/message').UploadedFile[]
  ) => {
    setAutoScroll(true);
    onSendMessage(content, images, files);
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
            {/* 🔥 加载更多指示器 */}
            {hasMoreMessages && (
              <div className="terminal-line" style={{ textAlign: 'center', padding: '8px 0', opacity: 0.6 }}>
                {isLoadingMore ? (
                  <span className="terminal-message system">加载中...</span>
                ) : (
                  <span className="terminal-message system">
                    ↑ 向上滚动加载更多 ({messages.length - displayCount} 条历史消息)
                  </span>
                )}
              </div>
            )}
            
            {displayedMessages.map((message) => (
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
