/**
 * 文档分析工具配置页面
 * 提示用户安装 markitdown
 */

import React from 'react';
import { getLanguage } from '../../i18n';

interface DocAnalysisToolConfigProps {
  onClose?: () => void;
}

export function DocAnalysisToolConfig({ onClose }: DocAnalysisToolConfigProps) {
  const lang = getLanguage();

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-base font-medium text-gray-900 mb-2">
          {lang === 'zh' ? '文档分析工具配置' : 'Document Analysis Tool Config'}
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          {lang === 'zh'
            ? '读取和分析各类文档内容（PDF、Word、Excel、PPT、HTML 等），将文档转换为 Markdown 格式供 AI 理解。'
            : 'Read and analyze various document formats (PDF, Word, Excel, PPT, HTML, etc.), converting them to Markdown for AI understanding.'}
        </p>

        {/* 安装说明 */}
        <div style={{
          padding: '12px 14px',
          background: 'rgba(59, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '6px',
          fontSize: '12px',
          color: 'var(--settings-text-dim)',
          lineHeight: '2',
          marginBottom: '16px',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--settings-accent)', marginBottom: '6px' }}>
            {lang === 'zh' ? '📦 安装 markitdown（必需）' : '📦 Install markitdown (Required)'}
          </div>
          {lang === 'zh' ? (
            <>
              此工具依赖 Microsoft 开源的{' '}
              <a href="https://github.com/microsoft/markitdown" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--settings-accent)', textDecoration: 'underline' }}>markitdown</a>
              ，请先安装：<br />
              <code style={{ display: 'inline-block', marginTop: '6px', padding: '4px 8px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px' }}>
                pip install markitdown
              </code>
              <br /><br />
              或直接告诉 DeepBot：<code style={{ padding: '2px 6px', background: 'rgba(0,0,0,0.1)', borderRadius: '3px' }}>帮我安装 markitdown</code>
            </>
          ) : (
            <>
              This tool requires Microsoft's open-source{' '}
              <a href="https://github.com/microsoft/markitdown" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--settings-accent)', textDecoration: 'underline' }}>markitdown</a>
              . Please install it first:<br />
              <code style={{ display: 'inline-block', marginTop: '6px', padding: '4px 8px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px' }}>
                pip install markitdown
              </code>
              <br /><br />
              Or tell DeepBot: <code style={{ padding: '2px 6px', background: 'rgba(0,0,0,0.1)', borderRadius: '3px' }}>Help me install markitdown</code>
            </>
          )}
        </div>

        {/* 支持格式 */}
        <div style={{
          padding: '12px 14px',
          background: 'var(--settings-input-bg)',
          border: '1px solid var(--settings-border)',
          borderRadius: '6px',
          fontSize: '12px',
          color: 'var(--settings-text-dim)',
          lineHeight: '1.8',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--settings-text)', marginBottom: '6px' }}>
            {lang === 'zh' ? '📄 支持的文件格式' : '📄 Supported File Formats'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 16px' }}>
            <div>• PDF (.pdf)</div>
            <div>• Word (.docx, .doc)</div>
            <div>• Excel (.xlsx, .xls)</div>
            <div>• PowerPoint (.pptx, .ppt)</div>
            <div>• HTML (.html, .htm)</div>
            <div>• CSV (.csv)</div>
            <div>• JSON (.json)</div>
            <div>• XML (.xml)</div>
            <div>• {lang === 'zh' ? '图片 OCR (.jpg, .png)' : 'Image OCR (.jpg, .png)'}</div>
            <div>• {lang === 'zh' ? '音频转录 (.mp3, .wav)' : 'Audio transcription (.mp3, .wav)'}</div>
            <div>• ZIP (.zip)</div>
            <div>• EPUB (.epub)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
