/**
 * 快速入门页面
 * 
 * 帮助用户快速了解和使用 DeepBot
 */

import React from 'react';
import qrcodeImg from '../../assets/qrcode.png';
import { getLanguage } from '../../i18n';

interface QuickStartProps {
  onClose: () => void;
  onNavigate?: (tab: string) => void;
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

export function QuickStart({ onNavigate }: QuickStartProps) {
  const lang = getLanguage();

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
          {lang === 'zh' ? '欢迎使用 DeepBot' : 'Welcome to DeepBot'}
        </h2>
        <p style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--settings-text-dim)' }}>
          {lang === 'zh'
            ? 'DeepBot 是一个系统级 AI 助手，会更多探索企业生产提效方向。它能够与企业现有系统深度结合，让 AI 深入参与各部门的日常办公提效，通过多 Agent 协作模式实现复杂业务流程的自动化。无论是文档处理、数据分析、系统监控，还是跨部门协作任务，DeepBot 都能通过 AI Agent 技术帮助企业轻松搞定。它支持多任务并行处理、定时任务、技能扩展等功能，同时通过严格的安全机制保护企业系统安全。'
            : 'DeepBot is a system-level AI assistant focused on boosting enterprise productivity. It integrates deeply with existing business systems, enabling AI to streamline daily operations across departments through multi-agent collaboration. Whether it\'s document processing, data analysis, system monitoring, or cross-team tasks, DeepBot leverages AI Agent technology to automate complex workflows with ease. It supports parallel task execution, scheduled tasks, skill extensions, and robust security mechanisms to keep your systems safe.'}
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
          {lang === 'zh' ? '快速导航' : 'Quick Navigation'}
        </h4>
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '8px',
          fontSize: '13px'
        }}>
          {[
            { id: 'quick-config', icon: '⚡', text: lang === 'zh' ? '快速配置' : 'Quick Setup' },
            { id: 'env-guide', icon: '📋', text: lang === 'zh' ? '环境依赖安装（Python）' : 'Environment Setup (Python)' },
            { id: 'available-tools', icon: '🔧', text: lang === 'zh' ? '可用工具' : 'Available Tools' },
            { id: 'external-comm', icon: '💬', text: lang === 'zh' ? '外部通讯（飞书）' : 'External Messaging (Lark)' },
            { id: 'skill-guide', icon: '🎯', text: lang === 'zh' ? 'Skill 使用指南' : 'Skill Guide' },
            { id: 'external-tools', icon: '🔧', text: lang === 'zh' ? '外部工具使用' : 'External Tools' },
            { id: 'memory-guide', icon: '🧠', text: lang === 'zh' ? '记忆使用指南' : 'Memory Guide' },
            { id: 'command-system', icon: '⌨️', text: lang === 'zh' ? '指令系统' : 'Commands' },
            { id: 'recommended', icon: '⭐', text: lang === 'zh' ? '推荐工具和 Skill' : 'Recommended Tools & Skills' },
            { id: 'tips', icon: '💡', text: lang === 'zh' ? '使用技巧' : 'Tips & Tricks' },
            { id: 'examples', icon: '💬', text: lang === 'zh' ? '示例对话' : 'Example Conversations' },
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
          {lang === 'zh' ? '快速配置（发挥最大能力）' : 'Quick Setup (Unlock Full Potential)'}
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
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>{lang === 'zh' ? '第一步：配置主大模型（必需）' : 'Step 1: Configure Main Model (Required)'}</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              {lang === 'zh' ? (
                <>前往<a href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('model'); }} style={{ color: 'var(--settings-accent)', cursor: 'pointer' }}>「模型配置」</a>，选择提供商并配置 API 密钥</>
              ) : (
                <>Go to <a href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('model'); }} style={{ color: 'var(--settings-accent)', cursor: 'pointer' }}>Model Settings</a> to select a provider and configure your API key</>
              )}
            </div>
          </div>

          {/* API Key 申请说明 */}
          <div style={{ 
            marginBottom: '10px',
            marginLeft: '16px',
            padding: '10px 12px',
            background: 'rgba(0,0,0,0.1)',
            borderRadius: '6px',
            fontSize: '12px',
            lineHeight: '1.6'
          }}>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ color: 'var(--settings-text)', fontWeight: '600', marginBottom: '4px' }}>
                {lang === 'zh' ? '🔑 方式一：扫码获取 DeepBot Token' : '🔑 Option 1: Scan QR Code for DeepBot Token'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--settings-text-dim)', marginBottom: '8px' }}>
                {lang === 'zh' ? '选择 DeepBot 提供商时，扫码添加微信获取 Token' : 'When selecting the DeepBot provider, scan the QR code to add WeChat and get your Token'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <img src={qrcodeImg} alt={lang === 'zh' ? '扫码添加微信' : 'Scan QR code'} style={{ width: '120px', height: '120px', borderRadius: '6px' }} />
              </div>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--settings-border)', margin: '10px 0' }} />
            <div>
              <div style={{ color: 'var(--settings-text)', fontWeight: '600', marginBottom: '4px' }}>
                {lang === 'zh' ? '🔑 方式二：自行申请（以 Qwen 为例）' : '🔑 Option 2: Apply Manually (e.g. Qwen)'}
              </div>
              <div style={{ lineHeight: '1.8' }}>
                {lang === 'zh' ? (
                  <>
                    1. 访问 <span style={{ color: 'var(--settings-accent)' }}>dashscope.console.aliyun.com</span><br/>
                    2. 进入控制台 →「API-KEY 管理」<br/>
                    3. 创建 API-KEY，复制密钥<br/>
                    4. 粘贴到此处保存即可
                  </>
                ) : (
                  <>
                    1. Visit <span style={{ color: 'var(--settings-accent)' }}>dashscope.console.aliyun.com</span><br/>
                    2. Go to Console → "API-KEY Management"<br/>
                    3. Create an API-KEY and copy the secret<br/>
                    4. Paste it here and save
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>{lang === 'zh' ? '第二步：配置工具（可选）' : 'Step 2: Configure Tools (Optional)'}</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              {lang === 'zh' ? (
                <>
                  • 前往<a href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('tools'); }} style={{ color: 'var(--settings-accent)', cursor: 'pointer' }}>「工具配置」</a>，配置图片生成和网络搜索工具的 API 密钥<br/>
                  • 支持 Qwen 或 DeepBot 供应商（DeepBot 供应商可免"魔法"使用 Gemini Nano Banana 2 生图和 Gemini 网络搜索，可填写自己的 Gemini API Key 或通过上方二维码获取）<br/>
                  <span style={{ fontSize: '12px', color: 'var(--settings-text-dim)', marginTop: '4px', display: 'inline-block' }}>
                    💡 如不使用内置工具，可在<a href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('tools'); }} style={{ color: 'var(--settings-accent)', cursor: 'pointer' }}>「工具配置」</a>中关闭，自行安装 Skill 来实现相关功能，详见下方<a href="#recommended" onClick={(e) => { e.preventDefault(); scrollToSection('recommended'); }} style={{ color: 'var(--settings-accent)', cursor: 'pointer' }}>「推荐工具和 Skill」</a>
                  </span>
                </>
              ) : (
                <>
                  • Go to <a href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('tools'); }} style={{ color: 'var(--settings-accent)', cursor: 'pointer' }}>Tool Settings</a> to configure API keys for image generation and web search<br/>
                  • Supports Qwen or DeepBot providers (DeepBot provider offers Gemini Nano Banana 2 image generation and Gemini web search without VPN; use your own Gemini API Key or get one via the QR code above)<br/>
                  <span style={{ fontSize: '12px', color: 'var(--settings-text-dim)', marginTop: '4px', display: 'inline-block' }}>
                    💡 If you don't need built-in tools, disable them in <a href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('tools'); }} style={{ color: 'var(--settings-accent)', cursor: 'pointer' }}>Tool Settings</a> and install Skills instead. See <a href="#recommended" onClick={(e) => { e.preventDefault(); scrollToSection('recommended'); }} style={{ color: 'var(--settings-accent)', cursor: 'pointer' }}>Recommended Tools & Skills</a> below
                  </span>
                </>
              )}
            </div>
          </div>
          <div>
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>{lang === 'zh' ? '第三步：安装环境依赖（推荐）' : 'Step 3: Install Dependencies (Recommended)'}</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              {lang === 'zh' ? (
                <>
                  • Python：用于执行 Python 脚本和 Skill（💬 告诉 DeepBot："帮我安装 Python"）<br/>
                  • Chrome：浏览器工具需要系统已安装 Chrome<br/>
                  • Node.js：用于运行需要 JavaScript 环境的程序
                </>
              ) : (
                <>
                  • Python: For running Python scripts and Skills (💬 Tell DeepBot: "Help me install Python")<br/>
                  • Chrome: Required by browser tools<br/>
                  • Node.js: For running programs that need a JavaScript environment
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 环境要求详细说明 */}
      <div id="env-guide" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>📋</span>
          {lang === 'zh' ? '环境依赖安装指南' : 'Environment Setup Guide'}
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
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>{lang === 'zh' ? 'Python（推荐）' : 'Python (Recommended)'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              {lang === 'zh' ? '用于执行 Python 脚本和 Skill' : 'For running Python scripts and Skills'}
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
                {lang === 'zh' ? '⚡ 快速安装' : '⚡ Quick Install'}
              </div>
              <div style={{ marginBottom: '8px', color: 'var(--settings-accent)', fontWeight: '600' }}>
                {lang === 'zh' ? '💬 只需告诉 DeepBot："帮我安装 Python"，即可自动完成安装！' : '💬 Just tell DeepBot: "Help me install Python" and it will handle the rest!'}
              </div>
              <div style={{ marginBottom: '6px', color: 'var(--settings-text)', fontWeight: '600' }}>
                {lang === 'zh' ? '📦 手动安装 Python' : '📦 Manual Python Installation'}
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
                  {lang === 'zh' ? '下载并运行：' : 'Download and run: '}https://www.python.org/downloads/windows/
                </div>
                <div style={{ marginTop: '6px', color: 'var(--settings-text)' }}>
                  <strong>{lang === 'zh' ? '验证安装:' : 'Verify installation:'}</strong> python3 --version
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>🌐</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>{lang === 'zh' ? 'Chrome（可选）' : 'Chrome (Optional)'}</span>
            </div>
            <div style={{ marginLeft: '28px' }}>
              {lang === 'zh' ? '浏览器工具需要系统已安装 Chrome' : 'Browser tools require Chrome to be installed'}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>📦</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>{lang === 'zh' ? 'Node.js（可选）' : 'Node.js (Optional)'}</span>
            </div>
            <div style={{ marginLeft: '28px' }}>
              {lang === 'zh' ? '用于运行需要 JavaScript 环境的程序' : 'For running programs that need a JavaScript environment'}
            </div>
          </div>
        </div>
      </div>

      {/* 可用工具 */}
      <div id="available-tools" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>🔧</span>
          {lang === 'zh' ? '可用工具' : 'Available Tools'}
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
            { icon: '📁', name: lang === 'zh' ? '文件操作' : 'File Operations', desc: lang === 'zh' ? '读写文件、搜索文件' : 'Read, write, and search files' },
            { icon: '⚡', name: lang === 'zh' ? '命令执行' : 'Command Execution', desc: lang === 'zh' ? '运行系统命令、脚本' : 'Run system commands and scripts' },
            { icon: '🌐', name: lang === 'zh' ? '浏览器控制' : 'Browser Control', desc: lang === 'zh' ? '网页截图、自动化' : 'Screenshots and automation' },
            { icon: '📅', name: lang === 'zh' ? '日历管理' : 'Calendar', desc: lang === 'zh' ? '查看日期、计算时间' : 'View dates, calculate time' },
            { icon: '🔍', name: lang === 'zh' ? '环境检查' : 'Environment Check', desc: lang === 'zh' ? '检测系统信息' : 'Detect system info' },
            { icon: '🎨', name: lang === 'zh' ? '图片生成' : 'Image Generation', desc: lang === 'zh' ? 'AI 生成图片' : 'AI-generated images' },
            { icon: '🔎', name: lang === 'zh' ? '网页搜索' : 'Web Search', desc: lang === 'zh' ? '实时信息查询' : 'Real-time information lookup' },
            { icon: '📄', name: lang === 'zh' ? '网页获取' : 'Web Fetch', desc: lang === 'zh' ? '提取网页内容' : 'Extract web page content' },
            { icon: '🧠', name: lang === 'zh' ? '记忆管理' : 'Memory', desc: lang === 'zh' ? '存储用户偏好' : 'Store user preferences' },
            { icon: '🎯', name: lang === 'zh' ? 'Skill 管理' : 'Skill Manager', desc: lang === 'zh' ? 'Skill 搜索、安装、使用' : 'Search, install, and use Skills' },
            { icon: '⏰', name: lang === 'zh' ? '定时任务' : 'Scheduled Tasks', desc: lang === 'zh' ? '创建周期任务' : 'Create recurring tasks' },
            { icon: '💬', name: lang === 'zh' ? 'AI 对话' : 'AI Chat', desc: lang === 'zh' ? '后台 AI 处理' : 'Background AI processing' },
            { icon: '🔗', name: lang === 'zh' ? '跨会话通信' : 'Cross-Session', desc: lang === 'zh' ? '多 Tab 协作' : 'Multi-tab collaboration' },
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
          {lang === 'zh' ? '外部通讯' : 'External Messaging'}
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
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>{lang === 'zh' ? '飞书机器人' : 'Lark Bot'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              {lang === 'zh' ? '将 DeepBot 接入飞书，在飞书中直接与 AI 对话，支持私聊和群组' : 'Connect DeepBot to Lark for direct AI conversations, supporting both private chats and group messages'}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '配置步骤：' : 'Setup Steps:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  1. 前往「系统管理 → 飞书」配置 App ID 和 App Secret<br/>
                  2. 点击「启动连接器」按钮<br/>
                  3. 在飞书中私聊或群组 @ 机器人即可使用
                </>
              ) : (
                <>
                  1. Go to "Settings → Lark" and configure App ID and App Secret<br/>
                  2. Click the "Start Connector" button<br/>
                  3. Chat privately or @ the bot in a group on Lark
                </>
              )}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '使用规则：' : 'Usage Rules:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  • <strong>私聊</strong>：首位用户自动成为管理员，后续用户需管理员审批配对码<br/>
                  • <strong>群组</strong>：必须 @ 机器人才会回复，无需配对<br/>
                  • <strong>管理员审批</strong>：发送 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>deepbot pairing approve feishu &lt;配对码&gt;</code>
                </>
              ) : (
                <>
                  • <strong>Private Chat</strong>: The first user becomes admin automatically; others need admin approval via pairing code<br/>
                  • <strong>Group Chat</strong>: Must @ the bot to get a reply; no pairing needed<br/>
                  • <strong>Admin Approval</strong>: Send <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>deepbot pairing approve feishu &lt;pairing_code&gt;</code>
                </>
              )}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '支持功能：' : 'Supported Features:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  • 发送文字、图片、文件，AI 自动处理<br/>
                  • 发送飞书文档链接，AI 自动读取内容<br/>
                  • 使用 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>/stop</code> 指令停止任务
                </>
              ) : (
                <>
                  • Send text, images, or files — AI processes them automatically<br/>
                  • Send Lark document links — AI reads the content automatically<br/>
                  • Use the <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>/stop</code> command to stop a task
                </>
              )}
            </div>
          </div>

          <div style={{ marginLeft: '28px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '飞书文档操作：' : 'Lark Document Operations:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  • 新建文档（可指定文件夹）<br/>
                  • 读取文档内容<br/>
                  • 追加内容到文档末尾<br/>
                  • 更新指定段落<br/>
                  • 删除指定内容<br/>
                  • 添加评论<br/>
                  • 删除整篇文档
                </>
              ) : (
                <>
                  • Create documents (with optional folder)<br/>
                  • Read document content<br/>
                  • Append content to end of document<br/>
                  • Update specific paragraphs<br/>
                  • Delete specific content<br/>
                  • Add comments<br/>
                  • Delete entire documents
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Skill 使用指南 */}
      <div id="skill-guide" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>🎯</span>
          {lang === 'zh' ? 'Skill 使用指南' : 'Skill Guide'}
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
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>{lang === 'zh' ? '什么是 Skill？' : 'What are Skills?'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              {lang === 'zh'
                ? 'Skill 是可以扩展 DeepBot 能力的技能包，类似于插件系统。通过安装不同的 Skill，可以让 AI 获得更多专业能力。'
                : 'Skills are extensible capability packages for DeepBot, similar to a plugin system. By installing different Skills, you can give the AI more specialized abilities.'}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '搜索 Skill：' : 'Search Skills:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  • 点击聊天界面的 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> 按钮进入 Skill 管理，在搜索框中搜索关键词<br/>
                  • 或直接告诉 DeepBot 你的需求：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"搜索能做 [某件事] 的 Skill"</code>
                </>
              ) : (
                <>
                  • Click the <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> button in the chat to open Skill Manager and search by keyword<br/>
                  • Or just tell DeepBot what you need: <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"Search for a Skill that can [do something]"</code>
                </>
              )}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '安装 Skill：' : 'Install Skills:'}</strong>
            <div style={{ 
              marginTop: '6px',
              padding: '10px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '6px',
              lineHeight: '1.8'
            }}>
              <div style={{ marginBottom: '8px', color: 'var(--settings-text)', fontWeight: '600' }}>
                {lang === 'zh' ? '方式一：自然语言安装（推荐）' : 'Option 1: Natural Language Install (Recommended)'}
              </div>
              <div style={{ 
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginBottom: '8px'
              }}>
                {lang === 'zh' ? (
                  <>
                    💬 "帮我搜索并安装 [Skill 名称] Skill"<br/>
                    💬 "安装这个 Skill：[GitHub URL]"
                  </>
                ) : (
                  <>
                    💬 "Search and install the [Skill name] Skill"<br/>
                    💬 "Install this Skill: [GitHub URL]"
                  </>
                )}
              </div>
              
              <div style={{ marginTop: '12px', marginBottom: '8px', color: 'var(--settings-text)', fontWeight: '600' }}>
                {lang === 'zh' ? '方式二：手动安装' : 'Option 2: Manual Install'}
              </div>
              <div style={{ 
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                {lang === 'zh'
                  ? <>点击 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> 按钮 → 搜索 Skill → 点击「安装」按钮</>
                  : <>Click the <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> button → Search for a Skill → Click "Install"</>}
              </div>
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '使用 Skill：' : 'Use Skills:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  安装后，直接告诉 AI 你的需求，它会自动调用相应的 Skill。例如：<br/>
                  • "使用[skill名称]帮我分析这个 PDF 文件"<br/>
                  • "使用[skill名称]获取 Twitter 上的最新动态"<br/>
                  • "使用[skill名称]连接 Linear 查看我的任务"
                </>
              ) : (
                <>
                  Once installed, just tell the AI what you need and it will automatically invoke the right Skill. For example:<br/>
                  • "Use [skill name] to analyze this PDF file"<br/>
                  • "Use [skill name] to get the latest updates from Twitter"<br/>
                  • "Use [skill name] to connect to Linear and check my tasks"
                </>
              )}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '管理 Skill：' : 'Manage Skills:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  • 查看已安装：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"列出所有已安装的 Skill"</code><br/>
                  • 更新 Skill：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"更新 [Skill 名称]"</code><br/>
                  • 卸载 Skill：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"卸载 [Skill 名称]"</code>
                </>
              ) : (
                <>
                  • View installed: <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"List all installed Skills"</code><br/>
                  • Update a Skill: <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"Update [Skill name]"</code><br/>
                  • Uninstall a Skill: <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"Uninstall [Skill name]"</code>
                </>
              )}
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
            💡 {lang === 'zh' ? '提示：Skill 安装在' : 'Tip: Skills are installed in'} <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>~/.agents/skills</code> {lang === 'zh' ? '目录，可以手动管理' : 'and can be managed manually'}
          </div>
        </div>
      </div>

      {/* 外部工具使用指南 */}
      <div id="external-tools" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>🔧</span>
          {lang === 'zh' ? '外部工具使用指南' : 'External Tools Guide'}
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
              {lang === 'zh'
                ? 'DeepBot 可以通过命令行调用任何已安装的外部工具（Python 包、Node.js 工具、命令行程序等）。'
                : 'DeepBot can invoke any installed external tool via the command line (Python packages, Node.js tools, CLI programs, etc.).'}
            </div>
          </div>

          {/* 两种使用方式 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '15px' }}>1️⃣</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '13px' }}>{lang === 'zh' ? '直接使用' : 'Direct Usage'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '6px', fontSize: '12px' }}>
              {lang === 'zh' ? '安装完成后，直接告诉 DeepBot 使用该工具即可：' : 'After installation, just tell DeepBot to use the tool:'}
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
              {lang === 'zh' ? (
                <>
                  💬 "读取 github.com/microsoft/markitdown 说明，帮我安装 markitdown"<br/>
                  💬 "使用 markitdown 转换这个 PDF 文件"
                </>
              ) : (
                <>
                  💬 "Read the docs at github.com/microsoft/markitdown and install markitdown for me"<br/>
                  💬 "Use markitdown to convert this PDF file"
                </>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ marginRight: '8px', fontSize: '15px' }}>2️⃣</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '13px' }}>{lang === 'zh' ? '推荐：创建 Skill 后通过 Skill 调用' : 'Recommended: Create a Skill and invoke via Skill'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '6px', fontSize: '12px' }}>
              {lang === 'zh'
                ? '将工具的使用方法封装成 Skill，AI 可以更智能、更稳定地调用，并在合适时机自动选择：'
                : 'Wrap the tool usage into a Skill so the AI can call it more reliably and choose it automatically when appropriate:'}
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
              {lang === 'zh' ? (
                <>
                  💬 "帮我安装 markitdown"<br/>
                  <span style={{ color: 'var(--settings-text-dim)' }}>→ 安装完成后，AI 会询问是否创建 Skill</span><br/>
                  💬 "是，读取markitdown使用说明，帮我创建 Skill"<br/>
                  <span style={{ color: 'var(--settings-text-dim)' }}>→ 之后直接说需求，AI 自动调用 Skill</span><br/>
                  💬 "使用markitdown skill把这个 PDF 转成 Markdown"<br/>
                  <span style={{ color: 'var(--settings-text-dim)' }}>→ 可以让deepbot记住只要是文档处理，都使用这个skill</span><br/>
                  💬 "记住所有文档的读取，都使用markitdown skill"
                </>
              ) : (
                <>
                  💬 "Install markitdown for me"<br/>
                  <span style={{ color: 'var(--settings-text-dim)' }}>→ After installation, the AI will ask if you want to create a Skill</span><br/>
                  💬 "Yes, read the markitdown docs and create a Skill for me"<br/>
                  <span style={{ color: 'var(--settings-text-dim)' }}>→ Then just describe your needs and the AI will call the Skill automatically</span><br/>
                  💬 "Use the markitdown skill to convert this PDF to Markdown"<br/>
                  <span style={{ color: 'var(--settings-text-dim)' }}>→ You can also tell DeepBot to always use this skill for document processing</span><br/>
                  💬 "Remember to always use the markitdown skill for reading documents"
                </>
              )}
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
            💡 {lang === 'zh' ? '推荐使用 Skill 方式：Skill 包含完整的使用规范，AI 调用更准确，也方便复用和分享' : 'Recommended: Using Skills provides complete usage specs, more accurate AI invocations, and easier reuse and sharing'}
          </div>
        </div>
      </div>

      {/* 指令系统 */}
      <div id="command-system" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>⌨️</span>
          {lang === 'zh' ? '指令系统' : 'Commands'}
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
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>{lang === 'zh' ? '新建会话' : 'New Session'}</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              {lang === 'zh' ? '清空当前会话历史，开始全新对话' : 'Clear current session history and start a new conversation'}
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
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>{lang === 'zh' ? '查看记忆' : 'View Memory'}</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              {lang === 'zh' ? '查看 AI 记住的所有信息（用户偏好、习惯等）' : 'View all information the AI has memorized (preferences, habits, etc.)'}
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
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>{lang === 'zh' ? '分析历史' : 'Analyze History'}</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              {lang === 'zh' ? '让 AI 分析当前会话的历史记录文件' : 'Have the AI analyze the current session\'s history file'}
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
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>{lang === 'zh' ? '停止任务' : 'Stop Task'}</span>
              <span style={{ 
                marginLeft: '8px',
                padding: '1px 6px',
                background: 'rgba(var(--settings-accent-rgb), 0.15)',
                color: 'var(--settings-accent)',
                borderRadius: '4px',
                fontSize: '11px'
              }}>{lang === 'zh' ? '仅飞书等外部通讯' : 'External messaging only'}</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              {lang === 'zh' ? '停止当前正在执行的任务。仅支持通过飞书等外部通讯渠道发送，桌面端请点击停止按钮' : 'Stop the currently running task. Only available via external messaging channels like Lark; use the stop button on desktop'}
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
              <span style={{ color: 'var(--settings-text)', fontWeight: '600' }}>{lang === 'zh' ? '查看状态' : 'View Status'}</span>
              <span style={{ 
                marginLeft: '8px',
                padding: '1px 6px',
                background: 'rgba(var(--settings-accent-rgb), 0.15)',
                color: 'var(--settings-accent)',
                borderRadius: '4px',
                fontSize: '11px'
              }}>{lang === 'zh' ? '仅飞书等外部通讯' : 'External messaging only'}</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '12px' }}>
              {lang === 'zh' ? '查看当前任务执行状态和正在输出的内容。仅支持通过飞书等外部通讯渠道发送' : 'View current task execution status and output. Only available via external messaging channels like Lark'}
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
          💡 {lang === 'zh' ? '提示：输入框中输入' : 'Tip: Type'} <code style={{ 
            padding: '1px 4px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '3px',
            fontFamily: 'monospace',
            color: 'var(--settings-accent)'
          }}>/</code> {lang === 'zh' ? '会自动显示可用指令列表' : 'in the input box to see available commands'}
        </div>
      </div>

      {/* 推荐工具和 Skill */}
      <div id="recommended" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>⭐</span>
          {lang === 'zh' ? '推荐工具和 Skill' : 'Recommended Tools & Skills'}
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
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>{lang === 'zh' ? 'MarkItDown - 文档转换神器' : 'MarkItDown - Document Converter'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              {lang === 'zh' ? '将各种文档格式转换为 Markdown，方便 DeepBot 读取和分析' : 'Convert various document formats to Markdown for easy reading and analysis by DeepBot'}
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '支持格式：' : 'Supported Formats:'}</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• PDF, PowerPoint, Word, Excel</div>
                <div>• {lang === 'zh' ? '图片（EXIF + OCR）' : 'Images (EXIF + OCR)'}</div>
                <div>• {lang === 'zh' ? '音频（转录）' : 'Audio (Transcription)'}</div>
                <div>• HTML, CSV, JSON, XML</div>
                <div>• ZIP</div>
                <div>• YouTube URL, EPUB</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '安装方式：' : 'Installation:'}</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                {lang === 'zh'
                  ? '💬 告诉 DeepBot："读取 github.com/microsoft/markitdown 说明，帮我安装 markitdown"'
                  : '💬 Tell DeepBot: "Read the docs at github.com/microsoft/markitdown and install markitdown"'}
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px' }}>
                {lang === 'zh' ? '或访问：' : 'Or visit: '}<a 
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
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>{lang === 'zh' ? 'Agent-Reach - 互联网能力扩展' : 'Agent-Reach - Internet Access Extension'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              {lang === 'zh' ? '给 AI Agent 装上互联网的眼睛，一键获得全网信息访问能力' : 'Give your AI Agent internet access — one-click setup for full web information retrieval'}
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '支持平台：' : 'Supported Platforms:'}</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• Twitter/X, Reddit, YouTube</div>
                <div>• {lang === 'zh' ? 'B站、小红书、抖音' : 'Bilibili, Xiaohongshu, Douyin'}</div>
                <div>• GitHub, LinkedIn, {lang === 'zh' ? '微博' : 'Weibo'}</div>
                <div>• {lang === 'zh' ? '微信公众号、RSS 订阅' : 'WeChat Official Accounts, RSS'}</div>
                <div>• {lang === 'zh' ? '全网搜索、网页阅读' : 'Web Search, Page Reading'}</div>
                <div>• {lang === 'zh' ? '小宇宙播客' : 'Xiaoyuzhou Podcast'}</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '特色功能：' : 'Highlights:'}</strong>
              <div style={{ marginTop: '4px' }}>
                {lang === 'zh' ? (
                  <>
                    • 💰 完全免费，所有工具开源<br/>
                    • 🔒 隐私安全，Cookie 只存本地<br/>
                    • 🔄 持续更新，自动追踪平台变化<br/>
                    • 🤖 兼容所有 Agent，一键安装
                  </>
                ) : (
                  <>
                    • 💰 Completely free, all tools open source<br/>
                    • 🔒 Privacy-first — cookies stored locally only<br/>
                    • 🔄 Continuously updated, auto-tracks platform changes<br/>
                    • 🤖 Compatible with all Agents, one-click install
                  </>
                )}
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '安装方式：' : 'Installation:'}</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                {lang === 'zh'
                  ? '💬 告诉 DeepBot："帮我安装 Agent Reach：https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md"'
                  : '💬 Tell DeepBot: "Install Agent Reach for me: https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md"'}
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px' }}>
                {lang === 'zh' ? '或访问：' : 'Or visit: '}<a 
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
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>{lang === 'zh' ? 'MCPorter - MCP 协议工具包' : 'MCPorter - MCP Protocol Toolkit'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              {lang === 'zh' ? 'TypeScript 运行时和 CLI 工具，让 AI Agent 轻松调用各种 MCP 服务器' : 'TypeScript runtime and CLI tool for AI Agents to easily invoke various MCP servers'}
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '核心功能：' : 'Core Features:'}</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• {lang === 'zh' ? '零配置自动发现 MCP 服务器' : 'Zero-config auto-discovery of MCP servers'}</div>
                <div>• {lang === 'zh' ? '一键生成 CLI 工具' : 'One-click CLI tool generation'}</div>
                <div>• {lang === 'zh' ? 'TypeScript 类型安全调用' : 'Type-safe TypeScript invocations'}</div>
                <div>• {lang === 'zh' ? 'OAuth 和 stdio 传输支持' : 'OAuth and stdio transport support'}</div>
                <div>• {lang === 'zh' ? '友好的组合式 API' : 'Composable API design'}</div>
                <div>• {lang === 'zh' ? '临时连接和持久化配置' : 'Ephemeral and persistent connections'}</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '支持的 MCP 服务：' : 'Supported MCP Services:'}</strong>
              <div style={{ marginTop: '4px' }}>
                {lang === 'zh' ? (
                  <>
                    • Linear、Vercel、Chrome DevTools<br/>
                    • Context7、Firecrawl、小红书<br/>
                    • 抖音、LinkedIn 等数十种服务<br/>
                    • 自动兼容 Cursor/Claude/VS Code 配置
                  </>
                ) : (
                  <>
                    • Linear, Vercel, Chrome DevTools<br/>
                    • Context7, Firecrawl, Xiaohongshu<br/>
                    • Douyin, LinkedIn, and dozens more<br/>
                    • Auto-compatible with Cursor/Claude/VS Code configs
                  </>
                )}
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '安装方式：' : 'Installation:'}</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                {lang === 'zh'
                  ? '💬 告诉 DeepBot："帮我安装 mcporter：npm install -g mcporter"'
                  : '💬 Tell DeepBot: "Install mcporter for me: npm install -g mcporter"'}
              </div>
              <div style={{ marginTop: '4px', fontSize: '12px' }}>
                {lang === 'zh' ? '或访问：' : 'Or visit: '}<a 
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
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>{lang === 'zh' ? 'Tavily Search - AI 搜索引擎 Skill' : 'Tavily Search - AI Search Engine Skill'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              {lang === 'zh'
                ? '专为 AI Agent 设计的搜索引擎，提供高质量、结构化的搜索结果，让 DeepBot 获得强大的实时信息检索能力'
                : 'A search engine designed for AI Agents, delivering high-quality structured results for powerful real-time information retrieval'}
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '核心优势：' : 'Key Advantages:'}</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• {lang === 'zh' ? '专为 AI 优化的搜索结果' : 'Search results optimized for AI'}</div>
                <div>• {lang === 'zh' ? '返回结构化数据，减少幻觉' : 'Structured data, fewer hallucinations'}</div>
                <div>• {lang === 'zh' ? '支持深度搜索和快速搜索' : 'Deep search and quick search modes'}</div>
                <div>• {lang === 'zh' ? '免费额度足够日常使用' : 'Free tier sufficient for daily use'}</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '安装方式：' : 'Installation:'}</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontSize: '12px',
                lineHeight: '1.8'
              }}>
                {lang === 'zh' ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: '6px' }}>
                      <strong>Step 1:</strong> Click the <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> button in chat, search for "Tavily Search", and install
                    </div>
                    <div style={{ marginBottom: '6px' }}>
                      <strong>Step 2:</strong> Go to <a 
                        href="https://app.tavily.com/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: 'var(--settings-accent)', textDecoration: 'none' }}
                      >
                        app.tavily.com
                      </a> to sign up and get a free API Key
                    </div>
                    <div>
                      <strong>Step 3:</strong> 💬 Tell DeepBot: "Configure the Tavily Search skill API Key, my API Key is [paste your API Key]"
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ marginRight: '8px', fontSize: '16px' }}>📧</span>
              <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>{lang === 'zh' ? 'imap-smtp-email-chinese - 中文邮件收发 Skill' : 'imap-smtp-email-chinese - Email Skill'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              {lang === 'zh'
                ? '支持 IMAP 收件、SMTP 发件，完美兼容 QQ、163、Gmail 等主流邮箱，中文友好'
                : 'IMAP receiving and SMTP sending, compatible with QQ, 163, Gmail and other major email providers'}
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '核心功能：' : 'Core Features:'}</strong>
              <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                <div>• {lang === 'zh' ? '发送邮件（支持附件）' : 'Send emails (with attachments)'}</div>
                <div>• {lang === 'zh' ? '读取收件箱' : 'Read inbox'}</div>
                <div>• {lang === 'zh' ? '搜索邮件' : 'Search emails'}</div>
                <div>• {lang === 'zh' ? '支持 HTML 格式' : 'HTML format support'}</div>
              </div>
            </div>
            <div style={{ marginLeft: '28px', marginTop: '8px' }}>
              <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '安装方式：' : 'Installation:'}</strong>
              <div style={{ 
                marginTop: '4px',
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontSize: '12px',
                lineHeight: '1.8'
              }}>
                {lang === 'zh' ? (
                  <>
                    <div style={{ marginBottom: '6px' }}>
                      <strong>第一步：</strong>打开聊天界面的 <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> 按钮，搜索「imap-smtp-email-chinese」，点击安装
                    </div>
                    <div>
                      <strong>第二步：</strong>💬 告诉 DeepBot："按照 imap-smtp-email-chinese skill 的说明配置好邮箱信息"
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: '6px' }}>
                      <strong>Step 1:</strong> Click the <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>[skill]</code> button in chat, search for "imap-smtp-email-chinese", and install
                    </div>
                    <div>
                      <strong>Step 2:</strong> 💬 Tell DeepBot: "Configure the imap-smtp-email-chinese skill with my email settings"
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 记忆使用指南 */}
      <div id="memory-guide" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>🧠</span>
          {lang === 'zh' ? '记忆使用指南' : 'Memory Guide'}
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
              <span style={{ fontWeight: '600', color: 'var(--settings-text)', fontSize: '14px' }}>{lang === 'zh' ? '什么是记忆？' : 'What is Memory?'}</span>
            </div>
            <div style={{ marginLeft: '28px', marginBottom: '8px' }}>
              {lang === 'zh'
                ? '记忆是 DeepBot 的长期存储系统，用于记住用户的偏好、习惯、角色定义和重要信息。不同于对话历史（会话结束后清空），记忆会永久保存，让 AI 越用越懂你。'
                : 'Memory is DeepBot\'s long-term storage system for remembering your preferences, habits, role definitions, and important information. Unlike chat history (cleared after each session), memories are saved permanently, so the AI gets to know you better over time.'}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '记忆分类：' : 'Memory Categories:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  • <strong>角色</strong>：AI 的专业角色（如"你是法律专家"、"你是数据分析师"）<br/>
                  • <strong>用户习惯</strong>：个人偏好、工作流程、常用工具（如"我喜欢简洁的代码风格"）<br/>
                  • <strong>错误总结</strong>：之前遇到的错误和解决方案（避免重复犯错）<br/>
                  • <strong>备忘事项</strong>：其他重要信息（如"项目截止日期是下周五"）
                </>
              ) : (
                <>
                  • <strong>Roles</strong>: AI professional roles (e.g. "You are a legal expert", "You are a data analyst")<br/>
                  • <strong>User Habits</strong>: Personal preferences, workflows, favorite tools (e.g. "I prefer clean code style")<br/>
                  • <strong>Error Summaries</strong>: Past errors and solutions (to avoid repeating mistakes)<br/>
                  • <strong>Notes</strong>: Other important info (e.g. "Project deadline is next Friday")
                </>
              )}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '如何添加记忆：' : 'How to Add Memories:'}</strong>
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
                {lang === 'zh' ? (
                  <>
                    💬 "记住：我喜欢用 VS Code 编辑器"<br/>
                    💬 "记住：你是一个前端开发专家"<br/>
                    💬 "记住：当我要读取 PDF 时，使用 markitdown 命令"<br/>
                    💬 "记住：项目部署在 ~/work/myproject 目录"
                  </>
                ) : (
                  <>
                    💬 "Remember: I prefer VS Code as my editor"<br/>
                    💬 "Remember: You are a frontend development expert"<br/>
                    💬 "Remember: Use the markitdown command when I need to read PDFs"<br/>
                    💬 "Remember: The project is deployed at ~/work/myproject"
                  </>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--settings-text)' }}>
                {lang === 'zh' ? 'AI 会自动提炼关键信息并分类存储' : 'The AI will automatically extract key information and categorize it'}
              </div>
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '查看记忆：' : 'View Memories:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  • 使用指令：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>/memory</code><br/>
                  • 或直接问：<code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"你记住了什么？"</code>
                </>
              ) : (
                <>
                  • Use the command: <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>/memory</code><br/>
                  • Or just ask: <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>"What do you remember?"</code>
                </>
              )}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '多 Tab 记忆管理：' : 'Multi-Tab Memory Management:'}</strong>
            <div style={{ marginTop: '6px', lineHeight: '1.8' }}>
              {lang === 'zh' ? (
                <>
                  • <strong>主记忆</strong>：默认 Tab 使用，存储通用信息<br/>
                  • <strong>Tab 独立记忆</strong>：每个 Tab 可以有自己的记忆（如"法律专家"Tab 有专门的法律知识）<br/>
                  • <strong>记忆合并</strong>：可以将其他 Tab 的记忆合并到当前 Tab
                </>
              ) : (
                <>
                  • <strong>Main Memory</strong>: Used by the default tab, stores general information<br/>
                  • <strong>Tab-Specific Memory</strong>: Each tab can have its own memory (e.g. a "Legal Expert" tab with specialized legal knowledge)<br/>
                  • <strong>Memory Merge</strong>: Merge memories from other tabs into the current one
                </>
              )}
            </div>
          </div>

          <div style={{ marginLeft: '28px', marginBottom: '12px' }}>
            <strong style={{ color: 'var(--settings-text)' }}>{lang === 'zh' ? '合并记忆：' : 'Merge Memories:'}</strong>
            <div style={{ 
              marginTop: '6px',
              padding: '10px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '6px',
              lineHeight: '1.8'
            }}>
              <div style={{ marginBottom: '8px' }}>
                {lang === 'zh' ? '当你想让当前 Tab 继承其他 Tab 的经验时，可以合并记忆：' : 'When you want the current tab to inherit experience from another tab, merge their memories:'}
              </div>
              <div style={{ 
                padding: '8px',
                background: 'rgba(0,0,0,0.1)',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginBottom: '8px'
              }}>
                {lang === 'zh' ? (
                  <>
                    💬 "合并主记忆到当前 Tab"<br/>
                    💬 "合并'法律专家'Tab 的记忆"<br/>
                    💬 "将'数据分析师'的记忆合并过来"
                  </>
                ) : (
                  <>
                    💬 "Merge main memory into this tab"<br/>
                    💬 "Merge the 'Legal Expert' tab's memory"<br/>
                    💬 "Bring over the 'Data Analyst' memories"
                  </>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--settings-text)' }}>
                {lang === 'zh' ? 'AI 会智能合并两边的记忆，自动解决冲突和去重' : 'The AI will intelligently merge memories from both sides, resolving conflicts and removing duplicates'}
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
            💡 {lang === 'zh' ? '提示：记忆文件存储在' : 'Tip: Memory files are stored in'} <code style={{ padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px', fontFamily: 'monospace' }}>~/.deepbot/memory/</code> {lang === 'zh' ? '目录，可以手动编辑' : 'and can be edited manually'}
          </div>
        </div>
      </div>

      {/* 使用技巧 */}
      <div id="tips" style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>💡</span>
          {lang === 'zh' ? '使用技巧' : 'Tips & Tricks'}
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
            { icon: '👥', text: lang === 'zh' ? '多 Tab 协作：每个 Tab 可以有独立的角色和记忆，支持跨 Tab 通信' : 'Multi-Tab Collaboration: Each tab can have its own role and memory, with cross-tab communication' },
            { icon: '🧠', text: lang === 'zh' ? '长期记忆：告诉 AI "记住：..."，它会永久记住用户偏好和习惯' : 'Long-Term Memory: Tell the AI "Remember: ..." and it will permanently store your preferences' },
            { icon: '⏰', text: lang === 'zh' ? '智能定时任务：说"每天早上 9 点..."，AI 会自动创建和管理定时任务' : 'Smart Scheduling: Say "Every day at 9 AM..." and the AI will create and manage scheduled tasks' },
            { icon: '🎯', text: lang === 'zh' ? '技能扩展系统：使用 Skill Manager 安装技能包，无限扩展 AI 能力' : 'Skill Extensions: Use the Skill Manager to install skill packages and extend AI capabilities' },
            { icon: '🔒', text: lang === 'zh' ? '安全沙箱：所有操作都在工作目录白名单内，确保系统安全' : 'Security Sandbox: All operations stay within whitelisted directories to keep your system safe' },
            { icon: '📱', text: lang === 'zh' ? '跨平台通讯：配置飞书等平台，实现 AI 与外部系统的无缝交互' : 'Cross-Platform Messaging: Connect Lark and other platforms for seamless AI integration' },
            { icon: '🎨', text: lang === 'zh' ? '自然语言交互：直接说出需求，无需记忆复杂命令' : 'Natural Language: Just describe what you need — no complex commands to memorize' },
            { icon: '🔄', text: lang === 'zh' ? '上下文理解：AI 会记住对话历史，支持连续对话' : 'Context Awareness: The AI remembers conversation history for continuous dialogue' },
            { icon: '📋', text: lang === 'zh' ? '批量操作：一次性处理多个文件或任务' : 'Batch Operations: Process multiple files or tasks at once' },
            { icon: '⚡', text: lang === 'zh' ? '快速迭代：AI 会根据反馈不断优化执行方案' : 'Fast Iteration: The AI continuously refines its approach based on your feedback' },
            { icon: '🔍', text: lang === 'zh' ? '错误诊断：遇到问题时，AI 会主动分析并提供解决方案' : 'Error Diagnosis: When issues arise, the AI proactively analyzes and offers solutions' },
            { icon: '🎪', text: lang === 'zh' ? '精确控制：使用具体的路径和参数获得准确结果' : 'Precise Control: Use specific paths and parameters for accurate results' },
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
          {lang === 'zh' ? '示例对话' : 'Example Conversations'}
        </h4>
        <div style={{ 
          padding: '12px',
          background: 'var(--settings-input-bg)',
          borderRadius: '8px',
          display: 'grid', 
          gap: '8px', 
          fontSize: '13px' 
        }}>
          {(lang === 'zh' ? [
            '帮我整理桌面上的文件，把图片放到 Pictures 文件夹',
            '每天下午 5 点提醒我写日报',
            '记住：我喜欢简洁的代码风格，不要写太多注释',
            '打开百度搜索"人工智能最新进展"，截图前 3 条结果',
            '分析 ~/Documents/sales.csv 文件，生成销售趋势图表',
            '创建一个 Python 脚本，每小时自动备份 ~/work 目录到云盘',
            '搜索最新的 React 19 新特性，总结成 Markdown 文档保存',
            '监控 CPU 使用率，超过 80% 时发送飞书通知给我',
          ] : [
            'Organize the files on my desktop, move images to the Pictures folder',
            'Remind me to write my daily report every day at 5 PM',
            'Remember: I prefer clean code style, don\'t write too many comments',
            'Search Google for "latest AI breakthroughs" and screenshot the top 3 results',
            'Analyze ~/Documents/sales.csv and generate a sales trend chart',
            'Create a Python script to auto-backup ~/work to cloud storage every hour',
            'Search for the latest React 19 features and save a Markdown summary',
            'Monitor CPU usage and send me a Lark notification when it exceeds 80%',
          ]).map((text, index) => (
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
          🎯 {lang === 'zh' ? '关闭此页面，在聊天框输入你的需求即可开始使用' : 'Close this page and type your request in the chat box to get started'}
        </div>
        <div style={{ color: 'var(--settings-text-dim)', fontSize: '12px' }}>
          {lang === 'zh' ? '随时问 AI "你能做什么？" 或 "如何使用某个功能？"' : 'Ask the AI "What can you do?" or "How do I use this feature?" anytime'}
        </div>
      </div>
    </div>
  );
}
