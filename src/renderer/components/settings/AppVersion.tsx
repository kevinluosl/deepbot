/**
 * 系统版本页面
 * 显示当前版本号，支持手动检查更新
 */

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Download, RefreshCw, XCircle, ArrowRight } from 'lucide-react';
import { APP_VERSION } from '../../../shared/constants/version';
import { api } from '../../api';
import { isElectron } from '../../utils/platform';
import iconUrl from '../../assets/icon.png';

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error';

interface AppVersionProps {
  onClose?: () => void;
  initialUpdateInfo?: { version: string } | null;
}

export function AppVersion({ initialUpdateInfo }: AppVersionProps) {
  const [status, setStatus] = useState<UpdateStatus>(initialUpdateInfo ? 'available' : 'idle');
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(initialUpdateInfo || null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [installing, setInstalling] = useState(false);
  const checkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isElectron()) return;

    const unsubAvailable = api.onUpdateAvailable((info) => {
      // 清除检查超时 timer
      if (checkTimerRef.current) {
        clearTimeout(checkTimerRef.current);
        checkTimerRef.current = null;
      }
      setUpdateInfo(info);
      setStatus('available');
    });

    const unsubProgress = api.onUpdateDownloadProgress((progress) => {
      setDownloadProgress(Math.round(progress.percent));
      setStatus('downloading');
    });

    const unsubDownloaded = api.onUpdateDownloaded(() => {
      setStatus('downloaded');
    });

    return () => {
      unsubAvailable();
      unsubProgress();
      unsubDownloaded();
    };
  }, []);

  const handleCheckUpdate = async () => {
    if (!isElectron()) return;
    setStatus('checking');
    setErrorMsg('');
    checkTimerRef.current = setTimeout(() => {
      setStatus(prev => prev === 'checking' ? 'up-to-date' : prev);
      checkTimerRef.current = null;
    }, 10000);
    try {
      await api.checkForUpdates();
    } catch (e) {
      if (checkTimerRef.current) {
        clearTimeout(checkTimerRef.current);
        checkTimerRef.current = null;
      }
      setStatus('error');
      setErrorMsg('检查更新失败，请检查网络连接');
    }
  };

  const handleDownload = async () => {
    setStatus('downloading');
    setDownloadProgress(0);
    await api.downloadUpdate();
  };

  const handleInstall = async () => {
    setInstalling(true);
    await api.installUpdate();
  };

  return (
    <div className="settings-section">
      <div style={{ maxWidth: '480px' }}>
        {/* 版本信息 */}
        <div style={{
          padding: '20px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <img
              src={iconUrl}
              alt="DeepBot"
              style={{ width: '48px', height: '48px', borderRadius: '10px' }}
            />
            <div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--settings-text)' }}>
                DeepBot Terminal
              </div>
              <div style={{ fontSize: '13px', color: 'var(--settings-text-dim)', marginTop: '2px' }}>
                版本 {APP_VERSION}
              </div>
            </div>
          </div>
        </div>

        {/* 更新状态区域 - 仅 Electron */}
        {isElectron() && (
        <div style={{
          padding: '16px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          marginBottom: '16px',
        }}>
          {/* 状态提示 */}
          {status === 'idle' && (
            <p style={{ fontSize: '13px', color: 'var(--settings-text-dim)', marginBottom: '12px' }}>
              点击下方按钮检查是否有新版本可用
            </p>
          )}
          {status === 'checking' && (
            <p style={{ fontSize: '13px', color: 'var(--settings-text-dim)', marginBottom: '12px' }}>
              正在检查更新...
            </p>
          )}
          {status === 'up-to-date' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <CheckCircle size={16} color="var(--settings-success, #34c759)" />
              <p style={{ fontSize: '13px', color: 'var(--settings-success, #34c759)' }}>
                当前已是最新版本
              </p>
            </div>
          )}
          {status === 'available' && updateInfo && (
            <div style={{
              marginBottom: '12px',
              padding: '12px',
              background: 'rgba(0, 122, 255, 0.08)',
              borderRadius: '6px',
              border: '1px solid rgba(0, 122, 255, 0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <Download size={16} color="var(--settings-accent)" />
                <p style={{ fontSize: '14px', color: 'var(--settings-accent)', fontWeight: '600' }}>
                  发现新版本 v{updateInfo.version}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--settings-text-dim)' }}>v{APP_VERSION}</span>
                <ArrowRight size={12} color="var(--settings-text-dim)" />
                <span style={{ fontSize: '12px', color: 'var(--settings-accent)', fontWeight: '600' }}>v{updateInfo.version}</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--settings-text-dim)' }}>
                下载完成后将自动安装，应用会重启以完成更新
              </p>
            </div>
          )}
          {status === 'downloading' && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--settings-text-dim)', marginBottom: '8px' }}>
                正在下载更新... {downloadProgress}%
              </p>
              <div style={{
                height: '4px',
                background: 'var(--settings-border)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${downloadProgress}%`,
                  background: 'var(--settings-accent)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}
          {status === 'downloaded' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <CheckCircle size={16} color="var(--settings-success, #34c759)" />
              <p style={{ fontSize: '13px', color: 'var(--settings-success, #34c759)' }}>
                更新已下载完成，点击安装并重启
              </p>
            </div>
          )}
          {status === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <XCircle size={16} color="var(--settings-error, #ff3b30)" />
              <p style={{ fontSize: '13px', color: 'var(--settings-error, #ff3b30)' }}>
                {errorMsg}
              </p>
            </div>
          )}

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {(status === 'idle' || status === 'up-to-date' || status === 'error') && (
              <button
                onClick={handleCheckUpdate}
                className="settings-button"
                style={{ background: 'var(--settings-accent)', color: '#fff', borderColor: 'var(--settings-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} />
                检查更新
              </button>
            )}
            {status === 'checking' && (
              <button className="settings-button" disabled style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                检查中...
              </button>
            )}
            {status === 'available' && updateInfo && (
              <button
                onClick={handleDownload}
                className="settings-button"
                style={{ background: 'var(--settings-accent)', color: '#fff', borderColor: 'var(--settings-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} />
                下载 v{updateInfo.version}
              </button>
            )}
            {status === 'downloaded' && (
              <button
                onClick={handleInstall}
                disabled={installing}
                className="settings-button"
                style={{ background: 'var(--settings-accent)', color: '#fff', borderColor: 'var(--settings-accent)', display: 'flex', alignItems: 'center', gap: '6px', opacity: installing ? 0.7 : 1 }}
              >
                <RefreshCw size={14} style={installing ? { animation: 'spin 1s linear infinite' } : {}} />
                {installing ? '正在重启...' : '安装并重启'}
              </button>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
