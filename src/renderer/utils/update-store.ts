/**
 * 更新状态单例存储
 * 解决 SystemSettings 未挂载时自动检查结果丢失的问题
 */

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

let pendingUpdate: UpdateInfo | null = null;
let listeners: Array<(info: UpdateInfo) => void> = [];

export function setPendingUpdate(info: UpdateInfo) {
  pendingUpdate = info;
  listeners.forEach(fn => fn(info));
}

export function getPendingUpdate(): UpdateInfo | null {
  return pendingUpdate;
}

export function clearPendingUpdate() {
  pendingUpdate = null;
}

export function onPendingUpdateChange(fn: (info: UpdateInfo) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}
