/**
 * Markdown 内容渲染组件
 * 
 * 功能：
 * - 渲染 Markdown 格式的消息内容
 * - 支持代码高亮
 * - 支持 GFM（GitHub Flavored Markdown）
 * - 优化的排版和样式
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '' }) => {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // 标题 - 只用粗体区分，字体大小由 CSS 统一控制
          h1: ({ children }) => (
            <h1 className="font-bold mt-3 mb-1.5 text-text-primary border-b border-border-medium pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-bold mt-2.5 mb-1.5 text-text-primary border-b border-border-light pb-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-bold mt-2 mb-1 text-text-primary">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="font-bold mt-2 mb-1 text-text-primary">
              {children}
            </h4>
          ),

          // 段落 - 字体大小由 CSS 统一控制
          p: ({ children }) => (
            <p className="leading-normal mb-2 text-text-primary">
              {children}
            </p>
          ),

          // 列表 - 字体大小由 CSS 统一控制，减小间距
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-2 space-y-0.5 text-text-primary">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-2 space-y-0.5 text-text-primary">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-normal ml-3">
              {children}
            </li>
          ),

          // 代码块 - IDE 深色风格，更紧凑
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-gray-100 text-rose-600 border border-gray-200 font-mono font-medium"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className={`block p-3 rounded-lg bg-[#1e1e1e] text-[#d4d4d4] border border-[#333] font-mono leading-normal overflow-x-auto ${className || ''}`}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-lg">
              {children}
            </pre>
          ),

          // 引用 - 更紧凑
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-brand-500 pl-3 py-1 mb-2 bg-bg-secondary rounded-r text-text-secondary italic">
              {children}
            </blockquote>
          ),

          // 表格 - 更紧凑
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2">
              <table className="min-w-full border-collapse border border-border-medium">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-bg-secondary">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border-light">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-bg-secondary transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-1.5 text-left font-semibold text-text-primary border border-border-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 text-text-primary border border-border-light">
              {children}
            </td>
          ),

          // 链接
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-700 underline"
            >
              {children}
            </a>
          ),

          // 分隔线
          hr: () => (
            <hr className="my-4 border-t border-border-medium" />
          ),

          // 强调 - 使用半粗体（600）而非粗体（700）
          strong: ({ children }) => (
            <strong className="font-semibold text-text-primary">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-text-secondary">
              {children}
            </em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
