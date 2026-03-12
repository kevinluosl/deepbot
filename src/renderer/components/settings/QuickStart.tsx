/**
 * 快速入门页面
 * 
 * 帮助用户快速了解和使用 DeepBot
 */

import React from 'react';

interface QuickStartProps {
  onClose: () => void;
}

export function QuickStart(_props: QuickStartProps) {
  return (
    <div className="settings-section">
      <h3 className="settings-section-title">快速入门</h3>
      
      {/* 欢迎横幅 */}
      <div style={{ 
        marginBottom: '24px', 
        padding: '20px', 
        background: 'linear-gradient(135deg, var(--settings-accent) 0%, var(--settings-accent-hover) 100%)',
        borderRadius: '8px',
        color: '#fff'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '6px' }}>
          👋 欢迎使用 DeepBot
        </h2>
        <p style={{ fontSize: '13px', lineHeight: '1.5', opacity: 0.95 }}>
          系统级 AI 助手，帮你完成文件操作、命令执行、浏览器控制、定时任务等各种工作
        </p>
      </div>

      {/* 快速配置指南 */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>⚡</span>
          快速配置（发挥最大能力）
        </h4>
        <div style={{ 
          padding: '12px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          fontSize: '13px', 
          color: 'var(--settings-text-dim)', 
          lineHeight: '1.6' 
        }}>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>1. 配置主大模型（必需）</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              前往「模型配置」→「主大模型」，配置 Qwen、OpenAI 或 Claude 的 API 密钥
            </div>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>2. 配置快速模型（推荐）</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              前往「模型配置」→「快速模型」，配置一个快速响应的模型（如 GPT-4o-mini），用于快速任务处理
            </div>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>3. 配置图片生成（可选）</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              前往「工具配置」→「图片生成工具」，配置 Qwen Image 或 Gemini API 密钥，启用 AI 绘图功能
            </div>
          </div>
          <div>
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>4. 配置网络搜索（可选）</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              前往「工具配置」→「网络搜索工具」，配置 Qwen 或 Gemini 的 API 密钥，启用实时信息查询
            </div>
          </div>
        </div>
      </div>

      {/* 环境要求 */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>📋</span>
          环境要求
        </h4>
        <div style={{ display: 'grid', gap: '8px', fontSize: '13px' }}>
          <div style={{ color: 'var(--settings-text)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ marginRight: '8px' }}>🐍</span>
              <span style={{ fontWeight: '600', marginRight: '6px' }}>Python（推荐）：</span>
              <span style={{ color: 'var(--settings-text-dim)' }}>用于执行 Python 脚本和 Skill</span>
            </div>
            <div style={{ 
              marginLeft: '28px', 
              padding: '10px 12px',
              background: 'var(--settings-input-bg)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--settings-text-dim)',
              lineHeight: '1.5'
            }}>
              <div style={{ marginBottom: '6px', color: 'var(--settings-text)', fontWeight: '600' }}>
                ⚡ 快速安装
              </div>
              <div style={{ marginBottom: '8px', color: 'var(--settings-accent)', fontWeight: '600' }}>
                💬 只需告诉 DeepBot："帮我安装 Python"，即可自动完成安装！
              </div>
              <div style={{ marginBottom: '6px', color: 'var(--settings-text)', fontWeight: '600' }}>
                📦 手动安装 Python
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                <div style={{ marginBottom: '4px' }}>
                  <strong>macOS:</strong><br/>
                  brew install python
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <strong>Linux (Ubuntu/Debian):</strong><br/>
                  sudo apt update && sudo apt install python3 python3-pip
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <strong>Windows:</strong><br/>
                  下载并运行：https://www.python.org/downloads/windows/
                </div>
                <div style={{ marginTop: '6px', color: 'var(--settings-text)' }}>
                  <strong>验证安装:</strong> python3 --version
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--settings-text)' }}>
            <span style={{ marginRight: '8px' }}>🌐</span>
            <span style={{ fontWeight: '600', marginRight: '6px' }}>Chrome（可选）：</span>
            <span style={{ color: 'var(--settings-text-dim)' }}>浏览器工具需要系统已安装 Chrome</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--settings-text)' }}>
            <span style={{ marginRight: '8px' }}>📦</span>
            <span style={{ fontWeight: '600', marginRight: '6px' }}>Node.js（可选）：</span>
            <span style={{ color: 'var(--settings-text-dim)' }}>用于运行需要 JavaScript 环境的程序</span>
          </div>
        </div>
      </div>

      {/* 可用工具 */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>🔧</span>
          可用工具
          <span style={{ 
            marginLeft: '8px', 
            padding: '1px 6px', 
            background: 'var(--settings-accent)', 
            color: '#fff', 
            borderRadius: '10px', 
            fontSize: '11px',
            fontWeight: '600'
          }}>
            13
          </span>
        </h4>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
          gap: '8px',
          fontSize: '12px'
        }}>
          {[
            { icon: '📁', name: '文件操作', desc: '读写文件、搜索文件' },
            { icon: '⚡', name: '命令执行', desc: '运行系统命令、脚本' },
            { icon: '🌐', name: '浏览器控制', desc: '网页截图、自动化' },
            { icon: '📅', name: '日历管理', desc: '查看日期、计算时间' },
            { icon: '🔍', name: '环境检查', desc: '检测系统信息' },
            { icon: '🎨', name: '图片生成', desc: 'AI 生成图片' },
            { icon: '🔎', name: '网页搜索', desc: '实时信息查询' },
            { icon: '📄', name: '网页获取', desc: '提取网页内容' },
            { icon: '🧠', name: '记忆管理', desc: '存储用户偏好' },
            { icon: '🎯', name: '技能管理', desc: '安装技能包' },
            { icon: '⏰', name: '定时任务', desc: '创建周期任务' },
            { icon: '💬', name: 'AI 对话', desc: '后台 AI 处理' },
            { icon: '🔗', name: '跨会话通信', desc: '多 Tab 协作' },
          ].map((tool, index) => (
            <div 
              key={index}
              style={{ 
                padding: '8px 10px', 
                background: 'var(--settings-input-bg)', 
                borderRadius: '6px',
                color: 'var(--settings-text)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ marginRight: '6px', fontSize: '16px' }}>{tool.icon}</span>
                <span style={{ fontWeight: '600', fontSize: '13px' }}>{tool.name}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--settings-text-dim)', lineHeight: '1.3' }}>
                {tool.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 指令系统 */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>⌨️</span>
          指令系统
          <span style={{ 
            marginLeft: '8px', 
            padding: '1px 6px', 
            background: 'var(--settings-accent)', 
            color: '#fff', 
            borderRadius: '10px', 
            fontSize: '11px',
            fontWeight: '600'
          }}>
            3
          </span>
        </h4>
        <div style={{ 
          display: 'grid', 
          gap: '8px',
          fontSize: '13px', 
          color: 'var(--settings-text-dim)' 
        }}>
          <div style={{ 
            padding: '10px 12px',
            background: 'var(--settings-input-bg)',
            borderRadius: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
              <code style={{ 
                padding: '2px 8px', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--settings-accent)',
                marginRight: '8px'
              }}>
                /new
              </code>
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>新建会话</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              清空当前会话历史，开始全新对话
            </div>
          </div>
          
          <div style={{ 
            padding: '10px 12px',
            background: 'var(--settings-input-bg)',
            borderRadius: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
              <code style={{ 
                padding: '2px 8px', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--settings-accent)',
                marginRight: '8px'
              }}>
                /memory
              </code>
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>查看记忆</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              查看 AI 记住的所有信息（用户偏好、习惯等）
            </div>
          </div>
          
          <div style={{ 
            padding: '10px 12px',
            background: 'var(--settings-input-bg)',
            borderRadius: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
              <code style={{ 
                padding: '2px 8px', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--settings-accent)',
                marginRight: '8px'
              }}>
                /history
              </code>
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>分析历史</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              让 AI 分析当前会话的历史记录文件
            </div>
          </div>
        </div>
        
        <div style={{ 
          marginTop: '10px',
          padding: '8px 12px',
          background: 'rgba(var(--settings-accent-rgb), 0.1)',
          borderLeft: '3px solid var(--settings-accent)',
          borderRadius: '4px',
          fontSize: '12px',
          color: 'var(--settings-text-dim)'
        }}>
          💡 提示：输入框中输入 <code style={{ 
            padding: '1px 4px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '3px',
            fontFamily: 'monospace',
            color: 'var(--settings-accent)'
          }}>/</code> 会自动显示可用指令列表
        </div>
      </div>

      {/* 推荐工具和 Skill */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>⭐</span>
          推荐工具和 Skill
          <span style={{ 
            marginLeft: '8px', 
            padding: '1px 6px', 
            background: 'var(--settings-accent)', 
            color: '#fff', 
            borderRadius: '10px', 
            fontSize: '11px',
            fontWeight: '600'
          }}>
            3
          </span>
        </h4>
        <div style={{ 
          padding: '12px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          fontSize: '13px',
          color: 'var(--settings-text-dim)',
          lineHeight: '1.6'
        }}>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>📄</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>MarkItDown - 文档转换神器</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              将各种文档格式转换为 Markdown，方便 DeepBot 读取和分析
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>支持格式：</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• PDF、PowerPoint、Word、Excel</div>
                <div>• 图片（EXIF + OCR）</div>
                <div>• 音频（转录）</div>
                <div>• HTML、CSV、JSON、XML</div>
                <div>• ZIP 文件</div>
                <div>• YouTube URL、EPUB</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>安装方式：</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                💬 告诉 DeepBot："读取 github.com/microsoft/markitdown 说明，帮我安装 markitdown"
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px' }}>
                或访问：<a 
                  href="https://github.com/microsoft/markitdown" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: 'var(--settings-accent)', textDecoration: 'none' }}
                >
                  github.com/microsoft/markitdown
                </a>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>🌐</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>Agent-Reach - 互联网能力扩展</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              给 AI Agent 装上互联网的眼睛，一键获得全网信息访问能力
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>支持平台：</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• Twitter/X、Reddit、YouTube</div>
                <div>• B站、小红书、抖音</div>
                <div>• GitHub、LinkedIn、微博</div>
                <div>• 微信公众号、RSS 订阅</div>
                <div>• 全网搜索、网页阅读</div>
                <div>• 小宇宙播客</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>特色功能：</strong>
              <div style={{ marginTop: '4px' }}>
                • 💰 完全免费，所有工具开源<br/>
                • 🔒 隐私安全，Cookie 只存本地<br/>
                • 🔄 持续更新，自动追踪平台变化<br/>
                • 🤖 兼容所有 Agent，一键安装
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>安装方式：</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                💬 告诉 DeepBot："帮我安装 Agent Reach：https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md"
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px' }}>
                或访问：<a 
                  href="https://github.com/Panniantong/Agent-Reach" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: 'var(--settings-accent)', textDecoration: 'none' }}
                >
                  github.com/Panniantong/Agent-Reach
                </a>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>🔌</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>MCPorter - MCP 协议工具包</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              TypeScript 运行时和 CLI 工具，让 AI Agent 轻松调用各种 MCP 服务器
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>核心功能：</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• 零配置自动发现 MCP 服务器</div>
                <div>• 一键生成 CLI 工具</div>
                <div>• TypeScript 类型安全调用</div>
                <div>• OAuth 和 stdio 传输支持</div>
                <div>• 友好的组合式 API</div>
                <div>• 临时连接和持久化配置</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>支持的 MCP 服务：</strong>
              <div style={{ marginTop: '4px' }}>
                • Linear、Vercel、Chrome DevTools<br/>
                • Context7、Firecrawl、小红书<br/>
                • 抖音、LinkedIn 等数十种服务<br/>
                • 自动兼容 Cursor/Claude/VS Code 配置
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>安装方式：</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                💬 告诉 DeepBot："帮我安装 mcporter：npm install -g mcporter"
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px' }}>
                或访问：<a 
                  href="https://github.com/steipete/mcporter" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ color: 'var(--settings-accent)', textDecoration: 'none' }}
                >
                  github.com/steipete/mcporter
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 使用技巧 */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>💡</span>
          使用技巧
          <span style={{ 
            marginLeft: '8px', 
            padding: '1px 6px', 
            background: 'var(--settings-accent)', 
            color: '#fff', 
            borderRadius: '10px', 
            fontSize: '11px',
            fontWeight: '600'
          }}>
            12
          </span>
        </h4>
        <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
          {[
            { icon: '👥', text: '多 Tab 协作：每个 Tab 可以有独立的角色和记忆，支持跨 Tab 通信' },
            { icon: '🧠', text: '长期记忆：告诉 AI "记住：..."，它会永久记住用户偏好和习惯' },
            { icon: '⏰', text: '智能定时任务：说"每天早上 9 点..."，AI 会自动创建和管理定时任务' },
            { icon: '🎯', text: '技能扩展系统：使用 Skill Manager 安装技能包，无限扩展 AI 能力' },
            { icon: '🔒', text: '安全沙箱：所有操作都在工作目录白名单内，确保系统安全' },
            { icon: '📱', text: '跨平台通讯：配置飞书等平台，实现 AI 与外部系统的无缝交互' },
            { icon: '🎨', text: '自然语言交互：直接说出需求，无需记忆复杂命令' },
            { icon: '🔄', text: '上下文理解：AI 会记住对话历史，支持连续对话' },
            { icon: '📋', text: '批量操作：一次性处理多个文件或任务' },
            { icon: '⚡', text: '快速迭代：AI 会根据反馈不断优化执行方案' },
            { icon: '🔍', text: '错误诊断：遇到问题时，AI 会主动分析并提供解决方案' },
            { icon: '🎪', text: '精确控制：使用具体的路径和参数获得准确结果' },
          ].map((tip, index) => (
            <div 
              key={index}
              style={{ 
                display: 'flex',
                alignItems: 'center',
                color: 'var(--settings-text-dim)'
              }}
            >
              <span style={{ marginRight: '8px', fontSize: '14px' }}>{tip.icon}</span>
              <span>{tip.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 示例对话 */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>💬</span>
          示例对话
        </h4>
        <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
          {[
            '帮我整理桌面上的文件，把图片放到 Pictures 文件夹',
            '每天下午 5 点提醒我写日报',
            '记住：我喜欢简洁的代码风格，不要写太多注释',
            '打开淘宝网站，搜索"机械键盘"，截图前 3 个商品',
            '分析 ~/Documents/sales.csv 文件，生成销售趋势图表',
            '创建一个 Python 脚本，每小时自动备份 ~/work 目录到云盘',
            '搜索最新的 React 19 新特性，总结成 Markdown 文档保存',
            '监控 CPU 使用率，超过 80% 时发送飞书通知给我',
          ].map((text, index) => (
            <div 
              key={index}
              style={{ 
                padding: '8px 10px', 
                background: 'var(--settings-input-bg)', 
                borderRadius: '6px',
                color: 'var(--settings-text-dim)',
                fontStyle: 'italic'
              }}
            >
              "{text}"
            </div>
          ))}
        </div>
      </div>

      {/* 底部提示 */}
      <div style={{ 
        padding: '16px', 
        background: 'var(--settings-input-bg)',
        borderRadius: '8px',
        textAlign: 'center',
        fontSize: '13px'
      }}>
        <div style={{ color: 'var(--settings-text)', marginBottom: '6px' }}>
          🎯 关闭此页面，在聊天框输入你的需求即可开始使用
        </div>
        <div style={{ color: 'var(--settings-text-dim)', fontSize: '12px' }}>
          随时问 AI "你能做什么？" 或 "如何使用某个功能？"
        </div>
      </div>
    </div>
  );
}
