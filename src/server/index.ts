#!/usr/bin/env node
/**
 * DeepBot Web 服务器入口
 * 
 * 提供 HTTP API 和 WebSocket 服务
 */

// 设置进程名称，方便在 ps/top 中识别
process.title = 'deepbot';

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import { Gateway, setGlobalGatewayInstance } from '../main/gateway';
import { GatewayAdapter } from './gateway-adapter';
import { WebSocketManager } from './websocket-manager';
import { authMiddleware, loginHandler } from './middleware/auth';
import { createConfigRouter } from './routes/config';
import { createTabsRouter } from './routes/tabs';
import { createToolsRouter } from './routes/tools';
import { createConnectorsRouter } from './routes/connectors';
import { createTasksRouter } from './routes/tasks';
import { createFilesRouter } from './routes/files';
import { createSkillsRouter } from './routes/skills';
import { TIMEOUTS } from '../main/config/timeouts';

// 读取环境变量
const PORT = parseInt(process.env.PORT || '3008');
const NODE_ENV = process.env.NODE_ENV || 'development';

async function main(): Promise<void> {
  console.log('🚀 启动 DeepBot Web 服务器...');
  
  // 创建 Express 应用
  const app = express();
  const server = createServer(app);
  
  // 创建 WebSocket 服务器
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  // 初始化 Gateway（复用现有代码）
  console.log('📦 初始化 Gateway...');
  const gateway = new Gateway();
  
  // 创建 Gateway 适配器
  console.log('🔌 创建 Gateway 适配器...');
  const gatewayAdapter = new GatewayAdapter(gateway);
  
  // Web 模式下需要手动初始化 Gateway 的依赖（使用虚拟窗口）
  console.log('🔧 初始化 Gateway 依赖...');
  await gateway.initializeForWebMode(gatewayAdapter.getVirtualWindow());
  
  // 设置全局 Gateway 实例，供 cross_tab_call 等工具的 senderTabName 注入使用
  setGlobalGatewayInstance(gateway);
  
  // 初始化 WebSocket 管理器
  console.log('🔌 初始化 WebSocket 管理器...');
  const wsManager = new WebSocketManager(wss, gatewayAdapter);
  
  // 中间件
  app.use(cors()); // 允许跨域
  app.use(express.json({ limit: '700mb' })); // 解析 JSON 请求体（支持大文件上传：图片 5MB、文件 500MB，base64 编码后约 667MB）
  app.use(express.urlencoded({ extended: true, limit: '700mb' })); // 解析 URL 编码请求体
  
  // 静态文件服务（前端）
  if (NODE_ENV === 'production') {
    // __dirname 在编译后是 dist-server/server/，需要回退两级到项目根目录
    const staticPath = path.join(__dirname, '../../dist-web');
    app.use(express.static(staticPath));
    console.log(`📁 静态文件目录: ${staticPath}`);
  }
  
  // 健康检查
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '0.3.0',
      uptime: process.uptime(),
      connections: wsManager.getActiveConnectionCount()
    });
  });
  
  // 认证 API（无需 Token）
  app.post('/api/auth/login', loginHandler);
  
  // 受保护的 API（需要 Token）
  app.use('/api/config', authMiddleware, createConfigRouter(gatewayAdapter));
  app.use('/api/tabs', authMiddleware, createTabsRouter(gatewayAdapter));
  app.use('/api/tools', authMiddleware, createToolsRouter(gatewayAdapter));
  app.use('/api/connectors', authMiddleware, createConnectorsRouter(gatewayAdapter));
  app.use('/api/tasks', authMiddleware, createTasksRouter(gatewayAdapter));
  app.use('/api/files', authMiddleware, createFilesRouter(gatewayAdapter));
  app.use('/api/skills', authMiddleware, createSkillsRouter(gatewayAdapter));
  
  // SPA 路由（生产环境）- 必须放在所有 API 路由之后
  if (NODE_ENV === 'production') {
    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(path.join(__dirname, '../../dist-web/index.html'));
    });
  }
  
  // 错误处理
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Server] 错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
  });
  
  // 启动服务器
  server.listen(PORT, () => {
    console.log('');
    console.log('✅ DeepBot Web 服务器启动成功！');
    console.log('');
    console.log(`📍 服务地址: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`🏥 健康检查: http://localhost:${PORT}/health`);
    console.log('');
    
    if (process.env.ACCESS_PASSWORD) {
      console.log('🔒 密码保护已启用');
    } else {
      console.log('⚠️  警告: 未设置访问密码（ACCESS_PASSWORD）');
    }
    
    console.log('');
    console.log('按 Ctrl+C 停止服务器');
  });
  
  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 正在关闭服务器...');
    
    // 关闭 WebSocket 连接
    wss.clients.forEach(client => client.close());
    
    // 关闭 HTTP 服务器
    server.close(() => {
      console.log('✅ 服务器已关闭');
      process.exit(0);
    });
    
    // 强制退出
    setTimeout(() => {
      console.log('⚠️  强制退出');
      process.exit(1);
    }, TIMEOUTS.SERVER_GRACEFUL_SHUTDOWN);
  });
}

// 启动服务器
main().catch((error) => {
  console.error('❌ 启动失败:', error);
  process.exit(1);
});
