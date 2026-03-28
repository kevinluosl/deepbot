/**
 * 工作目录配置组件
 * 
 * 功能：
 * - 配置 Python 脚本默认工作目录
 * - 配置 Skill 工作目录（支持多个路径）
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { isElectron } from '../../utils/platform';
import { showToast } from '../../utils/toast';

interface WorkspaceConfigProps {
  onClose: () => void;
}

interface WorkspaceSettings {
  workspaceDir: string;
  scriptDir: string;
  skillDirs: string[];
  defaultSkillDir: string;
  imageDir: string;
  memoryDir: string;
  sessionDir: string; // 🔥 新增
}

export function WorkspaceConfig({ onClose }: WorkspaceConfigProps) {
  const [settings, setSettings] = useState<WorkspaceSettings>({
    workspaceDir: '',
    scriptDir: '',
    skillDirs: [],
    defaultSkillDir: '',
    imageDir: '',
    memoryDir: '',
    sessionDir: '',
  });
  const [defaultSettings, setDefaultSettings] = useState<WorkspaceSettings>({
    workspaceDir: '',
    scriptDir: '',
    skillDirs: [],
    defaultSkillDir: '',
    imageDir: '',
    memoryDir: '',
    sessionDir: '',
  });
  const [isDocker, setIsDocker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newSkillDir, setNewSkillDir] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const hasLoadedRef = React.useRef(false);

  // 追踪哪些字段被修改了（脏状态）
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  const markDirty = (field: string) => {
    setDirtyFields(prev => new Set(prev).add(field));
  };

  const clearDirty = (field: string) => {
    setDirtyFields(prev => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  // 打开文件夹选择对话框
  const handleBrowse = async (field: keyof WorkspaceSettings) => {
    const result = await api.selectFolder();
    if (result.success && result.path) {
      setSettings(prev => ({ ...prev, [field]: result.path! }));
      markDirty(field);
    }
  };

  // 加载配置（防止 Strict Mode 重复执行）
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [settingsResult, defaultResult] = await Promise.all([
        api.getWorkspaceSettings(),
        api.getDefaultWorkspaceSettings(),
      ]);
      
      if (settingsResult.success && settingsResult.settings) {
        setSettings(settingsResult.settings);
      }
      
      if (defaultResult.success && defaultResult.settings) {
        setDefaultSettings(defaultResult.settings);
        // 检测 Docker 模式
        if (defaultResult.isDocker) {
          setIsDocker(true);
        }
      }
    } catch (error) {
      console.error('加载工作目录配置失败:', error);
      showToast('error', '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWorkspaceDir = async () => {
    if (!settings.workspaceDir.trim()) {
      showToast('error', '默认工作目录不能为空');
      return;
    }

    try {
      setSaving(true);
      const result = await api.saveWorkspaceSettings(settings);
      
      if (result.success) {
        showToast('success', '默认工作目录已保存');
        clearDirty('workspaceDir');
      } else {
        showToast('error', result.error || '保存失败');
      }
    } catch (error) {
      console.error('保存默认工作目录失败:', error);
      showToast('error', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveScriptDir = async () => {
    try {
      setSaving(true);
      const result = await api.saveWorkspaceSettings(settings);
      
      if (result.success) {
        showToast('success', 'Python 脚本目录已保存');
        clearDirty('scriptDir');
      } else {
        showToast('error', result.error || '保存失败');
      }
    } catch (error) {
      console.error('保存 Python 脚本目录失败:', error);
      showToast('error', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveImageDir = async () => {
    try {
      setSaving(true);
      const result = await api.saveWorkspaceSettings(settings);
      
      if (result.success) {
        showToast('success', '图片生成目录已保存');
        clearDirty('imageDir');
      } else {
        showToast('error', result.error || '保存失败');
      }
    } catch (error) {
      console.error('保存图片生成目录失败:', error);
      showToast('error', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSkillDir = async () => {
    if (!newSkillDir.trim()) {
      showToast('error', '请输入 Skill 目录路径');
      return;
    }

    try {
      setSaving(true);
      const result = await api.addSkillDir(newSkillDir.trim());
      
      if (result.success && result.settings) {
        setSettings(result.settings);
        setNewSkillDir('');
        setShowAddInput(false);
        showToast('success', 'Skill 目录已添加');
      } else {
        showToast('error', result.error || '添加失败');
      }
    } catch (error) {
      console.error('添加 Skill 目录失败:', error);
      showToast('error', '添加失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSkillDir = async (dir: string) => {
    if (!confirm(`确定要删除 Skill 目录 "${dir}" 吗？`)) {
      return;
    }

    try {
      setSaving(true);
      const result = await api.removeSkillDir(dir);
      
      if (result.success && result.settings) {
        setSettings(result.settings);
        showToast('success', 'Skill 目录已删除');
      } else {
        showToast('error', result.error || '删除失败');
      }
    } catch (error) {
      console.error('删除 Skill 目录失败:', error);
      showToast('error', '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultSkillDir = async (dir: string) => {
    try {
      setSaving(true);
      const result = await api.setDefaultSkillDir(dir);
      
      if (result.success && result.settings) {
        setSettings(result.settings);
        showToast('success', '默认 Skill 目录已设置');
      } else {
        showToast('error', result.error || '设置失败');
      }
    } catch (error) {
      console.error('设置默认 Skill 目录失败:', error);
      showToast('error', '设置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleResetWorkspaceDir = async () => {
    try {
      const result = await api.getDefaultWorkspaceSettings();
      if (result.success && result.settings) {
        setSettings({ ...settings, workspaceDir: result.settings.workspaceDir });
        markDirty('workspaceDir');
      }
    } catch (error) {
      showToast('error', '获取默认路径失败');
    }
  };

  const handleResetScriptDir = async () => {
    try {
      const result = await api.getDefaultWorkspaceSettings();
      if (result.success && result.settings) {
        setSettings({ ...settings, scriptDir: result.settings.scriptDir });
        markDirty('scriptDir');
      }
    } catch (error) {
      showToast('error', '获取默认路径失败');
    }
  };

  const handleResetImageDir = async () => {
    try {
      const result = await api.getDefaultWorkspaceSettings();
      if (result.success && result.settings) {
        setSettings({ ...settings, imageDir: result.settings.imageDir });
        markDirty('imageDir');
      }
    } catch (error) {
      showToast('error', '获取默认路径失败');
    }
  };

  const handleSaveMemoryDir = async () => {
    try {
      setSaving(true);
      const result = await api.saveWorkspaceSettings(settings);
      
      if (result.success) {
        showToast('success', '记忆管理目录已保存');
        clearDirty('memoryDir');
      } else {
        showToast('error', result.error || '保存失败');
      }
    } catch (error) {
      console.error('保存记忆管理目录失败:', error);
      showToast('error', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleResetMemoryDir = async () => {
    try {
      const result = await api.getDefaultWorkspaceSettings();
      if (result.success && result.settings) {
        setSettings({ ...settings, memoryDir: result.settings.memoryDir });
        markDirty('memoryDir');
      }
    } catch (error) {
      showToast('error', '获取默认路径失败');
    }
  };

  const handleSaveSessionDir = async () => {
    try {
      setSaving(true);
      const result = await api.saveWorkspaceSettings(settings);
      
      if (result.success) {
        showToast('success', '对话历史目录已保存');
        clearDirty('sessionDir');
      } else {
        showToast('error', result.error || '保存失败');
      }
    } catch (error) {
      console.error('保存对话历史目录失败:', error);
      showToast('error', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleResetSessionDir = async () => {
    try {
      const result = await api.getDefaultWorkspaceSettings();
      if (result.success && result.settings) {
        setSettings({ ...settings, sessionDir: result.settings.sessionDir });
        markDirty('sessionDir');
      }
    } catch (error) {
      showToast('error', '获取默认路径失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">工作目录配置</h3>
        <p className="text-sm text-gray-500">
          配置 DeepBot 的工作目录，所有文件操作将限制在工作目录及其子目录内
        </p>
      </div>

      {/* Docker 模式提示 */}
      {isDocker && (
        <div className="bg-blue-900/30 border border-blue-500/50 rounded-md p-3">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-blue-300">
              <p className="font-medium">Docker 模式</p>
              <p className="mt-0.5 text-blue-400">目录由 docker-compose.yml 的 volume 挂载决定，无法在此修改。如需更改，请修改 .env 文件后重启容器。</p>
            </div>
          </div>
        </div>
      )}

      {/* 默认工作目录 - 放在第一个位置 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          默认工作目录 <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500 mb-2">
          所有文件操作（读写、执行命令等）将限制在此目录及其子目录内，必须设置
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.workspaceDir}
            onChange={(e) => { setSettings({ ...settings, workspaceDir: e.target.value }); markDirty('workspaceDir'); }}
            disabled={isDocker}
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            placeholder={defaultSettings.workspaceDir || '~/'}
            required
          />
          {isElectron() && !isDocker && (
            <button
              onClick={() => handleBrowse('workspaceDir')}
              className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
              浏览
            </button>
          )}
          <button
            onClick={handleResetWorkspaceDir}
            disabled={isDocker}
            className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            重置
          </button>
          {dirtyFields.has('workspaceDir') && (
            <button
              onClick={handleSaveWorkspaceDir}
              disabled={saving || !settings.workspaceDir.trim() || isDocker}
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors disabled:cursor-not-allowed whitespace-nowrap"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400">
          默认：{defaultSettings.workspaceDir || '用户主目录'}
        </p>
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mt-2">
          <div className="flex">
            <svg className="w-5 h-5 text-yellow-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="text-sm text-yellow-700">
              <p className="font-medium">安全提示</p>
              <p>为了安全，AI 只能操作工作目录及其子目录内的文件，无法访问其他目录</p>
            </div>
          </div>
        </div>
      </div>

      {/* Python 脚本目录 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Python 脚本目录
        </label>
        <p className="text-xs text-gray-500 mb-2">
          AI 生成的 Python 脚本将统一保存到此目录
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.scriptDir}
            onChange={(e) => { setSettings({ ...settings, scriptDir: e.target.value }); markDirty('scriptDir'); }}
            disabled={isDocker}
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            placeholder="~/.deepbot/scripts"
          />
          {isElectron() && !isDocker && (
            <button onClick={() => handleBrowse('scriptDir')} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors whitespace-nowrap">浏览</button>
          )}
          <button onClick={handleResetScriptDir} disabled={isDocker} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">重置</button>
          {dirtyFields.has('scriptDir') && (
            <button onClick={handleSaveScriptDir} disabled={saving || isDocker} className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors whitespace-nowrap">{saving ? '保存中...' : '保存'}</button>
          )}
        </div>
        <p className="text-xs text-gray-400">
          默认：{defaultSettings.scriptDir || '~/.deepbot/scripts'}
        </p>
      </div>

      {/* 图片生成目录 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          图片生成目录
        </label>
        <p className="text-xs text-gray-500 mb-2">
          AI 生成的图片将统一保存到此目录
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.imageDir}
            onChange={(e) => { setSettings({ ...settings, imageDir: e.target.value }); markDirty('imageDir'); }}
            disabled={isDocker}
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            placeholder="~/.deepbot/generated-images"
          />
          {isElectron() && !isDocker && (
            <button onClick={() => handleBrowse('imageDir')} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors whitespace-nowrap">浏览</button>
          )}
          <button onClick={handleResetImageDir} disabled={isDocker} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">重置</button>
          {dirtyFields.has('imageDir') && (
            <button onClick={handleSaveImageDir} disabled={saving || isDocker} className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors whitespace-nowrap">{saving ? '保存中...' : '保存'}</button>
          )}
        </div>
        <p className="text-xs text-gray-400">
          默认：{defaultSettings.imageDir || '~/.deepbot/generated-images'}
        </p>
      </div>

      {/* 记忆管理目录 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          记忆管理目录
        </label>
        <p className="text-xs text-gray-500 mb-2">
          AI 的记忆文件将保存到此目录
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.memoryDir}
            onChange={(e) => { setSettings({ ...settings, memoryDir: e.target.value }); markDirty('memoryDir'); }}
            disabled={isDocker}
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            placeholder="~/.deepbot/memory"
          />
          {isElectron() && !isDocker && (
            <button onClick={() => handleBrowse('memoryDir')} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors whitespace-nowrap">浏览</button>
          )}
          <button onClick={handleResetMemoryDir} disabled={isDocker} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">重置</button>
          {dirtyFields.has('memoryDir') && (
            <button onClick={handleSaveMemoryDir} disabled={saving || isDocker} className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors whitespace-nowrap">{saving ? '保存中...' : '保存'}</button>
          )}
        </div>
        <p className="text-xs text-gray-400">
          默认：{defaultSettings.memoryDir || '~/.deepbot/memory'}
        </p>
      </div>

      {/* Session 目录 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          对话历史目录
        </label>
        <p className="text-xs text-gray-500 mb-2">
          每个 Tab 的对话历史将保存到此目录
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.sessionDir}
            onChange={(e) => { setSettings({ ...settings, sessionDir: e.target.value }); markDirty('sessionDir'); }}
            disabled={isDocker}
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            placeholder="~/.deepbot/sessions"
          />
          {isElectron() && !isDocker && (
            <button onClick={() => handleBrowse('sessionDir')} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors whitespace-nowrap">浏览</button>
          )}
          <button onClick={handleResetSessionDir} disabled={isDocker} className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">重置</button>
          {dirtyFields.has('sessionDir') && (
            <button onClick={handleSaveSessionDir} disabled={saving || isDocker} className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors whitespace-nowrap">{saving ? '保存中...' : '保存'}</button>
          )}
        </div>
        <p className="text-xs text-gray-400">
          默认：{defaultSettings.sessionDir || '~/.deepbot/sessions'}
        </p>
      </div>

      {/* Skill 目录列表 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Skill 工作目录
          </label>
          {!isDocker && (
            <button
              onClick={() => setShowAddInput(!showAddInput)}
              className="px-3 py-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {showAddInput ? '取消' : '+ 添加路径'}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-2">
          Skill 将安装到这些目录，可以配置多个路径
        </p>

        {/* 添加新路径输入框 */}
        {showAddInput && (
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newSkillDir}
              onChange={(e) => setNewSkillDir(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddSkillDir()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入新的 Skill 目录路径"
              autoFocus
            />
            <button
              onClick={handleAddSkillDir}
              disabled={saving || !newSkillDir.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-green-400 transition-colors"
            >
              添加
            </button>
          </div>
        )}

        {/* Skill 目录列表 */}
        <div className="space-y-2">
          {settings.skillDirs.map((dir) => (
            <div
              key={dir}
              className={`flex items-center justify-between p-3 border rounded-md ${
                dir === settings.defaultSkillDir
                  ? 'border-blue-500 bg-blue-900/20'
                  : 'border-gray-600 bg-gray-800/50'
              }`}
            >
              <div className="flex items-center gap-2 flex-1">
                {dir === settings.defaultSkillDir && (
                  <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                )}
                <span className={`text-sm ${
                  dir === settings.defaultSkillDir ? 'font-medium text-blue-300' : 'text-gray-300'
                }`}>
                  {dir}
                </span>
                {dir === settings.defaultSkillDir && (
                  <span className="text-xs text-blue-400 font-medium">（默认）</span>
                )}
              </div>
              <div className="flex gap-2">
                {dir !== settings.defaultSkillDir && !isDocker && (
                  <button
                    onClick={() => handleSetDefaultSkillDir(dir)}
                    disabled={saving}
                    className="px-3 py-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-500/50 rounded hover:bg-blue-900/20 font-medium disabled:text-blue-600 disabled:border-blue-700"
                  >
                    设为默认
                  </button>
                )}
                {settings.skillDirs.length > 1 && dir !== settings.defaultSkillDir && !isDocker && (
                  <button
                    onClick={() => handleRemoveSkillDir(dir)}
                    disabled={saving}
                    className="px-3 py-1 text-xs text-red-400 hover:text-red-300 border border-red-500/50 rounded hover:bg-red-900/20 font-medium disabled:text-red-600 disabled:border-red-700"
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400">
          默认：{defaultSettings.defaultSkillDir || '~/.agents/skills'}
        </p>
      </div>

      {/* 提示信息 */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-blue-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">提示</p>
            <ul className="list-disc list-inside space-y-1">
              <li>修改目录后，AI 将使用新目录保存脚本和图片</li>
              <li>可以添加多个 Skill 目录，AI 会搜索所有目录</li>
              <li>默认目录用于安装新的 Skill</li>
              <li>已有的脚本、图片和 Skill 不会自动迁移</li>
              <li>确保目录路径存在且有写入权限</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
}
