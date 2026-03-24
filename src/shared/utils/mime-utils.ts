/**
 * MIME 类型工具函数
 */

/**
 * 根据文件扩展名获取 MIME 类型
 */
export function getMimeType(ext: string): string {
  const normalizedExt = ext.toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
  };
  
  return mimeTypes[normalizedExt] || 'image/jpeg';
}

/**
 * 将图片文件转换为 Data URL
 */
export function imageToDataUrl(buffer: Buffer, ext: string): string {
  const mimeType = getMimeType(ext);
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}
