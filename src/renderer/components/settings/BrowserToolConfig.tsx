/**
 * 浏览器工具配置组件
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { showToast } from '../../utils/toast';
import { getLanguage } from '../../i18n';

interface BrowserToolConfigProps {
  onClose?: () => void;
}

export function BrowserToolConfig({ onClose: _onClose }: BrowserToolConfigProps) {
  const lang = getLanguage();
  const [launching, setLaunching] = useState(false);
  const [isDocker, setIsDocker] = useState(false);

  useEffect(() => {
    api.getDefaultWorkspaceSettings().then(result => {
      if (result?.isDocker) setIsDocker(true);
    }).catch(() => {});
  }, []);

  const handleLaunchChrome = async () => {
    setLaunching(true);
    try {
      const result = await api.launchChromeWithDebug(9222);
      if (result.success) {
        showToast('success', lang === 'zh' ? 'Chrome 已启动，可以开始使用浏览器工具' : 'Chrome launched, browser tools are ready');
      } else {
        showToast('error', result.message || (lang === 'zh' ? '启动失败' : 'Launch failed'));
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : (lang === 'zh' ? '未知错误' : 'Unknown error');
      showToast('error', `${lang === 'zh' ? '启动失败' : 'Launch failed'}: ${errMsg}`);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-base font-semibold text-gray-900 mb-2">{lang === 'zh' ? '浏览器工具' : 'Browser Tools'}</h4>
        <p className="text-sm text-gray-600">
          {isDocker
            ? (lang === 'zh' ? 'Docker 模式下使用无头 Chromium 浏览器（Playwright），无需手动启动。' : 'Uses headless Chromium (Playwright) in Docker mode, no manual launch needed.')
            : (lang === 'zh' ? 'DeepBot 使用 CDP（Chrome DevTools Protocol）连接到您手动启动的 Chrome 浏览器。' : 'DeepBot connects to your manually launched Chrome browser via CDP (Chrome DevTools Protocol).')}
        </p>
      </div>

      {/* Docker 模式：无头浏览器安装说明 */}
      {isDocker && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-blue-900 mb-2">{lang === 'zh' ? '📦 安装 Chromium' : '📦 Install Chromium'}</h5>
            <p className="text-sm text-blue-800 mb-3">
              {lang === 'zh' ? '首次使用需要在容器内安装 Chromium，在宿主机终端执行：' : 'For first-time use, install Chromium inside the container by running on the host terminal:'}
            </p>
            <code className="block bg-gray-800 text-gray-100 px-3 py-2 rounded text-xs font-mono overflow-x-auto">
              docker exec -it deepbot npx playwright install chromium --with-deps
            </code>
            <p className="text-xs text-blue-700 mt-2">
              {lang === 'zh'
                ? <>安装完成后，Chromium 会保存在 docker-compose.yml 中配置的 <code className="bg-blue-100 px-1 rounded">PLAYWRIGHT_CACHE_DIR</code> 目录（默认 <code className="bg-blue-100 px-1 rounded">~/.deepbot/playwright</code>），容器重启后无需重新安装。</>
                : <>After installation, Chromium is saved in the <code className="bg-blue-100 px-1 rounded">PLAYWRIGHT_CACHE_DIR</code> directory configured in docker-compose.yml (default <code className="bg-blue-100 px-1 rounded">~/.deepbot/playwright</code>), no reinstall needed after container restart.</>}
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">{lang === 'zh' ? '✨ 特性' : '✨ Features'}</h5>
            <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li>{lang === 'zh' ? '无头模式运行，无需图形界面' : 'Runs in headless mode, no GUI required'}</li>
              <li>{lang === 'zh' ? '自动管理浏览器生命周期' : 'Automatic browser lifecycle management'}</li>
              <li>{lang === 'zh' ? 'Chromium 持久化到宿主机目录，避免重复下载' : 'Chromium persisted to host directory, avoiding repeated downloads'}</li>
            </ul>
          </div>
        </div>
      )}

      {/* Electron 模式：CDP 说明 */}
      {!isDocker && (
        <div className="space-y-4">
          {/* 快速启动按钮 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <span>🚀</span>
              <span>{lang === 'zh' ? '快速启动' : 'Quick Launch'}</span>
            </h5>
            <button
              onClick={handleLaunchChrome}
              disabled={launching}
              className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center justify-center gap-2"
            >
              {launching ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {lang === 'zh' ? '启动中...' : 'Launching...'}
                </>
              ) : (
                <>{lang === 'zh' ? '启动 Chrome（端口 9222）' : 'Launch Chrome (Port 9222)'}</>
              )}
            </button>
            <p className="text-xs text-blue-700 mt-2">
              {lang === 'zh' ? '点击此按钮将自动启动 Chrome 浏览器并开启远程调试端口 9222' : 'Click to automatically launch Chrome with remote debugging port 9222'}
            </p>
          </div>

          {/* 手动启动 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span>📋</span>
              <span>{lang === 'zh' ? '手动启动（可选）' : 'Manual Launch (Optional)'}</span>
            </h5>
            <p className="text-sm text-gray-600 mb-3">
              {lang === 'zh' ? '如果自动启动失败，可以手动在终端中运行以下命令：' : 'If auto-launch fails, you can manually run the following commands in your terminal:'}
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-700 font-medium">macOS:</p>
                <code className="block mt-1 p-2 bg-white border border-gray-300 rounded text-xs text-gray-800 overflow-x-auto">
                  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/.deepbot/browser-profile"
                </code>
              </div>
              <div>
                <p className="text-xs text-gray-700 font-medium">Windows:</p>
                <code className="block mt-1 p-2 bg-white border border-gray-300 rounded text-xs text-gray-800 overflow-x-auto">
                  chrome.exe --remote-debugging-port=9222 --user-data-dir=%USERPROFILE%\.deepbot\browser-profile
                </code>
              </div>
              <div>
                <p className="text-xs text-gray-700 font-medium">Linux:</p>
                <code className="block mt-1 p-2 bg-white border border-gray-300 rounded text-xs text-gray-800 overflow-x-auto">
                  google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.deepbot/browser-profile"
                </code>
              </div>
            </div>
          </div>

          {/* 特性 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span>✨</span>
              <span>{lang === 'zh' ? '特性' : 'Features'}</span>
            </h5>
            <div className="grid grid-cols-2 gap-3">
              {(lang === 'zh' ? [
                { icon: '👁️', title: '可见操作', desc: '可以看到浏览器窗口和操作过程' },
                { icon: '🔧', title: '便于调试', desc: '适合调试和演示场景' },
                { icon: '🔒', title: '安全可控', desc: '完全由您控制浏览器启动' },
                { icon: '⚡', title: '无需安装', desc: '使用系统已安装的 Chrome' },
              ] : [
                { icon: '👁️', title: 'Visible Actions', desc: 'See the browser window and operations in real time' },
                { icon: '🔧', title: 'Easy Debugging', desc: 'Great for debugging and demos' },
                { icon: '🔒', title: 'Secure & Controlled', desc: 'You fully control the browser launch' },
                { icon: '⚡', title: 'No Install Needed', desc: 'Uses your system-installed Chrome' },
              ]).map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-2">
                  <span className="text-green-600 text-lg">{icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{title}</p>
                    <p className="text-xs text-gray-600">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 注意事项 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-2">
              <span>⚠️</span>
              <span>{lang === 'zh' ? '注意事项' : 'Notes'}</span>
            </h5>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>{lang === 'zh' ? '确保系统已安装 Google Chrome 浏览器' : 'Make sure Google Chrome is installed on your system'}</li>
              <li>{lang === 'zh' ? '确保端口 9222 未被其他程序占用' : 'Make sure port 9222 is not in use by another program'}</li>
              <li>{lang === 'zh' ? '关闭 Chrome 后，需要重新启动才能继续使用浏览器工具' : 'After closing Chrome, you need to relaunch it to continue using browser tools'}</li>
              <li>{lang === 'zh' ? '如果浏览器工具执行失败，系统会自动尝试启动 Chrome' : 'If browser tools fail, the system will automatically try to launch Chrome'}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
