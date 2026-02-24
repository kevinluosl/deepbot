/**
 * 复制 Markdown 模板文件到 dist-electron 目录
 * 
 * 用途：确保 Prompt 模板文件在开发和生产环境中都可用
 */

const fs = require('fs');
const path = require('path');

// 源目录和目标目录
const sourceDir = path.join(__dirname, '../src/main/prompts/templates');
const targetDir = path.join(__dirname, '../dist-electron/main/prompts/templates');

/**
 * 递归创建目录
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 复制文件
 */
function copyFile(source, target) {
  fs.copyFileSync(source, target);
  console.log(`✅ 已复制: ${path.basename(source)}`);
}

/**
 * 复制目录中的所有 Markdown 文件
 */
function copyTemplates() {
  console.log('📋 开始复制 Prompt 模板文件...');
  console.log(`   源目录: ${sourceDir}`);
  console.log(`   目标目录: ${targetDir}`);
  
  // 确保源目录存在
  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ 源目录不存在: ${sourceDir}`);
    process.exit(1);
  }
  
  // 确保目标目录存在
  ensureDirectoryExists(targetDir);
  
  // 读取源目录中的所有文件
  const files = fs.readdirSync(sourceDir);
  
  // 复制所有 .md 文件
  let copiedCount = 0;
  files.forEach(file => {
    if (file.endsWith('.md')) {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, file);
      copyFile(sourcePath, targetPath);
      copiedCount++;
    }
  });
  
  console.log(`✅ 复制完成！共复制 ${copiedCount} 个文件`);
}

// 执行复制
try {
  copyTemplates();
} catch (error) {
  console.error('❌ 复制失败:', error);
  process.exit(1);
}
