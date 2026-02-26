/**
 * 文件系统工具函数
 * 
 * 提供通用的文件系统操作辅助函数，减少重复代码
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 确保目录存在，如果不存在则创建
 * 
 * @param dirPath 目录路径
 * @returns 目录是否已存在（true）或新创建（false）
 * 
 * @example
 * ensureDirectoryExists('/path/to/dir');
 */
export function ensureDirectoryExists(dirPath: string): boolean {
  if (fs.existsSync(dirPath)) {
    return true;
  }
  
  fs.mkdirSync(dirPath, { recursive: true });
  return false;
}

/**
 * 安全读取文件，如果文件不存在返回默认值
 * 
 * @param filePath 文件路径
 * @param defaultValue 默认值
 * @param encoding 编码（默认 utf-8）
 * @returns 文件内容或默认值
 * 
 * @example
 * const content = safeReadFile('/path/to/file.txt', '默认内容');
 */
export function safeReadFile(
  filePath: string,
  defaultValue: string = '',
  encoding: BufferEncoding = 'utf-8'
): string {
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  
  try {
    return fs.readFileSync(filePath, encoding);
  } catch (error) {
    console.warn(`[FS Utils] 读取文件失败: ${filePath}`, error);
    return defaultValue;
  }
}

/**
 * 安全写入文件，自动创建父目录
 * 
 * @param filePath 文件路径
 * @param content 文件内容
 * @param encoding 编码（默认 utf-8）
 * 
 * @example
 * safeWriteFile('/path/to/file.txt', '内容');
 */
export function safeWriteFile(
  filePath: string,
  content: string | Buffer,
  encoding: BufferEncoding = 'utf-8'
): void {
  const dir = path.dirname(filePath);
  ensureDirectoryExists(dir);
  
  if (typeof content === 'string') {
    fs.writeFileSync(filePath, content, encoding);
  } else {
    fs.writeFileSync(filePath, content);
  }
}

/**
 * 检查路径是否存在且是目录
 * 
 * @param dirPath 目录路径
 * @returns 是否是目录
 * 
 * @example
 * if (isDirectory('/path/to/dir')) { ... }
 */
export function isDirectory(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 检查路径是否存在且是文件
 * 
 * @param filePath 文件路径
 * @returns 是否是文件
 * 
 * @example
 * if (isFile('/path/to/file.txt')) { ... }
 */
export function isFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * 递归复制目录
 * 
 * @param source 源目录
 * @param target 目标目录
 * 
 * @example
 * copyDirectory('/source', '/target');
 */
export function copyDirectory(source: string, target: string): void {
  ensureDirectoryExists(target);
  
  const entries = fs.readdirSync(source, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

/**
 * 安全删除文件或目录
 * 
 * @param targetPath 目标路径
 * @returns 是否删除成功
 * 
 * @example
 * safeRemove('/path/to/file-or-dir');
 */
export function safeRemove(targetPath: string): boolean {
  try {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return true;
    }
    return false;
  } catch (error) {
    console.warn(`[FS Utils] 删除失败: ${targetPath}`, error);
    return false;
  }
}
