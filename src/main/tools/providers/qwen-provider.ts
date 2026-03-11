/**
 * 图片生成工具 - Qwen 提供商
 * 
 * 支持 Qwen-Image 系列模型：
 * - qwen-image-2.0-pro (推荐) - 最高质量，支持 2K 分辨率和专业排版
 * - qwen-image-2.0 - 平衡质量和速度
 * - qwen-image-max - 改进真实感和自然度
 * - qwen-image-plus - 擅长多样艺术风格
 */

import https from 'node:https';
import { existsSync } from 'node:fs';
import { TIMEOUTS } from '../../config/timeouts';
import { safeJsonParse } from '../../../shared/utils/json-utils';
import { expandPath, getMimeType, readImageFile } from './image-utils';

// 创建禁用 SSL 验证的 Agent
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

/**
 * 调用 Qwen API 生成图片
 */
export async function generateImageWithQwen(params: {
  prompt: string;
  aspectRatio?: '1:1' | '4:3' | '16:9' | '9:16' | '3:4' | '3:2' | '2:3' | '4:5' | '5:4' | '21:9';
  resolution?: '1K' | '2K' | '4K';
  referenceImages?: string[];
  apiKey: string;
  apiUrl: string;
  model: string;
  signal?: AbortSignal;
}): Promise<{ imageData: string; mimeType: string }> {
  const { prompt, aspectRatio = '16:9', resolution = '1K', referenceImages = [], apiKey, apiUrl, model, signal } = params;

  // 检查是否已被取消
  if (signal?.aborted) {
    const err = new Error('图片生成操作被取消');
    err.name = 'AbortError';
    throw err;
  }

  // 映射宽高比到具体尺寸（根据 Qwen-Image 2.0 API 支持的尺寸）
  const aspectRatioMap: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },     // 正方形
    '4:3': { width: 1024, height: 768 },      // 横向标准
    '16:9': { width: 1280, height: 720 },     // 宽屏
    '9:16': { width: 720, height: 1280 },     // 竖屏
    '3:4': { width: 768, height: 1024 },      // 竖向标准
    '3:2': { width: 1152, height: 768 },      // 横向照片
    '2:3': { width: 768, height: 1152 },      // 竖向照片
    '4:5': { width: 819, height: 1024 },      // 社交媒体竖屏
    '5:4': { width: 1024, height: 819 },      // 社交媒体横屏
    '21:9': { width: 1344, height: 576 },     // 超宽屏
  };

  const dimensions = aspectRatioMap[aspectRatio] || { width: 1024, height: 1024 };

  // 构建请求体（使用新的 Qwen-Image 2.0 API 格式）
  const requestBody: any = {
    model: model,
    input: {
      messages: [
        {
          role: 'user',
          content: [
            {
              text: prompt
            }
          ]
        }
      ]
    },
    parameters: {
      size: `${dimensions.width}*${dimensions.height}`,
      n: 1,
      seed: Math.floor(Math.random() * 1000000),
    },
  };

  // 如果有参考图片，添加到请求中（Qwen-Image 2.0 支持参考图片）
  if (referenceImages.length > 0) {
    const validImages = referenceImages.slice(0, 1); // Qwen-Image 2.0 支持1张参考图片
    
    for (const imagePath of validImages) {
      if (signal?.aborted) {
        const err = new Error('图片生成操作被取消');
        err.name = 'AbortError';
        throw err;
      }
      
      const expandedPath = expandPath(imagePath);
      
      if (existsSync(expandedPath)) {
        try {
          const { buffer, mimeType } = readImageFile(imagePath);
          const base64Image = buffer.toString('base64');
          
          // 添加参考图片到消息中
          requestBody.input.messages[0].content.push({
            image: `data:${mimeType};base64,${base64Image}`
          });
          
          // 更新提示词
          requestBody.input.messages[0].content[0].text = `参考图片风格。${prompt}`;
          break;
        } catch (error) {
          console.warn(`读取参考图片失败 (${expandedPath}):`, error);
        }
      } else {
        console.warn(`参考图片不存在: ${expandedPath}`);
      }
    }
  }

  console.log('[Qwen Image Generation] 调用 Qwen-Image 2.0 API...');
  console.log(`   模型: ${model}`);
  console.log(`   尺寸: ${dimensions.width}*${dimensions.height}`);
  console.log(`   提示词: ${prompt.substring(0, 50)}...`);

  // 第一步：提交任务（使用同步 API）
  const submitResponse = await new Promise<any>((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('图片生成操作被取消');
      err.name = 'AbortError';
      reject(err);
      return;
    }

    const urlObj = new URL(apiUrl);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        // 使用同步 API，不设置异步标头
      },
      agent: httpsAgent,
      timeout: TIMEOUTS.IMAGE_GENERATION_TIMEOUT,
    };

    const req = https.request(options, (res) => {
      console.log('[Qwen Image Generation] API 响应，状态码:', res.statusCode);
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          ok: res.statusCode === 200,
          status: res.statusCode,
          text: async () => data,
          json: async () => safeJsonParse(data, {}),
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API 请求超时'));
    });

    if (signal) {
      const onAbort = () => {
        console.log('[Qwen Image Generation] ⏹️ 收到停止信号，中止 API 请求');
        req.destroy();
        const err = new Error('图片生成操作被取消');
        err.name = 'AbortError';
        reject(err);
      };
      
      signal.addEventListener('abort', onAbort, { once: true });
      req.on('close', () => {
        signal.removeEventListener('abort', onAbort);
      });
    }
    
    req.write(JSON.stringify(requestBody));
    req.end();
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`Qwen-Image API 请求失败 (${submitResponse.status}): ${errorText}`);
  }

  const result: any = await submitResponse.json();
  
  // 检查响应格式
  if (!result.output || !result.output.choices || !result.output.choices[0]) {
    throw new Error('Qwen-Image API 未返回有效的图片数据');
  }

  const choice = result.output.choices[0];
  if (!choice.message || !choice.message.content || !choice.message.content[0]) {
    throw new Error('Qwen-Image API 响应格式错误');
  }

  const content = choice.message.content[0];
  if (!content.image) {
    throw new Error('Qwen-Image API 未返回图片数据');
  }

  // 处理图片数据
  let imageData: string;
  if (content.image.startsWith('http')) {
    // 如果是 URL，下载图片
    console.log('[Qwen Image Generation] 下载生成的图片...');
    imageData = await downloadImageAsBase64(content.image, signal);
  } else if (content.image.startsWith('data:')) {
    // 如果是 base64 数据，提取 base64 部分
    const base64Match = content.image.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (base64Match) {
      imageData = base64Match[1];
    } else {
      throw new Error('无效的 base64 图片数据格式');
    }
  } else {
    // 假设直接是 base64 数据
    imageData = content.image;
  }

  return {
    imageData,
    mimeType: 'image/png',
  };
}

