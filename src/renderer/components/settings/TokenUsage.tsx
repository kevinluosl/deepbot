/**
 * Token 用量统计页面
 * 
 * 功能：
 * - 显示选定时间段内各模型的 token 用量
 * - 支持快捷按钮（当天、最近一周、最近30天）
 * - 支持自定义日期范围选择（最长1年）
 */

import React, { useState, useEffect, useCallback, useContext } from 'react';
import { Calendar, CalendarDays, CalendarRange, Search, BarChart3, Image } from 'lucide-react';
import { api } from '../../api';
import { t, getLanguage } from '../../i18n';
import { ThemeContext } from '../../App';

interface TokenUsageRecord {
  date: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

/** 图片用量记录 */
interface ImageUsageRecord {
  date: string;
  provider: string;
  count: number;
}

/** 按模型汇总的数据 */
interface ModelSummary {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
}

/** 按提供商汇总的图片用量 */
interface ProviderImageSummary {
  provider: string;
  count: number;
}

/** 格式化日期为 YYYY-MM-DD */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 格式化 token 数量（K/M 单位） */
function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(1) + 'M';
  }
  if (count >= 1_000) {
    return (count / 1_000).toFixed(1) + 'K';
  }
  return count.toLocaleString();
}

export function TokenUsage() {
  const { mode: themeMode } = useContext(ThemeContext);
  const lang = getLanguage();
  const [startDate, setStartDate] = useState<string>(() => formatDate(new Date()));
  const [endDate, setEndDate] = useState<string>(() => formatDate(new Date()));
  const [records, setRecords] = useState<TokenUsageRecord[]>([]);
  const [imageRecords, setImageRecords] = useState<ImageUsageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeQuickBtn, setActiveQuickBtn] = useState<'today' | 'week' | 'month' | ''>('today');
  const [imageQuota, setImageQuota] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'token' | 'image'>('token');

  // 加载图片配额状态
  useEffect(() => {
    api.getImageQuotaStatus().then(result => {
      if (result.success) setImageQuota(result.quota);
    }).catch(() => {});
  }, []);

  /** 查询 token 用量 */
  const fetchData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const result = await api.getTokenUsage(start, end);
      if (result.success) {
        setRecords(result.records || []);
      } else {
        setRecords([]);
      }
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 查询图片用量 */
  const fetchImageData = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const result = await api.getImageUsage(start, end);
      if (result.success) {
        setImageRecords(result.records || []);
      } else {
        setImageRecords([]);
      }
    } catch {
      setImageRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 初始加载（当天数据） */
  useEffect(() => {
    fetchData(startDate, endDate);
    fetchImageData(startDate, endDate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 快捷按钮：当天 */
  const handleToday = () => {
    const today = formatDate(new Date());
    setStartDate(today);
    setEndDate(today);
    setActiveQuickBtn('today');
    fetchData(today, today);
    fetchImageData(today, today);
  };

  /** 快捷按钮：最近一周 */
  const handleWeek = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const s = formatDate(start);
    const e = formatDate(end);
    setStartDate(s);
    setEndDate(e);
    setActiveQuickBtn('week');
    fetchData(s, e);
    fetchImageData(s, e);
  };

  /** 快捷按钮：最近30天 */
  const handleMonth = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    const s = formatDate(start);
    const e = formatDate(end);
    setStartDate(s);
    setEndDate(e);
    setActiveQuickBtn('month');
    fetchData(s, e);
    fetchImageData(s, e);
  };

  /** 自定义日期查询 */
  const handleSearch = () => {
    // 校验日期范围不超过1年
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 365) {
      alert(lang === 'zh' ? '日期范围不能超过1年' : 'Date range cannot exceed 1 year');
      return;
    }
    if (diffDays < 0) {
      alert(lang === 'zh' ? '开始日期不能晚于结束日期' : 'Start date cannot be after end date');
      return;
    }
    setActiveQuickBtn('');
    fetchData(startDate, endDate);
    fetchImageData(startDate, endDate);
  };

  /** 按模型汇总数据 */
  const modelSummaries: ModelSummary[] = React.useMemo(() => {
    const map = new Map<string, ModelSummary>();
    for (const record of records) {
      const existing = map.get(record.modelId);
      if (existing) {
        existing.inputTokens += record.inputTokens;
        existing.outputTokens += record.outputTokens;
        existing.totalTokens += record.inputTokens + record.outputTokens;
        existing.requestCount += record.requestCount;
      } else {
        map.set(record.modelId, {
          modelId: record.modelId,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          totalTokens: record.inputTokens + record.outputTokens,
          requestCount: record.requestCount,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalTokens - a.totalTokens);
  }, [records]);

  /** 按提供商汇总图片用量 */
  const providerImageSummaries: ProviderImageSummary[] = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const record of imageRecords) {
      const existing = map.get(record.provider) || 0;
      map.set(record.provider, existing + record.count);
    }
    return Array.from(map.entries())
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count);
  }, [imageRecords]);

  /** 总计 */
  const totals = React.useMemo(() => {
    return modelSummaries.reduce(
      (acc, item) => ({
        inputTokens: acc.inputTokens + item.inputTokens,
        outputTokens: acc.outputTokens + item.outputTokens,
        totalTokens: acc.totalTokens + item.totalTokens,
        requestCount: acc.requestCount + item.requestCount,
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
    );
  }, [modelSummaries]);

  /** 图片用量总计 */
  const imageTotals = React.useMemo(() => {
    return providerImageSummaries.reduce((acc, item) => acc + item.count, 0);
  }, [providerImageSummaries]);

  return (
    <div style={{ padding: '24px', maxWidth: '800px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--settings-text)', margin: 0 }}>
          {t('settings.tokenUsage')}
        </h3>
        {/* 标签页切换 - SVG 按钮样式 */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setActiveTab('token')}
            className={`skill-icon-button tab-toggle-button ${activeTab === 'token' ? 'tab-toggle-active' : ''}`}
            title={lang === 'zh' ? '模型用量' : 'Token Usage'}
            style={{ gap: '4px' }}
          >
            <BarChart3 size={14} />
            <span style={{ fontSize: '12px' }}>{lang === 'zh' ? '模型用量' : 'Token'}</span>
          </button>
          <button
            onClick={() => setActiveTab('image')}
            className={`skill-icon-button tab-toggle-button ${activeTab === 'image' ? 'tab-toggle-active' : ''}`}
            title={lang === 'zh' ? '图片用量' : 'Image Usage'}
            style={{ gap: '4px' }}
          >
            <Image size={14} />
            <span style={{ fontSize: '12px' }}>{lang === 'zh' ? '图片用量' : 'Image'}</span>
          </button>
        </div>
      </div>

      {/* 图片生成配额 - 隐藏 */}
      {false && imageQuota && (
        <div style={{
          marginBottom: '20px',
          padding: '12px 14px',
          background: 'var(--settings-input-bg)',
          border: '1px solid var(--settings-border)',
          borderRadius: '8px',
          fontSize: '13px',
          color: 'var(--settings-text-dim)',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--settings-text)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🎨 {lang === 'zh' ? '图片生成配额' : 'Image Generation Quota'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--settings-text-dim)' }}>{lang === 'zh' ? '已使用 / 总配额' : 'Used / Total'}</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: imageQuota.exhausted ? '#ef4444' : 'var(--settings-text)' }}>
                {imageQuota.unlimited
                  ? `${imageQuota.used} / ∞`
                  : `${imageQuota.used} / ${imageQuota.totalAllowed}`
                }
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--settings-text-dim)' }}>{lang === 'zh' ? '有效期' : 'Validity'}</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: imageQuota.expired ? '#ef4444' : 'var(--settings-text)' }}>
                {!imageQuota.expiryDate
                  ? (lang === 'zh' ? '永久' : 'Permanent')
                  : imageQuota.expiryDate + (imageQuota.expired ? (lang === 'zh' ? '（已过期）' : ' (Expired)') : '')
                }
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--settings-text-dim)' }}>{lang === 'zh' ? '状态' : 'Status'}</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: (imageQuota.expired || imageQuota.exhausted) ? '#ef4444' : '#22c55e' }}>
                {imageQuota.expired
                  ? (lang === 'zh' ? '已过期' : 'Expired')
                  : imageQuota.exhausted
                    ? (lang === 'zh' ? '已用完' : 'Exhausted')
                    : (lang === 'zh' ? '正常' : 'Active')}
              </div>
            </div>
          </div>
        </div>
      )}
      {false && imageQuota === null && (
        <div style={{
          marginBottom: '20px',
          padding: '10px 14px',
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#ef4444',
        }}>
          🎨 {lang === 'zh' ? '图片生成 API Key 无效（缺少配额信息）' : 'Image generation API Key invalid (missing quota info)'}
        </div>
      )}

      {/* 快捷按钮 + 日期选择 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={handleToday} className={`skill-icon-button ${activeQuickBtn === 'today' ? 'skill-icon-button-accent' : ''}`} style={{ gap: '4px' }}>
          <Calendar size={13} />
          <span style={{ fontSize: '12px' }}>{lang === 'zh' ? '当天' : 'Today'}</span>
        </button>
        <button onClick={handleWeek} className={`skill-icon-button ${activeQuickBtn === 'week' ? 'skill-icon-button-accent' : ''}`} style={{ gap: '4px' }}>
          <CalendarDays size={13} />
          <span style={{ fontSize: '12px' }}>{lang === 'zh' ? '最近一周' : '7 Days'}</span>
        </button>
        <button onClick={handleMonth} className={`skill-icon-button ${activeQuickBtn === 'month' ? 'skill-icon-button-accent' : ''}`} style={{ gap: '4px' }}>
          <CalendarRange size={13} />
          <span style={{ fontSize: '12px' }}>{lang === 'zh' ? '最近30天' : '30 Days'}</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ ...dateInputStyle, colorScheme: themeMode === 'dark' ? 'dark' : 'light' }}
          />
          <span style={{ color: 'var(--settings-text-dim)', fontSize: '12px' }}>{lang === 'zh' ? '至' : 'to'}</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ ...dateInputStyle, colorScheme: themeMode === 'dark' ? 'dark' : 'light' }}
          />
          <button onClick={handleSearch} className="skill-icon-button">
            <Search size={14} />
          </button>
        </div>
      </div>

      {/* 数据表格 - 模型用量 */}
      {activeTab === 'token' && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--settings-text-dim)' }}>
              {lang === 'zh' ? '加载中...' : 'Loading...'}
            </div>
          ) : modelSummaries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--settings-text-dim)' }}>
              {lang === 'zh' ? '暂无数据' : 'No data'}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--settings-border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--settings-bg-secondary, rgba(0,0,0,0.03))' }}>
                    <th style={thStyle}>{lang === 'zh' ? '模型' : 'Model'}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{lang === 'zh' ? '字符消耗' : 'Characters'}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{lang === 'zh' ? '调用轮次' : 'Turns'}</th>
                  </tr>
                </thead>
                <tbody>
                  {modelSummaries.map((item) => (
                    <tr key={item.modelId} style={{ borderTop: '1px solid var(--settings-border)' }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 500, color: 'var(--settings-text)' }}>{item.modelId}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{formatTokenCount(item.totalTokens)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatTokenCount(item.requestCount)}</td>
                    </tr>
                  ))}
                </tbody>
                {/* 总计行 */}
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--settings-border)', background: 'var(--settings-bg-secondary, rgba(0,0,0,0.03))' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{lang === 'zh' ? '总计' : 'Total'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{formatTokenCount(totals.totalTokens)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{formatTokenCount(totals.requestCount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* 说明 */}
          <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--settings-text-dim)' }}>
            {lang === 'zh' 
              ? <>统计数据为实际消耗的字符数（中文=1，英文=0.5）。<span style={{ color: 'var(--settings-accent)', fontWeight: 500 }}>Token 因每个模型计算方式不一致，实际消耗以模型提供商账单为准。</span></>
              : <>Statistics show actual characters consumed (CJK=1, English=0.5). <span style={{ color: 'var(--settings-accent)', fontWeight: 500 }}>Token usage varies by model tokenizer. Refer to your provider's billing for actual token consumption.</span></>}
          </p>
        </>
      )}

      {/* 数据表格 - 图片用量 */}
      {activeTab === 'image' && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--settings-text-dim)' }}>
              {lang === 'zh' ? '加载中...' : 'Loading...'}
            </div>
          ) : providerImageSummaries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--settings-text-dim)' }}>
              {lang === 'zh' ? '暂无数据' : 'No data'}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--settings-border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--settings-bg-secondary, rgba(0,0,0,0.03))' }}>
                    <th style={thStyle}>{lang === 'zh' ? '提供商' : 'Provider'}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{lang === 'zh' ? '生成数量' : 'Count'}</th>
                  </tr>
                </thead>
                <tbody>
                  {providerImageSummaries.map((item) => (
                    <tr key={item.provider} style={{ borderTop: '1px solid var(--settings-border)' }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 500, color: 'var(--settings-text)' }}>{item.provider}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{item.count}</td>
                    </tr>
                  ))}
                </tbody>
                {/* 总计行 */}
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--settings-border)', background: 'var(--settings-bg-secondary, rgba(0,0,0,0.03))' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{lang === 'zh' ? '总计' : 'Total'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{imageTotals}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* 说明 */}
          <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--settings-text-dim)' }}>
            {lang === 'zh' 
              ? <>统计数据为当前 DeepBot 实例生成的图片数量，按提供商分类统计。</>
              : <>Statistics show the number of images generated by the current DeepBot instance, categorized by provider.</>}
          </p>
        </>
      )}
    </div>
  );
}

// ==================== 样式 ====================

const dateInputStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '12px',
  border: '1px solid var(--settings-border)',
  borderRadius: '4px',
  background: 'var(--settings-bg, #fff)',
  color: 'var(--settings-text)',
  outline: 'none',
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 500,
  color: 'var(--settings-text-dim)',
  fontSize: '12px',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: 'var(--settings-text)',
};
