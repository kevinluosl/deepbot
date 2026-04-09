/**
 * electron-builder afterPack 钩子
 * 打包完成、签名之前执行
 * 
 * 1. 修复 asar 中 constructor 目录名 bug
 * 2. 清理不需要的跨平台二进制文件（减小包体积）
 * 3. 创建 node 包装脚本（macOS）
 */

const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  const platform = context.electronPlatformName;
  const appPath = context.appOutDir + '/' + context.packager.appInfo.productFilename + '.app';
  const resourcesDir = platform === 'darwin'
    ? path.join(appPath, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');

  // ========== 修复和优化 asar ==========
  const asarPath = path.join(resourcesDir, 'app.asar');
  if (fs.existsSync(asarPath)) {
    await fixAndOptimizeAsar(asarPath, platform);
  }

  // ========== 清理 unpacked 中的跨平台文件 ==========
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');
  if (fs.existsSync(unpackedDir)) {
    cleanCrossPlatformFiles(unpackedDir, platform);
  }

  // ========== macOS: 创建 node 包装脚本 ==========
  if (platform !== 'darwin') {
    return;
  }

  const appDir = path.join(resourcesDir, 'app');
  const nodeWrapperDir = fs.existsSync(appDir) ? appDir : resourcesDir;
  const nodeWrapperPath = path.join(nodeWrapperDir, 'node');

  console.log('\n🔗 签名前创建 node 包装脚本...');

  if (fs.existsSync(nodeWrapperPath)) {
    fs.unlinkSync(nodeWrapperPath);
  }

  const productName = context.packager.appInfo.productFilename;
  const relPath = fs.existsSync(appDir) ? '../../MacOS' : '../MacOS';
  const wrapperScript = `#!/bin/bash
# Node.js wrapper for agent-browser
export ELECTRON_RUN_AS_NODE=1
SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
ELECTRON_PATH="$SCRIPT_DIR/${relPath}/${productName}"
exec "$ELECTRON_PATH" "$@"
`;

  fs.writeFileSync(nodeWrapperPath, wrapperScript, { mode: 0o755 });
  console.log('✅ node 包装脚本创建成功（将被纳入签名）\n');
};

/**
 * 修复和优化 asar 包
 */
async function fixAndOptimizeAsar(asarPath, platform) {
  try {
    const asar = require('@electron/asar');
    const tmpDir = asarPath + '.tmp';

    console.log('\n🔧 优化 asar 包...');
    asar.extractAll(asarPath, tmpDir);

    let modified = false;

    // 1. 修复 constructor 目录名 bug
    const sourceBase = path.join(process.cwd(), 'node_modules', '@sinclair', 'typebox', 'build');
    const fixes = [
      { dir: path.join(tmpDir, 'node_modules', '@sinclair', 'typebox', 'build', 'cjs', 'type', 'constructor'), src: path.join(sourceBase, 'cjs', 'type', 'constructor'), label: 'CJS' },
      { dir: path.join(tmpDir, 'node_modules', '@sinclair', 'typebox', 'build', 'esm', 'type', 'constructor'), src: path.join(sourceBase, 'esm', 'type', 'constructor'), label: 'ESM' },
    ];

    for (const fix of fixes) {
      if (!fs.existsSync(fix.dir) && fs.existsSync(fix.src)) {
        fs.cpSync(fix.src, fix.dir, { recursive: true });
        console.log(`   ✅ 已补回 ${fix.label} constructor 目录`);
        modified = true;
      }
    }

    // 2. 清理跨平台二进制文件
    const cleaned = cleanCrossPlatformFiles(tmpDir, platform);
    if (cleaned > 0) modified = true;

    if (modified) {
      await asar.createPackage(tmpDir, asarPath);
      console.log('✅ asar 已重新打包（优化完成）\n');
    } else {
      console.log('✅ asar 无需修改\n');
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (error) {
    console.error('⚠️ 优化 asar 失败:', error.message);
  }
}

/**
 * 清理不需要的跨平台二进制文件
 */
function cleanCrossPlatformFiles(baseDir, platform) {
  let cleaned = 0;

  // 根据平台确定要保留和删除的目录
  const platformKeep = platform === 'darwin' ? 'darwin' : platform === 'win32' ? 'win32' : 'linux';

  // koffi: 删除其他平台的二进制
  const koffiDir = path.join(baseDir, 'node_modules', 'koffi', 'build', 'koffi');
  if (fs.existsSync(koffiDir)) {
    for (const dir of fs.readdirSync(koffiDir)) {
      if (!dir.startsWith(platformKeep) && !dir.startsWith('musl')) {
        fs.rmSync(path.join(koffiDir, dir), { recursive: true, force: true });
        cleaned++;
      }
    }
    // musl 只在 linux 需要
    if (platform !== 'linux') {
      for (const dir of fs.readdirSync(koffiDir)) {
        if (dir.startsWith('musl')) {
          fs.rmSync(path.join(koffiDir, dir), { recursive: true, force: true });
          cleaned++;
        }
      }
    }
  }

  // lzma-native: 删除其他平台的 prebuilds
  const lzmaDir = path.join(baseDir, 'node_modules', 'lzma-native', 'prebuilds');
  if (fs.existsSync(lzmaDir)) {
    for (const dir of fs.readdirSync(lzmaDir)) {
      if (!dir.startsWith(platformKeep)) {
        fs.rmSync(path.join(lzmaDir, dir), { recursive: true, force: true });
        cleaned++;
      }
    }
  }

  // agent-browser: 删除其他平台的可执行文件
  const abBinDir = path.join(baseDir, 'node_modules', 'agent-browser', 'bin');
  if (fs.existsSync(abBinDir)) {
    for (const file of fs.readdirSync(abBinDir)) {
      // 保留 .js 文件和当前平台的二进制
      if (file.endsWith('.js')) continue;
      if (file.includes(platformKeep)) continue;
      fs.rmSync(path.join(abBinDir, file), { force: true });
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`   🗑️ 清理了 ${cleaned} 个跨平台文件`);
  }

  return cleaned;
}