/**
 * 下载图片并转换为 Base64
 */
async function downloadImageAsBase64(imageUrl: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('图片下载操作被取消');
      err.name = 'AbortError';
      reject(err);
      return;
    }

    const urlObj = new URL(imageUrl);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      agent: urlObj.protocol === 'https:' ? httpsAgent : undefined,
      timeout: TIMEOUTS.HTTP_REQUEST_TIMEOUT,
    };

    const httpModule = urlObj.protocol === 'https:' ? https : require('http');
    
    const req = httpModule.request(options, (res: any) => {
      if (res.statusCode !== 200) {
        reject(new Error(`图片下载失败: HTTP ${res.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalSize += chunk.length;
        
        // 每下载 100KB 打印一次进度
        if (totalSize % (100 * 1024) < chunk.length) {
          console.log(`[Qwen Image Download] 下载中... ${(totalSize / 1024).toFixed(0)} KB`);
        }
      });
      
      res.on('end', () => {
        const imageBuffer = Buffer.concat(chunks);
        const base64Data = imageBuffer.toString('base64');
        console.log(`[Qwen Image Download] 下载完成，总大小: ${(totalSize / 1024).toFixed(2)} KB`);
        resolve(base64Data);
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('图片下载超时'));
    });

    if (signal) {
      const onAbort = () => {
        console.log('[Qwen Image Download] ⏹️ 收到停止信号，中止下载');
        req.destroy();
        const err = new Error('图片下载操作被取消');
        err.name = 'AbortError';
        reject(err);
      };
      
      signal.addEventListener('abort', onAbort, { once: true });
      req.on('close', () => {
        signal.removeEventListener('abort', onAbort);
      });
    }
    
    req.end();
  });
}