/**
 * 快速入门页面
 * 
 * 帮助用户快速了解和使用 DeepBot
 */

import React from 'react';

interface QuickStartProps {
  onClose: () => void;
}

// 统一的样式常量
const STYLES = {
  // 间距
  sectionMargin: '24px',      // 章节之间的间距
  contentMargin: '16px',      // 内容块之间的间距
  itemMargin: '12px',         // 列表项之间的间距
  
  // 缩进
  indent: '24px',             // 标准缩进
  
  // 内边距
  cardPadding: '16px',        // 卡片内边距
  itemPadding: '12px',        // 列表项内边距
  
  // 字体大小
  titleSize: '15px',          // 标题字体
  contentSize: '13px',        // 正文字体
  smallSize: '12px',          // 小字体
  tinySize: '11px',           // 极小字体
};

export function QuickStart(_props: QuickStartProps) {
  // 滚动到指定章节
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="settings-section">
      {/* 欢迎横幅 */}
      <div className="quickstart-welcome" style={{ 
        marginBottom: '12px', 
        padding: '16px 20px', 
        borderRadius: '8px',
        color: 'var(--settings-text)'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '6px', color: 'inherit', display: 'flex', alignItems: 'center', marginLeft: '-20px' }}>
          <span style={{ marginRight: '8px' }}>👋</span>
          欢迎使用 DeepBot
        </h2>
        <p style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--settings-text-dim)' }}>
          DeepBot 是一个系统级 AI 助手，会更多探索企业生产提效方向。它能够与企业现有系统深度结合，让 AI 深入参与各部门的日常办公提效，通过多 Agent 协作模式实现复杂业务流程的自动化。无论是文档处理、数据分析、系统监控，还是跨部门协作任务，DeepBot 都能通过 AI Agent 技术帮助企业轻松搞定。它支持多任务并行处理、定时任务、技能扩展等功能，同时通过严格的安全机制保护企业系统安全。
        </p>
      </div>

      {/* 导航目录 */}
      <div style={{ 
        marginBottom: '20px',
        padding: '16px',
        background: 'var(--settings-input-bg)',
        borderRadius: '8px',
        border: '1px solid var(--settings-border)'
      }}>
        <h4 style={{ 
          fontSize: '14px', 
          fontWeight: '600', 
          color: 'var(--settings-text)', 
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <span style={{ marginRight: '8px' }}>📑</span>
          快速导航
        </h4>
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '8px',
          fontSize: '13px'
        }}>
          {[
            { id: 'quick-config', icon: '⚡', text: '快速配置' },
            { id: 'env-guide', icon: '📋', text: '环境依赖安装（Python）' },
            { id: 'available-tools', icon: '🔧', text: '可用工具' },
            { id: 'external-comm', icon: '💬', text: '外部通讯（飞书）' },
            { id: 'skill-guide', icon: '🎯', text: 'Skill 使用指南' },
            { id: 'external-tools', icon: '🔧', text: '外部工具使用' },
            { id: 'memory-guide', icon: '🧠', text: '记忆使用指南' },
            { id: 'command-system', icon: '⌨️', text: '指令系统' },
            { id: 'recommended', icon: '⭐', text: '推荐工具和 Skill' },
            { id: 'tips', icon: '💡', text: '使用技巧' },
            { id: 'examples', icon: '💬', text: '示例对话' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              style={{
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.05)',
                border: '1px solid var(--settings-border)',
                borderRadius: '6px',
                color: 'var(--settings-text)',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.2s',
                fontSize: '13px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--settings-accent)';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
                e.currentTarget.style.color = 'var(--settings-text)';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <span style={{ marginRight: '8px', fontSize: '14px' }}>{item.icon}</span>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 快速配置指南 */}
      <div id="quick-config" style={{ marginBottom: '20px' }}>
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
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>第一步：配置主大模型（必需）</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              前往「模型配置」，配置 Qwen、DeepSeek、Gemini、Minimax 或自定义模型的 API 密钥
            </div>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>第二步：配置工具（可选）</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              • 前往「工具配置」→「图片生成工具」，配置 Qwen Image 或 Gemini API 密钥，启用 AI 绘图功能<br/>
              • 前往「工具配置」→「网络搜索工具」，配置 Qwen 或 Gemini 的 API 密钥，启用实时信息查询
            </div>
          </div>
          <div>
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>第三步：安装环境依赖（推荐）</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              • Python：用于执行 Python 脚本和 Skill（💬 告诉 DeepBot："帮我安装 Python"）<br/>
              • Chrome：浏览器工具需要系统已安装 Chrome<br/>
              • Node.js：用于运行需要 JavaScript 环境的程序
            </div>
          </div>
        </div>
      </div>

      {/* 环境要求详细说明 */}
      <div id="env-guide" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>📋</span>
          环境依赖安装指南
        </h4>
        <div style={{ 
          padding: '12px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          fontSize: '13px',
          color: 'var(--settings-text-dim)',
          lineHeight: '1.6'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>🐍</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>Python（推荐）</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              用于执行 Python 脚本和 Skill
            </div>
            <div style={{ 
              marginLeft: '28px', 
              padding: '10px 12px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '6px',
              fontSize: '12px',
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

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>🌐</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>Chrome（可选）</span>
            </div>
            <div style={{ marginLeft: '28px' }}>
              浏览器工具需要系统已安装 Chrome
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>📦</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>Node.js（可选）</span>
            </div>
            <div style={{ marginLeft: '28px' }}>
              用于运行需要 JavaScript 环境的程序
            </div>
          </div>
        </div>
      </div>

      {/* 可用工具 */}
      <div id="available-tools" style={{ marginBottom: '20px' }}>
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
            { icon: '🎯', name: 'Skill 管理', desc: 'Skill 搜索、安装、使用' },
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

      {/* 外部通讯 */}
      <div id="external-comm" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>💬</span>
          外部通讯
          <span style={{ 
            marginLeft: '8px', 
            padding: '1px 6px', 
            background: 'var(--settings-accent)', 
            color: '#fff', 
            borderRadius: '10px', 
            fontSize: '11px',
            fontWeight: '600'
          }}>
            1
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
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>🚀</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>飞书机器人</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              将 DeepBot 接入飞书，在飞书中直接与 AI 对话，支持私聊和群组
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>配置步骤：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              1. 前往「系统管理 → 飞书」配置 App ID 和 App Secret<br/>
              2. 点击「启动连接器」按钮<br/>
              3. 在飞书中私聊或群组 @ 机器人即可使用
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>使用规则：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              • <strong>私聊</strong>：首位用户自动成为管理员，后续用户需管理员审批配对码<br/>
              • <strong>群组</strong>：必须 @ 机器人才会回复，无需配对<br/>
              • <strong>管理员审批</strong>：发送 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>deepbot pairing approve feishu &lt;配对码&gt;</code>
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>支持功能：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              • 发送文字、图片、文件，AI 自动处理<br/>
              • 发送飞书文档链接，AI 自动读取内容<br/>
              • 使用 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>/stop</code> 指令停止任务
            </div>
          </div>

          <div style={{ marginLeft: '28px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>飞书文档操作：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              • 新建文档（可指定文件夹）<br/>
              • 读取文档内容<br/>
              • 追加内容到文档末尾<br/>
              • 更新指定段落<br/>
              • 删除指定内容<br/>
              • 添加评论<br/>
              • 删除整篇文档
            </div>
          </div>
        </div>
      </div>

      {/* Skill 使用指南 */}
      <div id="skill-guide" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>🎯</span>
          Skill 使用指南
        </h4>
        <div style={{ 
          padding: '12px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          fontSize: '13px',
          color: 'var(--settings-text-dim)',
          lineHeight: '1.6'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>📦</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>什么是 Skill？</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              Skill 是可以扩展 DeepBot 能力的技能包，类似于插件系统。通过安装不同的 Skill，可以让 AI 获得更多专业能力。
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>搜索 Skill：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              • 点击聊天界面的 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> 按钮进入 Skill 管理，在搜索框中搜索关键词<br/>
              • 或直接告诉 DeepBot 你的需求：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"搜索能做 [某件事] 的 Skill"</code>
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>安装 Skill：</strong>
            <div style={{ 
              marginTop: '6px',
              padding: '10px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '6px',
              lineHeight: '1.8'
            }}>
              <div style={{ marginBottom: '8px', color: 'var(--settings-text)', fontWeight: '600' }}>
                方式一：自然语言安装（推荐）
              </div>
              <div style={{ 
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginBottom: '8px'
              }}>
                💬 "帮我搜索并安装 [Skill 名称] Skill"<br/>
                💬 "安装这个 Skill：[GitHub URL]"
              </div>
              
              <div style={{ marginTop: '12px', marginBottom: '8px', color: 'var(--settings-text)', fontWeight: '600' }}>
                方式二：手动安装
              </div>
              <div style={{ 
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                点击 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> 按钮 → 搜索 Skill → 点击「安装」按钮
              </div>
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>使用 Skill：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              安装后，直接告诉 AI 你的需求，它会自动调用相应的 Skill。例如：<br/>
              • "使用[skill名称]帮我分析这个 PDF 文件"<br/>
              • "使用[skill名称]获取 Twitter 上的最新动态"<br/>
              • "使用[skill名称]连接 Linear 查看我的任务"
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>管理 Skill：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              • 查看已安装：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"列出所有已安装的 Skill"</code><br/>
              • 更新 Skill：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"更新 [Skill 名称]"</code><br/>
              • 卸载 Skill：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"卸载 [Skill 名称]"</code>
            </div>
          </div>

          <div style={{ 
            marginTop: '12px',
            padding: '10px',
            background: 'rgba(var(--settings-accent-rgb), 0.1)',
            borderLeft: '3px solid var(--settings-accent)',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            💡 提示：Skill 安装在 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>~/.agents/skills</code> 目录，可以手动管理
          </div>
        </div>
      </div>

      {/* 外部工具使用指南 */}
      <div id="external-tools" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>🔧</span>
          外部工具使用指南
        </h4>
        <div style={{ 
          padding: '12px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          fontSize: '13px',
          color: 'var(--settings-text-dim)',
          lineHeight: '1.6'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '8px' }}>
              DeepBot 可以通过命令行调用任何已安装的外部工具（Python 包、Node.js 工具、命令行程序等）。
            </div>
          </div>

          {/* 两种使用方式 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '15px' }}>1️⃣</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '13px' }}>直接使用</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '6px', fontSize: '12px' }}>
              安装完成后，直接告诉 DeepBot 使用该工具即可：
            </div>
            <div style={{ 
              marginLeft: '28px',
              padding: '8px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              lineHeight: '1.8'
            }}>
              💬 "读取 github.com/microsoft/markitdown 说明，帮我安装 markitdown"<br/>
              💬 "使用 markitdown 转换这个 PDF 文件"
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '15px' }}>2️⃣</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '13px' }}>推荐：创建 Skill 后通过 Skill 调用</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '6px', fontSize: '12px' }}>
              将工具的使用方法封装成 Skill，AI 可以更智能、更稳定地调用，并在合适时机自动选择：
            </div>
            <div style={{ 
              marginLeft: '28px',
              padding: '8px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              lineHeight: '1.8'
            }}>
              💬 "帮我安装 markitdown"<br/>
              <span style={{ color: 'var(--settings-text-dim)' }}>→ 安装完成后，AI 会询问是否创建 Skill</span><br/>
              💬 "是，读取markitdown使用说明，帮我创建 Skill"<br/>
              <span style={{ color: 'var(--settings-text-dim)' }}>→ 之后直接说需求，AI 自动调用 Skill</span><br/>
              💬 "使用markitdown skill把这个 PDF 转成 Markdown"<br/>
               <span style={{ color: 'var(--settings-text-dim)' }}>→ 可以让deepbot记住只要是文档处理，都使用这个skill</span><br/>
              💬 "记住所有文档的读取，都使用markitdown skill"
            </div>
          </div>

          <div style={{ 
            marginTop: '12px',
            padding: '10px',
            background: 'rgba(var(--settings-accent-rgb), 0.1)',
            borderLeft: '3px solid var(--settings-accent)',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            💡 推荐使用 Skill 方式：Skill 包含完整的使用规范，AI 调用更准确，也方便复用和分享
          </div>
        </div>
      </div>

      {/* 指令系统 */}
      <div id="command-system" style={{ marginBottom: '20px' }}>
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
            5
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
                /stop
              </code>
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>停止任务</span>
              <span style={{ 
                marginLeft: '8px',
                padding: '1px 6px',
                background: 'rgba(var(--settings-accent-rgb), 0.15)',
                color: 'var(--settings-accent)',
                borderRadius: '4px',
                fontSize: '11px'
              }}>仅飞书等外部通讯</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              停止当前正在执行的任务。仅支持通过飞书等外部通讯渠道发送，桌面端请点击停止按钮
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
                /status
              </code>
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>查看状态</span>
              <span style={{ 
                marginLeft: '8px',
                padding: '1px 6px',
                background: 'rgba(var(--settings-accent-rgb), 0.15)',
                color: 'var(--settings-accent)',
                borderRadius: '4px',
                fontSize: '11px'
              }}>仅飞书等外部通讯</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              查看当前任务执行状态和正在输出的内容。仅支持通过飞书等外部通讯渠道发送
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
      <div id="recommended" style={{ marginBottom: '20px' }}>
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
            5
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

          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>🔍</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>Tavily Search - AI 搜索引擎 Skill</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              专为 AI Agent 设计的搜索引擎，提供高质量、结构化的搜索结果，让 DeepBot 获得强大的实时信息检索能力
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>核心优势：</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• 专为 AI 优化的搜索结果</div>
                <div>• 返回结构化数据，减少幻觉</div>
                <div>• 支持深度搜索和快速搜索</div>
                <div>• 免费额度足够日常使用</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>安装方式：</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontSize: '12px',
                lineHeight: '1.8'
              }}>
                <div style={{ marginBottom: '6px' }}>
                  <strong>第一步：</strong>打开聊天界面的 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> 按钮，搜索「Tavily Search」，点击安装
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <strong>第二步：</strong>前往 <a 
                    href="https://app.tavily.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--settings-accent)', textDecoration: 'none' }}
                  >
                    app.tavily.com
                  </a> 注册账号，获取免费 API Key
                </div>
                <div>
                  <strong>第三步：</strong>💬 告诉 DeepBot："按照 Tavily Search skill 的说明配置好 API Key，我的 API Key 是 [粘贴你的 API Key]"
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>📧</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>imap-smtp-email-chinese - 中文邮件收发 Skill</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              支持 IMAP 收件、SMTP 发件，完美兼容 QQ、163、Gmail 等主流邮箱，中文友好
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>核心功能：</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• 发送邮件（支持附件）</div>
                <div>• 读取收件箱</div>
                <div>• 搜索邮件</div>
                <div>• 支持 HTML 格式</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>安装方式：</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontSize: '12px',
                lineHeight: '1.8'
              }}>
                <div style={{ marginBottom: '6px' }}>
                  <strong>第一步：</strong>打开聊天界面的 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> 按钮，搜索「imap-smtp-email-chinese」，点击安装
                </div>
                <div>
                  <strong>第二步：</strong>💬 告诉 DeepBot："按照 imap-smtp-email-chinese skill 的说明配置好邮箱信息"
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 记忆使用指南 */}
      <div id="memory-guide" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>🧠</span>
          记忆使用指南
        </h4>
        <div style={{ 
          padding: '12px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          fontSize: '13px',
          color: 'var(--settings-text-dim)',
          lineHeight: '1.6'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>💾</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>什么是记忆？</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              记忆是 DeepBot 的长期存储系统，用于记住用户的偏好、习惯、角色定义和重要信息。不同于对话历史（会话结束后清空），记忆会永久保存，让 AI 越用越懂你。
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>记忆分类：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              • <strong>角色</strong>：AI 的专业角色（如"你是法律专家"、"你是数据分析师"）<br/>
              • <strong>用户习惯</strong>：个人偏好、工作流程、常用工具（如"我喜欢简洁的代码风格"）<br/>
              • <strong>错误总结</strong>：之前遇到的错误和解决方案（避免重复犯错）<br/>
              • <strong>备忘事项</strong>：其他重要信息（如"项目截止日期是下周五"）
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>如何添加记忆：</strong>
            <div style={{ 
              marginTop: '6px',
              padding: '10px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '6px',
              lineHeight: '1.8'
            }}>
              <div style={{ 
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginBottom: '8px'
              }}>
                💬 "记住：我喜欢用 VS Code 编辑器"<br/>
                💬 "记住：你是一个前端开发专家"<br/>
                💬 "记住：当我要读取 PDF 时，使用 markitdown 命令"<br/>
                💬 "记住：项目部署在 ~/work/myproject 目录"
              </div>
              <div style={{ fontSize: '12px', color: 'var(--settings-text)' }}>
                AI 会自动提炼关键信息并分类存储
              </div>
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>查看记忆：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              • 使用指令：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>/memory</code><br/>
              • 或直接问：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"你记住了什么？"</code>
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>多 Tab 记忆管理：</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              • <strong>主记忆</strong>：默认 Tab 使用，存储通用信息<br/>
              • <strong>Tab 独立记忆</strong>：每个 Tab 可以有自己的记忆（如"法律专家"Tab 有专门的法律知识）<br/>
              • <strong>记忆合并</strong>：可以将其他 Tab 的记忆合并到当前 Tab
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>合并记忆：</strong>
            <div style={{ 
              marginTop: '6px',
              padding: '10px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '6px',
              lineHeight: '1.8'
            }}>
              <div style={{ marginBottom: '8px' }}>
                当你想让当前 Tab 继承其他 Tab 的经验时，可以合并记忆：
              </div>
              <div style={{ 
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginBottom: '8px'
              }}>
                💬 "合并主记忆到当前 Tab"<br/>
                💬 "合并'法律专家'Tab 的记忆"<br/>
                💬 "将'数据分析师'的记忆合并过来"
              </div>
              <div style={{ fontSize: '12px', color: 'var(--settings-text)' }}>
                AI 会智能合并两边的记忆，自动解决冲突和去重
              </div>
            </div>
          </div>

          <div style={{ 
            marginTop: '12px',
            padding: '10px',
            background: 'rgba(var(--settings-accent-rgb), 0.1)',
            borderLeft: '3px solid var(--settings-accent)',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            💡 提示：记忆文件存储在 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>~/.deepbot/memory/</code> 目录，可以手动编辑
          </div>
        </div>
      </div>

      {/* 使用技巧 */}
      <div id="tips" style={{ marginBottom: '20px' }}>
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
        <div style={{ 
          padding: '12px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          display: 'grid', 
          gap: '6px', 
          fontSize: '13px' 
        }}>
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
      <div id="examples" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>💬</span>
          示例对话
        </h4>
        <div style={{ 
          padding: '12px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          display: 'grid', 
          gap: '8px', 
          fontSize: '13px' 
        }}>
          {[
            '帮我整理桌面上的文件，把图片放到 Pictures 文件夹',
            '每天下午 5 点提醒我写日报',
            '记住：我喜欢简洁的代码风格，不要写太多注释',
            '打开百度搜索"人工智能最新进展"，截图前 3 条结果',
            '分析 ~/Documents/sales.csv 文件，生成销售趋势图表',
            '创建一个 Python 脚本，每小时自动备份 ~/work 目录到云盘',
            '搜索最新的 React 19 新特性，总结成 Markdown 文档保存',
            '监控 CPU 使用率，超过 80% 时发送飞书通知给我',
          ].map((text, index) => (
            <div 
              key={index}
              style={{ 
                padding: '10px 12px', 
                background: 'rgba(0,0,0,0.05)', 
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
