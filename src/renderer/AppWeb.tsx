/**
 * DeepBot Web 版本主应用组件
 * 使用统一 API 适配器，支持 HTTP + WebSocket 通信
 */

import React, { useState, useEffect } from 'react';
import './styles/terminal.css';
import './styles/tabs.css';
import { ChatWindow } from './components/ChatWindow';
import { SkillManager } from './components/SkillManager';
import { ScheduledTaskManager } from './components/ScheduledTaskManager';
import { SystemSettings } from './components/SystemSettings';
import { LoginPage } from './components/LoginPage';
import { Message } from '../types/message';
import type { AgentTab } from '../types/agent-tab';
import { api } from './api';
import { ThemeContext } from './App';
import { useTheme } from './hooks/useTheme';

export function AppWeb() {
  // 主题管理
  const { mode: themeMode, setThemeMode } = useTheme();

  // 字体大小初始化
  useEffect(() => {
    const saved = localStorage.getItem('deepbot-font-size');
    if (saved) {
      document.documentElement.setAttribute('data-font-size', saved);
    }
  }, []);

  // 登录状态
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // Tab 管理
  const [tabs, setTabs] = useState<AgentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('default');
  
  // 当前 Tab 的状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSkillManagerOpen, setIsSkillManagerOpen] = useState(false);
  const [isScheduledTaskManagerOpen, setIsScheduledTaskManagerOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [hasModelConfig, setHasModelConfig] = useState(true);
  const [pendingPairingCount, setPendingPairingCount] = useState(0);
  const [isKicked, setIsKicked] = useState(false);

  // 检查登录状态并建立 WebSocket 连接
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        setIsAuthenticated(true);
      }
      setIsCheckingAuth(false);
    };
    
    checkAuth();
  }, []);
  
  // 🔥 登录后建立 WebSocket 连接（统一在这里处理）
  useEffect(() => {
    if (isAuthenticated) {
      console.log('[AppWeb] 用户已登录，建立 WebSocket 连接');
      api.createWebSocket();
    }
  }, [isAuthenticated]);

  // 监听被踢出事件
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = api.onSessionKicked(() => {
      console.log('[AppWeb] 🔒 当前会话被踢出');
      setIsKicked(true);
    });
    return unsubscribe;
  }, [isAuthenticated]);

  // 登录成功处理
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    // WebSocket 连接会在 useEffect 中自动建立
  };

  // 加载所有 Tab
  useEffect(() => {
    if (!isAuthenticated) return;
    
    loadTabs();
    
    // 🔥 Web 模式：通过 WebSocket 监听事件
    const unsubscribeTabCreated = api.onTabCreated((data) => {
      // 新 Tab 创建时立即订阅 WebSocket，确保能收到历史记录事件
      api.subscribeTab(data.tab.id);
      setTabs(prev => {
        if (prev.some(t => t.id === data.tab.id)) {
          return prev;
        }
        return [...prev, data.tab];
      });
    });

    const unsubscribeTabUpdated = api.onTabUpdated((data: { tabId: string; title: string }) => {
      setTabs(prev => prev.map(tab =>
        tab.id === data.tabId ? { ...tab, title: data.title } : tab
      ));
    });
    
    const unsubscribeMessagesCleared = api.onTabMessagesCleared((data: { tabId: string }) => {
      setTabs(prev => prev.map(tab => 
        tab.id === data.tabId 
          ? { ...tab, messages: [] }
          : tab
      ));
    });
    
    const unsubscribeNameUpdate = api.onNameConfigUpdate((config) => {
      if (config.isGlobalUpdate && config.agentName) {
        setTabs(prev => prev.map(tab => {
          if (tab.id === 'default') {
            return { ...tab, title: config.agentName! };
          }
          
          const match = tab.title.match(/\s+(\d+)$/);
          if (match) {
            const number = match[1];
            return { ...tab, title: `${config.agentName} ${number}` };
          }
          
          return tab;
        }));
      } else if (config.tabId && config.agentName) {
        setTabs(prev => prev.map(tab => 
          tab.id === config.tabId 
            ? { ...tab, title: config.agentName! }
            : tab
        ));
      }
    });
    
    return () => {
      unsubscribeTabCreated();
      unsubscribeTabUpdated();
      unsubscribeMessagesCleared();
      unsubscribeNameUpdate();
    };
  }, [isAuthenticated]);
  
  const loadTabs = async () => {
    try {
      const result = await api.getAllTabs();
      if (result.success && result.tabs) {
        setTabs(result.tabs);
      }
    } catch (error) {
      console.error('加载 Tab 失败:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Gateway 未初始化')) {
        setTimeout(() => {
          loadTabs();
        }, 500);
      }
    }
  };
  
  // 当切换 Tab 时，更新当前 Tab 的消息
  useEffect(() => {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab) {
      setMessages(currentTab.messages);
      setIsLoading(currentTab.isLoading);
    }
  }, [activeTabId, tabs]);
  
  // 监听历史消息加载事件
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const cleanup = api.onTabHistoryLoaded((data: { tabId: string; messages: Message[] }) => {
      setTabs(prev => prev.map(tab => 
        tab.id === data.tabId 
          ? { ...tab, messages: data.messages }
          : tab
      ));
      
      if (data.tabId === activeTabId) {
        setMessages(data.messages);
      }
    });
    
    return cleanup;
  }, [activeTabId, isAuthenticated]);
  
  // 获取当前 Tab
  const currentTab = tabs.find(t => t.id === activeTabId);
  const isCurrentTabLocked = currentTab?.isLocked || false;
  
  // 创建新 Tab
  const handleCreateTab = async () => {
    try {
      const result = await api.createTab();
      if (result.success && result.tab) {
        // 立即添加到 Tab 列表（不等待 WebSocket 事件）
        setTabs(prev => {
          if (prev.some(t => t.id === result.tab!.id)) {
            return prev;
          }
          return [...prev, result.tab!];
        });
        // 切换到新 Tab（会自动订阅 WebSocket）
        await handleSwitchTab(result.tab.id);
      } else if (result.error) {
        alert(result.error);
      }
    } catch (error) {
      console.error('创建 Tab 失败:', error);
      alert('创建窗口失败');
    }
  };
  
  // 关闭 Tab
  const handleCloseTab = async (tabId: string) => {
    try {
      const tabToDelete = tabs.find(t => t.id === tabId);
      if (!tabToDelete) return;
      
      const confirmed = window.confirm(
        `确定要删除 "${tabToDelete.title}" 吗？\n\n删除后将清空该窗口的所有对话记忆，此操作不可恢复。`
      );
      
      if (!confirmed) {
        return;
      }
      
      const result = await api.closeTab(tabId);
      if (result.success) {
        setTabs(prev => prev.filter(t => t.id !== tabId));
        if (tabId === activeTabId) {
          setActiveTabId('default');
        }
      } else if (result.error) {
        alert(result.error);
      }
    } catch (error) {
      console.error('关闭 Tab 失败:', error);
      alert('关闭窗口失败');
    }
  };
  
  // 切换 Tab
  const handleSwitchTab = async (tabId: string) => {
    setActiveTabId(tabId);
    try {
      await api.switchTab(tabId);
    } catch (error) {
      console.error('切换 Tab 失败:', error);
    }
  };
  
  // 更新当前 Tab 的消息
  const updateCurrentTabMessages = (updater: (prev: Message[]) => Message[]) => {
    setMessages(updater);
    
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, messages: updater(tab.messages) }
        : tab
    ));
  };
  
  // 更新当前 Tab 的加载状态
  const updateCurrentTabLoading = (loading: boolean) => {
    setIsLoading(loading);
    
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, isLoading: loading }
        : tab
    ));
  };

  // 检查模型配置
  useEffect(() => {
    if (!isAuthenticated) return;
    
    checkModelConfig();
    loadPendingPairingCount();
    
    const unsubscribeModel = api.onModelConfigUpdate(() => {
      setHasModelConfig(true);
    });
    
    const unsubscribePending = api.onPendingCountUpdate?.((data: { pendingCount: number }) => {
      setPendingPairingCount(data.pendingCount);
    });
    
    return () => {
      unsubscribeModel();
      unsubscribePending?.();
    };
  }, [isAuthenticated]);

  const checkModelConfig = async () => {
    try {
      const result = await api.getModelConfig();
      const actualResult = result.data || result;
      
      if (!actualResult.success || !actualResult.config || !actualResult.config.apiKey) {
        setHasModelConfig(false);
        setIsSystemSettingsOpen(true);
        
        const systemMessage: Message = {
          id: Date.now().toString(),
          role: 'system',
          content: '⚠️ 模型未配置，请在系统设置中配置 AI 模型后再使用。',
          timestamp: Date.now(),
        };
        updateCurrentTabMessages(() => [systemMessage]);
      } else {
        setHasModelConfig(true);
      }
    } catch (error) {
      setHasModelConfig(false);
      setIsSystemSettingsOpen(true);
    }
  };

  // 加载初始待授权用户数量
  const loadPendingPairingCount = async () => {
    try {
      const result = await api.connectorGetPairingRecords();
      if (result.success && result.records) {
        const pending = result.records.filter((r: { approved: boolean }) => !r.approved).length;
        setPendingPairingCount(pending);
      }
    } catch (error) {
      // 忽略错误
    }
  };

  // 使用 ref 存储最新的 tabs 状态
  const tabsRef = React.useRef<AgentTab[]>(tabs);
  
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // 监听清空所有消息事件
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const unsubscribe = api.onClearAllMessages(() => {
      setTabs(prev => prev.map(tab => ({ ...tab, messages: [] })));
      setMessages([]);
    });
    
    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  // 监听清空单个 Tab 聊天事件
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const unsubscribe = api.onClearChat?.((data: { sessionId: string }) => {
      setTabs(prev => prev.map(tab => 
        tab.id === data.sessionId ? { ...tab, messages: [] } : tab
      ));
      
      if (data.sessionId === activeTabId) {
        setMessages([]);
      }
    });
    
    return () => {
      unsubscribe?.();
    };
  }, [activeTabId, isAuthenticated]);

  // 监听流式消息和执行步骤
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const unsubscribeStream = api.onMessageStream((chunk) => {
      const targetTabId = chunk.sessionId || activeTabId;
      
      if (!tabsRef.current.some(tab => tab.id === targetTabId)) {
        return;
      }
      
      // 处理用户消息
      if ((chunk as any).role === 'user') {
        const userMessage: Message = {
          id: chunk.messageId,
          role: 'user',
          content: chunk.content,
          timestamp: Date.now(),
        };
        
        requestAnimationFrame(() => {
          setTabs(prev => prev.map(tab => {
            if (tab.id !== targetTabId) return tab;
            return { 
              ...tab, 
              messages: [...(tab.messages || []), userMessage],
              isLoading: true,
            };
          }));
          
          if (targetTabId === activeTabId) {
            setMessages(prev => [...prev, userMessage]);
            setIsLoading(true);
          }
        });
        
        return;
      }
      
      if (chunk.done) {
        requestAnimationFrame(() => {
          setTabs(prev => prev.map(tab => {
            if (tab.id !== targetTabId) return tab;
            
            const updatedMessages = (tab.messages || []).map(msg =>
              msg.id === chunk.messageId
                ? { 
                    ...msg, 
                    executionSteps: chunk.executionSteps || msg.executionSteps,
                    totalDuration: chunk.totalDuration,
                    sentAt: chunk.sentAt,
                    isStreaming: false 
                  }
                : msg
            );
            
            return { ...tab, messages: updatedMessages, isLoading: false };
          }));
          
          if (targetTabId === activeTabId) {
            setMessages(prev => prev.map(msg =>
              msg.id === chunk.messageId
                ? { 
                    ...msg, 
                    executionSteps: chunk.executionSteps || msg.executionSteps,
                    totalDuration: chunk.totalDuration,
                    sentAt: chunk.sentAt,
                    isStreaming: false 
                  }
                : msg
            ));
            setIsLoading(false);
          }
        });
      } else {
        const isSubAgentResult = chunk.isSubAgentResult === true;
        const subAgentTask = chunk.subAgentTask;
        
        requestAnimationFrame(() => {
          setTabs(prev => prev.map(tab => {
            if (tab.id !== targetTabId) return tab;
            
            const existingMessages = tab.messages || [];
            const existingIndex = existingMessages.findIndex(msg => msg.id === chunk.messageId);
            
            let updatedMessages: Message[];
            if (existingIndex >= 0) {
              updatedMessages = [
                ...existingMessages.slice(0, existingIndex),
                {
                  ...existingMessages[existingIndex],
                  content: existingMessages[existingIndex].content + chunk.content,
                  executionSteps: existingMessages[existingIndex].executionSteps,
                },
                ...existingMessages.slice(existingIndex + 1),
              ];
            } else {
              const newMessage: Message = {
                id: chunk.messageId,
                role: 'assistant',
                content: chunk.content,
                timestamp: Date.now(),
                isStreaming: true,
                isSubAgentResult,
                subAgentTask,
                executionSteps: [],
              };
              updatedMessages = [...existingMessages, newMessage];
            }
            
            return { ...tab, messages: updatedMessages };
          }));
          
          if (targetTabId === activeTabId) {
            setMessages(prev => {
              const existingIndex = prev.findIndex(msg => msg.id === chunk.messageId);
              
              if (existingIndex >= 0) {
                return [
                  ...prev.slice(0, existingIndex),
                  {
                    ...prev[existingIndex],
                    content: prev[existingIndex].content + chunk.content,
                  },
                  ...prev.slice(existingIndex + 1),
                ];
              } else {
                const newMessage: Message = {
                  id: chunk.messageId,
                  role: 'assistant',
                  content: chunk.content,
                  timestamp: Date.now(),
                  isStreaming: true,
                  isSubAgentResult,
                  subAgentTask,
                };
                return [...prev, newMessage];
              }
            });
          }
        });
      }
    });

    // 监听执行步骤更新
    const unsubscribeExecutionSteps = api.onExecutionStepUpdate?.((data) => {
      const targetTabId = data.sessionId || activeTabId;
      
      if (!tabsRef.current.some(tab => tab.id === targetTabId)) {
        return;
      }
      
      setTabs(prev => prev.map(tab => {
        if (tab.id !== targetTabId) return tab;
        
        const existingMessages = tab.messages || [];
        const existingIndex = existingMessages.findIndex(msg => msg.id === data.messageId);
        
        let updatedMessages: Message[];
        if (existingIndex >= 0) {
          updatedMessages = existingMessages.map(msg =>
            msg.id === data.messageId
              ? { ...msg, executionSteps: data.executionSteps }
              : msg
          );
        } else {
          const newMessage: Message = {
            id: data.messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            executionSteps: data.executionSteps,
          };
          updatedMessages = [...existingMessages, newMessage];
        }
        
        return { ...tab, messages: updatedMessages };
      }));
      
      if (targetTabId === activeTabId) {
        setMessages(prev => {
          const existingIndex = prev.findIndex(msg => msg.id === data.messageId);
          
          if (existingIndex >= 0) {
            return prev.map(msg =>
              msg.id === data.messageId
                ? { ...msg, executionSteps: data.executionSteps }
                : msg
            );
          } else {
            const newMessage: Message = {
              id: data.messageId,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
              executionSteps: data.executionSteps,
            };
            return [...prev, newMessage];
          }
        });
      }
    });

    const unsubscribeError = api.onMessageError((error) => {
      const targetTabId = error.sessionId || activeTabId;
      
      if (!tabsRef.current.some(tab => tab.id === targetTabId)) {
        return;
      }
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'system',
        content: `❌ **错误**\n\n${error.error || '未知错误'}\n\n💡 提示：请检查系统设置中的模型配置。`,
        timestamp: Date.now(),
      };
      
      setTabs(prev => prev.map(tab => {
        if (tab.id !== targetTabId) return tab;
        return { ...tab, messages: [...(tab.messages || []), errorMessage], isLoading: false };
      }));
      
      if (targetTabId === activeTabId) {
        setMessages(prev => [...prev, errorMessage]);
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribeStream();
      unsubscribeExecutionSteps?.();
      unsubscribeError();
    };
  }, [activeTabId, isAuthenticated]);

  // 发送消息
  const handleSendMessage = async (
    content: string, 
    images?: import('../types/message').UploadedImage[],
    files?: import('../types/message').UploadedFile[]
  ) => {
    if (!hasModelConfig) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'system',
        content: '⚠️ 模型未配置，请先在系统设置中配置 AI 模型。',
        timestamp: Date.now(),
      };
      updateCurrentTabMessages((prev) => [...prev, errorMessage]);
      setIsSystemSettingsOpen(true);
      return;
    }

    let messageContent = content;
    if (images && images.length > 0) {
      const imagePaths = images.map((img, index) => `[参考图${index + 1}]: ${img.path}`).join('\n');
      messageContent = `${imagePaths}\n\n${content}`;
    }

    if (files && files.length > 0) {
      const filePaths = files.map((file, index) => `[参考文件${index + 1}]: ${file.path}`).join('\n');
      messageContent = `${filePaths}\n\n${messageContent}`;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      uploadedImages: images,
      uploadedFiles: files,
    };
    updateCurrentTabMessages((prev) => [...prev, userMessage]);

    updateCurrentTabLoading(true);

    try {
      await api.sendMessage(messageContent, activeTabId);
    } catch (error) {
      updateCurrentTabLoading(false);
      
      const errorMsg = error instanceof Error ? error.message : '发送消息失败，请重试';
      const isConfigError = errorMsg.includes('模型未配置') || errorMsg.includes('API Key');
      
      updateCurrentTabMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'system',
          content: isConfigError 
            ? `⚠️ ${errorMsg}\n\n请点击右上角设置图标配置 AI 模型。`
            : `❌ ${errorMsg}`,
          timestamp: Date.now(),
        },
      ]);
      
      if (isConfigError) {
        setIsSystemSettingsOpen(true);
      }
    }
  };

  // 停止生成
  const handleStopGeneration = async () => {
    try {
      await api.stopGeneration(activeTabId);
      updateCurrentTabLoading(false);
    } catch (error) {
      // 忽略错误
    }
  };

  // 显示加载中或登录页面
  if (isCheckingAuth) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      加载中...
    </div>;
  }

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <ThemeContext.Provider value={{ mode: themeMode, setThemeMode }}>
      <ChatWindow
        messages={messages}
        onSendMessage={handleSendMessage}
        onStopGeneration={handleStopGeneration}
        isLoading={isLoading}
        isLocked={isCurrentTabLocked}
        onOpenSkillManager={() => setIsSkillManagerOpen(true)}
        onOpenScheduledTaskManager={() => setIsScheduledTaskManagerOpen(true)}
        onOpenSystemSettings={() => setIsSystemSettingsOpen(true)}
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={handleSwitchTab}
        onTabClose={handleCloseTab}
        onTabCreate={handleCreateTab}
        pendingPairingCount={pendingPairingCount}
      />
      
      <SkillManager
        isOpen={isSkillManagerOpen}
        onClose={() => setIsSkillManagerOpen(false)}
      />
      
      <ScheduledTaskManager
        isOpen={isScheduledTaskManagerOpen}
        onClose={() => setIsScheduledTaskManagerOpen(false)}
      />
      
      <SystemSettings
        isOpen={isSystemSettingsOpen}
        activeTabId={activeTabId}
        onClose={() => {
          setIsSystemSettingsOpen(false);
          // 关闭设置面板后重新检查模型配置（首次配置场景）
          checkModelConfig();
        }}
      />

      {/* 被踢出遮罩层 */}
      {isKicked && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(26, 31, 46, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999,
          gap: '20px',
        }}>
          <div style={{ fontSize: '48px' }}>🔒</div>
          <div style={{ color: '#f7768e', fontSize: '18px', fontWeight: 600 }}>
            会话已断开
          </div>
          <div style={{ color: '#8b9aaf', fontSize: '14px', textAlign: 'center', lineHeight: 1.6 }}>
            你的账号在其他设备登录，当前会话已被踢出
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '12px',
              padding: '10px 32px',
              backgroundColor: '#7aa2f7',
              color: '#1a1f2e',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            重新连接
          </button>
        </div>
      )}
    </ThemeContext.Provider>
  );
}
