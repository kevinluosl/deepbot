/**
 * 浏览器工具配置组件
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../api';

interface BrowserToolConfigProps {
  onClose?: () => void;
}

export function BrowserToolConfig({ onClose: _onClose }: BrowserToolConfigProps) {
  const [launching, setLaunching] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDocker, setIsDocker] = useState(false);

  useEffect(() => {
    api.getDefaultWorkspaceSettings().then(result => {
      if (result?.isDocker) setIsDocker(true);
    }).catch(() => {});
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleLaunchChrome = async () => {
    setLaunching(true);
    try {
      const result = await api.launchChromeWithDebug(9222);
      if (result.success) {
        showMessage('success', 'Chrome 已启动，可以开始使用浏览器工具');
      } else {
        showMessage('error', result.message || '启动失败');
      }
    } catch (error) {
      showMessage('error', `启动失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-base font-semibold text-gray-900 mb-2">浏览器工具</h4>
        <p className="text-sm text-gray-600">
          {isDocker
            ? 'Docker 模式下使用无头 Chromium 浏览器（Playwright），无需手动启动。'
            : 'DeepBot 使用 CDP（Chrome DevTools Protocol）连接到您手动启动的 Chrome 浏览器。'}
        </p>
      </div>

      {/* Docker 模式：无头浏览器安装说明 */}
      {isDocker && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-blue-900 mb-2">📦 安装 Chromium</h5>
            <p className="text-sm text-blue-800 mb-3">
              首次使用需要在容器内安装 Chromium，在宿主机终端执行：
            </p>
            <code className="block bg-gray-800 text-gray-100 px-3 py-2 rounded text-xs font-mono overflow-x-auto">
              docker exec -it deepbot npx playwright install chromium --with-deps
            </code>
            <p className="text-xs text-blue-700 mt-2">
              安装完成后，Chromium 会保存在 docker-compose.yml 中配置的 <code className="bg-blue-100 px-1 rounded">PLAYWRIGHT_CACHE_DIR</code> 目录（默认 <code className="bg-blue-100 px-1 rounded">~/.deepbot/playwright</code>），容器重启后无需重新安装。
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">✨ 特性</h5>
            <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
              <li>无头模式运行，无需图形界面</li>
              <li>自动管理浏览器生命周期</li>
              <li>Chromium 持久化到宿主机目录，避免重复下载</li>
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
              <span>快速启动</span>
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
                  启动中...
                </>
              ) : (
                <>启动 Chrome（端口 9222）</>
              )}
            </button>
            <p className="text-xs text-blue-700 mt-2">
              点击此按钮将自动启动 Chrome 浏览器并开启远程调试端口 9222
            </p>
          </div>

          {/* 消息提示 */}
          {message && (
            <div className={`p-4 rounded-md ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          {/* 手动启动 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span>📋</span>
              <span>手动启动（可选）</span>
            </h5>
            <p className="text-sm text-gray-600 mb-3">
              如果自动启动失败，可以手动在终端中运行以下命令：
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
              <span>特性</span>
            </h5>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '👁️', title: '可见操作', desc: '可以看到浏览器窗口和操作过程' },
                { icon: '🔧', title: '便于调试', desc: '适合调试和演示场景' },
                { icon: '🔒', title: '安全可控', desc: '完全由您控制浏览器启动' },
                { icon: '⚡', title: '无需安装', desc: '使用系统已安装的 Chrome' },
              ].map(({ icon, title, desc }) => (
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
              <span>注意事项</span>
            </h5>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>确保系统已安装 Google Chrome 浏览器</li>
              <li>确保端口 9222 未被其他程序占用</li>
              <li>关闭 Chrome 后，需要重新启动才能继续使用浏览器工具</li>
              <li>如果浏览器工具执行失败，系统会自动尝试启动 Chrome</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
