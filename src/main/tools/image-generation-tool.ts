/**
 * 图片生成工具
 * 
 * 使用 Gemini 3 Pro Image (Nano Banana Pro) 生成和编辑图片
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import https from 'node:https';
import { execSync } from 'node:child_process';
import { TIMEOUTS } from '../config/timeouts';
import { TOOL_NAMES } from './tool-names';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { safeJsonParse } from '../../shared/utils/json-utils';
import { ensureDirectoryExists } from '../../shared/utils/fs-utils';
import type { SystemConfigStore } from '../database/system-config-store';
import { assertPathAllowed } from '../utils/path-security';

// 默认输出目录
const DEFAULT_OUTPUT_DIR = join(homedir(), '.deepbot', 'generated-images');

/**
 * 获取工具配置（完全从数据库读取，不使用默认值）
 */
function getToolConfig(configStore: SystemConfigStore): {
  apiKey: string;
  apiUrl: string;
  model: string;
  defaultOutputDir: string;
} {
  const dbConfig = configStore.getImageGenerationToolConfig();
  
  if (!dbConfig) {
    throw new Error('图片生成工具未配置。请在系统设置 > 工具配置中配置 API Key 和地址');
  }
  
  if (!dbConfig.apiKey || !dbConfig.apiKey.trim()) {
    throw new Error('API Key 未配置。请在系统设置 > 工具配置中配置 API Key');
  }
  
  if (!dbConfig.apiUrl || !dbConfig.apiUrl.trim()) {
    throw new Error('API 地址未配置。请在系统设置 > 工具配置中配置 API 地址');
  }
  
  if (!dbConfig.model || !dbConfig.model.trim()) {
    throw new Error('模型未配置。请在系统设置 > 工具配置中选择模型');
  }
  
  return {
    apiKey: dbConfig.apiKey,
    apiUrl: dbConfig.apiUrl,
    model: dbConfig.model,
    defaultOutputDir: DEFAULT_OUTPUT_DIR,
  };
}

// 创建禁用 SSL 验证的 Agent
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

/**
 * 图片生成参数
 */
const ImageGenerationSchema = Type.Object({
  action: Type.Optional(Type.Union([
    Type.Literal('generate'),
    Type.Literal('analyze'),
  ], {
    description: '操作类型：generate (生成图片，默认), analyze (解析图片生成提示词)',
  })),
  prompt: Type.Optional(Type.String({
    description: '图片生成提示词（中文或英文）。action=generate 时必填',
  })),
  imagePath: Type.Optional(Type.String({
    description: '要解析的图片路径。action=analyze 时必填',
  })),
  aspectRatio: Type.Optional(Type.Union([
    Type.Literal('1:1'),
    Type.Literal('4:3'),
    Type.Literal('16:9'),
    Type.Literal('9:16'),
    Type.Literal('3:4'),
    Type.Literal('3:2'),
    Type.Literal('2:3'),
    Type.Literal('4:5'),
    Type.Literal('5:4'),
    Type.Literal('21:9'),
  ], {
    description: '图片宽高比。支持：1:1 (正方形), 4:3 (横向), 16:9 (宽屏，默认), 9:16 (竖屏), 3:4, 3:2, 2:3, 4:5, 5:4, 21:9 (超宽)。默认 16:9',
  })),
  resolution: Type.Optional(Type.Union([
    Type.Literal('1K'),
    Type.Literal('2K'),
    Type.Literal('4K'),
  ], {
    description: '输出分辨率：1K (约1024px，默认), 2K (约2048px), 4K (约4096px)。注意：必须大写 K',
  })),
  referenceImages: Type.Optional(Type.Array(Type.String(), {
    description: '参考图片路径列表（可选，最多5张）。用于风格参考或图片编辑。按顺序使用',
  })),
  outputPath: Type.Optional(Type.String({
    description: '输出文件路径（可选）。默认保存到 ~/.deepbot/generated-images/',
  })),
});

/**
 * 展开路径（将 ~ 转换为用户主目录，并执行 shell 命令）
 * 
 * 支持：
 * - ~ 展开为用户主目录
 * - $(command) 执行 shell 命令
 * - `command` 执行 shell 命令
 * 
 * @param filePath - 文件路径（可能包含 shell 命令）
 * @returns 展开后的路径
 */
