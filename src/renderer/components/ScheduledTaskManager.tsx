/**
 * 定时任务管理器（独立组件）
 * 
 * 功能：
 * - 显示所有定时任务
 * - 编辑任务内容
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
    maxRuns?: number;
  };
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
}

interface ScheduledTaskManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScheduledTaskManager({ isOpen, onClose }: ScheduledTaskManagerProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [editingScheduleTaskId, setEditingScheduleTaskId] = useState<string | null>(null);
  const [editingScheduleText, setEditingScheduleText] = useState('');
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

  // 开始编辑任务内容
  const handleStartEdit = (task: ScheduledTask) => {
    setEditingTaskId(task.id);
    setEditingDescription(task.description);
  };

  // 取消编辑任务内容
  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditingDescription('');
  };

  // 保存编辑任务内容
  const handleSaveEdit = async (taskId: string) => {
    if (!editingDescription.trim()) {
      alert('任务内容不能为空');
      return;
    }

    try {
      const response = await window.deepbot.scheduledTask({
        action: 'update',
        taskId,
        description: editingDescription.trim(),
      });
      
      if (response.success) {
        await loadTasks();
        setEditingTaskId(null);
        setEditingDescription('');
      } else {
        alert(`保存失败: ${response.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('保存任务失败:', error);
      alert('保存失败，请重试');
    }
  };

  // 开始编辑调度方式
  const handleStartEditSchedule = (task: ScheduledTask) => {
    setEditingScheduleTaskId(task.id);
    // 生成自然语言描述
    const scheduleText = generateScheduleText(task.schedule);
    setEditingScheduleText(scheduleText);
  };

  // 取消编辑调度方式
  const handleCancelEditSchedule = () => {
    setEditingScheduleTaskId(null);
    setEditingScheduleText('');
  };

  // 保存编辑调度方式
  const handleSaveEditSchedule = async (taskId: string) => {
    if (!editingScheduleText.trim()) {
      alert('调度方式不能为空');
      return;
    }

    try {
      const response = await window.deepbot.scheduledTask({
        action: 'updateSchedule',
        taskId,
        scheduleText: editingScheduleText.trim(),
      });
      
      if (response.success) {
        await loadTasks();
        setEditingScheduleTaskId(null);
        setEditingScheduleText('');
      } else {
        alert(`保存失败: ${response.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('保存调度方式失败:', error);
      alert('保存失败，请重试');
    }
  };

  // 生成调度方式的自然语言描述
  const generateScheduleText = (schedule: ScheduledTask['schedule']): string => {
    const maxRunsText = schedule.maxRuns ? `，最多执行${schedule.maxRuns}次` : '';
    
    switch (schedule.type) {
      case 'once':
        return `一次性任务，执行时间：${new Date(schedule.executeAt!).toLocaleString('zh-CN')}`;
      case 'interval':
        const seconds = Math.floor(schedule.intervalMs! / 1000);
        if (seconds < 60) {
          return `每隔${seconds}秒执行一次${maxRunsText}`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
          return `每隔${minutes}分钟执行一次${maxRunsText}`;
        }
        const hours = Math.floor(minutes / 60);
        return `每隔${hours}小时执行一次${maxRunsText}`;
      case 'cron':
        return `Cron表达式：${schedule.cronExpr}${maxRunsText}`;
      default:
        return '';
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

  // 初始加载（每次打开时都重新加载）
  useEffect(() => {
    if (!isOpen) {
      // 关闭时重置标记，下次打开时会重新加载
      hasLoadedRef.current = false;
      return;
    }
    
    // 防止 Strict Mode 重复执行
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    void loadTasks();
  }, [isOpen]);

  // 定时刷新（仅在有启用的任务时刷新）
  useEffect(() => {
    if (!isOpen) return;
    
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
  }, [isOpen, tasks]);

  // 格式化调度信息
  const formatSchedule = (task: ScheduledTask) => {
    const maxRunsText = task.schedule.maxRuns ? ` (最多 ${task.schedule.maxRuns} 次)` : '';
    
    switch (task.schedule.type) {
      case 'once':
        return `一次性 (${new Date(task.schedule.executeAt!).toLocaleString('zh-CN')})`;
      case 'interval':
        const seconds = Math.floor(task.schedule.intervalMs! / 1000);
        if (seconds < 60) {
          return `每 ${seconds} 秒${maxRunsText}`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
          return `每 ${minutes} 分钟${maxRunsText}`;
        }
        const hours = Math.floor(minutes / 60);
        return `每 ${hours} 小时${maxRunsText}`;
      case 'cron':
        return `Cron: ${task.schedule.cronExpr}${maxRunsText}`;
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">定时任务管理</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="关闭"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 任务统计 */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
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
                      
                      {/* 任务描述（可编辑） */}
                      {editingTaskId === task.id ? (
                        <div className="mt-2">
                          <textarea
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            rows={3}
                            placeholder="输入任务内容..."
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleSaveEdit(task.id)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              保存
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">{task.description}</p>
                      )}
                    </div>
                  </div>

                  {/* 调度信息 */}
                  <div className="space-y-3 mb-3 text-sm">
                    {/* 调度方式（单独一行） */}
                    <div>
                      <span className="text-gray-500">调度方式：</span>
                      {editingScheduleTaskId === task.id ? (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={editingScheduleText}
                            onChange={(e) => setEditingScheduleText(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder="例如：每隔10秒执行一次，最多100次"
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleSaveEditSchedule(task.id)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              保存
                            </button>
                            <button
                              onClick={handleCancelEditSchedule}
                              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            >
                              取消
                            </button>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            支持自然语言，例如："每隔10秒"、"每天早上9点"、"每隔5分钟，最多100次"
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 ml-1">{formatSchedule(task)}</span>
                          <button
                            onClick={() => handleStartEditSchedule(task)}
                            className="text-xs text-blue-600 hover:text-blue-700"
                          >
                            编辑
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* 执行信息（一行三列） */}
                    <div className="grid grid-cols-3 gap-4">
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
                  </div>

                  {/* 操作按钮 */}
                  {editingTaskId !== task.id && editingScheduleTaskId !== task.id && (
                    <div className="flex items-center gap-2 pt-3 border-t">
                      <button
                        onClick={() => handleStartEdit(task)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        编辑内容
                      </button>
                      
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
                  )}

                  {/* ID（用于调试） */}
                  <div className="mt-2 text-xs text-gray-400 font-mono">
                    ID: {task.id}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 提示信息 */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mt-6">
            <div className="flex">
              <svg className="w-5 h-5 text-blue-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">使用提示</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>通过对话创建定时任务，例如："每天早上9点提醒我开会"</li>
                  <li>点击"编辑"可以修改任务内容，下次执行时生效</li>
                  <li>暂停的任务不会执行，但会保留配置</li>
                  <li>立即执行不会影响下次计划执行时间</li>
                  <li>删除任务后无法恢复，请谨慎操作</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
