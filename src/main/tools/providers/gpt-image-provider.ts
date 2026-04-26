/**
 * GPT Image 2 图片生成提供商
 * 
 * 支持文生图和图生图（编辑）
 */

import { readFileSync } from 'node:fs';
import { expandPath, getMimeType } from './image-utils';

// 尺寸映射：resolution + aspectRatio → GPT Image 2 支持的 size
// 1K 支持所有比例，2K 只支持 16:9 和 9:16
const SIZE_MAP_1K: Record<string, string> = {
  '4:3': '1024x768',
  '3:4': '768x1024',
  '1:1': '1024x1024',
  '2:3': '1024x1536',
  '3:2': '1536x1024',
  '16:9': '1920x1080',
  '9:16': '1080x1920',
  // 不支持的比例降级
  '4:5': '1024x1536',   // → 2:3
  '5:4': '1536x1024',   // → 3:2
  '21:9': '1920x1080',  // → 16:9
};

const SIZE_MAP_2K: Record<string, string> = {
  '16:9': '2560x1440',
  '9:16': '1440x2560',
};

/**
 * 上传参考图片，返回下载 URL
 */
async function uploadReferenceImage(
  imagePath: string,
  apiKey: string,
  apiUrl: string,
  signal?: AbortSignal
): Promise<string> {
  const expanded = expandPath(imagePath);
  const imageBuffer = readFileSync(expanded);
  const mimeType = getMimeType(expanded);
  const fileName = expanded.split('/').pop() || 'image.png';

  // 构造 multipart/form-data
  const boundary = `----FormBoundary${Date.now()}`;
  const bodyParts: Buffer[] = [];

  // file 字段
  bodyParts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  ));
  bodyParts.push(imageBuffer);
  bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(bodyParts);

  // 上传地址：baseUrl + /uploadMedia
  const uploadUrl = apiUrl.replace(/\/$/, '') + '/uploadMedia';
  console.log(`[GPT Image] 上传参考图: ${uploadUrl}`);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`上传参考图失败: ${response.status} ${text}`);
  }

  const result = await response.json() as any;
  const downloadUrl = result.data?.download_url;
  if (!downloadUrl) {
    throw new Error('上传参考图失败: 未返回 download_url');
  }

  console.log(`[GPT Image] ✅ 参考图上传成功: ${downloadUrl}`);
  return downloadUrl;
}

/**
 * 轮询获取生成结果
 */
async function pollPrediction(
  predictionId: string,
  apiKey: string,
  apiUrl: string,
  signal?: AbortSignal
): Promise<string> {
  const pollUrl = `${apiUrl.replace(/\/$/, '')}/prediction/${predictionId}`;
  const maxAttempts = 60; // 最多轮询 2 分钟（每次 2 秒）

  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) {
      throw new Error('图片生成操作被取消');
    }

    const response = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`轮询失败: ${response.status} ${text}`);
    }

    const result = await response.json() as any;
    const status = result.data?.status;

    if (status === 'completed' || status === 'succeeded') {
      const imageUrl = result.data?.outputs?.[0];
      if (!imageUrl) throw new Error('生成完成但未返回图片 URL');
      console.log(`[GPT Image] ✅ 生成完成，耗时约 ${(i + 1) * 2} 秒`);
      return imageUrl;
    }

    if (status === 'failed') {
      throw new Error(result.data?.error || '图片生成失败');
    }

    // 等待 2 秒后重试
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('图片生成超时（超过 2 分钟）');
}

/**
 * 下载图片并转为 base64
 */
async function downloadImageAsBase64(imageUrl: string, signal?: AbortSignal): Promise<{ imageData: string; mimeType: string }> {
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) {
    throw new Error(`下载图片失败: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type') || 'image/png';
  return {
    imageData: buffer.toString('base64'),
    mimeType,
  };
}

/**
 * 使用 GPT Image 2 生成图片
 */
export async function generateImageWithGptImage2(params: {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  referenceImages?: string[];
  apiKey: string;
  apiUrl: string;
  model: string;
  signal?: AbortSignal;
}): Promise<{ imageData: string; mimeType: string }> {
  const { prompt, aspectRatio, resolution, referenceImages, apiKey, apiUrl, signal } = params;

  // 确定尺寸：根据 resolution 选择对应的 SIZE_MAP
  const ratio = aspectRatio || '16:9';
  const res = resolution || '1K';
  let size: string;
  
  if (res === '2K') {
    // 2K 只支持 16:9 和 9:16，其他比例降级到 1K
    size = SIZE_MAP_2K[ratio] || SIZE_MAP_1K[ratio] || '1920x1080';
  } else {
    size = SIZE_MAP_1K[ratio] || '1920x1080';
  }

  // 判断是文生图还是图生图
  const hasReferenceImages = referenceImages && referenceImages.length > 0;

  let requestBody: any;

  if (hasReferenceImages) {
    // 图生图：先上传参考图
    console.log(`[GPT Image] 图生图模式，上传 ${referenceImages.length} 张参考图...`);
    const uploadedUrls: string[] = [];
    for (const imgPath of referenceImages) {
      const url = await uploadReferenceImage(imgPath, apiKey, apiUrl, signal);
      uploadedUrls.push(url);
    }

    requestBody = {
      model: 'openai/gpt-image-2/edit',
      enable_base64_output: false,
      enable_sync_mode: false,
      input_fidelity: 'high',
      output_format: 'png',
      quality: 'medium',
      size,
      images: uploadedUrls,
      prompt,
    };
  } else {
    // 文生图
    requestBody = {
      model: 'openai/gpt-image-2/text-to-image',
      enable_base64_output: false,
      enable_sync_mode: false,
      output_format: 'png',
      quality: 'medium',
      size,
      prompt,
    };
  }

  // 发起生成请求
  const generateUrl = `${apiUrl.replace(/\/$/, '')}/generateImage`;
  console.log(`[GPT Image] 发起生成请求: ${generateUrl}`);
  console.log(`[GPT Image] 模式: ${hasReferenceImages ? '图生图' : '文生图'}, 尺寸: ${size}`);

  const response = await fetch(generateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 404) {
      throw new Error('API Key 无效或未配置，请检查图片生成工具配置中的 API Key');
    }
    throw new Error(`图片生成请求失败: ${response.status} ${text}`);
  }

  const generateResult = await response.json() as any;
  const predictionId = generateResult.data?.id;
  if (!predictionId) {
    throw new Error('未返回 prediction ID');
  }

  console.log(`[GPT Image] 任务已提交，prediction ID: ${predictionId}，等待生成...`);

  // 轮询等待结果
  const imageUrl = await pollPrediction(predictionId, apiKey, apiUrl, signal);

  // 下载图片转 base64
  console.log(`[GPT Image] 下载生成的图片: ${imageUrl}`);
  return downloadImageAsBase64(imageUrl, signal);
}
