/**
 * 全局 Toast 通知工具
 * 
 * 使用事件总线模式，各组件直接调用 showToast()，无需 props 传递
 */

type ToastType = 'success' | 'error';

interface ToastEvent {
  type: ToastType;
  text: string;
}

type ToastListener = (event: ToastEvent) => void;

const listeners = new Set<ToastListener>();

/** 显示全局 Toast 通知 */
export function showToast(type: ToastType, text: string): void {
  listeners.forEach(fn => fn({ type, text }));
}

/** 订阅 Toast 事件（返回取消订阅函数） */
export function onToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
