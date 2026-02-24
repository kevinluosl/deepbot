/**
 * DeepBot 主应用组件
 */

import React, { useState, useEffect } from 'react';
import './styles/terminal.css';
import './styles/tabs.css';
import { ChatWindow } from './components/ChatWindow';
import { SkillManager } from './components/SkillManager';
import { ScheduledTaskManager } from './components/ScheduledTaskManager';
import { SystemSettings } from './components/SystemSettings';
import { Message } from '../types/message';
import type { AgentTab } from '../types/agent-tab';

function App() {
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

  // 加载所有 Tab
  useEffect(() => {
    loadTabs();
    
    // 监听 Tab 创建事件（定时任务等后台创建的 Tab）
    const unsubscribe = window.deepbot.onTabCreated((data) => {
      console.log('[App] 收到 Tab 创建通知:', data.tab);
      setTabs(prev => {
        // 检查是否已存在（避免重复）
        if (prev.some(t => t.id === data.tab.id)) {
          return prev;
        }
        return [...prev, data.tab];
      });
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  const loadTabs = async () => {
    try {
      const result = await window.deepbot.getAllTabs();
      if (result.success && result.tabs) {
        setTabs(result.tabs);
      }
    } catch (error) {
      console.error('加载 Tab 失败:', error);
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
  
  // 获取当前 Tab
  const currentTab = tabs.find(t => t.id === activeTabId);
  const isCurrentTabLocked = currentTab?.isLocked || false;
  
  // 创建新 Tab
  const handleCreateTab = async () => {
    try {
      // 计算新 Tab 的编号
      const tabNumbers = tabs
        .map(t => {
          const match = t.title.match(/^Agent (\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);
      
      const nextNumber = tabNumbers.length > 0 ? Math.max(...tabNumbers) + 1 : tabs.length + 1;
      const title = `Agent ${nextNumber}`;
      
      const result = await window.deepbot.createTab(title);
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
      const result = await window.deepbot.closeTab(tabId);
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
      await window.deepbot.switchTab(tabId);
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
  }, []);

  const checkModelConfig = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('model-config:get');
      
      if (!result.success || !result.config || !result.config.apiKey) {
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
      console.error('检查模型配置失败:', error);
      setHasModelConfig(false);
      setIsSystemSettingsOpen(true);
    }
  };

  // 使用 ref 存储最新的 tabs 状态，避免频繁重新订阅
  const tabsRef = React.useRef<AgentTab[]>(tabs);
  
  // 同步更新 ref
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // 监听流式消息和 Sub Agent 通知
  useEffect(() => {
    const unsubscribeStream = window.deepbot.onMessageStream((chunk) => {
      // 🔥 消息应该发送到对应的 Tab，而不是只处理当前 Tab
      const targetTabId = chunk.sessionId || activeTabId;
      
      // 如果消息不属于任何已知 Tab，忽略
      if (!tabsRef.current.some(tab => tab.id === targetTabId)) {
        console.log(`[App] 忽略未知 Tab 的消息: ${targetTabId}`);
        return;
      }
      
      // 🔥 处理用户消息（定时任务的原始内容）
      if ((chunk as any).role === 'user') {
        console.log('[App] 📥 收到用户消息:', chunk.content);
        
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
    const unsubscribeExecutionSteps = window.deepbot.onExecutionStepUpdate?.((data) => {
      // 🔥 更新目标 Tab 的执行步骤
      const targetTabId = data.sessionId || activeTabId;
      
      if (!tabsRef.current.some(tab => tab.id === targetTabId)) {
        return;
      }
      
      console.log('收到执行步骤更新:', data);
      
      // 更新目标 Tab 的消息
      setTabs(prev => prev.map(tab => {
        if (tab.id !== targetTabId) return tab;
        
        const updatedMessages = (tab.messages || []).map(msg =>
          msg.id === data.messageId
            ? { ...msg, executionSteps: data.executionSteps }
            : msg
        );
        
        return { ...tab, messages: updatedMessages };
      }));
      
      // 如果是当前 Tab，同步更新 messages 状态
      if (targetTabId === activeTabId) {
        setMessages(prev => prev.map(msg =>
          msg.id === data.messageId
            ? { ...msg, executionSteps: data.executionSteps }
            : msg
        ));
      }
    });

    const unsubscribeError = window.deepbot.onMessageError((error) => {
      // 🔥 更新目标 Tab 的错误消息
      const targetTabId = error.sessionId || activeTabId;
      
      if (!tabsRef.current.some(tab => tab.id === targetTabId)) {
        return;
      }
      
      console.log('[App] 收到错误消息:', error);
      console.error('消息错误:', error);
      
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
  const handleSendMessage = async (content: string, images?: import('../types/message').UploadedImage[]) => {
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

    // 如果有上传的图片，将图片路径添加到消息内容中
    let messageContent = content;
    if (images && images.length > 0) {
      const imagePaths = images.map(img => img.path).join('\n');
      messageContent = `${content}\n\n[参考图片路径]:\n${imagePaths}`;
    }

    // 添加用户消息（显示原始内容和图片）
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      uploadedImages: images, // 添加上传的图片（用于前端显示）
    };
    updateCurrentTabMessages((prev) => [...prev, userMessage]);

    updateCurrentTabLoading(true);

    try {
      // 发送消息到主进程（使用包含图片路径的完整内容）
      await window.deepbot.sendMessage(messageContent, activeTabId);
    } catch (error) {
      console.error('发送消息失败:', error);
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
      await window.deepbot.stopGeneration(activeTabId);
      updateCurrentTabLoading(false);
    } catch (error) {
      console.error('停止生成失败:', error);
    }
  };

  return (
    <>
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
        onClose={() => {
          setIsSystemSettingsOpen(false);
          // 不要在这里重新检查配置，避免无限循环
          // checkModelConfig();
        }}
      />
    </>
  );
}

export default App;
