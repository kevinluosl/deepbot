/**
 * 终端风格消息输入组件
 */

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ImageUploader } from './ImageUploader';
import type { UploadedImage } from '../../types/message';

interface MessageInputProps {
  onSend: (content: string, images?: UploadedImage[]) => void;
  onStop: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  userName?: string; // 用户名字
  disableStop?: boolean; // 是否禁用 Stop 按钮（独立控制）
}

// 🔥 暴露给父组件的方法
export interface MessageInputRef {
  focus: () => void;
}

export const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(({
  onSend,
  onStop,
  disabled = false,
  isGenerating = false,
  userName = 'user',
  disableStop = false,
}, ref) => {
  const [content, setContent] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 🔥 暴露 focus 方法给父组件
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (textareaRef.current && !disabled) {
        textareaRef.current.focus();
      }
    }
  }));

  // 自动聚焦到输入框
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  // 自动调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      // 重置高度以获取正确的 scrollHeight
      textareaRef.current.style.height = 'auto';

      // 计算新高度（最小 32px，最大 120px）
      const newHeight = Math.min(Math.max(textareaRef.current.scrollHeight, 32), 120);
      textareaRef.current.style.height = `${newHeight}px`;

      // 只有在内容超过最大高度时才显示滚动条
      if (textareaRef.current.scrollHeight > 120) {
        textareaRef.current.style.overflowY = 'auto';
      } else {
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
  }, [content]);

  const handleSend = () => {
    const trimmedContent = content.trim();
    if (trimmedContent && !disabled) {
      onSend(trimmedContent, uploadedImages.length > 0 ? uploadedImages : undefined);
      setContent('');
      setUploadedImages([]); // 清空已上传的图片

      // 重置文本框高度和滚动条
      if (textareaRef.current) {
        textareaRef.current.style.height = '32px';
        textareaRef.current.style.overflowY = 'hidden';
        // 发送后重新聚焦到输入框
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter 发送，Shift + Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="terminal-input-container">
      <div className="terminal-input-wrapper">
        {/* 提示符 */}
        <div className="terminal-input-prompt">{userName}@deepbot:~$</div>

        {/* 输入框容器（包含图片预览、文本框和上传按钮） */}
        <div className="terminal-input-with-upload">
          {/* 图片预览（在输入框内部最前面） */}
          {uploadedImages.length > 0 && (
            <div className="input-images-inline">
              {uploadedImages.map((image) => (
                <div key={image.id} className="input-image-item">
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    className="input-image-thumbnail"
                  />
                  <button
                    type="button"
                    className="input-image-remove"
                    onClick={() => setUploadedImages(uploadedImages.filter(img => img.id !== image.id))}
                    title="删除图片"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="input-images-separator">|</div>
            </div>
          )}

          {/* 文本输入框 */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command or query..."
            disabled={disabled}
            rows={1}
            className="terminal-input"
          />

          {/* 图片上传按钮（在输入框内部右侧） */}
          <ImageUploader
            images={uploadedImages}
            onImagesChange={setUploadedImages}
            showButtonOnly={true}
          />
        </div>

        {/* 发送/停止按钮 */}
        {isGenerating ? (
          <button
            onClick={onStop}
            disabled={disableStop}
            className="terminal-button danger"
            title={disableStop ? "定时任务专属窗口（只读）" : "停止生成"}
          >
            [STOP]
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || !content.trim()}
            className="terminal-button"
            title="发送消息"
          >
            [SEND]
          </button>
        )}
      </div>
    </div>
  );
});