function expandPath(filePath: string): string {
  let expanded = filePath;
  
  // 1. 展开 ~ 为用户主目录
  if (expanded.startsWith('~')) {
    expanded = expanded.replace(/^~/, homedir());
  }
  
  // 2. 检查是否包含 shell 命令 $(command) 或 `command`
  const hasShellCommand = /\$\([^)]+\)|`[^`]+`/.test(expanded);
  
  if (hasShellCommand) {
    try {
      // 使用 echo 命令让 shell 展开所有变量和命令
      // 注意：使用双引号保留路径中的空格
      const result = execSync(`echo "${expanded}"`, {
        shell: '/bin/bash',
        encoding: 'utf-8',
        timeout: TIMEOUTS.COMMAND_EXECUTION_TIMEOUT,
      });
      
      expanded = result.trim();
      console.log(`[Image Tool] 🔧 路径展开: ${filePath} → ${expanded}`);
    } catch (error) {
      console.warn(`[Image Tool] ⚠️ 路径展开失败: ${filePath}`, error);
      // 展开失败时使用原始路径
    }
  }
  
  return expanded;
}

/**
 * 调用 Gemini API 生成图片
 */
async function generateImage(params: {
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
      
      // 安全检查：验证路径
      assertPathAllowed(imagePath);
      
      const expandedPath = expandPath(imagePath); // 展开 ~ 路径
      if (existsSync(expandedPath)) {
        try {
          const imageBuffer = readFileSync(expandedPath);
          const base64Image = imageBuffer.toString('base64');
          const mimeType = getMimeType(expandedPath);
          
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
        imageSize: resolution, // 必须是 "1K", "2K", "4K" (大写 K)
      },
    },
  };

  console.log('[Image Generation] 调用 Gemini API...');
  console.log(`   模型: ${model}`);
  console.log(`   分辨率: ${resolution}`);
  console.log(`   宽高比: ${aspectRatio}`);
  console.log(`   提示词: ${prompt.substring(0, 50)}...`);

  // 调用 API（使用 https 模块以支持自定义 agent）
  // API Key 放在 URL 参数中
  const url = `${apiUrl}/models/${model}:generateContent?key=${apiKey}`;
  
  console.log('[Image Generation] 发送请求到:', url.replace(apiKey, '***'));
  
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
      console.log('[Image Generation] 收到响应，状态码:', res.statusCode);
      let data = '';
      let receivedBytes = 0;
      
      res.on('data', (chunk) => {
        data += chunk;
        receivedBytes += chunk.length;
        // 每接收 100KB 打印一次进度
        if (receivedBytes % (100 * 1024) < chunk.length) {
          console.log(`[Image Generation] 接收中... ${(receivedBytes / 1024).toFixed(0)} KB`);
        }
      });
      
      res.on('end', () => {
        console.log('[Image Generation] 响应接收完成，总大小:', (receivedBytes / 1024).toFixed(2), 'KB');
        resolve({
          ok: res.statusCode === 200,
          status: res.statusCode,
          text: async () => data,
          json: async () => safeJsonParse(data, {}),
        });
      });
    });

    req.on('error', (err) => {
      console.error('[Image Generation] 请求错误:', err);
      reject(err);
    });
    
    req.on('timeout', () => {
      console.error('[Image Generation] 请求超时');
      req.destroy();
      reject(new Error('请求超时（60秒）'));
    });
    
    // 监听 AbortSignal
    if (signal) {
      const onAbort = () => {
        console.log('[Image Generation] ⏹️ 收到停止信号，中止请求');
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
async function analyzeImage(params: {
  imagePath: string;
  apiKey: string;
  apiUrl: string;
  model: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { imagePath, apiKey, apiUrl, model, signal } = params;

  // 检查是否已被取消
  if (signal?.aborted) {
    const err = new Error('图片解析操作被取消');
    err.name = 'AbortError';
    throw err;
  }

  // 安全检查：验证路径
  assertPathAllowed(imagePath);

  // 展开路径
  const expandedPath = expandPath(imagePath);

  // 读取图片
  if (!existsSync(expandedPath)) {
    throw new Error(`图片文件不存在: ${expandedPath}`);
  }

  const imageBuffer = readFileSync(expandedPath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = getMimeType(expandedPath);

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
            text: '请详细描述这张图片的内容、风格、色彩、构图等特征，生成一个适合用于图片生成的提示词（prompt）。提示词应该包含：\n1. 主要内容和主体\n2. 艺术风格\n3. 色彩特征\n4. 构图和视角\n5. 光影效果\n6. 其他重要细节\n\n请用简洁的英文短语描述，用逗号分隔。',
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

  console.log('[Image Analysis] 调用 Gemini API 解析图片...');
  console.log(`   图片路径: ${imagePath}`);

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
        console.log('[Image Analysis] ⏹️ 收到停止信号，中止请求');
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

/**
 * 根据文件扩展名获取 MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif',
  };
  return mimeTypes[ext || ''] || 'image/png';
}

/**
 * 保存图片到文件
 */
function saveImage(imageData: string, mimeType: string, outputDir: string, outputPath?: string): string {
  // 确定输出路径
  let finalPath: string;
  if (outputPath) {
    // 使用 expandPath 展开 ~ 和 shell 命令
    finalPath = expandPath(outputPath);
  } else {
    // 生成默认文件名
    const timestamp = Date.now();
    const ext = mimeType.split('/')[1] || 'png';
    finalPath = join(outputDir, `generated-${timestamp}.${ext}`);
  }

  // 确保目录存在
  const dir = dirname(finalPath);
  ensureDirectoryExists(dir);

  // 保存图片
  const buffer = Buffer.from(imageData, 'base64');
  writeFileSync(finalPath, buffer);

  return finalPath;
}

/**
 * 创建图片生成工具
 */
export function createImageGenerationTool(configStore: SystemConfigStore): AgentTool {
  return {
    name: TOOL_NAMES.IMAGE_GENERATION,
    label: 'Image Generation',
    description: '使用 Gemini 3 Pro Image 生成或解析图片。支持：1) 文本生成图片 2) 解析图片生成提示词 3) 使用参考图片（最多5张）生成图片。',
    parameters: ImageGenerationSchema,
    execute: async (_toolCallId: string, args: unknown, signal?: AbortSignal) => {
      try {
        const params = args as {
          action?: 'generate' | 'analyze';
          prompt?: string;
          imagePath?: string;
          aspectRatio?: '1:1' | '4:3' | '16:9' | '9:16' | '3:4' | '3:2' | '2:3' | '4:5' | '5:4' | '21:9';
          resolution?: '1K' | '2K' | '4K';
          referenceImages?: string[];
          outputPath?: string;
        };

        const action = params.action || 'generate';

        // 检查是否已被取消（执行前）
        if (signal?.aborted) {
          const err = new Error('图片生成操作被取消');
          err.name = 'AbortError';
          throw err;
        }

        // 获取工具配置
        const toolConfig = getToolConfig(configStore);

        // 图片解析
        if (action === 'analyze') {
          if (!params.imagePath) {
            throw new Error('图片解析需要提供 imagePath 参数');
          }

          console.log('[Image Analysis] 开始解析图片...');
          console.log(`   图片路径: ${params.imagePath}`);

          const analysisResult = await analyzeImage({
            imagePath: params.imagePath,
            apiKey: toolConfig.apiKey,
            apiUrl: toolConfig.apiUrl,
            model: toolConfig.model,
            signal,
          });

          console.log('[Image Analysis] ✅ 图片解析成功');

          return {
            type: 'tool-result',
            details: {
              success: true,
              action: 'analyze',
              prompt: analysisResult,
            },
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  action: 'analyze',
                  message: '图片解析成功',
                  prompt: analysisResult,
                }, null, 2),
              },
            ],
          };
        }

        // 图片生成
        if (!params.prompt) {
          throw new Error('图片生成需要提供 prompt 参数');
        }

        // 从配置中读取输出目录
        const workspaceSettings = configStore.getWorkspaceSettings();
        const outputDir = workspaceSettings.imageDir || DEFAULT_OUTPUT_DIR;

        console.log('[Image Generation] 开始生成图片...');
        console.log(`   提示词: ${params.prompt}`);
        console.log(`   宽高比: ${params.aspectRatio || '4:3 (默认)'}`);
        console.log(`   分辨率: ${params.resolution || '1K (默认)'}`);
        console.log(`   输出目录: ${outputDir}`);
        
        if (params.referenceImages && params.referenceImages.length > 0) {
          console.log(`   参考图片: ${params.referenceImages.length} 张`);
          params.referenceImages.forEach((img, idx) => {
            console.log(`     ${idx + 1}. ${img}`);
          });
        }

        // 检查是否已被取消（生成前）
        if (signal?.aborted) {
          const err = new Error('图片生成操作被取消');
          err.name = 'AbortError';
          throw err;
        }

        // 生成图片
        const { imageData, mimeType } = await generateImage({
          prompt: params.prompt,
          aspectRatio: params.aspectRatio,
          resolution: params.resolution,
          referenceImages: params.referenceImages,
          apiKey: toolConfig.apiKey,
          apiUrl: toolConfig.apiUrl,
          model: toolConfig.model,
          signal,
        });

        // 保存图片（使用配置的输出目录）
        const savedPath = saveImage(imageData, mimeType, outputDir, params.outputPath);

        console.log('[Image Generation] ✅ 图片生成成功');
        console.log(`   保存路径: ${savedPath}`);

        return {
          type: 'tool-result',
          details: {
            success: true,
            action: 'generate',
            path: savedPath,
            aspectRatio: params.aspectRatio || '4:3',
            resolution: params.resolution || '1K',
            referenceCount: params.referenceImages?.length || 0,
          },
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                action: 'generate',
                message: '图片生成成功',
                path: savedPath,
                aspectRatio: params.aspectRatio || '4:3',
                resolution: params.resolution || '1K',
                referenceCount: params.referenceImages?.length || 0,
                size: `${(Buffer.from(imageData, 'base64').length / 1024).toFixed(2)} KB`,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error('[Image Generation] ❌ 操作失败:', error);
        const errorMessage = getErrorMessage(error);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: errorMessage,
                message: '操作失败，请检查参数和网络连接',
              }, null, 2),
            },
          ],
          details: {
            success: false,
            error: errorMessage,
          },
          isError: true,
        };
      }
    },
  };
}
