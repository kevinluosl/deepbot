/**
 * 图片生成工具 - Gemini 提供商
 * 
 * 支持 Gemini 3 Pro Image (Nano Banana Pro) 模型
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
 * 调用 Gemini API 生成图片
 */
export async function generateImageWithGemini(params: {
  prompt: string;
  aspectRatio?: '1:1' | '4:3' | '16:9' | '9:16' | '3:4' | '3:2' | '2:3' | '4:5' | '5:4' | '21:9';
  resolution?: '1K' | '2K';
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

  // 构建请求体
  const contents: any[] = [];
  
  // 如果有参考图片，先添加参考图片（最多5张）
  if (referenceImages.length > 0) {
    const validImages = referenceImages.slice(0, 5); // 最多5张
    const parts: any[] = [];
    
    // 添加所有参考图片
    for (const imagePath of validImages) {
      // 🔥 在处理每张图片前检查是否已被取消
      if (signal?.aborted) {
        const err = new Error('图片生成操作被取消');
        err.name = 'AbortError';
        throw err;
      }
      
      const expandedPath = expandPath(imagePath); // 展开 ~ 路径
      if (existsSync(expandedPath)) {
        try {
          const { buffer, mimeType } = readImageFile(imagePath);
          const base64Image = buffer.toString('base64');
          
          parts.push({
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          });
        } catch (error) {
          console.warn(`读取参考图片失败 (${expandedPath}):`, error);
        }
      } else {
        console.warn(`参考图片不存在: ${expandedPath}`);
      }
    }
    
    // 添加提示词
    if (parts.length > 0) {
      parts.push({
        text: `参考这${parts.length}张图片的风格。${prompt}`,
      });
      
      contents.push({
        role: 'user',
        parts,
      });
    } else {
      // 没有有效的参考图片，直接使用提示词
      contents.push({
        role: 'user',
        parts: [{ text: prompt }],
      });
    }
  } else {
    // 没有参考图片，直接使用提示词
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });
  }

  // 构建请求
  const requestBody = {
    contents,
    generationConfig: {
      temperature: 1.0,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseModalities: ['IMAGE', 'TEXT'], // 同时支持图片和文本输出
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: resolution, // 必须是 "1K", "2K" (大写 K)
      },
    },
  };

  console.log('[Gemini Image Generation] 调用 Gemini API...');
  console.log(`   模型: ${model}`);
  console.log(`   分辨率: ${resolution}`);
  console.log(`   宽高比: ${aspectRatio}`);
  console.log(`   提示词: ${prompt.substring(0, 50)}...`);

  // 调用 API（使用 https 模块以支持自定义 agent）
  // API Key 放在 URL 参数中
  const url = `${apiUrl}/models/${model}:generateContent?key=${apiKey}`;
  
  console.log('[Gemini Image Generation] 发送请求到:', url.replace(apiKey, '***'));
  
  const response = await new Promise<any>((resolve, reject) => {
    // 检查是否已被取消
    if (signal?.aborted) {
      const err = new Error('图片生成操作被取消');
      err.name = 'AbortError';
      reject(err);
      return;
    }

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      agent: httpsAgent,
      timeout: TIMEOUTS.IMAGE_GENERATION_TIMEOUT, // 60 秒超时
    };

    const req = https.request(options, (res) => {
      console.log('[Gemini Image Generation] 收到响应，状态码:', res.statusCode);
      let data = '';
      let receivedBytes = 0;
      
      res.on('data', (chunk) => {
        data += chunk;
        receivedBytes += chunk.length;
        // 每接收 100KB 打印一次进度
        if (receivedBytes % (100 * 1024) < chunk.length) {
          console.log(`[Gemini Image Generation] 接收中... ${(receivedBytes / 1024).toFixed(0)} KB`);
        }
      });
      
      res.on('end', () => {
        console.log('[Gemini Image Generation] 响应接收完成，总大小:', (receivedBytes / 1024).toFixed(2), 'KB');
        resolve({
          ok: res.statusCode === 200,
          status: res.statusCode,
          text: async () => data,
          json: async () => safeJsonParse(data, {}),
        });
      });
    });

    req.on('error', (err) => {
      console.error('[Gemini Image Generation] 请求错误:', err);
      reject(err);
    });
    
    req.on('timeout', () => {
      console.error('[Gemini Image Generation] 请求超时');
      req.destroy();
      reject(new Error('请求超时（60秒）'));
    });
    
    // 监听 AbortSignal
    if (signal) {
      const onAbort = () => {
        console.log('[Gemini Image Generation] ⏹️ 收到停止信号，中止请求');
        req.destroy();
        const err = new Error('图片生成操作被取消');
        err.name = 'AbortError';
        reject(err);
      };
      
      signal.addEventListener('abort', onAbort, { once: true });
      
      // 清理监听器
      req.on('close', () => {
        signal.removeEventListener('abort', onAbort);
      });
    }
    
    req.write(JSON.stringify(requestBody));
    req.end();
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 错误 (${response.status}): ${errorText}`);
  }

  const result: any = await response.json();
  
  // 提取图片数据
  if (!result.candidates || result.candidates.length === 0) {
    throw new Error('API 返回空结果');
  }

  const candidate = result.candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    throw new Error('API 返回格式错误');
  }

  // 查找图片部分 - 支持两种字段名格式
  let imagePart: any = null;
  for (const part of candidate.content.parts) {
    // 尝试驼峰命名 inlineData
    if (part.inlineData) {
      imagePart = {
        inline_data: {
          data: part.inlineData.data,
          mime_type: part.inlineData.mimeType || 'image/png',
        },
      };
      break;
    }
    // 尝试下划线命名 inline_data
    if (part.inline_data) {
      imagePart = part;
      break;
    }
  }

  if (!imagePart || !imagePart.inline_data) {
    throw new Error('API 未返回图片数据');
  }

  return {
    imageData: imagePart.inline_data.data,
    mimeType: imagePart.inline_data.mime_type || 'image/png',
  };
}

/**
 * 调用 Gemini API 解析图片
 */
export async function analyzeImageWithGemini(params: {
  imagePath: string;
  apiKey: string;
  apiUrl: string;
  model: string;
  prompt?: string; // 🔥 可选的自定义提示词
  signal?: AbortSignal;
}): Promise<string> {
  const { imagePath, apiKey, apiUrl, model, prompt, signal } = params;

  // 检查是否已被取消
  if (signal?.aborted) {
    const err = new Error('图片解析操作被取消');
    err.name = 'AbortError';
    throw err;
  }

  // 读取图片
  const { buffer, mimeType, expandedPath } = readImageFile(imagePath);
  const base64Image = buffer.toString('base64');

  // 🔥 使用自定义提示词或默认提示词
  const analysisPrompt = prompt || '请详细描述这张图片的内容、风格、色彩、构图等特征，生成一个适合用于图片生成的提示词（prompt）。提示词应该包含：\n1. 主要内容和主体\n2. 艺术风格\n3. 色彩特征\n4. 构图和视角\n5. 光影效果\n6. 其他重要细节\n\n请用简洁的英文短语描述，用逗号分隔。';

  // 构建请求体
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
          {
            text: analysisPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
    },
  };

  console.log('[Gemini Image Analysis] 调用 Gemini API 解析图片...');
  console.log(`   图片路径: ${imagePath}`);
  console.log(`   提示词: ${prompt ? '自定义' : '默认'}`);

  // 调用 API
  const url = `${apiUrl}/models/${model}:generateContent?key=${apiKey}`;
  
  const response = await new Promise<any>((resolve, reject) => {
    // 检查是否已被取消
    if (signal?.aborted) {
      const err = new Error('图片解析操作被取消');
      err.name = 'AbortError';
      reject(err);
      return;
    }

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      agent: httpsAgent,
      timeout: TIMEOUTS.IMAGE_GENERATION_TIMEOUT,
    };

    const req = https.request(options, (res) => {
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
      reject(new Error('请求超时（60秒）'));
    });

    // 监听 AbortSignal
    if (signal) {
      const onAbort = () => {
        console.log('[Gemini Image Analysis] ⏹️ 收到停止信号，中止请求');
        req.destroy();
        const err = new Error('图片解析操作被取消');
        err.name = 'AbortError';
        reject(err);
      };
      
      signal.addEventListener('abort', onAbort, { once: true });
      
      // 清理监听器
      req.on('close', () => {
        signal.removeEventListener('abort', onAbort);
      });
    }
    
    req.write(JSON.stringify(requestBody));
    req.end();
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 错误 (${response.status}): ${errorText}`);
  }

  const result: any = await response.json();
  
  // 提取文本内容
  if (!result.candidates || result.candidates.length === 0) {
    throw new Error('API 返回空结果');
  }

  const candidate = result.candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    throw new Error('API 返回格式错误');
  }

  // 查找文本部分
  for (const part of candidate.content.parts) {
    if (part.text) {
      return part.text;
    }
  }

  throw new Error('API 未返回文本内容');
}