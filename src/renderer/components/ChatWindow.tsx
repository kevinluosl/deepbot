/**
 * 终端风格聊天窗口
 */

import React, { useEffect, useRef, useState } from 'react';
import { Message } from '../../types/message';
import { MessageBubble } from './MessageBubble';
import { MessageInput, MessageInputRef } from './MessageInput'; // 🔥 导入 MessageInputRef
import type { AgentTab } from '../../types/agent-tab';
import { MAX_TABS } from '../../shared/constants/version';
import { api } from '../api'; // 🔥 使用统一 API 适配器
import { isElectron, isMacOS } from '../utils/platform'; // 🔥 平台检测
import { showToast } from '../utils/toast';
import { getLanguage } from '../i18n';
import { ModelConfig } from './settings/ModelConfig';
import { IMAGE_GENERATION_PROVIDER_PRESETS } from '../../shared/config/default-configs';
import { X, Pencil, Settings, FileText, Shield, FolderOpen, Image as ImageIcon, Zap } from 'lucide-react';

// 从 Tab 标题中提取智能客服名称：SK-{客服名}-{用户} → 客服名
const getSmartKfName = (title: string): string => {
  const match = title.match(/^SK-(.+?)-/);
  return match ? match[1] : '';
};

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (content: string, images?: import('../../types/message').UploadedImage[], files?: import('../../types/message').UploadedFile[]) => void;
  onStopGeneration: () => void;
  isLoading?: boolean;
  onOpenSkillManager?: () => void;
  onOpenScheduledTaskManager?: () => void;
  onOpenSystemSettings?: () => void;
  isLocked?: boolean;
  pendingPairingCount?: number; // 待授权用户数量
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
  pendingPairingCount = 0,
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabCreate,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<MessageInputRef>(null); // 🔥 添加输入框引用
  const messagesContainerRef = useRef<HTMLDivElement>(null); // 🔥 消息容器引用
  const lang = getLanguage();
  const [agentName, setAgentName] = useState('matrix');
  const [userName, setUserName] = useState('user');
  const [isInitializing, setIsInitializing] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true); // 🔥 是否自动滚动
  const programScrollingRef = useRef(false); // 🔥 程序是否正在滚动（避免误判）
  const lastScrollHeightRef = useRef(0); // 🔥 记录上次滚动高度
  const [loadingText, setLoadingText] = useState('Processing'); // 加载状态文本
  const [isDragOver, setIsDragOver] = useState(false); // 拖拽悬停状态
  const dragCounterRef = useRef(0); // 拖拽计数器（处理子元素触发的 enter/leave）
  
  // 🔥 分页加载优化：初始只显示最近 20 条消息
  const [displayCount, setDisplayCount] = useState(20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Tab 右键菜单和模型选择
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string; isGroup?: boolean; groupTabIds?: string[] } | null>(null);
  const [showModelPicker, setShowModelPicker] = useState<string | null>(null); // tabId
  const [showRenameDialog, setShowRenameDialog] = useState<string | null>(null); // tabId
  const [renameValue, setRenameValue] = useState('');
  const [showWorkPromptDialog, setShowWorkPromptDialog] = useState<string | null>(null); // tabId
  const [workPromptValue, setWorkPromptValue] = useState('');
  const workPromptGroupRef = useRef<string[] | null>(null); // 分组工作提示词时的 Tab ID 列表
  const [showSkillWhitelistDialog, setShowSkillWhitelistDialog] = useState<string | null>(null); // tabId
  const [allSkills, setAllSkills] = useState<{ name: string; description?: string }[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const skillWhitelistGroupRef = useRef<string[] | null>(null);
  const [showWorkspaceDirsDialog, setShowWorkspaceDirsDialog] = useState<string | null>(null); // tabId
  const [isCustomWorkspace, setIsCustomWorkspace] = useState(false);
  const [workspaceMainDir, setWorkspaceMainDir] = useState('');
  const [workspaceExtraDirs, setWorkspaceExtraDirs] = useState<string[]>([]);
  const workspaceDirsGroupRef = useRef<string[] | null>(null);
  const [showImageToolDialog, setShowImageToolDialog] = useState<string | null>(null); // tabId
  const [imageToolConfig, setImageToolConfig] = useState<{ provider?: string; model: string; apiUrl: string; apiKey: string } | null>(null);
  const imageToolGroupRef = useRef<string[] | null>(null);
  const [showFastModeDialog, setShowFastModeDialog] = useState<string | null>(null); // tabId
  const [fastModeEnabled, setFastModeEnabled] = useState(false);
  const [tabFastModes, setTabFastModes] = useState<Record<string, boolean>>({}); // tabId -> fastMode
  
  // 智能客服分组相关
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null); // 当前展开的分组名
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 }); // 下拉列表位置
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({}); // tabId -> 未读消息数
  const [groupSelectedTab, setGroupSelectedTab] = useState<Record<string, string>>({}); // 分组名 -> 最后选中的 tabId
  const modelPickerGroupRef = useRef<string[] | null>(null); // 分组模型设置时的 Tab ID 列表
  
  // 智能客服 Tab 回复模式（按 Tab 保存）
  const [wecomReplyModes, setWecomReplyModes] = useState<Record<string, 'agent' | 'direct'>>({}); // tabId -> 回复模式
  const currentWecomReplyMode = activeTabId ? (wecomReplyModes[activeTabId] || 'agent') : 'agent';
  
  // 🔥 获取当前 Tab 类型
  const currentTab = tabs?.find(t => t.id === activeTabId);
  const isConnectorTab = currentTab?.type === 'connector';

  // 智能客服 Tab 未读消息追踪（按用户消息轮次计数，一轮对话只算 1）
  const prevTabUserMsgCountsRef = useRef<Record<string, number>>({});
  const appReadyForUnreadRef = useRef(false); // 启动后延迟开启未读追踪
  const tabsForUnreadRef = useRef(tabs); // 保存最新 tabs 引用
  tabsForUnreadRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const unreadCountsRef = useRef(unreadCounts);
  unreadCountsRef.current = unreadCounts;

  // 启动 3 秒后才开始追踪未读（等待历史消息加载完成）
  useEffect(() => {
    const timer = setTimeout(() => {
      // 用最新的 tabs 初始化基线
      const currentTabs = tabsForUnreadRef.current;
      if (currentTabs) {
        for (const tab of currentTabs) {
          if (tab.connectorId !== 'smart-kf') continue;
          prevTabUserMsgCountsRef.current[tab.id] = (tab.messages || []).filter(m => m.role === 'user').length;
        }
      }
      appReadyForUnreadRef.current = true;
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!tabs || !appReadyForUnreadRef.current) return;
    const prevCounts = prevTabUserMsgCountsRef.current;
    const newUnread: Record<string, number> = {};
    for (const tab of tabs) {
      if (tab.connectorId !== 'smart-kf') continue;
      const userMsgCount = (tab.messages || []).filter(m => m.role === 'user').length;
      const prevCount = prevCounts[tab.id] ?? 0;
      if (userMsgCount > prevCount && tab.id !== activeTabIdRef.current) {
        newUnread[tab.id] = (unreadCountsRef.current[tab.id] || 0) + (userMsgCount - prevCount);
      }
      prevCounts[tab.id] = userMsgCount;
    }
    if (Object.keys(newUnread).length > 0) {
      setUnreadCounts(prev => ({ ...prev, ...newUnread }));
    }
  }, [tabs]);

  // 切换 Tab 时清除该 Tab 的未读计数
  useEffect(() => {
    if (activeTabId && unreadCounts[activeTabId]) {
      setUnreadCounts(prev => {
        const next = { ...prev };
        delete next[activeTabId];
        return next;
      });
    }
  }, [activeTabId]);

  // 点击分组外部区域关闭下拉列表
  useEffect(() => {
    if (!expandedGroup) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 点击在分组区域内（包括 dropdown）不关闭
      if (target.closest('.agent-tab-group') || target.closest('.agent-tab-group-dropdown')) {
        return;
      }
      setExpandedGroup(null);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [expandedGroup]);

  const { normalTabs, wecomGroups } = React.useMemo(() => {
    if (!tabs) return { normalTabs: [] as AgentTab[], wecomGroups: {} as Record<string, AgentTab[]> };
    const sorted = [...tabs].sort((a, b) => {
      if (a.id === 'default') return -1;
      if (b.id === 'default') return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    const normal: AgentTab[] = [];
    const groups: Record<string, AgentTab[]> = {};
    for (const tab of sorted) {
      if (tab.connectorId === 'smart-kf') {
        const key = getSmartKfName(tab.title || '') || 'unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(tab);
      } else if (tab.connectorId?.startsWith('wecom')) {
        // 企业微信按 connectorId 分组（wecom-1、wecom-2 各一组）
        const key = tab.connectorId;
        if (!groups[key]) groups[key] = [];
        groups[key].push(tab);
      } else if (tab.connectorId === 'feishu') {
        // 飞书按 connectorId 分组（只有一个组）
        const key = 'feishu';
        if (!groups[key]) groups[key] = [];
        groups[key].push(tab);
      } else {
        normal.push(tab);
      }
    }
    return { normalTabs: normal, wecomGroups: groups };
  }, [tabs]);

  const getGroupActiveTab = (groupTabs: AgentTab[], kfName: string) => {
    // 优先：当前激活的 Tab 在分组内
    const activeInGroup = groupTabs.find(t => t.id === activeTabId);
    if (activeInGroup) return activeInGroup;
    // 其次：上次在该分组中选中的 Tab
    const lastSelected = groupSelectedTab[kfName];
    if (lastSelected) {
      const found = groupTabs.find(t => t.id === lastSelected);
      if (found) return found;
    }
    // 兜底：第一个
    return groupTabs[0];
  };

  // 🔥 计算要显示的消息（从最新的开始）
  const displayedMessages = messages.slice(-displayCount);
  const hasMoreMessages = messages.length > displayCount;

  // 🔥 加载 Tab 的 Agent 名字（考虑继承）
  useEffect(() => {
    const loadTabAgentName = async () => {
      try {
        const result = await api.getTabAgentName(activeTabId || 'default');
        if (result.success) {
          setAgentName(result.agentName);
          setUserName(result.userName);
        }
      } catch (error) {
        console.error('加载 Tab Agent 名字失败:', error);
      }
    };
    
    loadTabAgentName();

    // 🔥 加载智能客服 Tab 的回复模式
    const loadTabReplyMode = async () => {
      const tabId = activeTabId || 'default';
      const tab = tabs?.find(t => t.id === tabId);
      if (tab?.connectorId === 'smart-kf' && !wecomReplyModes[tabId]) {
        try {
          const result = await api.getTabReplyMode(tabId);
          if (result.success) {
            setWecomReplyModes(prev => ({ ...prev, [tabId]: result.replyMode || 'agent' }));
          }
        } catch {
          // 默认 agent 模式
        }
      }
    };
    loadTabReplyMode();
    
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
    
    const unsubscribeNameUpdate = api.onNameConfigUpdate(handleNameConfigUpdate);
    
    // 清理监听器
    return () => {
      unsubscribeNameUpdate();
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
    
    const cleanup = api.onTabHistoryLoaded(handleHistoryLoaded);
    
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

  // 监听加载状态变化（processing / checking）
  useEffect(() => {
    const unsubscribe = api.onLoadingStatus((data: { status: string; sessionId?: string }) => {
      // 只处理当前 Tab 的状态
      if (data.sessionId && data.sessionId !== (activeTabId || 'default')) return;
      if (data.status === 'checking') {
        setLoadingText('Checking Result');
      } else {
        setLoadingText('Processing');
      }
    });
    return unsubscribe;
  }, [activeTabId]);

  // isLoading 变为 true 时重置为默认文本
  useEffect(() => {
    if (isLoading) {
      setLoadingText('Processing');
    }
  }, [isLoading]);
  
  // 🔥 监听 Tab 消息清除事件，重新显示初始化状态（仅 default Tab）
  useEffect(() => {
    const handleMessagesCleared = (data: { tabId: string }) => {
      const currentTabId = activeTabId || 'default';
      // 只在 default Tab 被清除时，重新显示初始化状态
      if (data.tabId === currentTabId && currentTabId === 'default') {
        setIsInitializing(true);
      }
    };
    
    const cleanup = api.onTabMessagesCleared(handleMessagesCleared);
    return cleanup;
  }, [activeTabId]);

  // 监听 Tab Fast 模式变化
  useEffect(() => {
    const cleanup = api.onTabFastModeChanged((data: { tabId: string; fastMode: boolean }) => {
      setTabFastModes(prev => ({ ...prev, [data.tabId]: data.fastMode }));
    });
    return cleanup;
  }, []);

  // 🔥 检测用户手动滚动
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    let scrollEndTimer: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      // 如果是程序滚动，忽略此事件
      if (programScrollingRef.current) {
        return;
      }

      // 🔥 用户手动滚动时，立即暂停自动滚动（不等延迟）
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;

      if (!isAtBottom && autoScroll) {
        setAutoScroll(false);
      }

      // 🔥 延迟检测滚动停止后的状态（恢复自动滚动、加载更多）
      if (scrollEndTimer) {
        clearTimeout(scrollEndTimer);
      }

      scrollEndTimer = setTimeout(() => {
        if (programScrollingRef.current) return;

        const { scrollTop: st, scrollHeight: sh, clientHeight: ch } = container;
        const atBottom = Math.abs(sh - st - ch) < 10;
        const atTop = st < 100;

        // 用户滚动到顶部，加载更多消息
        if (atTop && hasMoreMessages && !isLoadingMore) {
          loadMoreMessages();
        }

        // 用户滚动到底部，恢复自动滚动
        if (atBottom && !autoScroll) {
          setAutoScroll(true);
        }
      }, 150);
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
        programScrollingRef.current = true;
        messagesEndRef.current.scrollIntoView({ behavior: 'instant' });
        // instant 滚动立即完成，短延迟后重置标记
        setTimeout(() => {
          programScrollingRef.current = false;
        }, 50);
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

  // 🔥 判断是否为 Electron 环境（Web 版本不需要标题栏）
  const isElectronEnv = isElectron();

  // 拖拽事件处理
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0 && messageInputRef.current) {
      messageInputRef.current.handleDroppedFiles(files);
    }
  };

  return (
    <div
      className="terminal-container flex flex-col h-screen"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 拖拽遮罩 */}
      {isDragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            <span className="drop-overlay-icon">📎</span>
            <span className="drop-overlay-text">{lang === 'zh' ? '释放以上传文件' : 'Drop to upload'}</span>
          </div>
        </div>
      )}
      {/* 窗口控制栏 - 仅 macOS Electron 需要，为交通灯按钮预留空间 */}
      {isElectronEnv && isMacOS() && (
        <div className="window-titlebar">
          {/* 系统原生的三色按钮会显示在这里 */}
        </div>
      )}

      {/* 顶部栏 */}
      <div className="terminal-header">
        <div className="terminal-title">DeepBot Terminal - 吴大叔</div>
        
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
              title={lang === 'zh' ? '定时任务' : 'Tasks'}
            >
              [TASKS]
            </button>
          )}
          
          {onOpenSystemSettings && (
            <button
              onClick={onOpenSystemSettings}
              className="terminal-control-button"
              title={lang === 'zh' ? '系统设置' : 'Settings'}
              style={{ position: 'relative' }}
            >
              [CONFIG]
              {pendingPairingCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  background: '#ff3b30',
                  color: '#fff',
                  borderRadius: '50%',
                  minWidth: '16px',
                  height: '16px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  padding: '0 3px',
                  pointerEvents: 'none',
                }}>
                  {pendingPairingCount > 99 ? '99+' : pendingPairingCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Tab 栏 - 放在 banner 下面 */}
      {tabs && activeTabId && onTabClick && onTabClose && onTabCreate && (
        <div className="agent-tabs-wrapper">
          <div className="agent-tabs-container">
            {/* 普通 Tab */}
            {normalTabs.map((tab) => (
              <div
                key={tab.id}
                className={`agent-tab ${tab.id === activeTabId ? 'active' : ''} ${tabFastModes[tab.id] ? 'fast-mode' : ''}`}
                onClick={() => onTabClick(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onTabClick(tab.id);
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                }}
              >
                {tabFastModes[tab.id] && <Zap size={10} style={{ marginRight: '3px', color: 'var(--terminal-accent)' }} />}
                <span className="agent-tab-title">{tab.title}</span>
                {tab.id !== 'default' && (
                  <button
                    className="agent-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose(tab.id);
                    }}
                    title={lang === 'zh' ? '关闭窗口' : 'Close tab'}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            {/* 智能客服分组 Tab */}
            {Object.entries(wecomGroups).map(([kfName, groupTabs]) => {
              const activeGroupTab = getGroupActiveTab(groupTabs, kfName);
              const isGroupActive = groupTabs.some(t => t.id === activeTabId);
              const isExpanded = expandedGroup === kfName;
              const groupTabIds = groupTabs.map(t => t.id);
              const hasGroupUnread = groupTabs.some(t => (unreadCounts[t.id] || 0) > 0);

              return (
                <div key={`group-${kfName}`} className={`agent-tab-group ${isGroupActive ? 'active' : ''}`}>
                  <div
                    className={`agent-tab ${isGroupActive ? 'active' : ''}`}
                    onClick={() => onTabClick(activeGroupTab.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, tabId: activeGroupTab.id, isGroup: true, groupTabIds });
                    }}
                  >
                    <span className="agent-tab-title">{activeGroupTab.title}</span>
                    <button
                      className={`agent-tab-group-toggle ${hasGroupUnread ? 'has-unread' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isExpanded) {
                          setExpandedGroup(null);
                        } else {
                          const rect = (e.currentTarget.closest('.agent-tab-group') as HTMLElement)?.getBoundingClientRect();
                          if (rect) {
                            setDropdownPos({ top: rect.bottom, left: rect.left });
                          }
                          setExpandedGroup(kfName);
                        }
                      }}
                      title={lang === 'zh' ? '展开分组' : 'Expand group'}
                    >
                      {groupTabs.length}
                    </button>
                  </div>
                </div>
              );
            })}
            
            {tabs.length < MAX_TABS && (
              <button
                className="agent-tab-create"
                onClick={onTabCreate}
                title={lang === 'zh' ? '新建窗口' : 'New tab'}
              >
                +
              </button>
            )}
          </div>
        </div>
      )}

      {/* 智能客服分组下拉列表 - 渲染在 Tab 栏外部，避免被 overflow/z-index 裁剪 */}
      {expandedGroup && wecomGroups[expandedGroup] && (
        <div className="agent-tab-group-dropdown" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
          {wecomGroups[expandedGroup].map((tab) => (
            <div
              key={tab.id}
              className={`agent-tab-group-item ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => {
                onTabClick?.(tab.id);
                setGroupSelectedTab(prev => ({ ...prev, [expandedGroup!]: tab.id }));
                setExpandedGroup(null);
              }}
            >
              <span className="agent-tab-group-item-title">{tab.title}</span>
              {(unreadCounts[tab.id] || 0) > 0 && (
                <span className="agent-tab-group-item-badge">
                  {(unreadCounts[tab.id] || 0) > 99 ? '99+' : unreadCounts[tab.id]}
                </span>
              )}
              <button
                className="agent-tab-group-item-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose?.(tab.id);
                }}
                title={lang === 'zh' ? '关闭' : 'Close'}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab 右键菜单 */}
      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}
        >
          {/* 分组 Tab 不显示取名选项 */}
          {!contextMenu.isGroup && (
            <div
              className="tab-context-menu-item"
              onClick={() => {
                const tabId = contextMenu.tabId;
                const tab = tabs?.find(t => t.id === tabId);
                setContextMenu(null);
                setRenameValue(tab?.title || '');
                setShowRenameDialog(tabId);
              }}
            >
              <Pencil size={14} style={{ marginRight: '6px' }} />
              {lang === 'zh' ? '取名' : 'Rename'}
            </div>
          )}
          <div
            className="tab-context-menu-item"
            onClick={() => {
              const tabId = contextMenu.tabId;
              let groupTabIds = contextMenu.groupTabIds;
              setContextMenu(null);
              
              // 分组 Tab：自动查找同分组的所有 Tab（智能客服、企业微信或飞书）
              if (!groupTabIds) {
                const tab = tabs?.find(t => t.id === tabId);
                if (tab?.connectorId === 'smart-kf') {
                  const kfName = getSmartKfName(tab.title || '');
                  if (kfName && wecomGroups[kfName]) {
                    groupTabIds = wecomGroups[kfName].map(t => t.id);
                  }
                } else if (tab?.connectorId?.startsWith('wecom') && wecomGroups[tab.connectorId]) {
                  groupTabIds = wecomGroups[tab.connectorId].map(t => t.id);
                } else if (tab?.connectorId === 'feishu' && wecomGroups['feishu']) {
                  groupTabIds = wecomGroups[tab.connectorId].map(t => t.id);
                }
              }
              
              setShowModelPicker(tabId);
              modelPickerGroupRef.current = groupTabIds || null;
            }}
          >
            <Settings size={14} style={{ marginRight: '6px' }} />
            {lang === 'zh' ? '设置模型' : 'Set Model'}
          </div>
          <div
            className="tab-context-menu-item"
            onClick={async () => {
              const tabId = contextMenu.tabId;
              let groupTabIds = contextMenu.groupTabIds;
              setContextMenu(null);
              
              // 分组 Tab：自动查找同分组的所有 Tab（智能客服、企业微信或飞书）
              if (!groupTabIds) {
                const tab = tabs?.find(t => t.id === tabId);
                if (tab?.connectorId === 'smart-kf') {
                  const kfName = getSmartKfName(tab.title || '');
                  if (kfName && wecomGroups[kfName]) {
                    groupTabIds = wecomGroups[kfName].map(t => t.id);
                  }
                } else if (tab?.connectorId?.startsWith('wecom') && wecomGroups[tab.connectorId]) {
                  groupTabIds = wecomGroups[tab.connectorId].map(t => t.id);
                } else if (tab?.connectorId === 'feishu' && wecomGroups['feishu']) {
                  groupTabIds = wecomGroups[tab.connectorId].map(t => t.id);
                }
              }
              
              // 加载当前工作提示词
              try {
                const result = await api.getTabWorkPrompt(tabId);
                setWorkPromptValue(result?.workPrompt || '');
              } catch {
                setWorkPromptValue('');
              }
              setShowWorkPromptDialog(tabId);
              workPromptGroupRef.current = groupTabIds || null;
            }}
          >
            <FileText size={14} style={{ marginRight: '6px' }} />
            {lang === 'zh' ? '工作提示词' : 'Work Prompt'}
          </div>
          <div
            className="tab-context-menu-item"
            onClick={async () => {
              const tabId = contextMenu.tabId;
              let groupTabIds = contextMenu.groupTabIds;
              setContextMenu(null);
              
              // 分组 Tab：自动查找同分组（智能客服、企业微信或飞书）
              if (!groupTabIds) {
                const tab = tabs?.find(t => t.id === tabId);
                if (tab?.connectorId === 'smart-kf') {
                  const kfName = getSmartKfName(tab.title || '');
                  if (kfName && wecomGroups[kfName]) {
                    groupTabIds = wecomGroups[kfName].map(t => t.id);
                  }
                } else if (tab?.connectorId?.startsWith('wecom') && wecomGroups[tab.connectorId]) {
                  groupTabIds = wecomGroups[tab.connectorId].map(t => t.id);
                } else if (tab?.connectorId === 'feishu' && wecomGroups['feishu']) {
                  groupTabIds = wecomGroups[tab.connectorId].map(t => t.id);
                }
              }
              
              // 加载当前工作目录配置 + 系统默认值
              try {
                const result = await api.getTabWorkspaceDirs(tabId);
                // 同时获取系统默认工作目录（用于继承模式显示和自定义模式预填）
                let sysWorkspaceDirs: string[] = [];
                try {
                  const wsResult = await api.getWorkspaceSettings();
                  const ws = wsResult?.settings || wsResult;
                  sysWorkspaceDirs = ws?.workspaceDirs || [ws?.workspaceDir || ''];
                } catch { /* 静默 */ }
                
                if (result?.workspaceDirs && result.workspaceDirs.length > 0) {
                  setIsCustomWorkspace(true);
                  setWorkspaceMainDir(result.workspaceDirs[0]);
                  setWorkspaceExtraDirs(result.workspaceDirs.slice(1));
                } else {
                  setIsCustomWorkspace(false);
                  // 预填系统默认值，方便用户切换到自定义时基于此修改
                  setWorkspaceMainDir(sysWorkspaceDirs[0] || '');
                  setWorkspaceExtraDirs(sysWorkspaceDirs.slice(1));
                }
              } catch {
                setIsCustomWorkspace(false);
                setWorkspaceMainDir('');
                setWorkspaceExtraDirs([]);
              }
              setShowWorkspaceDirsDialog(tabId);
              workspaceDirsGroupRef.current = groupTabIds || null;
            }}
          >
            <FolderOpen size={14} style={{ marginRight: '6px' }} />
            {lang === 'zh' ? '工作目录' : 'Workspace'}
          </div>
          {/* 生图工具配置 */}
          <div
            className="tab-context-menu-item"
            onClick={async () => {
              const tabId = contextMenu.tabId;
              let groupTabIds = contextMenu.groupTabIds;
              setContextMenu(null);
              
              // 分组 Tab 处理
              if (!groupTabIds) {
                const tab = tabs?.find(t => t.id === tabId);
                if (tab?.connectorId === 'smart-kf') {
                  const kfName = getSmartKfName(tab.title || '');
                  if (kfName && wecomGroups[kfName]) {
                    groupTabIds = wecomGroups[kfName].map(t => t.id);
                  }
                } else if (tab?.connectorId?.startsWith('wecom') && wecomGroups[tab.connectorId]) {
                  groupTabIds = wecomGroups[tab.connectorId].map(t => t.id);
                } else if (tab?.connectorId === 'feishu' && wecomGroups['feishu']) {
                  groupTabIds = wecomGroups['feishu'].map(t => t.id);
                }
              }
              
              // 加载当前 tab 的图片工具配置
              try {
                const result = await api.getTabImageToolConfig(tabId);
                const actualResult = (result as any).data || result;
                if (actualResult.success && actualResult.config) {
                  setImageToolConfig(actualResult.config);
                } else {
                  // tab 没有自定义配置，用全局配置预填
                  try {
                    const globalConfig = await api.getImageGenerationToolConfig();
                    const gc = (globalConfig as any)?.data || globalConfig;
                    setImageToolConfig(gc ? { provider: gc.provider || 'deepbot', model: gc.model || '', apiUrl: gc.apiUrl || '', apiKey: gc.apiKey || '' } : null);
                  } catch {
                    setImageToolConfig(null);
                  }
                }
              } catch {
                setImageToolConfig(null);
              }
              setShowImageToolDialog(tabId);
              imageToolGroupRef.current = groupTabIds || null;
            }}
          >
            <ImageIcon size={14} style={{ marginRight: '6px' }} />
            {lang === 'zh' ? '生图工具' : 'Image Tool'}
          </div>
          {/* FAST 模式 */}
          <div
            className="tab-context-menu-item"
            onClick={async () => {
              const tabId = contextMenu.tabId;
              setContextMenu(null);
              // 加载当前 fast 模式状态
              try {
                const result = await api.getTabFastMode(tabId);
                setFastModeEnabled(result?.fastMode === true);
              } catch {
                setFastModeEnabled(false);
              }
              setShowFastModeDialog(tabId);
            }}
          >
            <Zap size={14} style={{ marginRight: '6px' }} />
            {lang === 'zh' ? 'FAST 模式' : 'FAST Mode'}
          </div>
          {/* Skill 白名单（仅智能客服分组显示） */}
          {contextMenu.isGroup && tabs?.find(t => t.id === contextMenu.tabId)?.connectorId === 'smart-kf' && (
            <div
              className="tab-context-menu-item"
              onClick={async () => {
                const tabId = contextMenu.tabId;
                let groupTabIds = contextMenu.groupTabIds;
                setContextMenu(null);
                
                // 分组 Tab：自动查找同分组的所有 Tab（智能客服、企业微信或飞书）
                if (!groupTabIds) {
                  const tab = tabs?.find(t => t.id === tabId);
                  if (tab?.connectorId === 'smart-kf') {
                    const kfName = getSmartKfName(tab.title || '');
                    if (kfName && wecomGroups[kfName]) {
                      groupTabIds = wecomGroups[kfName].map(t => t.id);
                    }
                  } else if (tab?.connectorId?.startsWith('wecom') && wecomGroups[tab.connectorId]) {
                    groupTabIds = wecomGroups[tab.connectorId].map(t => t.id);
                  } else if (tab?.connectorId === 'feishu' && wecomGroups['feishu']) {
                    groupTabIds = wecomGroups['feishu'].map(t => t.id);
                  }
                }
                
                // 加载当前白名单
                try {
                  const configResult = await api.getTabSkillWhitelist(tabId);
                  setSelectedSkills(new Set(configResult?.whitelist || []));
                } catch {
                  setSelectedSkills(new Set());
                }
                // 获取已安装 Skill 列表（只获取已启用的）
                try {
                  const result = await api.skillManager({ action: 'list' });
                  setAllSkills(result?.skills || []);
                } catch {
                  setAllSkills([]);
                }
                setShowSkillWhitelistDialog(tabId);
                skillWhitelistGroupRef.current = groupTabIds || null;
              }}
            >
              <Shield size={14} style={{ marginRight: '6px' }} />
              {lang === 'zh' ? 'Skill 白名单' : 'Skill Whitelist'}
            </div>
          )}
        </div>
      )}

      {/* 点击其他地方关闭右键菜单 */}
      {contextMenu && (
        <div className="tab-context-menu-backdrop" onClick={() => setContextMenu(null)} />
      )}

      {/* 模型选择弹窗 */}
      {showModelPicker && (
        <div className="settings-overlay" onClick={() => setShowModelPicker(null)}>
          <div
            className="settings-container tab-model-picker-container"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header">
              <h2 className="settings-title">
                {lang === 'zh' ? 'Tab 模型配置' : 'Tab Model Config'}
              </h2>
              <button className="settings-close-button" onClick={() => setShowModelPicker(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-panel tab-model-picker-panel">
              <ModelConfig onClose={async () => {
                // 分组模式：将模型配置同步到分组内所有其他 Tab
                if (modelPickerGroupRef.current && showModelPicker) {
                  try {
                    const tabResult = await api.getTabModelConfig(showModelPicker);
                    const modelConfig = tabResult?.modelConfig || null;
                    for (const otherTabId of modelPickerGroupRef.current) {
                      if (otherTabId !== showModelPicker) {
                        await api.setTabModelConfig(otherTabId, modelConfig);
                      }
                    }
                  } catch (err) {
                    console.error('同步分组模型配置失败:', err);
                  }
                  modelPickerGroupRef.current = null;
                }
                setShowModelPicker(null);
              }} tabId={showModelPicker} />
            </div>
          </div>
        </div>
      )}

      {/* Tab 取名弹窗 */}
      {showRenameDialog && (
        <div className="settings-overlay" onClick={() => setShowRenameDialog(null)}>
          <div
            className="settings-container tab-model-picker-container"
            style={{ width: '360px', height: 'auto', maxHeight: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header">
              <h2 className="settings-title">
                {lang === 'zh' ? 'Tab 取名' : 'Rename Tab'}
              </h2>
              <button className="settings-close-button" onClick={() => setShowRenameDialog(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-panel" style={{ padding: '12px 20px' }}>
              <div className="space-y-2">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => { if (e.target.value.length <= 20) setRenameValue(e.target.value); }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && renameValue.trim()) {
                      const result = await api.renameTab(showRenameDialog, renameValue.trim());
                      if (result.success) {
                        const name = renameValue.trim();
                        setShowRenameDialog(null);
                        const msg = lang === 'zh' ? `已经给你取了新名字叫「${result.title || name}」，你不用再设置，我已经设置好了` : `I've given you a new name: "${result.title || name}". No need to set it yourself, it's already done.`;
                        onSendMessage(msg);
                      } else {
                        alert(result.error || (lang === 'zh' ? '重命名失败' : 'Rename failed'));
                      }
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={lang === 'zh' ? '输入名称' : 'Enter name'}
                  autoFocus
                />
              </div>
              <div className="flex justify-end pt-3 mt-3 border-t">
                <button
                  onClick={async () => {
                    if (renameValue.trim()) {
                      const result = await api.renameTab(showRenameDialog, renameValue.trim());
                      if (result.success) {
                        const name = renameValue.trim();
                        setShowRenameDialog(null);
                        const msg = lang === 'zh' ? `已经给你取了新名字叫「${result.title || name}」，你不用再设置，我已经设置好了` : `I've given you a new name: "${result.title || name}". No need to set it yourself, it's already done.`;
                        onSendMessage(msg);
                      } else {
                        alert(result.error || (lang === 'zh' ? '重命名失败' : 'Rename failed'));
                      }
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  {lang === 'zh' ? '保存' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 工作提示词弹窗 */}
      {showWorkPromptDialog && (
        <div className="settings-overlay" onClick={() => setShowWorkPromptDialog(null)}>
          <div
            className="settings-container tab-model-picker-container"
            style={{ width: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header">
              <h2 className="settings-title">
                {lang === 'zh' ? '工作提示词' : 'Work Prompt'}
              </h2>
              <button className="settings-close-button" onClick={() => setShowWorkPromptDialog(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-panel" style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
              <div className="settings-alert settings-alert-success" style={{ marginBottom: '12px', flexShrink: 0 }}>
                <h4 className="text-sm font-medium text-green-900 mb-2">{lang === 'zh' ? '💡 什么是工作提示词？' : '💡 What is a Work Prompt?'}</h4>
                <p className="text-sm text-green-800">
                  {lang === 'zh'
                    ? '工作提示词可以告诉 AI 它应该扮演什么角色、用什么语气回复、需要注意哪些事项。设置后，AI 在每次对话中都会遵循这些指导。例如：「你是一个专业的售后客服，回复要简洁友好，遇到退款问题引导用户联系人工客服。」'
                    : 'Work prompts tell the AI what role to play, what tone to use, and what to pay attention to. Once set, the AI will follow these guidelines in every conversation.'}
                </p>
              </div>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <textarea
                  value={workPromptValue}
                  onChange={(e) => { if (e.target.value.length <= 10000) setWorkPromptValue(e.target.value); }}
                  className="settings-input"
                  style={{ width: '100%', minHeight: '300px', height: '100%', resize: 'none', fontFamily: 'inherit', fontSize: '13px', lineHeight: '1.5' }}
                  placeholder={lang === 'zh' ? '例如：\n你是一个专业的客服助手，请注意以下几点：\n1. 回复要简洁友好，不超过 200 字\n2. 遇到技术问题，先询问具体情况再给建议\n3. 无法解决的问题，引导用户联系人工客服' : 'e.g. You are a professional customer service assistant...'}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--settings-border, #e5e7eb)', marginTop: '12px', flexShrink: 0 }}>
                <span style={{ fontSize: '12px', color: 'var(--terminal-text-dim)' }}>
                  {workPromptValue.length} / 10000
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {workPromptValue && (
                    <button
                      onClick={async () => {
                        await api.setTabWorkPrompt(showWorkPromptDialog, null);
                        if (workPromptGroupRef.current) {
                          for (const otherTabId of workPromptGroupRef.current) {
                            if (otherTabId !== showWorkPromptDialog) {
                              await api.setTabWorkPrompt(otherTabId, null);
                            }
                          }
                          workPromptGroupRef.current = null;
                        }
                        setShowWorkPromptDialog(null);
                      }}
                      className="skill-icon-button"
                      style={{ padding: '8px 20px', fontSize: '13px' }}
                    >
                      {lang === 'zh' ? '清空' : 'Clear'}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const prompt = workPromptValue.trim() || null;
                      await api.setTabWorkPrompt(showWorkPromptDialog, prompt);
                      if (workPromptGroupRef.current) {
                        for (const otherTabId of workPromptGroupRef.current) {
                          if (otherTabId !== showWorkPromptDialog) {
                            await api.setTabWorkPrompt(otherTabId, prompt);
                          }
                        }
                        workPromptGroupRef.current = null;
                      }
                      setShowWorkPromptDialog(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    {lang === 'zh' ? '保存配置' : 'Save Configuration'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skill 白名单弹窗 */}
      {showSkillWhitelistDialog && (
        <div className="settings-overlay" onClick={() => setShowSkillWhitelistDialog(null)}>
          <div
            className="settings-container tab-model-picker-container"
            style={{ width: '500px', maxHeight: '70vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header">
              <h2 className="settings-title">
                {lang === 'zh' ? 'Skill 白名单' : 'Skill Whitelist'}
              </h2>
              <button className="settings-close-button" onClick={() => setShowSkillWhitelistDialog(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-panel" style={{ padding: '16px 24px' }}>
              <div className="settings-alert settings-alert-success" style={{ marginBottom: '12px' }}>
                <h4 className="text-sm font-medium text-green-900 mb-2">{lang === 'zh' ? '🔒 Skill 安全控制' : '🔒 Skill Security'}</h4>
                <p className="text-sm text-green-800">
                  {lang === 'zh'
                    ? '勾选允许在智能客服会话中使用的 Skill。未勾选的 Skill 将被禁止执行，确保客服场景的安全性。'
                    : 'Select Skills allowed in Smart KF sessions. Unchecked Skills will be blocked for security.'}
                </p>
              </div>
              {allSkills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--terminal-text-dim)' }}>
                  {lang === 'zh' ? '暂无已安装的 Skill' : 'No installed Skills'}
                </div>
              ) : (
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {allSkills.map((skill) => (
                    <label
                      key={skill.name}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 4px', cursor: 'pointer', borderBottom: '1px solid var(--terminal-border)' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSkills.has(skill.name)}
                        onChange={(e) => {
                          const next = new Set(selectedSkills);
                          if (e.target.checked) {
                            next.add(skill.name);
                          } else {
                            next.delete(skill.name);
                          }
                          setSelectedSkills(next);
                        }}
                        style={{ flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{skill.name}</div>
                        {skill.description && (
                          <div style={{ fontSize: '11px', color: 'var(--terminal-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill.description}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button
                  onClick={async () => {
                    const whitelist = selectedSkills.size > 0 ? Array.from(selectedSkills) : null;
                    await api.setTabSkillWhitelist(showSkillWhitelistDialog, whitelist);
                    // 分组模式：同步到所有 Tab
                    if (skillWhitelistGroupRef.current) {
                      for (const otherTabId of skillWhitelistGroupRef.current) {
                        if (otherTabId !== showSkillWhitelistDialog) {
                          await api.setTabSkillWhitelist(otherTabId, whitelist);
                        }
                      }
                      skillWhitelistGroupRef.current = null;
                    }
                    setShowSkillWhitelistDialog(null);
                  }}
                  className="skill-icon-button skill-icon-button-accent"
                  style={{ padding: '6px 16px', fontSize: '12px' }}
                >
                  {lang === 'zh' ? '保存' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 工作目录弹窗 */}
      {showWorkspaceDirsDialog && (
        <div className="settings-overlay" onClick={() => setShowWorkspaceDirsDialog(null)}>
          <div
            className="settings-container tab-model-picker-container"
            style={{ width: '550px', maxHeight: '70vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header">
              <h2 className="settings-title">
                {lang === 'zh' ? '工作目录' : 'Workspace Directory'}
              </h2>
              <button className="settings-close-button" onClick={() => setShowWorkspaceDirsDialog(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-panel" style={{ padding: '16px 24px' }}>
              {/* 继承/自定义切换 */}
              <div className="space-y-2 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={!isCustomWorkspace} onChange={() => setIsCustomWorkspace(false)} />
                  <span className="text-sm">{lang === 'zh' ? '继承系统工作目录' : 'Inherit system workspace'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={isCustomWorkspace} onChange={() => setIsCustomWorkspace(true)} />
                  <span className="text-sm">{lang === 'zh' ? '自定义' : 'Custom'}</span>
                </label>
              </div>

              {isCustomWorkspace && (
                <div className="space-y-4">
                  {/* 主工作目录 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      {lang === 'zh' ? '主工作目录' : 'Main workspace'} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={workspaceMainDir}
                        onChange={(e) => setWorkspaceMainDir(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={isElectron() ? '/Users/xxx/projects' : 'projects（相对于 /data/workspace/）'}
                      />
                      {isElectron() && (
                        <button
                          onClick={async () => {
                            const result = await api.selectFolder();
                            if (result?.success && result.path) setWorkspaceMainDir(result.path);
                          }}
                          className="skill-icon-button"
                          title={lang === 'zh' ? '浏览' : 'Browse'}
                        ><FolderOpen size={16} /></button>
                      )}
                    </div>
                    {!isElectron() && (
                      <p className="text-xs text-gray-500">
                        {lang === 'zh' ? '填写 /data/workspace/ 之后的子目录路径，如 projects。完整路径为 /data/workspace/projects' : 'Enter subdirectory under /data/workspace/, e.g. projects'}
                      </p>
                    )}
                  </div>

                  {/* 额外工作目录 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      {lang === 'zh' ? '额外工作目录（可选）' : 'Extra directories (optional)'}
                    </label>
                    {workspaceExtraDirs.map((dir, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          value={dir}
                          onChange={(e) => {
                            const next = [...workspaceExtraDirs];
                            next[idx] = e.target.value;
                            setWorkspaceExtraDirs(next);
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={isElectron() ? '/Users/xxx/other' : 'other（相对于 /data/workspace/）'}
                        />
                        {isElectron() && (
                          <button
                            onClick={async () => {
                              const result = await api.selectFolder();
                              if (result?.success && result.path) {
                                const next = [...workspaceExtraDirs];
                                next[idx] = result.path;
                                setWorkspaceExtraDirs(next);
                              }
                            }}
                            className="skill-icon-button"
                            title={lang === 'zh' ? '浏览' : 'Browse'}
                          ><FolderOpen size={16} /></button>
                        )}
                        <button
                          onClick={() => setWorkspaceExtraDirs(prev => prev.filter((_, i) => i !== idx))}
                          className="skill-icon-button"
                          style={{ color: 'var(--settings-error)' }}
                        ><X size={16} /></button>
                      </div>
                    ))}
                    <button
                      onClick={() => setWorkspaceExtraDirs(prev => [...prev, ''])}
                      className="skill-icon-button skill-icon-button-accent"
                    >
                      <span style={{ fontSize: '12px' }}>+ {lang === 'zh' ? '添加目录' : 'Add directory'}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t mt-4">
                <button
                  onClick={async () => {
                    if (isCustomWorkspace) {
                      const mainDir = workspaceMainDir.trim();
                      if (!mainDir) return;
                      
                      // Docker 模式：自动拼接 /data/workspace/ 前缀
                      let finalMainDir = mainDir;
                      let finalExtraDirs = workspaceExtraDirs.filter(d => d.trim()).map(d => d.trim());
                      if (!isElectron()) {
                        finalMainDir = mainDir.startsWith('/data/workspace') ? mainDir : `/data/workspace/${mainDir}`;
                        finalExtraDirs = finalExtraDirs.map(d => d.startsWith('/data/workspace') ? d : `/data/workspace/${d}`);
                      }
                      
                      const allDirs = [finalMainDir, ...finalExtraDirs];
                      await api.setTabWorkspaceDirs(showWorkspaceDirsDialog, allDirs);
                      // 分组同步
                      if (workspaceDirsGroupRef.current) {
                        for (const otherTabId of workspaceDirsGroupRef.current) {
                          if (otherTabId !== showWorkspaceDirsDialog) {
                            await api.setTabWorkspaceDirs(otherTabId, allDirs);
                          }
                        }
                        workspaceDirsGroupRef.current = null;
                      }
                    } else {
                      // 继承系统：清空自定义
                      await api.setTabWorkspaceDirs(showWorkspaceDirsDialog, null);
                      if (workspaceDirsGroupRef.current) {
                        for (const otherTabId of workspaceDirsGroupRef.current) {
                          if (otherTabId !== showWorkspaceDirsDialog) {
                            await api.setTabWorkspaceDirs(otherTabId, null);
                          }
                        }
                        workspaceDirsGroupRef.current = null;
                      }
                    }
                    setShowWorkspaceDirsDialog(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  {lang === 'zh' ? '保存配置' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 生图工具配置弹窗 */}
      {showImageToolDialog && (
        <div className="settings-overlay" onClick={() => setShowImageToolDialog(null)}>
          <div
            className="settings-container tab-model-picker-container"
            style={{ width: '550px', maxHeight: '70vh', height: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header">
              <h2 className="settings-title">{lang === 'zh' ? '生图工具配置' : 'Image Tool Config'}</h2>
              <button className="settings-close-button" onClick={() => setShowImageToolDialog(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-panel" style={{ padding: '16px 24px' }}>
              {/* 提供商选择 */}
              <div className="space-y-2 mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  {lang === 'zh' ? '提供商' : 'Provider'}
                </label>
                <select
                  value={imageToolConfig?.provider || 'deepbot'}
                  onChange={(e) => {
                    const provider = e.target.value as keyof typeof IMAGE_GENERATION_PROVIDER_PRESETS;
                    const preset = IMAGE_GENERATION_PROVIDER_PRESETS[provider];
                    if (preset) {
                      setImageToolConfig({
                        provider,
                        model: preset.defaultModelId,
                        apiUrl: preset.baseUrl,
                        apiKey: imageToolConfig?.apiKey || '',
                      });
                    } else {
                      setImageToolConfig({ ...imageToolConfig || { model: '', apiUrl: '', apiKey: '' }, provider });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="deepbot">DeepBot（Gemini）</option>
                  <option value="deepbot-gpt">DeepBot（GPT Image）</option>
                  <option value="qwen">Qwen Image</option>
                </select>
              </div>

              {/* 模型 */}
              <div className="space-y-2 mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  {lang === 'zh' ? '模型' : 'Model'}
                </label>
                <input
                  type="text"
                  value={imageToolConfig?.model || ''}
                  onChange={(e) => setImageToolConfig({ ...imageToolConfig || { model: '', apiUrl: '', apiKey: '' }, model: e.target.value })}
                  placeholder="gemini-2.0-flash-preview-image-generation"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* API URL */}
              <div className="space-y-2 mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  {lang === 'zh' ? 'API 地址' : 'API URL'}
                </label>
                <input
                  type="text"
                  value={imageToolConfig?.apiUrl || ''}
                  onChange={(e) => setImageToolConfig({ ...imageToolConfig || { model: '', apiUrl: '', apiKey: '' }, apiUrl: e.target.value })}
                  placeholder="https://im-director.com/tool/gemini"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* API Key */}
              <div className="space-y-2 mb-4">
                <label className="block text-sm font-medium text-gray-700">API Key</label>
                <input
                  type="password"
                  value={imageToolConfig?.apiKey || ''}
                  onChange={(e) => setImageToolConfig({ ...imageToolConfig || { model: '', apiUrl: '', apiKey: '' }, apiKey: e.target.value })}
                  placeholder={lang === 'zh' ? '留空则使用全局配置的 Key' : 'Leave empty to use global key'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 底部按钮 */}
              <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                <button
                  onClick={async () => {
                    const tabId = showImageToolDialog!;
                    await api.saveTabImageToolConfig(tabId, null);
                    if (imageToolGroupRef.current) {
                      for (const otherTabId of imageToolGroupRef.current) {
                        if (otherTabId !== tabId) {
                          await api.saveTabImageToolConfig(otherTabId, null);
                        }
                      }
                    }
                    setShowImageToolDialog(null);
                    showToast('success', lang === 'zh' ? '✅ 已还原为全局配置' : '✅ Restored to global config');
                  }}
                  className="skill-icon-button"
                  style={{ padding: '8px 16px', borderRadius: '6px' }}
                >
                  {lang === 'zh' ? '还原默认' : 'Reset'}
                </button>
                <button
                  onClick={async () => {
                    const tabId = showImageToolDialog!;
                    const configToSave = imageToolConfig && (imageToolConfig.model || imageToolConfig.apiUrl || imageToolConfig.apiKey)
                      ? imageToolConfig
                      : null;
                    const result = await api.saveTabImageToolConfig(tabId, configToSave);
                    if (result && result.success === false) {
                      showToast('error', (result as any).error || (lang === 'zh' ? 'API Key 无效，请检查是否正确' : 'API Key invalid, please check'));
                      return;
                    }
                    if (imageToolGroupRef.current) {
                      for (const otherTabId of imageToolGroupRef.current) {
                        if (otherTabId !== tabId) {
                          await api.saveTabImageToolConfig(otherTabId, configToSave);
                        }
                      }
                    }
                    setShowImageToolDialog(null);
                    showToast('success', lang === 'zh' ? '✅ 生图工具配置已保存' : '✅ Image tool config saved');
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  {lang === 'zh' ? '保存配置' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FAST 模式弹窗 */}
      {showFastModeDialog && (
        <div className="settings-overlay" onClick={() => setShowFastModeDialog(null)}>
          <div
            className="settings-container tab-model-picker-container"
            style={{ width: '420px', height: 'auto', maxHeight: '300px', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header">
              <h2 className="settings-title">
                {lang === 'zh' ? '⚡ FAST 模式' : '⚡ FAST Mode'}
              </h2>
              <button className="settings-close-button" onClick={() => setShowFastModeDialog(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-panel" style={{ padding: '16px 24px' }}>
              <div className="settings-alert settings-alert-success" style={{ marginBottom: '16px' }}>
                <p className="text-sm text-green-800">
                  {lang === 'zh'
                    ? '开启后不加载工具描述和 Agent 指令，大幅减少 Token 消耗，适合简单问答场景。'
                    : 'When enabled, tool descriptions and agent instructions are skipped, significantly reducing token usage. Suitable for simple Q&A.'}
                </p>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 0' }}
                onClick={async () => {
                  const newValue = !fastModeEnabled;
                  setFastModeEnabled(newValue);
                  setTabFastModes(prev => ({ ...prev, [showFastModeDialog!]: newValue }));
                  await api.setTabFastMode(showFastModeDialog!, newValue);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: fastModeEnabled ? 'var(--terminal-accent)' : 'var(--terminal-text-dim)' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  {fastModeEnabled && <polyline points="9 11 12 14 22 4" />}
                </svg>
                <span style={{ fontSize: '14px', color: 'var(--terminal-text)' }}>
                  {lang === 'zh' ? '启用 FAST 模式' : 'Enable FAST Mode'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 消息列表区域 */}
      <div ref={messagesContainerRef} className="terminal-content flex-1">
        {isInitializing ? (
          // 初始化提示 - 显示在提示符后面
          <div className="terminal-line" style={{ display: 'block' }}>
            <span className="terminal-prompt agent">{agentName}@deepbot:~&gt;</span>
            <span className="terminal-message system">{lang === 'zh' ? '正在初始化系统...' : 'Initializing system...'}</span>
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
                  {loadingText}
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

      {/* 输入框 - 智能客服 Tab 显示特殊输入框 */}
      {tabs && activeTabId && tabs.find(t => t.id === activeTabId)?.type === 'connector' ? (
        // 智能客服 Tab：显示带模式切换的输入框
        currentTab?.connectorId === 'smart-kf' ? (
          <MessageInput
            ref={messageInputRef}
            onSend={handleSendMessage}
            onStop={onStopGeneration}
            disabled={isLoading || isLocked || isInitializing}
            isGenerating={isLoading}
            userName={userName}
            disableStop={isLocked}
            isConnectorTab={true}
            activeTabId={activeTabId}
            isSmartKfTab={true}
            wecomReplyMode={currentWecomReplyMode}
            onWecomReplyModeChange={async (mode) => {
              // 保存到本地状态
              setWecomReplyModes(prev => ({ ...prev, [activeTabId]: mode }));
              // 持久化到后端
              try {
                await api.setTabReplyMode(activeTabId, mode);
              } catch {
                // 静默处理
              }
            }}
            onDirectReply={async (content) => {
              // 人工直接回复：调用后端 API 直接发送给客户
              try {
                const result = await api.connectorDirectReply(activeTabId, content);
                if (!result.success) {
                  console.error('直接回复失败:', result.error);
                }
              } catch (error) {
                console.error('直接回复异常:', error);
              }
            }}
          />
        ) : null
      ) : (
        <MessageInput 
          ref={messageInputRef}
          onSend={handleSendMessage}
          onStop={onStopGeneration} 
          disabled={isLoading || isLocked || isInitializing} 
          isGenerating={isLoading}
          userName={userName}
          disableStop={isLocked}
          activeTabId={activeTabId}
        />
      )}
    </div>
  );
});

// 设置 displayName 以便调试
ChatWindow.displayName = 'ChatWindow';
