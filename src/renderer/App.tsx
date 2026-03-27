/**
 * DeepBot 主应用组件
 */

import React, { useState, useEffect, createContext } from 'react';
import './styles/terminal.css';
import './styles/tabs.css';
import { ChatWindow } from './components/ChatWindow';
import { SkillManager } from './components/SkillManager';
import { ScheduledTaskManager } from './components/ScheduledTaskManager';
import { SystemSettings } from './components/SystemSettings';
import { Message } from '../types/message';
import type { AgentTab } from '../types/agent-tab';
import { api } from './api';
import { useTheme, ThemeMode } from './hooks/useTheme';
import { setPendingUpdate } from './utils/update-store';

// 主题 Context
export const ThemeContext = createContext<{
  mode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}>({ mode: 'dark', setThemeMode: () => {} });

function App() {
  // 主题管理
  const { mode: themeMode, setThemeMode } = useTheme();

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

  // 监听自动更新（App 层注册，确保不丢失）
  useEffect(() => {
    const unsub = api.onUpdateAvailable((info) => setPendingUpdate(info));
    return unsub;
  }, []);

  // 加载所有 Tab
  useEffect(() => {
    loadTabs();
    
    const unsubscribeTabCreated = api.onTabCreated((data) => {
      setTabs(prev => {
        // 检查是否已存在（避免重复）
        if (prev.some(t => t.id === data.tab.id)) {
          return prev;
        }
        return [...prev, data.tab];
      });
    });

    // 监听 Tab 标题更新（如飞书群名称变更）
    const unsubscribeTabUpdated = api.onTabUpdated((data: { tabId: string; title: string }) => {
      setTabs(prev => prev.map(tab =>
        tab.id === data.tabId ? { ...tab, title: data.title } : tab
      ));
    });
    
    // 🔥 监听 Tab 消息清除事件
    const unsubscribeMessagesCleared = api.onTabMessagesCleared((data: { tabId: string }) => {
      setTabs(prev => prev.map(tab => 
        tab.id === data.tabId 
          ? { ...tab, messages: [] }
          : tab
      ));
    });
    
    // 🔥 监听名字配置更新事件（更新 Tab 标题）
    const unsubscribeNameUpdate = api.onNameConfigUpdate((config) => {
      // 🔥 如果是全局更新，需要更新所有继承的 Tab
      if (config.isGlobalUpdate && config.agentName) {
        setTabs(prev => prev.map(tab => {
          // 主 Tab 直接使用新名字
          if (tab.id === 'default') {
            return { ...tab, title: config.agentName! };
          }
          
          // 其他 Tab：提取数字部分，更新为新名字 + 数字
          const match = tab.title.match(/\s+(\d+)$/);
          if (match) {
            const number = match[1];
            return { ...tab, title: `${config.agentName} ${number}` };
          }
          
          // 如果没有数字后缀，说明是有独立名字的 Tab，不更新
          return tab;
        }));
      } else if (config.tabId && config.agentName) {
        // 特定 Tab 的名字更新
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
  }, []);
  
  const loadTabs = async () => {
    try {
      const result = await api.getAllTabs();
      if (result.success && result.tabs) {
        setTabs(result.tabs);
      }
    } catch (error) {
      console.error('加载 Tab 失败:', error);
      
      // 🔥 如果是 Gateway 未初始化错误，延迟重试
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
  
  // 🔥 监听历史消息加载事件
  useEffect(() => {
    const cleanup = api.onTabHistoryLoaded((data: { tabId: string; messages: Message[] }) => {
      // 更新对应 Tab 的消息列表
      setTabs(prev => prev.map(tab => 
        tab.id === data.tabId 
          ? { ...tab, messages: data.messages }
          : tab
      ));
      
      // 如果是当前 Tab，同步更新 messages 状态
      if (data.tabId === activeTabId) {
        setMessages(data.messages);
      }
    });
    
    return cleanup;
  }, [activeTabId]);
  
  // 获取当前 Tab
  const currentTab = tabs.find(t => t.id === activeTabId);
  const isCurrentTabLocked = currentTab?.isLocked || false;
  
  // 创建新 Tab
  const handleCreateTab = async () => {
    try {
      // 🔥 不传递 title，让后端根据全局 Agent 名字自动生成
      const result = await api.createTab();
      if (result.success && result.tab) {
        // 🔥 不需要手动添加到 tabs，onTabCreated 监听器会自动添加
        // setTabs(prev => [...prev, result.tab!]);
        setActiveTabId(result.tab.id);
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
      // 🔥 删除前确认（主 Tab 不能删除，所以不会走到这里）
      const tabToDelete = tabs.find(t => t.id === tabId);
      if (!tabToDelete) return;
      
      // 🔥 显示确认对话框
      const confirmed = window.confirm(
        `确定要删除 "${tabToDelete.title}" 吗？\n\n删除后将清空该窗口的所有对话记忆，此操作不可恢复。`
      );
      
      if (!confirmed) {
        return; // 用户取消删除
      }
      
      const result = await api.closeTab(tabId);
      if (result.success) {
        setTabs(prev => prev.filter(t => t.id !== tabId));
        // 如果关闭的是当前 Tab，切换到默认 Tab
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
    
    // 同时更新 tabs 中的数据
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, messages: updater(tab.messages) }
        : tab
    ));
  };
  
  // 更新当前 Tab 的加载状态
  const updateCurrentTabLoading = (loading: boolean) => {
    setIsLoading(loading);
    
    // 同时更新 tabs 中的数据
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, isLoading: loading }
        : tab
    ));
  };

  // 检查模型配置
  useEffect(() => {
    checkModelConfig();
    loadPendingPairingCount();
    
    // 监听模型配置更新事件
    const unsubscribeModel = api.onModelConfigUpdate(() => {
      setHasModelConfig(true);
    });
    
    // 监听待授权数量变化
    const unsubscribePending = api.onPendingCountUpdate?.((data: { pendingCount: number }) => {
      setPendingPairingCount(data.pendingCount);
    });
    
    return () => {
      unsubscribeModel();
      unsubscribePending?.();
    };
  }, []);

  const checkModelConfig = async () => {
    try {
      const result = await api.getModelConfig();      
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (!actualResult.success || !actualResult.config || !actualResult.config.apiKey) {
        // 没有配置，显示提示并打开系统设置
        setHasModelConfig(false);
        setIsSystemSettingsOpen(true);
        
        // 添加系统提示消息
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
      // 忽略错误，不影响主流程
    }
  };

  // 使用 ref 存储最新的 tabs 状态，避免频繁重新订阅
  const tabsRef = React.useRef<AgentTab[]>(tabs);
  
  // 同步更新 ref
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // 监听清空所有消息事件（切换模型时触发）
  useEffect(() => {
    const unsubscribe = api.onClearAllMessages(() => {
      // 清空所有 Tab 的消息
      setTabs(prev => prev.map(tab => ({ ...tab, messages: [] })));
      // 清空当前显示的消息
      setMessages([]);
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  // 🔥 监听清空单个 Tab 聊天事件（/new 指令触发）
  useEffect(() => {
    const unsubscribe = api.onClearChat?.((data: { sessionId: string }) => {
      // 清空指定 Tab 的消息
      setTabs(prev => prev.map(tab => 
        tab.id === data.sessionId ? { ...tab, messages: [] } : tab
      ));
      
      // 如果是当前 Tab，也清空显示的消息
      if (data.sessionId === activeTabId) {
        setMessages([]);
      }
    });
    
    return () => {
      unsubscribe?.();
    };
  }, [activeTabId]);

  // 监听流式消息和 Sub Agent 通知
  useEffect(() => {
    const unsubscribeStream = api.onMessageStream((chunk) => {
      // 🔥 消息应该发送到对应的 Tab，而不是只处理当前 Tab
      const targetTabId = chunk.sessionId || activeTabId;
      
      // 如果消息不属于任何已知 Tab，忽略
      if (!tabsRef.current.some(tab => tab.id === targetTabId)) {
        return;
      }
      
      // 🔥 处理用户消息（定时任务的原始内容）
      if ((chunk as any).role === 'user') {
        // 创建用户消息
        const userMessage: Message = {
          id: chunk.messageId,
          role: 'user',
          content: chunk.content,
          timestamp: Date.now(),
        };
        
        // 🔥 批量更新：使用 requestAnimationFrame 减少重渲染
        requestAnimationFrame(() => {
          // 更新目标 Tab 的消息，并设置为加载状态
          setTabs(prev => prev.map(tab => {
            if (tab.id !== targetTabId) return tab;
            return { 
              ...tab, 
              messages: [...(tab.messages || []), userMessage],
              isLoading: true,
            };
          }));
          
          // 如果是当前 Tab，同步更新 messages 和 isLoading 状态
          if (targetTabId === activeTabId) {
            setMessages(prev => [...prev, userMessage]);
            setIsLoading(true);
          }
        });
        
        return;
      }
      
      if (chunk.done) {
        // 批量更新：使用 requestAnimationFrame
        requestAnimationFrame(() => {
          // 更新目标 Tab 的消息状态
          setTabs(prev => prev.map(tab => {
            if (tab.id !== targetTabId) return tab;
            
            const updatedMessages = (tab.messages || []).map(msg =>
              msg.id === chunk.messageId
                ? { 
                    ...msg, 
                    executionSteps: chunk.executionSteps || msg.executionSteps,
                    totalDuration: chunk.totalDuration, // 🔥 添加总执行时间
                    sentAt: chunk.sentAt, // 🔥 添加发送时间
                    isStreaming: false 
                  }
                : msg
            );
            
            return { ...tab, messages: updatedMessages, isLoading: false };
          }));
          
          // 如果是当前 Tab，同步更新 messages 和 isLoading 状态
          if (targetTabId === activeTabId) {
            setMessages(prev => prev.map(msg =>
              msg.id === chunk.messageId
                ? { 
                    ...msg, 
                    executionSteps: chunk.executionSteps || msg.executionSteps,
                    totalDuration: chunk.totalDuration, // 🔥 添加总执行时间
                    sentAt: chunk.sentAt, // 🔥 添加发送时间
                    isStreaming: false 
                  }
                : msg
            ));
            setIsLoading(false);
          }
        });
      } else {
        // 检查是否为 Sub Agent 结果报告
        const isSubAgentResult = chunk.isSubAgentResult === true;
        const subAgentTask = chunk.subAgentTask;
        
        // 批量更新：使用 requestAnimationFrame
        requestAnimationFrame(() => {
          // 更新目标 Tab 的消息
          setTabs(prev => prev.map(tab => {
            if (tab.id !== targetTabId) return tab;
            
            const existingMessages = tab.messages || [];
            const existingIndex = existingMessages.findIndex(msg => msg.id === chunk.messageId);
            
            let updatedMessages: Message[];
            if (existingIndex >= 0) {
              // 更新现有消息
              updatedMessages = [
                ...existingMessages.slice(0, existingIndex),
                {
                  ...existingMessages[existingIndex],
                  content: existingMessages[existingIndex].content + chunk.content,
                  executionSteps: existingMessages[existingIndex].executionSteps, // 🔥 保留现有的执行步骤
                },
                ...existingMessages.slice(existingIndex + 1),
              ];
            } else {
              // 创建新消息
              const newMessage: Message = {
                id: chunk.messageId,
                role: 'assistant',
                content: chunk.content,
                timestamp: Date.now(),
                isStreaming: true,
                isSubAgentResult,
                subAgentTask,
                executionSteps: [], // 🔥 初始化执行步骤为空数组
              };
              updatedMessages = [...existingMessages, newMessage];
            }
            
            return { ...tab, messages: updatedMessages };
          }));
          
          // 如果是当前 Tab，同步更新 messages 状态
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
      // 🔥 更新目标 Tab 的执行步骤
      const targetTabId = data.sessionId || activeTabId;
      
      if (!tabsRef.current.some(tab => tab.id === targetTabId)) {
        return;
      }
      
      // 更新目标 Tab 的消息
      setTabs(prev => prev.map(tab => {
        if (tab.id !== targetTabId) return tab;
        
        const existingMessages = tab.messages || [];
        const existingIndex = existingMessages.findIndex(msg => msg.id === data.messageId);
        
        let updatedMessages: Message[];
        if (existingIndex >= 0) {
          // 更新现有消息
          updatedMessages = existingMessages.map(msg =>
            msg.id === data.messageId
              ? { ...msg, executionSteps: data.executionSteps }
              : msg
          );
        } else {
          // 🔥 消息不存在，创建一个空的 assistant 消息（用于显示执行步骤）
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
      
      // 如果是当前 Tab，同步更新 messages 状态
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
            // 🔥 消息不存在，创建一个空的 assistant 消息（用于显示执行步骤）
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
      // 🔥 更新目标 Tab 的错误消息
      const targetTabId = error.sessionId || activeTabId;
      
      if (!tabsRef.current.some(tab => tab.id === targetTabId)) {
        return;
      }
      
      // 添加错误消息（使用更醒目的格式）
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'system',
        content: `❌ **错误**\n\n${error.error || '未知错误'}\n\n💡 提示：请检查系统设置中的模型配置。`,
        timestamp: Date.now(),
      };
      
      // 更新目标 Tab 的消息
      setTabs(prev => prev.map(tab => {
        if (tab.id !== targetTabId) return tab;
        return { ...tab, messages: [...(tab.messages || []), errorMessage], isLoading: false };
      }));
      
      // 如果是当前 Tab，同步更新 messages 和 isLoading 状态
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
  }, [activeTabId]); // 只依赖 activeTabId，使用 tabsRef 访问最新的 tabs

  // 发送消息
  const handleSendMessage = async (
    content: string, 
    images?: import('../types/message').UploadedImage[],
    files?: import('../types/message').UploadedFile[]
  ) => {
    // 检查是否已配置模型
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

    // 🔥 如果有上传的图片，将图片路径按上传顺序插入到消息开头
    let messageContent = content;
    if (images && images.length > 0) {
      const imagePaths = images.map((img, index) => `[参考图${index + 1}]: ${img.path}`).join('\n');
      messageContent = `${imagePaths}\n\n${content}`;
    }

    // 🔥 如果有上传的文件，将文件路径插入到消息中
    if (files && files.length > 0) {
      const filePaths = files.map((file, index) => `[参考文件${index + 1}]: ${file.path}`).join('\n');
      messageContent = `${filePaths}\n\n${messageContent}`;
    }

    // 添加用户消息（显示原始内容、图片和文件）
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      uploadedImages: images, // 添加上传的图片（用于前端显示）
      uploadedFiles: files, // 添加上传的文件（用于前端显示）
    };
    updateCurrentTabMessages((prev) => [...prev, userMessage]);

    updateCurrentTabLoading(true);

    try {
      // 发送消息到主进程（使用包含图片路径的完整内容）
      await api.sendMessage(messageContent, activeTabId);
    } catch (error) {
      updateCurrentTabLoading(false);
      
      // 添加错误消息
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
      
      // 如果是配置错误，打开系统设置
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
      // 忽略停止生成错误
    }
  };

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
      
      {/* Skill 管理器 */}
      <SkillManager
        isOpen={isSkillManagerOpen}
        onClose={() => setIsSkillManagerOpen(false)}
      />
      
      {/* 定时任务管理器 */}
      <ScheduledTaskManager
        isOpen={isScheduledTaskManagerOpen}
        onClose={() => setIsScheduledTaskManagerOpen(false)}
      />
      
      {/* 系统设置 */}
      <SystemSettings
        isOpen={isSystemSettingsOpen}
        activeTabId={activeTabId}
        onClose={() => {
          setIsSystemSettingsOpen(false);
        }}
      />
    </ThemeContext.Provider>
  );
}

export default App;
