/**
 * 终端风格消息组件
 */

import React, { useState, useEffect } from 'react';
import { Message } from '../../types/message';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDuration, formatTimestamp } from '../../shared/utils/time-format';
import { api } from '../api';
import { Tooltip } from './Tooltip';
import { getLanguage } from '../i18n';

interface MessageBubbleProps {
  message: Message;
  agentName?: string; // 智能体名字
  userName?: string; // 用户称呼
  isConnectorTab?: boolean; // 是否为外部连接器 Tab
}

// 图片缓存（避免重复加载）
const imageCache = new Map<string, string>();

/**
 * 将 data URL 转为 Blob URL 并在新标签页打开
 * Chrome 限制了 data URL 的导航，Blob URL 没有长度限制
 */
function openImageInNewTab(dataUrl: string) {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  const blob = new Blob([u8arr], { type: mime });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
}

// 图片加载组件（通过 IPC 读取本地文件）
const ImageLoader: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const lang = getLanguage();
  // 处理路径格式
  const processPath = (rawPath: string): string => {
    let filePath = rawPath;
    
    // 1. 移除 file:// 协议
    if (filePath.startsWith('file://')) {
      filePath = filePath.replace(/^file:\/\/+/, '/');
    }
    
    // 2. 处理 URL 编码
    try {
      filePath = decodeURIComponent(filePath);
    } catch (e) {
      // 如果解码失败，使用原始路径
    }
    
    // 3. 处理相对路径（相对于用户目录）
    if (!filePath.startsWith('/') && !filePath.startsWith('~')) {
      filePath = `~/${filePath}`;
    }
    
    return filePath;
  };

  const filePath = processPath(src);
  
  // 立即检查缓存，避免闪烁
  const cachedData = imageCache.get(filePath);
  const [imageData, setImageData] = useState<string | null>(cachedData || null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    // 如果已有缓存，直接返回
    if (cachedData) {
      return;
    }

    const loadImage = async () => {
      try {
        // 通过 IPC 读取图片
        const result = await api.readImage(filePath);
        
        if (result.success && result.data) {
          imageCache.set(filePath, result.data);
          setImageData(result.data);
        } else {
          setError(result.error || '图片加载失败');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '图片加载失败');
      } finally {
        setLoading(false);
      }
    };

    loadImage();
  }, [filePath, cachedData]);

  if (loading) {
    return (
      <div className="terminal-image-container">
        <div className="terminal-image-loading">加载中...</div>
      </div>
    );
  }

  if (error || !imageData) {
    return (
      <div className="terminal-image-container">
        <div className="terminal-image-error">[图片加载失败: {error || '未知错误'}]</div>
      </div>
    );
  }

  // 点击图片查看大图
  const handleImageClick = async () => {
    // 先尝试用系统应用打开（Electron 模式）
    const result = await api.openPath(filePath);
    // 如果失败（Web 模式），转 Blob URL 在新标签页打开
    if (!result?.success && imageData) {
      openImageInNewTab(imageData);
    }
  };

  return (
    <div className="terminal-image-container">
      <img 
        src={imageData} 
        alt={alt} 
        className="terminal-image terminal-image-clickable"
        loading="lazy"
        onClick={handleImageClick}
        title={lang === 'zh' ? '点击查看大图' : 'Click to enlarge'}
      />
      {alt && <div className="terminal-image-caption">{alt}</div>}
    </div>
  );
};

