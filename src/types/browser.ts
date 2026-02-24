/**
 * Browser 类型定义
 * 
 */

/**
 * 浏览器状态
 */
export interface BrowserStatus {
  enabled: boolean;
  running: boolean;
  cdpReady: boolean;
  pid: number | null;
  cdpPort: number;
  cdpUrl: string;
  profile: string;
  headless: boolean;
}

/**
 * 浏览器标签页
 */
export interface BrowserTab {
  targetId: string;
  title: string;
  url: string;
  type?: string;
}

/**
 * 快照结果（AI 格式）
 */
export interface SnapshotAiResult {
  ok: true;
  format: 'ai';
  targetId: string;
  url: string;
  title: string;
  snapshot: string;
  truncated?: boolean;
}

/**
 * 快照结果（ARIA 格式）
 */
export interface SnapshotAriaNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  depth: number;
}

export interface SnapshotAriaResult {
  ok: true;
  format: 'aria';
  targetId: string;
  url: string;
  nodes: SnapshotAriaNode[];
}

/**
 * 快照结果（联合类型）
 */
export type SnapshotResult = SnapshotAiResult | SnapshotAriaResult;

/**
 * 截图结果
 */
export interface ScreenshotResult {
  ok: true;
  path: string;
  type: 'png' | 'jpeg';
}

/**
 * PDF 导出结果
 */
export interface PdfResult {
  ok: true;
  path: string;
}

/**
 * 控制台消息
 */
export interface ConsoleMessage {
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  timestamp: number;
}

/**
 * 导航结果
 */
export interface NavigateResult {
  ok: true;
  url: string;
  targetId: string;
}
