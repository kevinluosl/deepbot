/**
 * 文档分析工具
 *
 * 使用 markitdown（Microsoft）将各类文档转换为 Markdown 进行读取分析
 * 支持：PDF、Word、Excel、PowerPoint、HTML、CSV、JSON、XML、图片（OCR）等
 * 需要用户安装：pip install markitdown
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { execSync } from 'node:child_process';
import { TOOL_NAMES } from './tool-names';
import { getErrorMessage } from '../../shared/utils/error-handler';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';

// 支持的文件格式
const SUPPORTED_EXTS = new Set([
  '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.html', '.htm', '.csv', '.json', '.xml',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
  '.mp3', '.wav', '.m4a', '.ogg',
  '.zip', '.md', '.txt', '.rtf', '.epub',
]);

/**
 * 检查 markitdown 是否已安装
 */
function checkMarkitdownInstalled(): boolean {
  try {
    execSync('markitdown --help', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 使用 markitdown 转换文档
 */
function convertDocument(filePath: string): string {
  try {
    const result = execSync(`markitdown "${filePath}"`, {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return result;
  } catch (error: any) {
    if (error.stderr && error.stderr.includes('No such file or directory')) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    throw new Error(`文档转换失败: ${error.message || '未知错误'}`);
  }
}

/**
 * 参数 Schema
 */
const DocAnalysisSchema = Type.Object({
  filePath: Type.String({
    description: '要分析的文档文件路径（支持 PDF、Word、Excel、PPT、HTML、CSV、JSON、XML、图片等格式）',
  }),
});

/**
 * 创建文档分析工具
 */
export function createDocAnalysisTool(): AgentTool {
  return {
    name: TOOL_NAMES.DOC_ANALYSIS,
    label: '文档分析',
    description:
      '读取和分析各类文档内容。使用 markitdown 将文档转换为 Markdown 格式。支持 PDF、Word、Excel、PowerPoint、HTML、CSV、JSON、XML、图片（OCR）等格式。',
    parameters: DocAnalysisSchema,
    execute: async (_toolCallId: string, args: unknown, _signal?: AbortSignal) => {
      try {
        const params = args as { filePath: string };

        if (!params.filePath || !params.filePath.trim()) {
          throw new Error('文件路径不能为空');
        }

        // 展开 ~ 路径
        const { expandHomePath } = require('../utils/path-security');
        const filePath = expandHomePath(params.filePath.trim());

        // 检查文件是否存在
        if (!existsSync(filePath)) {
          throw new Error(`文件不存在: ${params.filePath}`);
        }

        // 检查文件格式
        const ext = extname(filePath).toLowerCase();
        if (ext && !SUPPORTED_EXTS.has(ext)) {
          throw new Error(
            `不支持的文件格式: ${ext}。支持的格式：PDF、Word、Excel、PPT、HTML、CSV、JSON、XML、图片、音频等`
          );
        }

        // 检查 markitdown 是否已安装
        if (!checkMarkitdownInstalled()) {
          throw new Error(
            '未安装 markitdown。请先执行以下命令安装：pip install markitdown'
          );
        }

        console.log(`[Doc Analysis] 开始分析文档: ${filePath}`);

        // 转换文档
        const markdown = convertDocument(filePath);

        if (!markdown || !markdown.trim()) {
          throw new Error('文档内容为空或无法解析');
        }

        console.log(`[Doc Analysis] ✅ 文档分析完成，内容长度: ${markdown.length} 字符`);

        // 如果内容过长，截断并提示
        const MAX_LENGTH = 50000;
        let content = markdown;
        let truncated = false;
        if (content.length > MAX_LENGTH) {
          content = content.substring(0, MAX_LENGTH);
          truncated = true;
        }

        let resultText = `**文档内容**（${ext || '未知格式'}）\n\n${content}`;
        if (truncated) {
          resultText += `\n\n---\n⚠️ 文档内容过长（${markdown.length} 字符），已截断显示前 ${MAX_LENGTH} 字符。`;
        }

        return {
          type: 'tool-result',
          details: {
            success: true,
            filePath: params.filePath,
            format: ext,
            contentLength: markdown.length,
            truncated,
            toolName: TOOL_NAMES.DOC_ANALYSIS,
          },
          content: [
            {
              type: 'text',
              text: resultText,
            },
          ],
        };
      } catch (error) {
        console.error('[Doc Analysis] ❌ 分析失败:', error);
        const errorMessage = getErrorMessage(error);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { success: false, error: errorMessage, message: '文档分析失败' },
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

export const docAnalysisToolPlugin: ToolPlugin = {
  metadata: {
    id: 'doc-analysis',
    name: '文档分析',
    version: '1.0.0',
    description: '使用 markitdown 读取和分析各类文档（PDF、Word、Excel、PPT 等）',
    author: 'DeepBot',
    category: 'file',
    tags: ['document', 'pdf', 'word', 'excel', 'analysis', 'markitdown'],
    requiresConfig: false,
  },
  create: (_options: ToolCreateOptions) => {
    return createDocAnalysisTool();
  },
};
