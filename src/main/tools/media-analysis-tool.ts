/**
 * 多媒体分析工具
 *
 * 上传图片/视频到临时存储，调用 im-director.com API 进行分析
 * 仅在主模型为 DeepBot 供应商时可用，复用主模型的 API Key 和地址
 * 支持图片（jpg/png/gif/webp）和视频（mp4/mov/avi/mkv）
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { existsSync, readFileSync } from 'node:fs';
import { extname, basename } from 'node:path';
import { TIMEOUTS } from '../config/timeouts';
import { TOOL_NAMES } from './tool-names';
import { getErrorMessage } from '../../shared/utils/error-handler';
import { httpPost } from '../../shared/utils/http-utils';
import type { SystemConfigStore } from '../database/system-config-store';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';

// 文件上传地址
const UPLOAD_URL = 'https://uguu.se/upload';

// 支持的文件格式
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v']);

/**
 * 获取工具配置（从主模型读取 API Key，从工具配置读取模型）
 */
function getToolConfig(configStore: SystemConfigStore): { apiKey: string; apiUrl: string; model: string } {
  // 读取主模型配置
  const modelConfig = configStore.getModelConfig();
  if (!modelConfig) {
    throw new Error('主模型未配置。请先在系统设置中配置主模型。');
  }

  // 仅 DeepBot 供应商可用
  if ((modelConfig.providerType as string) !== 'deepbot') {
    throw new Error('多媒体分析为 DeepBot 供应商专用工具。其他供应商请创建 Skill 实现相同功能。');
  }

  if (!modelConfig.apiKey || !modelConfig.apiKey.trim()) {
    throw new Error('主模型 API Key 未配置。请在系统设置 > 模型配置中填写 API Key。');
  }

  // 读取工具配置（仅模型选择）
  const toolConfig = configStore.getMediaAnalysisToolConfig();
  const model = toolConfig?.model || 'qwen3.5-35b-a3b';

  return {
    apiKey: modelConfig.apiKey.trim(),
    apiUrl: modelConfig.baseUrl,
    model,
  };
}

/**
 * 判断文件类型
 */
function getMediaType(filePath: string): 'image' | 'video' {
  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  throw new Error(
    `不支持的文件格式: ${ext}。支持图片(jpg/png/gif/webp/bmp/tiff)和视频(mp4/mov/avi/mkv/webm)`
  );
}

/**
 * 上传文件到 uguu.se
 */
async function uploadFile(filePath: string, signal?: AbortSignal): Promise<string> {
  const fileBuffer = readFileSync(filePath);
  const fileName = basename(filePath);

  const formData = new FormData();
  const blob = new Blob([fileBuffer]);
  formData.append('files[]', blob, fileName);

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`文件上传失败 (HTTP ${response.status})`);
  }

  const result: any = await response.json();
  if (result?.success && result?.files?.[0]?.url) {
    return result.files[0].url;
  }
  throw new Error(`文件上传失败: ${JSON.stringify(result)}`);
}

/**
 * 调用 API 分析媒体
 */
async function analyzeMedia(params: {
  mediaUrl: string;
  prompt: string;
  mediaType: 'image' | 'video';
  fps: number;
  apiKey: string;
  apiUrl: string;
  model: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { mediaUrl, prompt, mediaType, fps, apiKey, apiUrl, model, signal } = params;

  // 构建媒体内容
  const mediaContent = mediaType === 'image'
    ? { type: 'image_url', image_url: { url: mediaUrl } }
    : { type: 'video_url', video_url: { url: mediaUrl, fps } };

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: [mediaContent, { type: 'text', text: prompt }],
      },
    ],
  };

  // 使用主模型的 baseUrl（替换 /v1 为 /v2）
  const url = apiUrl.replace(/\/v1\/?$/, '/v2') + '/chat/completions';

  const response = await httpPost<any>(url, body, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    timeout: TIMEOUTS.MEDIA_ANALYSIS_TIMEOUT,
    signal,
  });

  if (!response.ok) {
    const errDetail = response.error || `HTTP ${response.status}`;
    // 特殊处理：模型不支持视频输入
    if (response.data?.error?.message?.includes('No endpoints found that support input video')) {
      throw new Error(`当前模型 "${model}" 不支持视频解析，请切换为支持视频的模型（如 qwen3.5-35b-a3b）`);
    }
    throw new Error(`API 错误 (${response.status}): ${errDetail}`);
  }

  const data = response.data;
  if (data?.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  throw new Error('API 返回空结果');
}

