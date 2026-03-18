/**
 * 环境配置页面
 * 
 * 功能：
 * 1. 显示环境状态（Python、Node.js）
 * 2. 提供一键检查按钮（发送提示词到 Main Agent）
 * 3. 从数据库读取状态并显示
 */

import React, { useState, useEffect } from 'react';

interface EnvironmentStatus {
  python: {
    isInstalled: boolean;
    version?: string;
    path?: string;
    error?: string;
  } | null;
  allInstalled: boolean;
  needsCheck: boolean;
}

interface EnvironmentConfigProps {
  onClose?: () => void;
  activeTabId?: string; // 当前选中的 Tab ID
}

export function EnvironmentConfig({ onClose, activeTabId }: EnvironmentConfigProps) {
  const [status, setStatus] = useState<EnvironmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = React.useRef(false);

  // 加载环境状态
  const loadStatus = async () => {
    try {
      const result = await window.deepbot.checkEnvironment('get_status');
      if (result.success) {
        setStatus(result.data);
      } else {
        setError(result.error || '获取状态失败');
      }
    } catch (err: any) {
      console.error('加载环境状态失败:', err);
      setError(err.message || '加载失败');
    }
  };

  // 组件挂载时加载状态（防止 Strict Mode 重复执行）
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    loadStatus();
  }, []);

  // 执行环境检查（通过 Main Agent）
  const handleCheckEnvironment = () => {
    // 发送提示词到 Main Agent（不等待完成）
    const prompt = `请检查系统环境依赖，使用 environment_check 工具执行检查操作（action: check）。检查完成后，请告诉我结果。`;
    
    // 🔥 使用当前选中的 Tab ID，如果没有则使用默认 Tab
    const sessionId = activeTabId || 'default';
    
    window.deepbot.sendMessage(prompt, sessionId).catch((err) => {
      console.error('发送消息失败:', err);
    });

    // 立即关闭窗口，让用户在聊天窗口看到 Agent 执行过程
    if (onClose) {
      onClose();
    }
  };

  // 渲染环境项
  const renderEnvironmentItem = (
    name: string,
    displayName: string,
    config: { isInstalled: boolean; version?: string; path?: string; error?: string } | null
  ) => {
    if (!config) {
      return (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-gray-400 text-xl">?</span>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">{displayName}</h3>
                <p className="text-xs text-gray-500">未检查</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`rounded-lg p-4 ${config.isInstalled ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              config.isInstalled ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {config.isInstalled ? (
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">{displayName}</h3>
              {config.isInstalled ? (
                <>
                  <p className="text-xs text-gray-600 mt-1">版本: {config.version}</p>
                  <p className="text-xs text-gray-500 mt-0.5">路径: {config.path}</p>
                </>
              ) : (
                <p className="text-xs text-red-600 mt-1">未安装 - {config.error}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 标题和说明 */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">环境配置</h3>
        <p className="text-sm text-gray-500">
          DeepBot 需要 Python 环境才能正常运行。
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-red-900">错误</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* 环境状态 */}
      {status && !status.needsCheck && (
        <div className="space-y-3">
          {renderEnvironmentItem('python', 'Python', status.python)}
        </div>
      )}

      {/* 未检查状态 */}
      {status && status.needsCheck && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-yellow-900">尚未检查环境</h4>
              <p className="text-sm text-yellow-700 mt-1">
                请点击下方按钮检查系统环境配置
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 检查按钮 */}
      <div className="flex items-center space-x-4">
        <button
          onClick={handleCheckEnvironment}
          className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          检查环境
        </button>

        {status && !status.needsCheck && (
          <button
            onClick={loadStatus}
            className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            刷新状态
          </button>
        )}
      </div>

      {/* 总体状态 */}
      {status && !status.needsCheck && (
        <div className={`rounded-lg p-4 ${
          status.allInstalled ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-start space-x-3">
            {status.allInstalled ? (
              <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <div>
              <h4 className={`text-sm font-medium ${
                status.allInstalled ? 'text-green-900' : 'text-yellow-900'
              }`}>
                {status.allInstalled ? '环境配置完成' : '环境配置不完整'}
              </h4>
              <p className={`text-sm mt-1 ${
                status.allInstalled ? 'text-green-700' : 'text-yellow-700'
              }`}>
                {status.allInstalled 
                  ? 'DeepBot 已准备就绪，可以正常使用所有功能。'
                  : 'Python 未安装，某些功能可能无法使用。请安装 Python。'
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 安装指南 */}
      {status && !status.allInstalled && !status.needsCheck && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">安装指南</h4>
          <div className="space-y-2 text-sm text-blue-700">
            {!status.python?.isInstalled && (
              <div>
                <p className="font-medium">安装 Python:</p>
                <code className="block bg-blue-100 px-2 py-1 rounded mt-1 text-xs">
                  # macOS: brew install python<br/>
                  # Linux: sudo apt install python3 python3-pip<br/>
                  # Windows: 下载官方安装包
                </code>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
