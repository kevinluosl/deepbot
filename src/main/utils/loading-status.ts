/**
 * 加载状态工具
 * 
 * 用于通知前端当前的加载阶段（如 processing / checking）
 * 兼容 Electron 和 Docker（Web）模式
 */

export type LoadingStatus = 'processing' | 'checking';

// 全局 mainWindow 引用（由 Gateway 初始化时设置）
let _mainWindow: any = null;

/**
 * 设置 mainWindow 引用
 */
export function setLoadingStatusWindow(win: any): void {
  _mainWindow = win;
}

/**
 * 发送加载状态到前端
 */
export function sendLoadingStatus(status: LoadingStatus): void {
  try {
    if (_mainWindow && !_mainWindow.isDestroyed()) {
      _mainWindow.webContents.send('loading-status', { status });
    }
  } catch {
    // 忽略错误
  }
}