// 自定义比较函数 - 只在消息内容或执行步骤真正变化时重渲染
const arePropsEqual = (
  prevProps: MessageBubbleProps,
  nextProps: MessageBubbleProps
): boolean => {
  const prev = prevProps.message;
  const next = nextProps.message;
  
  // 🔥 比较 agentName 和 userName（切换 Tab 时需要重新渲染）
  if (
    prevProps.agentName !== nextProps.agentName ||
    prevProps.userName !== nextProps.userName
  ) {
    return false;
  }
  
  // 基本属性比较
  if (
    prev.id !== next.id ||
    prev.content !== next.content ||
    prev.role !== next.role ||
    prev.isStreaming !== next.isStreaming
  ) {
    return false;
  }
  
  // 上传图片比较
  if (prev.uploadedImages?.length !== next.uploadedImages?.length) {
    return false;
  }
  
  // 上传文件比较
  if (prev.uploadedFiles?.length !== next.uploadedFiles?.length) {
    return false;
  }
  
  // 🔥 执行步骤比较 - 更细致的比较
  const prevSteps = prev.executionSteps || [];
  const nextSteps = next.executionSteps || [];
  
  if (prevSteps.length !== nextSteps.length) {
    return false; // 步骤数量变化，需要重新渲染
  }
  
  // 🔥 比较每个步骤的关键属性（包括 params 和 result 的变化）
  for (let i = 0; i < prevSteps.length; i++) {
    const prevStep = prevSteps[i];
    const nextStep = nextSteps[i];
    
    // 基本属性比较
    if (
      prevStep.id !== nextStep.id ||
      prevStep.status !== nextStep.status ||
      prevStep.toolName !== nextStep.toolName ||
      prevStep.toolLabel !== nextStep.toolLabel ||
      prevStep.error !== nextStep.error ||
      prevStep.duration !== nextStep.duration
    ) {
      return false; // 步骤属性变化，需要重新渲染
    }
    
    // result 比较：直接引用比较，避免序列化大对象
    if (prevStep.result !== nextStep.result) {
      return false;
    }
    
    // params 比较：直接引用比较，params 在步骤创建后不会变化
    if (prevStep.params !== nextStep.params) {
      return false;
    }
  }
  
  // 所有关键属性都相同，不需要重渲染
  return true;
};

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, agentName = 'matrix', userName = 'user', isConnectorTab = false }) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const lang = getLanguage();

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isSubAgentResult = message.isSubAgentResult === true;

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 格式化时间戳 - 已禁用
  // const formatTimestamp = (timestamp: number): string => {
  //   const date = new Date(timestamp);
  //   const now = new Date();
  //   const isToday = date.toDateString() === now.toDateString();
  //   
  //   if (isToday) {
  //     // 今天：只显示时间
  //     return date.toLocaleTimeString('zh-CN', { 
  //       hour: '2-digit', 
  //       minute: '2-digit',
  //       second: '2-digit'
  //     });
  //   } else {
  //     // 其他日期：显示日期和时间
  //     return date.toLocaleString('zh-CN', {
  //       month: '2-digit',
  //       day: '2-digit',
  //       hour: '2-digit',
  //       minute: '2-digit'
  //     });
  //   }
  // };

  // 复制消息内容
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 过滤系统提示信息
  const filterSystemPrompts = (content: string): string => {
    // 移除 [系统提示: ...] 格式的内容
    return content.replace(/\n*\[系统提示:.*?\]/g, '').trim();
  };

  // 确定提示符
  let prompt = '';
  let promptClass = '';
  
  if (isUser) {
    prompt = `${userName}@deepbot:~$`;
    promptClass = 'user';
  } else if (isSystem) {
    prompt = '[SYSTEM]';
    promptClass = 'system';
  } else if (isSubAgentResult) {
    prompt = '[TASK-COMPLETE]';
    promptClass = 'system';
  } else {
    prompt = `${agentName}@deepbot:~>`;
    promptClass = 'agent';
  }

  // 切换单个步骤的展开状态
  const toggleStep = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  // 切换全部展开/折叠
  const toggleAll = () => {
    if (isAllExpanded) {
      setExpandedSteps(new Set());
    } else {
      const allIds = new Set(message.executionSteps?.map(step => step.id) || []);
      setExpandedSteps(allIds);
    }
    setIsAllExpanded(!isAllExpanded);
  };

  return (
    <div className={`terminal-line${isUser ? ' terminal-line-user' : ''}`}>
      {/* 提示符和消息内容在同一行 */}
      <div className="terminal-message-line">
        <span className={`terminal-prompt ${promptClass}`}>{prompt}</span>
        <span className={`terminal-message ${isSystem ? 'error' : ''}`}>
          {/* 如果有上传的图片，先显示图片 */}
          {message.uploadedImages && message.uploadedImages.length > 0 && (
            <div className="message-uploaded-images">
              {message.uploadedImages.map((image) => (
                <div key={image.id} className="message-uploaded-image">
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    className="terminal-image terminal-image-clickable"
                    loading="lazy"
                    onClick={async () => {
                      if (image.path) {
                        const result = await api.openPath(image.path);
                        if (!result?.success && image.dataUrl) {
                          openImageInNewTab(image.dataUrl);
                        }
                      } else if (image.dataUrl) {
                        openImageInNewTab(image.dataUrl);
                      }
                    }}
                    title={lang === 'zh' ? '点击查看大图' : 'Click to enlarge'}
                  />
                  <div className="terminal-image-caption">{image.name}</div>
                </div>
              ))}
            </div>
          )}
          
          {/* 如果有上传的文件，显示文件列表 */}
          {message.uploadedFiles && message.uploadedFiles.length > 0 && (
            <div className="message-uploaded-files">
              {message.uploadedFiles.map((file) => (
                <div key={file.id} className="message-uploaded-file">
                  <span className="message-file-icon">📄</span>
                  <div className="message-file-info">
                    <div className="message-file-name">{file.name}</div>
                    <div className="message-file-size">
                      {formatFileSize(file.size)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => {
              // 允许所有 URL，包括 file:// 协议
              return url;
            }}
            components={{
              // 自定义渲染规则 - 保持简洁紧凑的终端风格
              p: ({ children }) => <div className="terminal-paragraph">{children}</div>,
              code: ({ inline, children, ...props }: any) =>
                inline ? (
                  <code className="terminal-code" {...props}>
                    {children}
                  </code>
                ) : (
                  <pre className="terminal-code-block">
                    <code {...props}>{children}</code>
                  </pre>
                ),
              ul: ({ children }) => <ul className="terminal-list">{children}</ul>,
              ol: ({ children }) => <ol className="terminal-list">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              a: ({ children, href }) => (
                <a href={href} className="terminal-link" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              img: ({ src, alt }) => {
                // 判断是否为本地文件路径
                const isLocalFile = src && (
                  src.startsWith('file://') ||           // file:// 协议
                  src.startsWith('/') ||                 // 绝对路径
                  src.startsWith('~/') ||                // 用户目录
                  (!src.startsWith('http://') &&         // 不是 http
                   !src.startsWith('https://') &&        // 不是 https
                   !src.startsWith('data:'))             // 不是 data URL
                );
                
                // 如果是本地文件，通过 IPC 读取图片
                if (isLocalFile) {
                  return <ImageLoader src={src!} alt={alt || '图片'} />;
                }
                
                // 其他协议（http, https, data）直接显示
                return (
                  <div className="terminal-image-container">
                    <img 
                      src={src} 
                      alt={alt || '图片'} 
                      className="terminal-image terminal-image-clickable"
                      loading="lazy"
                      onClick={() => window.open(src, '_blank')}
                      title={lang === 'zh' ? '点击查看大图' : 'Click to enlarge'}
                    />
                    {alt && <div className="terminal-image-caption">{alt}</div>}
                  </div>
                );
              },
              br: () => <br />,
              h1: ({ children }) => <strong>{children}</strong>,
              h2: ({ children }) => <strong>{children}</strong>,
              h3: ({ children }) => <strong>{children}</strong>,
              h4: ({ children }) => <strong>{children}</strong>,
              h5: ({ children }) => <strong>{children}</strong>,
              h6: ({ children }) => <strong>{children}</strong>,
              strong: ({ children }) => <strong>{children}</strong>,
              em: ({ children }) => <em>{children}</em>,
            }}
          >
            {filterSystemPrompts(message.content)}
          </ReactMarkdown>
          
          {/* 时间戳和复制按钮 - 已隐藏 */}
          {/* {isHovered && (
            <span className="terminal-message-actions">
              <span className="terminal-message-timestamp">
                {formatTimestamp(message.timestamp)}
              </span>
              <button
                className="terminal-message-copy"
                onClick={handleCopy}
                title="复制消息内容"
              >
                {copySuccess ? '[✓]' : '[copy]'}
              </button>
            </span>
          )} */}
        </span>
      </div>

      {/* 执行步骤 */}
      {message.executionSteps && message.executionSteps.length > 0 && (
        <div className="terminal-execution-steps">
          {/* 全部展开/折叠按钮 */}
          <div className="terminal-execution-header">
            <span className="terminal-execution-title">
              执行步骤 ({message.executionSteps.length})
            </span>
            <button
              className="terminal-execution-toggle-all"
              onClick={toggleAll}
              title={isAllExpanded ? '全部折叠' : '全部展开'}
            >
              {isAllExpanded ? '[-]' : '[+]'}
            </button>
          </div>

          {message.executionSteps.map((step) => {
            const isExpanded = expandedSteps.has(step.id);
            const hasDetails = step.params || step.result || step.error;

            return (
              <div key={step.id} className="terminal-execution-step-container">
                {/* 步骤摘要 */}
                <div
                  className={`terminal-execution-step ${step.status} ${hasDetails ? 'clickable' : ''}`}
                  onClick={() => hasDetails && toggleStep(step.id)}
                  style={{ cursor: hasDetails ? 'pointer' : 'default' }}
                >
                  {hasDetails && (
                    <span className="terminal-execution-expand-icon">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  )}
                  <span className="terminal-execution-step-name">
                    {step.toolLabel || step.toolName}
                  </span>
                  {step.duration !== undefined && (
                    <span className="terminal-execution-duration">
                      ({Math.round(step.duration / 1000)}s)
                    </span>
                  )}
                </div>

                {/* 步骤详情 */}
                {isExpanded && hasDetails && (
                  <div className="terminal-execution-details">
                    {step.params && (
                      <div className="terminal-execution-detail-section">
                        <div className="terminal-execution-detail-label">参数:</div>
                        <pre className="terminal-execution-detail-content">
                          {JSON.stringify(step.params, null, 2)}
                        </pre>
                      </div>
                    )}
                    {/* 🔥 优化：有错误时只显示错误框，没有错误时才显示结果框 */}
                    {step.error ? (
                      <div className="terminal-execution-detail-section error">
                        <div className="terminal-execution-detail-label">错误:</div>
                        <pre className="terminal-execution-detail-content">
                          {step.error}
                        </pre>
                      </div>
                    ) : step.result ? (
                      <div className="terminal-execution-detail-section">
                        <div className="terminal-execution-detail-label">结果:</div>
                        <pre className="terminal-execution-detail-content">
                          {typeof step.result === 'string' 
                            ? step.result 
                            : JSON.stringify(step.result, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* 🔥 总执行时间 + 操作按钮 - 只在 Agent 消息且有执行时间时显示 */}
      {!isUser && !isSystem && message.totalDuration !== undefined && (
        <div className="terminal-execution-time" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="terminal-execution-time-label">执行时间:</span>
          <span className="terminal-execution-time-value">
            {formatDuration(message.totalDuration)}
          </span>
          {message.sentAt && (
            <span className="terminal-execution-time-sent">
              (发送于 {formatTimestamp(message.sentAt)})
            </span>
          )}
          {/* 复制按钮 */}
          <span style={{ display: 'inline-flex', gap: '4px', marginLeft: '4px' }}>
            <Tooltip content={copySuccess ? (lang === 'zh' ? '已复制' : 'Copied') : (lang === 'zh' ? '复制回答' : 'Copy reply')}>
              <button
                onClick={handleCopy}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center', opacity: 0.5 }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </Tooltip>
          </span>
        </div>
      )}
    </div>
  );
}, arePropsEqual);

// 设置 displayName 以便调试
MessageBubble.displayName = 'MessageBubble';

// 自定义比较函数 - 只在消息内容或执行步骤变化时重渲染
// @ts-ignore
MessageBubble.whyDidYouRender = false;
