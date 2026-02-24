/**
 * electron-builder afterSign 钩子
 * 在 electron-builder 完成打包后，对应用进行 ad-hoc 签名
 */

const { execSync } = require('child_process');
const path = require('path');

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
};
