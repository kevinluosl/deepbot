/**
 * Browser Server 类型定义
 */

import type { Server } from 'node:http';
import type { BrowserStatus } from '../../../types/browser';

/**
 * Browser Server 状态
 */
export interface BrowserServerState {
  server: Server;
  port: number;
  profile: {
    name: string;
    cdpPort: number;
    color: string;
  };
  browser: {
    running: boolean;
    pid: number | null;
  };
}

/**
 * 请求处理器类型
 */
export type RequestHandler = (req: any, res: any) => Promise<void> | void;

/**
 * 路由定义
 */
export interface RouteDefinition {
  method: 'get' | 'post' | 'delete';
  path: string;
  handler: RequestHandler;
}
