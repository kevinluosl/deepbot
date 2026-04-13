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
import { api } from '../api';
import { X } from 'lucide-react';
import { t, getLanguage } from '../i18n';
import '../styles/settings.css';

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
  const lang = getLanguage();
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
      const response = await api.scheduledTask({
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
      alert(lang === 'zh' ? '任务内容不能为空' : 'Task content cannot be empty');
      return;
    }

    try {
      const response = await api.scheduledTask({
        action: 'update',
        taskId,
        description: editingDescription.trim(),
      });
      
      if (response.success) {
        await loadTasks();
        setEditingTaskId(null);
        setEditingDescription('');
      } else {
        alert(lang === 'zh' ? `保存失败: ${response.message || '未知错误'}` : `Save failed: ${response.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('保存任务失败:', error);
      alert(lang === 'zh' ? '保存失败，请重试' : 'Save failed, please retry');
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
      alert(lang === 'zh' ? '调度方式不能为空' : 'Schedule cannot be empty');
      return;
    }

    try {
      const response = await api.scheduledTask({
        action: 'updateSchedule',
        taskId,
        scheduleText: editingScheduleText.trim(),
      });
      
      if (response.success) {
        await loadTasks();
        setEditingScheduleTaskId(null);
        setEditingScheduleText('');
      } else {
        alert(lang === 'zh' ? `保存失败: ${response.message || '未知错误'}` : `Save failed: ${response.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('保存调度方式失败:', error);
      alert(lang === 'zh' ? '保存失败，请重试' : 'Save failed, please retry');
    }
  };

  // 生成调度方式的自然语言描述
  const generateScheduleText = (schedule: ScheduledTask['schedule']): string => {
    const maxRunsText = schedule.maxRuns
      ? (lang === 'zh' ? `，最多执行${schedule.maxRuns}次` : `, max ${schedule.maxRuns} runs`)
      : '';
    
    switch (schedule.type) {
      case 'once':
        return lang === 'zh'
          ? `一次性任务，执行时间：${new Date(schedule.executeAt!).toLocaleString('zh-CN')}`
          : `One-time task, execute at: ${new Date(schedule.executeAt!).toLocaleString('en-US')}`;
      case 'interval':
        const seconds = Math.floor(schedule.intervalMs! / 1000);
        if (seconds < 60) {
          return lang === 'zh'
            ? `每隔${seconds}秒执行一次${maxRunsText}`
            : `Execute every ${seconds}s${maxRunsText}`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
          return lang === 'zh'
            ? `每隔${minutes}分钟执行一次${maxRunsText}`
            : `Execute every ${minutes}min${maxRunsText}`;
        }
        const hours = Math.floor(minutes / 60);
        return lang === 'zh'
          ? `每隔${hours}小时执行一次${maxRunsText}`
          : `Execute every ${hours}h${maxRunsText}`;
      case 'cron':
        return lang === 'zh'
          ? `Cron表达式：${schedule.cronExpr}${maxRunsText}`
          : `Cron expression: ${schedule.cronExpr}${maxRunsText}`;
      default:
        return '';
    }
  };

  // 删除任务
  const handleDelete = async (taskId: string, taskName: string) => {
    if (!confirm(t('task.confirm_delete', { name: taskName }))) {
      return;
    }

    try {
      const response = await api.scheduledTask({
        action: 'delete',
        taskId,
      });
      
      if (response.success) {
        await loadTasks();
      } else {
        alert(lang === 'zh' ? `删除失败: ${response.message || '未知错误'}` : `Delete failed: ${response.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('删除任务失败:', error);
      alert(lang === 'zh' ? '删除失败，请重试' : 'Delete failed, please retry');
    }
  };

  // 暂停/恢复任务
  const handleToggleEnabled = async (taskId: string, currentEnabled: boolean) => {
    try {
      const action = currentEnabled ? 'pause' : 'resume';
      const response = await api.scheduledTask({
        action,
        taskId,
      });
      
      if (response.success) {
        await loadTasks();
      } else {
        alert(lang === 'zh' ? `操作失败: ${response.message || '未知错误'}` : `Operation failed: ${response.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('切换任务状态失败:', error);
      alert(lang === 'zh' ? '操作失败，请重试' : 'Operation failed, please retry');
    }
  };

  // 手动触发任务
  const handleTrigger = async (taskId: string, taskName: string) => {
    if (!confirm(lang === 'zh' ? `确定要立即执行任务"${taskName}"吗？` : `Execute task "${taskName}" now?`)) {
      return;
    }

    try {
      const response = await api.scheduledTask({
        action: 'trigger',
        taskId,
      });
      
      if (!response.success) {
        alert(lang === 'zh' ? `触发失败: ${response.message || '未知错误'}` : `Trigger failed: ${response.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('触发任务失败:', error);
      alert(lang === 'zh' ? '触发失败，请重试' : 'Trigger failed, please retry');
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
    const maxRunsText = task.schedule.maxRuns ? ` (${t('task.max_runs', { count: task.schedule.maxRuns })})` : '';
    
    switch (task.schedule.type) {
      case 'once':
        return `${t('task.once')} (${new Date(task.schedule.executeAt!).toLocaleString('zh-CN')})`;
      case 'interval':
        const seconds = Math.floor(task.schedule.intervalMs! / 1000);
        if (seconds < 60) {
          return `${t('task.interval', { value: seconds })} ${t('task.seconds')}${maxRunsText}`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
          return `${t('task.interval', { value: minutes })} ${t('task.minutes')}${maxRunsText}`;
        }
        const hours = Math.floor(minutes / 60);
        return `${t('task.interval', { value: hours })} ${t('task.hours')}${maxRunsText}`;
      case 'cron':
        return `${t('task.cron', { expr: task.schedule.cronExpr! })}${maxRunsText}`;
      default:
        return '';
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
      return lang === 'zh' ? '即将执行' : 'Imminent';
    }
    
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) {
      return lang === 'zh' ? `${seconds}秒后` : `in ${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return lang === 'zh' ? `${minutes}分钟后` : `in ${minutes}min`;
    }
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return lang === 'zh' ? `${hours}小时后` : `in ${hours}h`;
    }
    
    const days = Math.floor(hours / 24);
    return lang === 'zh' ? `${days}天后` : `in ${days}d`;
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-container">
        {/* 标题栏 */}
        <div className="settings-header">
          <h2 className="settings-title">{t('task.title')}</h2>
          <button onClick={onClose} className="settings-close-button">
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="settings-panel">
          {/* 任务统计 */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-700">
                {lang === 'zh' ? '共 ' : 'Total: '}<span className="font-semibold text-blue-700">{tasks.length}</span>{lang === 'zh' ? ' 个任务' : ' tasks'}
              </div>
              {tasks.filter(t => t.enabled).length > 0 && (
                <div className="text-green-700">
                  <span className="font-semibold">{tasks.filter(t => t.enabled).length}</span>{lang === 'zh' ? ' 个运行中' : ' running'}
                </div>
              )}
            </div>
          </div>

          {/* 任务列表 */}
          {isLoading && tasks.length === 0 ? (
            <div className="text-center text-gray-500 py-8">{t('task.loading')}</div>
          ) : tasks.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <div className="text-4xl mb-4">📅</div>
              <div>{t('task.no_tasks')}</div>
              <div className="text-sm mt-2">{t('task.no_tasks_hint')}</div>
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
                            {t('task.disabled')}
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
                            placeholder={lang === 'zh' ? '输入任务内容...' : 'Enter task content...'}
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleSaveEdit(task.id)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              {t('task.save')}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            >
                              {t('task.cancel')}
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
                      <span className="text-gray-500">{t('task.schedule')}：</span>
                      {editingScheduleTaskId === task.id ? (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={editingScheduleText}
                            onChange={(e) => setEditingScheduleText(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder={lang === 'zh' ? '例如：每隔10秒执行一次，最多100次' : 'e.g.: Execute every 10 seconds, max 100 runs'}
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleSaveEditSchedule(task.id)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              {t('task.save')}
                            </button>
                            <button
                              onClick={handleCancelEditSchedule}
                              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            >
                              {t('task.cancel')}
                            </button>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {lang === 'zh'
                              ? '支持自然语言，例如："每隔10秒"、"每天早上9点"、"每隔5分钟，最多100次"'
                              : 'Supports natural language, e.g.: "every 10 seconds", "every day at 9am", "every 5 minutes, max 100 runs"'}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 ml-1">{formatSchedule(task)}</span>
                          <button
                            onClick={() => handleStartEditSchedule(task)}
                            className="text-xs text-blue-600 hover:text-blue-700"
                          >
                            {t('task.edit')}
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* 执行信息（一行三列） */}
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <span className="text-gray-500">{t('task.run_count')}：</span>
                        <span className="text-gray-900 ml-1">{task.runCount} {t('task.times')}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">{t('task.last_run')}：</span>
                        <span className="text-gray-900 ml-1">{formatTime(task.lastRunAt)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">{t('task.next_run')}：</span>
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
                        {t('task.edit')}
                      </button>
                      
                      <button
                        onClick={() => handleToggleEnabled(task.id, task.enabled)}
                        className={`px-3 py-1 text-sm rounded transition-colors ${
                          task.enabled
                            ? 'text-orange-600 hover:bg-orange-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {task.enabled ? t('task.disable') : t('task.enable')}
                      </button>
                      
                      {task.enabled && (
                        <button
                          onClick={() => handleTrigger(task.id, task.name)}
                          className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          {lang === 'zh' ? '立即执行' : 'Run Now'}
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleDelete(task.id, task.name)}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors ml-auto"
                      >
                        {t('task.delete')}
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
                <p className="font-medium mb-1">{lang === 'zh' ? '使用提示' : 'Tips'}</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>{lang === 'zh' ? '通过对话创建定时任务，例如："每天早上9点提醒我开会"' : 'Create scheduled tasks via chat, e.g.: "Remind me of the meeting every day at 9am"'}</li>
                  <li>{lang === 'zh' ? '点击"编辑"可以修改任务内容，下次执行时生效' : 'Click "Edit" to modify task content, effective on next execution'}</li>
                  <li>{lang === 'zh' ? '暂停的任务不会执行，但会保留配置' : 'Paused tasks won\'t execute but retain their configuration'}</li>
                  <li>{lang === 'zh' ? '立即执行不会影响下次计划执行时间' : 'Running now won\'t affect the next scheduled execution time'}</li>
                  <li>{lang === 'zh' ? '删除任务后无法恢复，请谨慎操作' : 'Deleted tasks cannot be recovered, proceed with caution'}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
