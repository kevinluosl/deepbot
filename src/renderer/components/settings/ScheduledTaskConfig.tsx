/**
 * 定时任务配置组件
 * 
 * 功能：
 * - 显示所有定时任务
 * - 暂停/恢复任务
 * - 立即执行任务
 * - 删除任务
 */

import React, { useState, useEffect } from 'react';

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  schedule: {
    type: 'once' | 'interval' | 'cron';
    executeAt?: number;
    intervalMs?: number;
    cronExpr?: string;
    timezone?: string;
  };
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
}

interface ScheduledTaskConfigProps {
  onClose: () => void;
}

export function ScheduledTaskConfig({ onClose }: ScheduledTaskConfigProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedRef = React.useRef(false);

  // 加载任务列表
  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const response = await window.deepbot.scheduledTask({
        action: 'list',
      });
      
      if (response.success) {
        setTasks(response.tasks || []);
      }
    } catch (error) {
      console.error('加载定时任务列表失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 删除任务
  const handleDelete = async (taskId: string, taskName: string) => {
    if (!confirm(`确定要删除任务"${taskName}"吗？`)) {
      return;
    }

    try {
      const response = await window.deepbot.scheduledTask({
        action: 'delete',
        taskId,
      });
      
      if (response.success) {
        await loadTasks();
      } else {
        alert(`删除失败: ${response.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('删除任务失败:', error);
      alert('删除失败，请重试');
    }
  };

  // 暂停/恢复任务
  const handleToggleEnabled = async (taskId: string, currentEnabled: boolean) => {
    try {
      const action = currentEnabled ? 'pause' : 'resume';
      const response = await window.deepbot.scheduledTask({
        action,
        taskId,
      });
      
      if (response.success) {
        await loadTasks();
      } else {
        alert(`操作失败: ${response.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('切换任务状态失败:', error);
      alert('操作失败，请重试');
    }
  };

  // 手动触发任务
  const handleTrigger = async (taskId: string, taskName: string) => {
    if (!confirm(`确定要立即执行任务"${taskName}"吗？`)) {
      return;
    }

    try {
      const response = await window.deepbot.scheduledTask({
        action: 'trigger',
        taskId,
      });
      
      if (response.success) {
        alert('任务已触发执行');
      } else {
        alert(`触发失败: ${response.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('触发任务失败:', error);
      alert('触发失败，请重试');
    }
  };

  // 初始加载（防止 Strict Mode 重复执行）
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    void loadTasks();
  }, []);

  // 定时刷新（仅在有启用的任务时刷新）
  useEffect(() => {
    // 如果没有启用的任务，不需要频繁刷新
    const hasEnabledTasks = tasks.some(t => t.enabled);
    if (!hasEnabledTasks) {
      return;
    }

    // 每 30 秒刷新一次（降低频率）
    const interval = setInterval(() => {
      void loadTasks();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [tasks]); // 依赖 tasks，当任务列表变化时重新设置定时器

  // 格式化调度信息
  const formatSchedule = (task: ScheduledTask) => {
    switch (task.schedule.type) {
      case 'once':
        return `一次性 (${new Date(task.schedule.executeAt!).toLocaleString('zh-CN')})`;
      case 'interval':
        const seconds = Math.floor(task.schedule.intervalMs! / 1000);
        if (seconds < 60) {
          return `每 ${seconds} 秒`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
          return `每 ${minutes} 分钟`;
        }
        const hours = Math.floor(minutes / 60);
        return `每 ${hours} 小时`;
      case 'cron':
        return `Cron: ${task.schedule.cronExpr}`;
      default:
        return '未知';
    }
  };

  // 格式化时间
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 计算距离下次执行的时间
  const getNextRunText = (nextRunAt?: number) => {
    if (!nextRunAt) return '-';
    
    const nextRunTime = typeof nextRunAt === 'number' ? nextRunAt : new Date(nextRunAt).getTime();
    
    if (isNaN(nextRunTime)) {
      return '-';
    }
    
    const now = Date.now();
    const diff = nextRunTime - now;
    
    if (diff < 0) {
      return '即将执行';
    }
    
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) {
      return `${seconds}秒后`;
    }
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}分钟后`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}小时后`;
    }
    
    const days = Math.floor(hours / 24);
    return `${days}天后`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">定时任务管理</h3>
        <p className="text-sm text-gray-500">
          管理所有定时任务，支持暂停、恢复、立即执行和删除操作
        </p>
      </div>

      {/* 任务统计 */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-700">
            共 <span className="font-semibold text-blue-700">{tasks.length}</span> 个任务
          </div>
          {tasks.filter(t => t.enabled).length > 0 && (
            <div className="text-green-700">
              <span className="font-semibold">{tasks.filter(t => t.enabled).length}</span> 个运行中
            </div>
          )}
        </div>
      </div>

      {/* 任务列表 */}
      {isLoading && tasks.length === 0 ? (
        <div className="text-center text-gray-500 py-8">加载中...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <div className="text-4xl mb-4">📅</div>
          <div>暂无定时任务</div>
          <div className="text-sm mt-2">通过对话创建定时任务，例如："每天早上9点提醒我开会"</div>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
                !task.enabled ? 'bg-gray-50 opacity-60' : ''
              }`}
            >
              {/* 任务信息 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900">{task.name}</h3>
                    {!task.enabled && (
                      <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                        已暂停
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{task.description}</p>
                </div>
              </div>

              {/* 调度信息 */}
              <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                <div>
                  <span className="text-gray-500">调度方式：</span>
                  <span className="text-gray-900 ml-1">{formatSchedule(task)}</span>
                </div>
                <div>
                  <span className="text-gray-500">执行次数：</span>
                  <span className="text-gray-900 ml-1">{task.runCount} 次</span>
                </div>
                <div>
                  <span className="text-gray-500">上次执行：</span>
                  <span className="text-gray-900 ml-1">{formatTime(task.lastRunAt)}</span>
                </div>
                <div>
                  <span className="text-gray-500">下次执行：</span>
                  <span className="text-blue-600 ml-1 font-medium">
                    {task.enabled ? getNextRunText(task.nextRunAt) : '-'}
                  </span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2 pt-3 border-t">
                <button
                  onClick={() => handleToggleEnabled(task.id, task.enabled)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    task.enabled
                      ? 'text-orange-600 hover:bg-orange-50'
                      : 'text-green-600 hover:bg-green-50'
                  }`}
                >
                  {task.enabled ? '暂停' : '恢复'}
                </button>
                
                {task.enabled && (
                  <button
                    onClick={() => handleTrigger(task.id, task.name)}
                    className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    立即执行
                  </button>
                )}
                
                <button
                  onClick={() => handleDelete(task.id, task.name)}
                  className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors ml-auto"
                >
                  删除
                </button>
              </div>

              {/* ID（用于调试） */}
              <div className="mt-2 text-xs text-gray-400 font-mono">
                ID: {task.id}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 提示信息 */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-blue-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">使用提示</p>
            <ul className="list-disc list-inside space-y-1">
              <li>通过对话创建定时任务，例如："每天早上9点提醒我开会"</li>
              <li>暂停的任务不会执行，但会保留配置</li>
              <li>立即执行不会影响下次计划执行时间</li>
              <li>删除任务后无法恢复，请谨慎操作</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
