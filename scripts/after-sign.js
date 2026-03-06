/**
 * electron-builder afterSign 钩子
 * 在 electron-builder 完成打包后，对应用进行 ad-hoc 签名
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  // 只在 macOS 平台执行
  if (context.electronPlatformName !== 'darwin') {
    console.log('⏭️  跳过签名（非 macOS 平台）');
    return;
  }

  const appPath = context.appOutDir + '/' + context.packager.appInfo.productFilename + '.app';
  
  console.log('\n🔐 执行 ad-hoc 签名...');
  console.log('   应用路径:', appPath);

  try {
    // 执行签名脚本
    const scriptPath = path.join(__dirname, 'sign-mac.sh');
    execSync(`bash "${scriptPath}" "${appPath}"`, { 
      stdio: 'inherit',
      encoding: 'utf-8'
    });
    
    console.log('✅ Ad-hoc 签名完成\n');
  } catch (error) {
    console.error('❌ 签名失败:', error.message);
    console.error('   这不会影响应用功能，但用户可能会看到"包损坏"提示');
    console.error('   用户可以使用 xattr 命令移除隔离属性\n');
    // 不抛出错误，允许构建继续
  }

  // 创建 node 包装脚本，用于 agent-browser
  console.log('\n🔗 创建 node 包装脚本...');
  try {
    const resourcesPath = path.join(appPath, 'Contents', 'Resources');
    const appDir = path.join(resourcesPath, 'app');
    const nodeWrapperPath = path.join(appDir, 'node');
    
    console.log('   包装脚本路径:', nodeWrapperPath);
    
    // 确保 app 目录存在
    if (!fs.existsSync(appDir)) {
      console.error('❌ app 目录不存在:', appDir);
      return;
    }
    
    // 删除已存在的文件
    if (fs.existsSync(nodeWrapperPath)) {
      fs.unlinkSync(nodeWrapperPath);
      console.log('   已删除旧的包装脚本');
    }
    
    // 创建包装脚本，使用 Electron 的 Node.js 运行
    // process.execPath 在 Electron 中指向 Electron 可执行文件
    // 但我们需要用它来运行纯 Node.js 脚本
    const wrapperScript = `#!/bin/bash
# Node.js wrapper for agent-browser
# This script uses Electron's built-in Node.js to run scripts

# CRITICAL: Set ELECTRON_RUN_AS_NODE before anything else
# This tells Electron to run as pure Node.js, not as an Electron app
export ELECTRON_RUN_AS_NODE=1

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"

# Get the Electron executable path (3 levels up: app -> Resources -> Contents -> MacOS)
ELECTRON_PATH="$SCRIPT_DIR/../../MacOS/${context.packager.appInfo.productFilename}"

# Execute with all arguments
exec "$ELECTRON_PATH" "$@"
`;
    
    fs.writeFileSync(nodeWrapperPath, wrapperScript, { mode: 0o755 });
    
    console.log('✅ node 包装脚本创建成功');
    console.log('   脚本使用 ELECTRON_RUN_AS_NODE=1 模式运行\n');
  } catch (error) {
    console.error('❌ 创建 node 包装脚本失败:', error.message);
    console.error('   这可能导致 agent-browser 无法启动\n');
    // 不抛出错误，允许构建继续
  }
};
