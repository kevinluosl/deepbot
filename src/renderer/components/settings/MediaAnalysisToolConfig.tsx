/**
 * 多媒体分析工具配置页面
 * 仅需选择模型，API Key 复用主模型（DeepBot 供应商）
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { showToast } from '../../utils/toast';
import { getLanguage } from '../../i18n';

// 预设模型列表
const MODEL_OPTIONS = [
  { id: 'qwen3.5-35b-a3b', desc: '图片 + 视频' },
  { id: 'qwen3-vl-30b-a3b-instruct', desc: '仅图片' },
  { id: 'qwen3-vl-8b-instruct', desc: '仅图片' },
];

interface MediaAnalysisToolConfigProps {
  onClose?: () => void;
}

export function MediaAnalysisToolConfig({ onClose }: MediaAnalysisToolConfigProps) {
  const lang = getLanguage();
  const [model, setModel] = useState('qwen3.5-35b-a3b');
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const hasLoadedRef = React.useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await api.getMediaAnalysisToolConfig();
      if (result.success && result.config?.model) {
        setModel(result.config.model);
      }
    } catch (error) {
      console.error('加载多媒体分析工具配置失败:', error);
    }
  };

  const handleSave = async () => {
    if (!model.trim()) {
      showToast('error', lang === 'zh' ? '请选择或输入模型' : 'Please select or enter a model');
      return;
    }

    setIsSaving(true);
    try {
      const result = await api.saveMediaAnalysisToolConfig({ model: model.trim() });
      if (result.success) {
        showToast('success', lang === 'zh' ? '✅ 保存成功！' : '✅ Saved successfully!');
      } else {
        showToast('error', result.error || (lang === 'zh' ? '保存失败' : 'Save failed'));
      }
    } catch (error) {
      showToast('error', lang === 'zh' ? '保存失败，请重试' : 'Save failed, please retry');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-base font-medium text-gray-900 mb-2">
          {lang === 'zh' ? '图片/视频分析工具配置' : 'Image/Video Analysis Tool Config'}
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          {lang === 'zh'
            ? '分析图片和视频内容，支持内容描述、文字识别、场景理解等。'
            : 'Analyze image and video content, supporting content description, text recognition, scene understanding, etc.'}
        </p>

        {/* 说明 */}
        <div style={{
          padding: '12px 14px',
          background: 'rgba(59, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          borderRadius: '6px',
          fontSize: '12px',
          color: 'var(--settings-text-dim)',
          lineHeight: '1.8',
          marginBottom: '16px',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--settings-accent)', marginBottom: '4px' }}>
            {lang === 'zh' ? '💡 使用说明' : '💡 Usage Notes'}
          </div>
          {lang === 'zh' ? (
            <>
              • 此工具复用主模型的 API Key，仅在主模型为 <strong>DeepBot</strong> 供应商时可用<br />
              • 支持图片格式：jpg、png、gif、webp、bmp、tiff<br />
              • 支持视频格式：mp4、mov、avi、mkv、webm
            </>
          ) : (
            <>
              • This tool reuses the main model's API Key, only available when the main model provider is <strong>DeepBot</strong><br />
              • Supported image formats: jpg, png, gif, webp, bmp, tiff<br />
              • Supported video formats: mp4, mov, avi, mkv, webm
            </>
          )}
        </div>
      </div>

      {/* 模型选择（和主模型 DeepBot 供应商一样的 input + 下拉控件） */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {lang === 'zh' ? '分析模型' : 'Analysis Model'} <span className="text-red-500">*</span>
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            placeholder="qwen3.5-35b-a3b"
            className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
              cursor: 'pointer', color: 'var(--settings-text-dim, #999)', fontSize: '10px',
              pointerEvents: 'auto',
            }}
          >▼</span>
          {showDropdown && (
            <ul style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: 'var(--settings-bg, #fff)', border: '1px solid var(--settings-border, #d1d5db)',
              borderTop: 'none', borderRadius: '0 0 6px 6px', maxHeight: '200px', overflowY: 'auto',
              listStyle: 'none', margin: 0, padding: '4px 0',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
              {MODEL_OPTIONS.map(opt => (
                <li key={opt.id}
                  onMouseDown={() => setModel(opt.id)}
                  style={{
                    padding: '6px 12px', cursor: 'pointer', fontSize: '13px',
                    color: model === opt.id ? 'var(--settings-accent, #3b82f6)' : 'var(--settings-text, #333)',
                    fontWeight: model === opt.id ? 600 : 400,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--settings-bg-light, rgba(59,130,246,0.08))'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {opt.id}<span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--settings-text-dim, #999)' }}>({opt.desc})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {lang === 'zh'
            ? '从列表选择或输入自定义模型 ID'
            : 'Select from the list or enter a custom model ID'}
        </p>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end pt-4 border-t">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
        >
          {isSaving
            ? (lang === 'zh' ? '保存中...' : 'Saving...')
            : (lang === 'zh' ? '保存配置' : 'Save Config')}
        </button>
      </div>
    </div>
  );
}