/**
 * 参数 Schema
 */
const MediaAnalysisSchema = Type.Object({
  filePath: Type.String({
    description: '要分析的图片或视频文件路径（支持 jpg/png/gif/webp/mp4/mov/avi/mkv 等格式）',
  }),
  prompt: Type.Optional(Type.String({
    description: '分析提示词（默认："请详细描述这个文件的内容"）',
  })),
  fps: Type.Optional(Type.Number({
    description: '视频抽帧率（仅视频有效，默认 2，即每秒取 2 帧）',
    minimum: 1,
    maximum: 10,
  })),
});

/**
 * 创建多媒体分析工具
 */
export function createMediaAnalysisTool(configStore: SystemConfigStore): AgentTool {
  return {
    name: TOOL_NAMES.MEDIA_ANALYSIS,
    label: '多媒体分析',
    description:
      '分析图片或视频内容。上传文件后使用 AI 视觉模型进行内容理解和描述。支持图片(jpg/png/gif/webp)和视频(mp4/mov/avi/mkv)。仅在主模型为 DeepBot 供应商时可用。',
    parameters: MediaAnalysisSchema,
    execute: async (_toolCallId: string, args: unknown, signal?: AbortSignal) => {
      try {
        if (signal?.aborted) {
          const err = new Error('多媒体分析操作被取消');
          err.name = 'AbortError';
          throw err;
        }

        const params = args as {
          filePath: string;
          prompt?: string;
          fps?: number;
        };

        if (!params.filePath || !params.filePath.trim()) {
          throw new Error('文件路径不能为空');
        }

        // 展开 ~ 路径
        const { expandHomePath } = require('../utils/path-security');
        const filePath = expandHomePath(params.filePath.trim());

        if (!existsSync(filePath)) {
          throw new Error(`文件不存在: ${params.filePath}`);
        }

        // 判断媒体类型
        const mediaType = getMediaType(filePath);
        const prompt = params.prompt || '请详细描述这个文件的内容';
        const fps = params.fps || 2;

        // 获取配置（从主模型读取 API Key）
        const toolConfig = getToolConfig(configStore);

        console.log(`[Media Analysis] 开始分析 ${mediaType}...`);
        console.log(`   文件: ${filePath}`);
        console.log(`   模型: ${toolConfig.model}`);
        if (mediaType === 'video') console.log(`   FPS: ${fps}`);

        // 上传文件
        console.log('[Media Analysis] 📤 上传文件...');
        const mediaUrl = await uploadFile(filePath, signal);
        console.log(`[Media Analysis] ✅ 上传成功: ${mediaUrl}`);

        // 分析
        console.log('[Media Analysis] 🔍 分析中...');
        const result = await analyzeMedia({
          mediaUrl,
          prompt,
          mediaType,
          fps,
          apiKey: toolConfig.apiKey,
          apiUrl: toolConfig.apiUrl,
          model: toolConfig.model,
          signal,
        });

        console.log('[Media Analysis] ✅ 分析完成');

        return {
          type: 'tool-result',
          details: {
            success: true,
            mediaType,
            filePath: params.filePath,
            model: toolConfig.model,
            toolName: TOOL_NAMES.MEDIA_ANALYSIS,
          },
          content: [
            {
              type: 'text',
              text: `**${mediaType === 'image' ? '图片' : '视频'}分析结果**\n\n${result}`,
            },
          ],
        };
      } catch (error) {
        console.error('[Media Analysis] ❌ 分析失败:', error);
        const errorMessage = getErrorMessage(error);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: false, error: errorMessage, message: '分析失败，请检查文件和配置' },
                null,
                2
              ),
            },
          ],
          details: { success: false, error: errorMessage },
          isError: true,
        };
      }
    },
  };
}

// ── ToolPlugin 接口 ──────────────────────────────────────────────────────────

export const mediaAnalysisToolPlugin: ToolPlugin = {
  metadata: {
    id: 'media-analysis',
    name: '多媒体分析',
    version: '1.0.0',
    description: '上传图片/视频并使用 AI 视觉模型分析内容（仅 DeepBot 供应商可用）',
    author: 'DeepBot',
    category: 'ai',
    tags: ['image', 'video', 'analysis', 'vision'],
    requiresConfig: true,
  },
  create: (options: ToolCreateOptions) => {
    if (!options.configStore) throw new Error('mediaAnalysisToolPlugin 需要 configStore');
    return createMediaAnalysisTool(options.configStore);
  },
};
