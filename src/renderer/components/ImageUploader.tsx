/**
 * 图片上传组件
 * 
 * 功能：
 * - 支持点击上传和拖拽上传
 * - 最多 5 张图片，每张最大 5MB
 * - 显示缩略图和删除按钮
 */

import React, { useRef } from 'react';
import type { UploadedImage } from '../../types/message';

interface ImageUploaderProps {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  maxSizeMB?: number;
  showButtonOnly?: boolean; // 只显示上传按钮（在输入框内）
  showPreviewOnly?: boolean; // 只显示预览（悬浮层）
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  images,
  onImagesChange,
  maxImages = 5,
  maxSizeMB = 5,
  showButtonOnly = false,
  showPreviewOnly = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 处理文件选择
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // 检查数量限制
    if (images.length >= maxImages) {
      alert(`最多只能上传 ${maxImages} 张图片`);
      return;
    }

    const newImages: UploadedImage[] = [];
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    for (let i = 0; i < files.length; i++) {
      // 检查数量
      if (images.length + newImages.length >= maxImages) {
        alert(`最多只能上传 ${maxImages} 张图片`);
        break;
      }

      const file = files[i];

      // 检查文件类型
      if (!file.type.startsWith('image/')) {
        alert(`文件 ${file.name} 不是图片格式`);
        continue;
      }

      // 检查文件大小
      if (file.size > maxSizeBytes) {
        alert(`图片 ${file.name} 超过 ${maxSizeMB}MB 限制`);
        continue;
      }

      try {
        // 读取文件为 base64
        const dataUrl = await readFileAsDataURL(file);

        // 上传到主进程（保存到临时目录）
        const result = await window.deepbot.uploadImage(file.name, dataUrl, file.size);

        if (result.success && result.image) {
          newImages.push(result.image);
        } else {
          alert(`上传失败: ${result.error || '未知错误'}`);
        }
      } catch (error) {
        console.error('上传图片失败:', error);
        alert(`上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }

    // 清空 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 读取文件为 Data URL
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 删除图片
  const handleRemove = (id: string) => {
    onImagesChange(images.filter(img => img.id !== id));
  };

  // 点击上传按钮
  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  // 只显示上传按钮（在输入框内）
  if (showButtonOnly) {
    return (
      <>
        <button
          type="button"
          className="image-upload-button-inline"
          onClick={handleButtonClick}
          title={`上传图片 (最多${maxImages}张，每张最大${maxSizeMB}MB)`}
          disabled={images.length >= maxImages}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="2" y="4" width="12" height="10" stroke="currentColor" strokeWidth="1.5" rx="1" />
            <circle cx="5.5" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 11L5 8L8 11L11 8L14 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 2L8 6M6 4L8 2L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </>
    );
  }

  // 只显示预览（悬浮层）
  if (showPreviewOnly) {
    if (images.length === 0) return null;

    return (
      <div className="image-preview-floating">
        {images.map((image) => (
          <div key={image.id} className="image-preview-item-floating">
            <img
              src={image.dataUrl}
              alt={image.name}
              className="image-preview-thumbnail-floating"
            />
            <button
              type="button"
              className="image-preview-remove-floating"
              onClick={() => handleRemove(image.id)}
              title="删除图片"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }

  // 默认显示（完整模式，保留兼容性）
  return (
    <div className="image-uploader">
      {/* 上传按钮 */}
      <button
        type="button"
        className="terminal-button image-upload-button"
        onClick={handleButtonClick}
        title={`上传图片 (最多${maxImages}张，每张最大${maxSizeMB}MB)`}
        disabled={images.length >= maxImages}
      >
        [📷]
      </button>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* 图片预览列表 */}
      {images.length > 0 && (
        <div className="image-preview-list">
          {images.map((image) => (
            <div key={image.id} className="image-preview-item">
              <img
                src={image.dataUrl}
                alt={image.name}
                className="image-preview-thumbnail"
              />
              <button
                type="button"
                className="image-preview-remove"
                onClick={() => handleRemove(image.id)}
                title="删除图片"
              >
                ×
              </button>
              <div className="image-preview-name">{image.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
