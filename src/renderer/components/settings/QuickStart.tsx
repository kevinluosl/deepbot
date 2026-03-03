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
              前往「模型配置」→「主大模型」，配置通义千问、OpenAI 或 Claude 的 API 密钥
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
              前往「工具配置」→「图片生成工具」，配置通义千问或 Gemini 的 API 密钥，启用 AI 绘图功能
            </div>
          </div>
          <div>
            <span style={{ fontWeight: '600', color: 'var(--settings-text)' }}>4. 配置网络搜索（可选）</span>
            <div style={{ marginLeft: '16px', marginTop: '4px' }}>
              前往「工具配置」→「网络搜索工具」，配置通义千问或 Gemini 的 API 密钥，启用实时信息查询
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
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--settings-text)' }}>
            <span style={{ marginRight: '8px' }}>🐍</span>
            <span style={{ fontWeight: '600', marginRight: '6px' }}>Python（可选）：</span>
            <span style={{ color: 'var(--settings-text-dim)' }}>用于执行 Python 脚本和 Skill，建议 3.8+</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--settings-text)' }}>
            <span style={{ marginRight: '8px' }}>🌐</span>
            <span style={{ fontWeight: '600', marginRight: '6px' }}>Chrome（可选）：</span>
            <span style={{ color: 'var(--settings-text-dim)' }}>浏览器工具需要系统已安装 Chrome</span>
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
        </h4>
        <div style={{ fontSize: '13px', color: 'var(--settings-text-dim)' }}>
          <div style={{ marginBottom: '6px' }}>
            输入 
            <code style={{ 
              margin: '0 4px',
              padding: '2px 8px', 
              background: 'var(--settings-input-bg)', 
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: '600',
              color: 'var(--settings-accent)'
            }}>
              /new
            </code>
            清空当前会话历史，开始新对话
          </div>
        </div>
      </div>

      {/* 使用技巧 */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--settings-text)', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>💡</span>
          使用技巧
        </h4>
        <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
          {[
            { icon: '👥', text: '多 Tab 协作：每个 Tab 可以有独立的角色和记忆' },
            { icon: '🧠', text: '长期记忆：告诉 AI "记住：..."，它会永久记住' },
            { icon: '⏰', text: '定时任务：说"每天早上 9 点..."，AI 会自动创建' },
            { icon: '🎯', text: '技能扩展：使用 Skill Manager 安装技能包' },
            { icon: '🔒', text: '安全限制：所有操作都在工作目录白名单内' },
            { icon: '📱', text: '外部通讯：配置飞书等平台，实现跨平台交互' },
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
