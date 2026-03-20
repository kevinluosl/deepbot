/**
 * 构建前脚本：下载 Windows 版 node.exe
 *
 * agent-browser 的 Rust 二进制在 Windows 上会 spawn "node.exe" 来启动 daemon。
 * 由于用户不需要安装 Node.js，我们在构建时把独立的 node.exe 打包进去。
 *
 * node.exe 放在 app/ 根目录，构建时通过 build.files 包含进去。
 * 运行时 agent-browser-wrapper.ts 会把 app/ 目录加入 PATH。
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 从 package.json 读取 Electron 版本，确定对应的 Node.js 版本
const pkg = require('../package.json');
const electronVersion = pkg.devDependencies.electron.replace('^', '').replace('~', '');

// Electron 28 对应 Node.js 20
// 通过 node -e 获取当前开发环境的 Node.js 版本作为参考
let nodeVersion;
try {
  // 尝试从 .nvmrc 或 engines 字段获取
  const enginesNode = pkg.engines?.node?.replace('>=', '') || '20.0.0';
  const major = enginesNode.split('.')[0];
  // 使用 LTS 版本
  const ltsMap = { '18': '18.20.4', '20': '20.18.0', '22': '22.11.0' };
  nodeVersion = ltsMap[major] || '20.18.0';
} catch {
  nodeVersion = '20.18.0';
}

const outputPath = path.join(__dirname, '../node.exe');

// 如果已经存在且大小合理（>10MB），跳过下载
if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10 * 1024 * 1024) {
  console.log(`✅ node.exe 已存在 (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)}MB)，跳过下载`);
  process.exit(0);
}

const downloadUrl = `https://nodejs.org/dist/v${nodeVersion}/win-x64/node.exe`;
console.log(`📥 下载 node.exe v${nodeVersion}...`);
console.log(`   来源: ${downloadUrl}`);
console.log(`   目标: ${outputPath}`);

function download(url, dest, redirectCount = 0) {
  if (redirectCount > 5) {
    console.error('❌ 重定向次数过多');
    process.exit(1);
  }

  const file = fs.createWriteStream(dest);
  https.get(url, (response) => {
    // 处理重定向
    if (response.statusCode === 301 || response.statusCode === 302) {
      file.close();
      fs.unlinkSync(dest);
      download(response.headers.location, dest, redirectCount + 1);
      return;
    }

    if (response.statusCode !== 200) {
      file.close();
      fs.unlinkSync(dest);
      console.error(`❌ 下载失败，HTTP ${response.statusCode}`);
      process.exit(1);
    }

    const totalSize = parseInt(response.headers['content-length'] || '0', 10);
    let downloaded = 0;

    response.on('data', (chunk) => {
      downloaded += chunk.length;
      if (totalSize > 0) {
        const pct = Math.round((downloaded / totalSize) * 100);
        process.stdout.write(`\r   进度: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
      }
    });

    response.pipe(file);

    file.on('finish', () => {
      file.close();
      console.log(`\n✅ node.exe 下载完成`);
    });
  }).on('error', (err) => {
    fs.unlinkSync(dest);
    console.error(`❌ 下载出错: ${err.message}`);
    process.exit(1);
  });
}

download(downloadUrl, outputPath);
