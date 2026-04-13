/**
 * API Key 获取帮助模态框
 * 
 * 在模型配置、图片生成工具、网络搜索工具中复用
 */

import React from 'react';
import { X } from 'lucide-react';
import qrcodeImg from '../../assets/qrcode.png';
import { getLanguage } from '../../i18n';

interface ApiKeyHelpModalProps {
  onClose: () => void;
}

export function ApiKeyHelpModal({ onClose }: ApiKeyHelpModalProps) {
  const lang = getLanguage();

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-container" onClick={(e) => e.stopPropagation()} style={{ width: '300px', maxWidth: '300px', height: 'auto', maxHeight: '70vh' }}>
        <div className="settings-header">
          <h2 className="settings-title" style={{ fontSize: '13px' }}>{lang === 'zh' ? '获取 API KEY' : 'Get API KEY'}</h2>
          <button className="settings-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '14px 16px', overflowY: 'auto' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--settings-text)', marginBottom: '4px' }}>{lang === 'zh' ? '方式一：扫码获取 DeepBot Token' : 'Option 1: Scan QR Code for DeepBot Token'}</div>
            <div style={{ fontSize: '11px', color: 'var(--settings-text-dim)', marginBottom: '8px' }}>{lang === 'zh' ? '选择 DeepBot 提供商时，扫码添加微信获取 Token' : 'When using DeepBot provider, scan the QR code to add WeChat and get a Token'}</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img src={qrcodeImg} alt={lang === 'zh' ? '扫码添加微信' : 'Scan QR code to add WeChat'} style={{ width: '140px', height: '140px', borderRadius: '6px' }} />
            </div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--settings-border)', margin: '12px 0' }} />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--settings-text)', marginBottom: '4px' }}>{lang === 'zh' ? '方式二：自行申请（以 Qwen 为例）' : 'Option 2: Apply Yourself (e.g. Qwen)'}</div>
            <div style={{ fontSize: '11px', color: 'var(--settings-text-dim)', lineHeight: '1.8' }}>
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
                  3. Create an API-KEY and copy the key<br/>
                  4. Paste it here and save
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
