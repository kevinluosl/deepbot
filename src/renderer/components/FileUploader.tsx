/**
 * 文件上传组件
 * 
 * 功能：
 * - 支持点击上传
 * - 最多 5 个文件，每个最大 500MB
 * - 显示文件列表和删除按钮
 */

import React, { useRef } from 'react';
import { api } from '../api';
import type { UploadedFile } from '../../types/message';
import { Tooltip } from './Tooltip';
import { readFileAsDataURL } from '../utils/file-reader';
import { getLanguage } from '../i18n';

interface FileUploaderProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  showButtonOnly?: boolean; // 只显示上传按钮（在输入框内）
  showPreviewOnly?: boolean; // 只显示预览（悬浮层）
  hasImages?: boolean; // 是否已有图片上传（用于互斥检查）
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  files,
  onFilesChange,
  maxFiles = 5,
  maxSizeMB = 500,
  showButtonOnly = false,
  showPreviewOnly = false,
  hasImages = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lang = getLanguage();

  // 处理文件选择
  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    // 检查是否已有图片上传
    if (hasImages) {
      alert('已上传图片，不能同时上传文件');
      return;
    }

    // 检查数量限制
    if (files.length >= maxFiles) {
      alert(`最多只能上传 ${maxFiles} 个文件`);
      return;
    }

    const newFiles: UploadedFile[] = [];
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    for (let i = 0; i < selectedFiles.length; i++) {
      // 检查数量
      if (files.length + newFiles.length >= maxFiles) {
        alert(`最多只能上传 ${maxFiles} 个文件`);
        break;
      }

      const file = selectedFiles[i];

      // 检查文件大小
      if (file.size > maxSizeBytes) {
        alert(`文件 ${file.name} 超过 ${maxSizeMB}MB 限制`);
        continue;
      }

      try {
        // 读取文件为 base64
        const dataUrl = await readFileAsDataURL(file);

        // 上传到主进程（保存到临时目录）
        const result = await api.uploadFile(file.name, dataUrl, file.size, file.type);

        if (result.success && result.file) {
          newFiles.push(result.file);
        } else {
          alert(`上传失败: ${result.error || '未知错误'}`);
        }
      } catch (error) {
        console.error('上传文件失败:', error);
        alert(`上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    if (newFiles.length > 0) {
      onFilesChange([...files, ...newFiles]);
    }

    // 清空 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 删除文件
  const handleRemove = async (id: string) => {
    const fileToRemove = files.find(f => f.id === id);
    if (fileToRemove) {
      // 删除临时文件
      try {
        await api.deleteTempFile(fileToRemove.path);
      } catch (error) {
        console.error('删除临时文件失败:', error);
      }
    }
    onFilesChange(files.filter(f => f.id !== id));
  };

  // 点击上传按钮
  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 只显示上传按钮（在输入框内）
  if (showButtonOnly) {
    return (
      <>
        <Tooltip content={lang === 'zh' ? `上传文件 (最多${maxFiles}个，每个最大${maxSizeMB}MB)` : `Upload files (max ${maxFiles}, ${maxSizeMB}MB each)`}>
          <button
            type="button"
            className="file-upload-button-inline"
            onClick={handleButtonClick}
            disabled={files.length >= maxFiles}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* 文档外框 */}
              <path d="M3 2C3 1.44772 3.44772 1 4 1H9L13 5V14C13 14.5523 12.5523 15 12 15H4C3.44772 15 3 14.5523 3 14V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              {/* 折角 */}
              <path d="M9 1V4C9 4.55228 9.44772 5 10 5H13" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              {/* 文档内容线条 */}
              <path d="M5 8H11M5 10.5H11M5 13H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </Tooltip>

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </>
    );
  }

  // 只显示预览（悬浮层）
  if (showPreviewOnly) {
    if (files.length === 0) return null;

    return (
      <div className="file-preview-floating">
        {files.map((file) => (
          <Tooltip key={file.id} content={`${file.path}\n${file.name}`}>
            <div className="file-preview-item-floating">
              <div className="file-icon-floating">📄</div>
              <button
                type="button"
                className="file-preview-remove-floating"
                onClick={() => handleRemove(file.id)}
                title={lang === 'zh' ? '删除文件' : 'Remove file'}
              >
                ×
              </button>
            </div>
          </Tooltip>
        ))}
      </div>
    );
  }

  // 默认显示（完整模式，保留兼容性）
  return (
    <div className="file-uploader">
      {/* 上传按钮 */}
      <button
        type="button"
        className="terminal-button file-upload-button"
        onClick={handleButtonClick}
        title={`上传文件 (最多${maxFiles}个，每个最大${maxSizeMB}MB)`}
        disabled={files.length >= maxFiles}
      >
        [📎]
      </button>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* 文件预览列表 */}
      {files.length > 0 && (
        <div className="file-preview-list">
          {files.map((file) => (
            <div key={file.id} className="file-preview-item">
              <div className="file-preview-icon">📄</div>
              <div className="file-preview-info">
                <div className="file-preview-name">{file.name}</div>
                <div className="file-preview-size">{formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                className="file-preview-remove"
                onClick={() => handleRemove(file.id)}
                title={lang === 'zh' ? '删除文件' : 'Remove file'}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
