/**
 * 环境配置页面
 * 
 * 功能：
 * 1. 显示环境状态（Python、Node.js）
 * 2. 提供一键检查按钮（发送提示词到 Main Agent）
 * 3. 从数据库读取状态并显示
 */

import React, { useState, useEffect, useContext } from 'react';
import { api } from '../../api';
import { ThemeContext } from '../../App';
import type { ThemeMode } from '../../hooks/useTheme';
import { getLanguage, setLanguage as saveLanguage, type Language } from '../../i18n';

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
  const { mode: themeMode, setThemeMode } = useContext(ThemeContext);
  const [status, setStatus] = useState<EnvironmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = React.useRef(false);
  const [fontSize, setFontSize] = useState<string>(() => {
    return localStorage.getItem('deepbot-font-size') || 'small';
  });
  const [language, setLang] = useState<Language>(getLanguage);

  // 切换字体大小
  const handleFontSizeChange = (size: string) => {
    setFontSize(size);
    localStorage.setItem('deepbot-font-size', size);
    document.documentElement.setAttribute('data-font-size', size);
  };

  // 切换语言
  const handleLanguageChange = (lang: Language) => {
    setLang(lang);
    saveLanguage(lang);
    // 同步到后端（影响系统提示词）
    api.saveAppSetting('language', lang).catch(() => {});
  };

  // 加载环境状态
  const loadStatus = async () => {
    try {
      const result = await api.checkEnvironment('get_status');
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
    
    api.sendMessage(prompt, sessionId).catch((err) => {
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
          配置界面主题和运行环境。
        </p>
      </div>

      {/* 界面主题 */}
      <div style={{
        padding: '12px 16px',
        border: '1px solid var(--settings-border)',
        borderRadius: '8px',
      }}>
        <div style={{ fontSize: '13px', color: 'var(--settings-text)', fontWeight: '600', marginBottom: '8px' }}>
          界面主题
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {([
            { value: 'light' as ThemeMode, label: '浅色', icon: (
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.8 7.8l2.1 2.1M22.1 22.1l2.1 2.1M7.8 24.2l2.1-2.1M22.1 9.9l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )},
            { value: 'dark' as ThemeMode, label: '深色', icon: (
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <path d="M26 17.6A10 10 0 1114.4 6a8 8 0 0011.6 11.6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )},
            { value: 'auto' as ThemeMode, label: '自动', icon: (
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 6v20" stroke="currentColor" strokeWidth="2"/>
                <path d="M16 6a10 10 0 010 20" fill="currentColor" opacity="0.15"/>
              </svg>
            )},
          ]).map(opt => (
            <div
              key={opt.value}
              onClick={() => setThemeMode(opt.value)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                border: themeMode === opt.value ? '2px solid var(--settings-accent)' : '2px solid transparent',
                background: themeMode === opt.value ? 'var(--terminal-accent-bg)' : 'transparent',
                color: themeMode === opt.value ? 'var(--settings-accent)' : 'var(--settings-text-dim)',
                transition: 'all 0.15s ease',
              }}
            >
              {opt.icon}
              <span style={{ fontSize: '11px', fontWeight: themeMode === opt.value ? '600' : '400' }}>
                {opt.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 字体大小 */}
      <div style={{
        padding: '12px 16px',
        border: '1px solid var(--settings-border)',
        borderRadius: '8px',
        marginBottom: '16px',
      }}>
        <div style={{ fontSize: '13px', color: 'var(--settings-text)', fontWeight: '600', marginBottom: '8px' }}>
          字体大小
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {([
            { value: 'small', label: '标准' },
            { value: 'medium', label: '中等' },
            { value: 'large', label: '较大' },
          ]).map(opt => (
            <div
              key={opt.value}
              onClick={() => handleFontSizeChange(opt.value)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                border: fontSize === opt.value ? '2px solid var(--settings-accent)' : '2px solid transparent',
                background: fontSize === opt.value ? 'var(--terminal-accent-bg)' : 'transparent',
                color: fontSize === opt.value ? 'var(--settings-accent)' : 'var(--settings-text-dim)',
                transition: 'all 0.15s ease',
                minWidth: '60px',
              }}
            >
              <span style={{ fontSize: opt.value === 'small' ? '13px' : opt.value === 'medium' ? '14px' : '15px', fontFamily: 'Courier New, Consolas, monospace' }}>Aa</span>
              <span style={{ fontSize: '11px', fontWeight: fontSize === opt.value ? '600' : '400', marginTop: '2px' }}>
                {opt.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 语言 */}
      <div style={{
        padding: '12px 16px',
        border: '1px solid var(--settings-border)',
        borderRadius: '8px',
        marginBottom: '16px',
      }}>
        <div style={{ fontSize: '13px', color: 'var(--settings-text)', fontWeight: '600', marginBottom: '8px' }}>
          语言 / Language
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {([
            { value: 'zh' as Language, label: '中文' },
            { value: 'en' as Language, label: 'English' },
          ]).map(opt => (
            <div
              key={opt.value}
              onClick={() => handleLanguageChange(opt.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                border: language === opt.value ? '2px solid var(--settings-accent)' : '2px solid transparent',
                background: language === opt.value ? 'var(--terminal-accent-bg)' : 'transparent',
                color: language === opt.value ? 'var(--settings-accent)' : 'var(--settings-text-dim)',
                transition: 'all 0.15s ease',
                fontSize: '13px',
                fontWeight: language === opt.value ? '600' : '400',
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
        {language === 'en' && (
          <div style={{ fontSize: '11px', color: 'var(--settings-text-dim)', marginTop: '6px' }}>
            Agent will respond in English when this is selected.
          </div>
        )}
      </div>

      {/* 运行环境 */}
      <div style={{
        padding: '16px',
        border: '1px solid var(--settings-border)',
        borderRadius: '8px',
      }}>
        <div style={{ fontSize: '13px', color: 'var(--settings-text)', fontWeight: '600', marginBottom: '4px' }}>
          运行环境
        </div>
        <p style={{ fontSize: '12px', color: 'var(--settings-text-dim)', marginBottom: '12px' }}>
          DeepBot 需要 Python 环境来执行脚本和 Skill。
        </p>

        <div className="space-y-3">

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
      </div>
    </div>
  );
}
