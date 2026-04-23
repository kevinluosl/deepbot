/**
 * 终端风格消息输入组件
 */

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ImageUploader } from './ImageUploader';
import { FileUploader } from './FileUploader';
import type { UploadedImage, UploadedFile } from '../../types/message';
import { api } from '../api';
import { readFileAsDataURL } from '../utils/file-reader';
import { getLanguage } from '../i18n';

interface MessageInputProps {
  onSend: (content: string, images?: UploadedImage[], files?: UploadedFile[]) => void;
  onStop: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  userName?: string; // 用户名字
  disableStop?: boolean; // 是否禁用 Stop 按钮（独立控制）
  isConnectorTab?: boolean; // 是否是连接器 Tab（显示 /stop 指令）
  activeTabId?: string; // 当前 Tab ID（用于按 Tab 隔离历史记录）
}

// 🔥 暴露给父组件的方法
export interface MessageInputRef {
  focus: () => void;
  handleDroppedFiles: (files: FileList) => void;
}

export const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(({
  onSend,
  onStop,
  disabled = false,
  isGenerating = false,
  userName = 'user',
  disableStop = false,
  isConnectorTab = false,
  activeTabId = 'default',
}, ref) => {
  const [content, setContent] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false); // IME 组合输入状态（中文输入法等）
  const lang = getLanguage();
  
  // 🔥 按 Tab 隔离的历史记录
  const historyMapRef = useRef<Map<string, string[]>>(new Map());
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempContent, setTempContent] = useState(''); // 临时保存当前输入
  
  // 获取当前 Tab 的历史记录
  const getHistory = (): string[] => {
    return historyMapRef.current.get(activeTabId) || [];
  };
  
  // 设置当前 Tab 的历史记录
  const setHistory = (updater: (prev: string[]) => string[]) => {
    const current = historyMapRef.current.get(activeTabId) || [];
    historyMapRef.current.set(activeTabId, updater(current));
  };
  
  // 切换 Tab 时重置历史索引
  useEffect(() => {
    setHistoryIndex(-1);
    setTempContent('');
  }, [activeTabId]);

  // 🔥 命令提示功能
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const commandSuggestionsRef = useRef<HTMLDivElement>(null);
  
  // 🔥 防止重复执行标志
  const isExecutingCommandRef = useRef(false);
  
  // 可用命令列表（connector tab 额外显示 /stop）
  const availableCommands = [
    { name: 'new', description: lang === 'zh' ? '清空当前会话历史，开始新对话' : 'Clear session history and start fresh' },
    { name: 'memory', description: lang === 'zh' ? '查看和管理记忆' : 'View and manage memory' },
    { name: 'merge-memory', description: lang === 'zh' ? '合并其他 Tab 的记忆（用法：/merge-memory Tab名称）' : 'Merge memory from another Tab (usage: /merge-memory Tab name)' },
    { name: 'clone', description: lang === 'zh' ? '克隆其他 Tab 的历史和记忆（用法：/clone Tab名称）' : 'Clone history and memory from another Tab (usage: /clone Tab name)' },
    { name: 'history', description: lang === 'zh' ? '查看对话历史统计' : 'View conversation history stats' },
    { name: 'reload-path', description: lang === 'zh' ? '刷新环境变量（外部安装工具后使用）' : 'Reload PATH environment variables' },
    ...(isConnectorTab ? [{ name: 'stop', description: lang === 'zh' ? '停止当前正在执行的任务' : 'Stop the current running task' }] : []),
  ];

  // 🔥 暴露 focus 和 handleDroppedFiles 方法给父组件
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (textareaRef.current && !disabled) {
        textareaRef.current.focus();
      }
    },
    handleDroppedFiles: (files: FileList) => {
      processFiles(files);
    },
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

  // 🔥 检测命令输入，显示/隐藏命令提示
  useEffect(() => {
    const trimmedContent = content.trim();
    
    // 只有当输入以 / 开头且没有空格时才显示命令提示
    if (trimmedContent.startsWith('/') && !trimmedContent.includes(' ')) {
      const commandPrefix = trimmedContent.slice(1).toLowerCase();
      
      // 过滤匹配的命令
      const matchedCommands = availableCommands.filter(cmd => 
        cmd.name.toLowerCase().startsWith(commandPrefix)
      );
      
      if (matchedCommands.length > 0) {
        setShowCommandSuggestions(true);
        setSelectedCommandIndex(0);
      } else {
        setShowCommandSuggestions(false);
      }
    } else {
      setShowCommandSuggestions(false);
    }
  }, [content]);

  // 🔥 点击外部关闭命令提示
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        commandSuggestionsRef.current &&
        !commandSuggestionsRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowCommandSuggestions(false);
      }
    };

    if (showCommandSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCommandSuggestions]);

  const handleSend = () => {
    const trimmedContent = content.trim();
    if (trimmedContent && !disabled) {
      // 🔥 保存到历史记录（避免重复，不记录系统指令）
      if (!trimmedContent.startsWith('/')) {
        setHistory(prev => {
          const newHistory = prev.filter(item => item !== trimmedContent);
          return [...newHistory, trimmedContent];
        });
      }
      setHistoryIndex(-1); // 重置历史索引
      setTempContent(''); // 清空临时内容
      
      onSend(
        trimmedContent, 
        uploadedImages.length > 0 ? uploadedImages : undefined,
        uploadedFiles.length > 0 ? uploadedFiles : undefined
      );
      setContent('');
      setUploadedImages([]); // 清空已上传的图片
      setUploadedFiles([]); // 清空已上传的文件

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
    // 🔥 命令提示激活时，处理上下键和 Tab/Enter 选择
    if (showCommandSuggestions) {
      const trimmedContent = content.trim();
      const commandPrefix = trimmedContent.slice(1).toLowerCase();
      const matchedCommands = availableCommands.filter(cmd => 
        cmd.name.toLowerCase().startsWith(commandPrefix)
      );

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex(prev => 
          prev < matchedCommands.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex(prev => 
          prev > 0 ? prev - 1 : matchedCommands.length - 1
        );
        return;
      }

      if (e.key === 'Tab') {
        // Tab 键：填充命令到输入框（保留原有行为）
        e.preventDefault();
        const selectedCommand = matchedCommands[selectedCommandIndex];
        if (selectedCommand) {
          setContent(`/${selectedCommand.name} `);
          setShowCommandSuggestions(false);
          // 聚焦回输入框
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
            }
          }, 0);
        }
        return;
      }

      if (e.key === 'Enter') {
        // Enter 键：直接执行命令
        e.preventDefault();
        e.stopPropagation();
        
        // 防止重复执行
        if (isExecutingCommandRef.current) {
          return;
        }
        
        const selectedCommand = matchedCommands[selectedCommandIndex];
        if (selectedCommand) {
          isExecutingCommandRef.current = true;
          
          const commandText = `/${selectedCommand.name}`;
          setShowCommandSuggestions(false);
          
          // 需要参数的指令：填入输入框但不发送
          if (selectedCommand.name === 'merge-memory' || selectedCommand.name === 'clone') {
            setContent(commandText + ' ');
            if (textareaRef.current) {
              textareaRef.current.focus();
            }
            setTimeout(() => { isExecutingCommandRef.current = false; }, 100);
            return;
          }
          
          setContent('');
          
          setHistoryIndex(-1);
          setTempContent('');
          
          // 发送命令
          onSend(commandText);
          
          // 重置文本框
          if (textareaRef.current) {
            textareaRef.current.style.height = '32px';
            textareaRef.current.style.overflowY = 'hidden';
            textareaRef.current.focus();
          }
          
          // 延迟重置执行标志
          setTimeout(() => {
            isExecutingCommandRef.current = false;
          }, 200);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommandSuggestions(false);
        return;
      }
    }

    // Enter 发送，Shift + Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      // IME 组合输入中（如中文输入法选词），回车是确认候选，不是发送
      if (e.nativeEvent.isComposing || isComposingRef.current) {
        return;
      }
      
      e.preventDefault();
      
      // 如果命令正在执行，跳过
      if (isExecutingCommandRef.current) {
        return;
      }
      
      // 普通消息发送
      handleSend();
      return;
    }

    // 🔥 上下键浏览历史记录
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const textarea = textareaRef.current;
      const history = getHistory();
      if (!textarea || history.length === 0) return;

      const { selectionStart, selectionEnd, value } = textarea;
      const lines = value.split('\n');
      const currentLineIndex = value.substring(0, selectionStart).split('\n').length - 1;

      // 向上键：只有在第一行且光标在开头时才触发历史记录
      if (e.key === 'ArrowUp' && currentLineIndex === 0 && selectionStart === 0) {
        e.preventDefault();
        
        // 第一次按上键，保存当前内容
        if (historyIndex === -1 && content) {
          setTempContent(content);
        }

        const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setContent(history[newIndex]);
        
        // 将光标移到开头
        setTimeout(() => {
          if (textarea) {
            textarea.selectionStart = 0;
            textarea.selectionEnd = 0;
          }
        }, 0);
      }

      // 向下键：只有在最后一行且光标在末尾时才触发历史记录
      if (e.key === 'ArrowDown' && currentLineIndex === lines.length - 1 && selectionStart === value.length) {
        e.preventDefault();

        if (historyIndex !== -1) {
          if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setContent(history[newIndex]);
          } else {
            // 回到最新状态，恢复临时内容
            setHistoryIndex(-1);
            setContent(tempContent);
            setTempContent('');
          }
          
          // 将光标移到末尾
          setTimeout(() => {
            if (textarea) {
              textarea.selectionStart = textarea.value.length;
              textarea.selectionEnd = textarea.value.length;
            }
          }, 0);
        }
      }
    }
  };

  // 处理外部传入的文件（粘贴或拖拽）
  const processFiles = async (files: FileList) => {
    if (!files || files.length === 0) return;

    // 已有文件上传时，所有新文件（包括图片）都当文件处理
    const hasExistingFiles = uploadedFiles.length > 0;
    const hasExistingImages = uploadedImages.length > 0;

    const imageFiles: File[] = [];
    const otherFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/') && !hasExistingFiles) {
        imageFiles.push(files[i]);
      } else {
        otherFiles.push(files[i]);
      }
    }

    // 处理图片
    if (imageFiles.length > 0) {
      const maxSizeBytes = 5 * 1024 * 1024;
      const newImages: UploadedImage[] = [];

      for (const file of imageFiles) {
        if (uploadedImages.length + newImages.length >= 5) break;
        if (file.size > maxSizeBytes) continue;

        try {
          const dataUrl = await readFileAsDataURL(file);
          const result = await api.uploadImage(file.name || 'pasted-image.png', dataUrl, file.size);
          if (result.success && result.image) {
            newImages.push(result.image);
          }
        } catch (error) {
          console.error('上传图片失败:', error);
        }
      }

      if (newImages.length > 0) {
        setUploadedImages(prev => [...prev, ...newImages]);
      }
    }

    // 处理其他文件
    if (otherFiles.length > 0) {
      if (hasExistingImages) {
        alert(lang === 'zh' ? '已上传图片，不能同时上传文件' : 'Cannot upload files when images are already uploaded');
        return;
      }
      const maxSizeBytes = 500 * 1024 * 1024;
      const newFiles: UploadedFile[] = [];

      for (const file of otherFiles) {
        if (uploadedFiles.length + newFiles.length >= 5) break;
        if (file.size > maxSizeBytes) continue;

        try {
          const dataUrl = await readFileAsDataURL(file);
          const result = await api.uploadFile(file.name, dataUrl, file.size, file.type);
          if (result.success && result.file) {
            newFiles.push(result.file);
          }
        } catch (error) {
          console.error('上传文件失败:', error);
        }
      }

      if (newFiles.length > 0) {
        setUploadedFiles(prev => [...prev, ...newFiles]);
      }
    }
  };

  // 处理粘贴事件
  const handlePaste = async (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    await processFiles(files);
  };

  return (
    <div className="terminal-input-container">
      {/* 🔥 命令提示列表 */}
      {showCommandSuggestions && (
        <div ref={commandSuggestionsRef} className="command-suggestions">
          {availableCommands
            .filter(cmd => cmd.name.toLowerCase().startsWith(content.trim().slice(1).toLowerCase()))
            .map((cmd, index) => (
              <div
                key={cmd.name}
                className={`command-suggestion-item ${index === selectedCommandIndex ? 'selected' : ''}`}
                onClick={() => {
                  const commandText = `/${cmd.name}`;
                  setShowCommandSuggestions(false);
                  
                  // 需要参数的指令：填入输入框但不发送
                  if (cmd.name === 'merge-memory' || cmd.name === 'clone') {
                    setContent(commandText + ' ');
                    if (textareaRef.current) {
                      textareaRef.current.focus();
                    }
                    return;
                  }
                  
                  setContent('');
                  
                  setHistoryIndex(-1);
                  setTempContent('');
                  
                  // 直接发送命令
                  onSend(commandText);
                  
                  // 重置文本框高度
                  if (textareaRef.current) {
                    textareaRef.current.style.height = '32px';
                    textareaRef.current.style.overflowY = 'hidden';
                    textareaRef.current.focus();
                  }
                }}
              >
                <span className="command-suggestion-name">/{cmd.name}</span>
                <span className="command-suggestion-description">{cmd.description}</span>
              </div>
            ))}
        </div>
      )}

      <div className="terminal-input-wrapper">
        {/* 提示符 */}
        <div className="terminal-input-prompt">{userName}@deepbot:~$</div>

        {/* 输入框列（包含输入框和帮助提示） */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 输入框容器（包含图片预览、文本框和上传按钮） */}
          <div className="terminal-input-with-upload">
          {/* 图片预览（悬浮层） */}
          <ImageUploader
            images={uploadedImages}
            onImagesChange={setUploadedImages}
            showPreviewOnly={true}
            hasFiles={uploadedFiles.length > 0}
          />

          {/* 文件预览（悬浮层） */}
          <FileUploader
            files={uploadedFiles}
            onFilesChange={setUploadedFiles}
            showPreviewOnly={true}
            hasImages={uploadedImages.length > 0}
          />

          {/* 文本输入框 */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
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
            hasFiles={uploadedFiles.length > 0}
          />

          {/* 文件上传按钮（在输入框内部右侧） */}
          <FileUploader
            files={uploadedFiles}
            onFilesChange={setUploadedFiles}
            showButtonOnly={true}
            hasImages={uploadedImages.length > 0}
          />
        </div>

          {/* 帮助提示 */}
          <div className="terminal-input-hint">
            {lang === 'zh' ? '上/下键 切换历史输入　输入 / 查看可用指令　右键窗口标签可单独配置模型' : 'Up/Down browse history　Type / for commands　Right-click tab to configure model'}
          </div>
        </div>

        {/* 发送/停止按钮 */}
        {isGenerating ? (
          <button
            onClick={onStop}
            disabled={disableStop}
            className="terminal-button danger"
            title={disableStop ? (lang === 'zh' ? '定时任务专属窗口（只读）' : 'Task-only tab (read-only)') : (lang === 'zh' ? '停止生成' : 'Stop')}
          >
            [STOP]
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || !content.trim()}
            className="terminal-button"
            title={lang === 'zh' ? '发送消息' : 'Send'}
          >
            [SEND]
          </button>
        )}
      </div>
    </div>
  );
});
