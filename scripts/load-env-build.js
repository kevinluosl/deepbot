/**
 * 加载 .env 文件后执行 electron-builder 打包
 * 用途：确保 after-sign.js 能读取到 APPLE_ID 等环境变量
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 加载 .env 文件
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    process.env[key] = value;
  }
  console.log('✅ 已加载 .env 环境变量');
} else {
  console.warn('⚠️  未找到 .env 文件，Apple 公证可能失败');
}

// 获取打包平台参数（--mac / --win / --linux）
const platform = process.argv[2] || '--mac';

// 执行构建和打包
const buildCmd = platform === '--win'
  ? `node scripts/download-node-win.js && pnpm run build && electron-builder ${platform}`
  : `pnpm run build && electron-builder ${platform}`;

console.log(`\n🚀 开始打包: ${buildCmd}\n`);

execSync(buildCmd, { stdio: 'inherit', env: process.env });
