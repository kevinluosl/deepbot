/**
 * 连接器配置组件
 * 
 * 配置外部通讯工具（飞书、微信等）
 */

import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { showToast } from '../../utils/toast';
import { getLanguage } from '../../i18n';

interface ConnectorConfigProps {
  onClose: () => void;
}

interface Connector {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  hasConfig: boolean;
}

interface FeishuConfig {
  appId: string;
  appSecret: string;
  enabled?: boolean;
  requirePairing?: boolean;
}

interface PairingRecord {
  connectorId: string;
  userId: string;
  userName?: string;
  pairingCode: string;
  approved: boolean;
  isAdmin: boolean;
  createdAt: number;
  approvedAt?: number;
}

type TabType = 'config' | 'pairing' | 'guide';

export function ConnectorConfig({ onClose }: ConnectorConfigProps) {
  const lang = getLanguage();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [feishuConfig, setFeishuConfig] = useState<FeishuConfig>({ appId: '', appSecret: '', enabled: false, requirePairing: false });
  const [pairingRecords, setPairingRecords] = useState<PairingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startingMap, setStartingMap] = useState<Record<string, boolean>>({});
  const [loadingPairing, setLoadingPairing] = useState(false);
  const [connectorHealthMap, setConnectorHealthMap] = useState<Record<string, 'healthy' | 'unhealthy' | 'checking'>>({});
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    loadConnectors();
  }, []);

  const loadConnectors = async (preserveSelection = false) => {
    try {
      setLoading(true);
      const result = await api.connectorGetAll();
      const actualResult = result.data || result;
      if (actualResult.success && actualResult.connectors) {
        setConnectors(actualResult.connectors);
        // 只在初始加载时设置默认选中，后续刷新保持当前选中
        if (!preserveSelection && actualResult.connectors.length > 0) {
          const first = actualResult.connectors[0];
          setSelectedConnector(first.id);
          await loadConnectorConfig(first.id);
        }
        for (const connector of actualResult.connectors) {
          if (connector.enabled) {
            setConnectorHealthMap(prev => {
              if (prev[connector.id]) return prev;
              api.connectorHealthCheck(connector.id).then((hr: any) => {
                const ah = hr.data || hr;
                setConnectorHealthMap(p => ({ ...p, [connector.id]: ah.status === 'healthy' ? 'healthy' : 'unhealthy' }));
              }).catch(() => {
                setConnectorHealthMap(p => ({ ...p, [connector.id]: 'unhealthy' }));
              });
              return { ...prev, [connector.id]: 'checking' };
            });
          }
        }
      }
    } catch (error) {
      console.error('加载连接器列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConnectorConfig = async (connectorId: string) => {
    try {
      const result = await api.connectorGetConfig(connectorId);
      const actualResult = result.data || result;
      if (connectorId === 'feishu') {
        if (actualResult.success && actualResult.config) {
          setFeishuConfig({ appId: actualResult.config.appId || '', appSecret: actualResult.config.appSecret || '', enabled: actualResult.enabled || false, requirePairing: actualResult.config.requirePairing === true });
        } else {
          setFeishuConfig({ appId: '', appSecret: '', enabled: false, requirePairing: false });
        }
      }
      await loadPairingRecords();
    } catch (error) {
      console.error('加载连接器配置失败:', error);
      if (connectorId === 'feishu') setFeishuConfig({ appId: '', appSecret: '', enabled: false, requirePairing: false });
    }
  };

  const loadPairingRecords = async () => {
    try {
      setLoadingPairing(true);
      const result = await api.connectorGetPairingRecords();
      const actualResult = result.data || result;
      setPairingRecords(actualResult.success ? (actualResult.records ?? []) : []);
    } catch { setPairingRecords([]); } finally { setLoadingPairing(false); }
  };

  const handleApprovePairing = async (pairingCode: string) => {
    try {
      const result = await api.connectorApprovePairing(pairingCode);
      const actualResult = result.data || result;
      if (actualResult.success) { showToast('success', lang === 'zh' ? '配对已批准' : 'Pairing approved'); await loadPairingRecords(); }
      else showToast('error', actualResult.error || (lang === 'zh' ? '批准失败' : 'Approval failed'));
    } catch (error) { showToast('error', `${lang === 'zh' ? '批准失败' : 'Approval failed'}: ${error instanceof Error ? error.message : ''}`); }
  };

  const handleSetAdmin = async (connectorId: string, userId: string, isAdmin: boolean) => {
    try {
      const result = await api.connectorSetAdminPairing(connectorId, userId, isAdmin);
      const actualResult = result.data || result;
      if (actualResult.success) { showToast('success', isAdmin ? (lang === 'zh' ? '已设为管理员' : 'Set as admin') : (lang === 'zh' ? '已取消管理员' : 'Admin removed')); await loadPairingRecords(); }
      else showToast('error', actualResult.error || (lang === 'zh' ? '操作失败' : 'Operation failed'));
    } catch (error) { showToast('error', `${lang === 'zh' ? '操作失败' : 'Operation failed'}: ${error instanceof Error ? error.message : ''}`); }
  };

  const handleDeletePairing = async (connectorId: string, userId: string) => {
    if (!confirm(lang === 'zh' ? '确定要删除此配对记录吗？' : 'Delete this pairing record?')) return;
    try {
      const result = await api.connectorDeletePairing(connectorId, userId);
      const actualResult = result.data || result;
      if (actualResult.success) { showToast('success', lang === 'zh' ? '已删除' : 'Deleted'); await loadPairingRecords(); }
      else showToast('error', actualResult.error || (lang === 'zh' ? '删除失败' : 'Delete failed'));
    } catch (error) { showToast('error', `${lang === 'zh' ? '删除失败' : 'Delete failed'}: ${error instanceof Error ? error.message : ''}`); }
  };

  const handleFeishuSave = async () => {
    if (!feishuConfig.appId.trim() || !feishuConfig.appSecret.trim()) {
      showToast('error', lang === 'zh' ? '请输入 App ID 和 App Secret' : 'Please enter App ID and App Secret');
      return;
    }
    setSaving(true);
    try {
      await api.connectorSaveConfig('feishu', { ...feishuConfig, enabled: false });
      showToast('success', lang === 'zh' ? '配置保存成功' : 'Configuration saved');
      await loadConnectors(true);
    } catch (error) { showToast('error', `${lang === 'zh' ? '保存失败' : 'Save failed'}: ${error instanceof Error ? error.message : ''}`); }
    finally { setSaving(false); }
  };

  const handleStart = async (connectorId: string) => {
    setStartingMap(prev => ({ ...prev, [connectorId]: true }));
    try {
      if (connectorId.startsWith('wechat')) {
        await api.connectorSaveConfig(connectorId, { enabled: false });
      }
      await api.connectorStart(connectorId);
      showToast('success', lang === 'zh' ? '连接器已启动' : 'Connector started');

      // 只更新当前连接器的状态，不刷新全部列表（避免干扰其他正在启动的连接器）
      setConnectors(prev => prev.map(c => c.id === connectorId ? { ...c, enabled: true } : c));
      setConnectorHealthMap(prev => ({ ...prev, [connectorId]: 'checking' }));

      // 延迟检查健康状态
      setTimeout(async () => {
        try {
          const hr = await api.connectorHealthCheck(connectorId);
          const ah = (hr as any).data || hr;
          setConnectorHealthMap(prev => ({ ...prev, [connectorId]: ah.status === 'healthy' ? 'healthy' : 'unhealthy' }));
        } catch {
          setConnectorHealthMap(prev => ({ ...prev, [connectorId]: 'unhealthy' }));
        }
      }, 2000);
    } catch (error) { showToast('error', `${lang === 'zh' ? '启动失败' : 'Start failed'}: ${error instanceof Error ? error.message : ''}`); }
    finally { setStartingMap(prev => ({ ...prev, [connectorId]: false })); }
  };

  const handleStop = async (connectorId: string) => {
    setStartingMap(prev => ({ ...prev, [connectorId]: true }));
    try {
      await api.connectorStop(connectorId);
      // 清除该连接器的健康状态
      setConnectorHealthMap(prev => {
        const next = { ...prev };
        delete next[connectorId];
        return next;
      });
      // 只更新当前连接器的状态
      setConnectors(prev => prev.map(c => c.id === connectorId ? { ...c, enabled: false } : c));
      showToast('success', lang === 'zh' ? '连接器已停止' : 'Connector stopped');
    } catch (error) { showToast('error', `${lang === 'zh' ? '停止失败' : 'Stop failed'}: ${error instanceof Error ? error.message : ''}`); }
    finally { setStartingMap(prev => ({ ...prev, [connectorId]: false })); }
  };

  const selectedConnectorData = connectors.find(c => c.id === selectedConnector);

  // ── 启停按钮（通用） ──────────────────────────────────────────────
  const renderStartStopButtons = (connectorId: string) => {
    const connectorData = connectors.find(c => c.id === connectorId);
    const isStarting = startingMap[connectorId] || false;

    return (
    <div className="flex space-x-3 pt-4">
      {connectorData?.enabled ? (
        <button onClick={() => handleStop(connectorId)} disabled={isStarting}
          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
          {isStarting ? (lang === 'zh' ? '停止中...' : 'Stopping...') : (lang === 'zh' ? '停止连接器' : 'Stop Connector')}
        </button>
      ) : (
        <button onClick={() => handleStart(connectorId)} disabled={isStarting || (connectorId === 'feishu' && !connectorData?.hasConfig)}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
          {isStarting
            ? (lang === 'zh' ? '启动中...' : 'Starting...')
            : connectorId.startsWith('wechat')
              ? (lang === 'zh' ? '启动连接器（扫码登录）' : 'Start Connector (QR Login)')
              : (lang === 'zh' ? '启动连接器' : 'Start Connector')}
        </button>
      )}
    </div>
    );
  };

  // ── 飞书配置面板 ──────────────────────────────────────────────────
  const renderFeishuConfig = () => (
    <div className="space-y-4">
      {/* 子标签页 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1">
          {(['config', 'pairing', 'guide'] as TabType[]).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); if (tab === 'pairing') loadPairingRecords(); }}
              className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'}`}>
              {tab === 'config' ? (lang === 'zh' ? '基础配置' : 'Basic Config') : tab === 'pairing' ? (lang === 'zh' ? 'Pairing 管理' : 'Pairing') : (lang === 'zh' ? '配置说明' : 'Setup Guide')}
              {tab === 'pairing' && pairingRecords.filter(r => !r.approved).length > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{pairingRecords.filter(r => !r.approved).length}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* 基础配置 */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">App ID <span className="text-red-500">*</span></label>
            <input type="text" value={feishuConfig.appId} onChange={(e) => setFeishuConfig({ ...feishuConfig, appId: e.target.value })}
              placeholder="cli_xxxxxxxxxxxxxxxx" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">App Secret <span className="text-red-500">*</span></label>
            <input type="password" value={feishuConfig.appSecret} onChange={(e) => setFeishuConfig({ ...feishuConfig, appSecret: e.target.value })}
              placeholder={lang === 'zh' ? '请输入 App Secret' : 'Enter App Secret'} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-start space-x-3">
            <input type="checkbox" id="requirePairing" checked={feishuConfig.requirePairing === true}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, requirePairing: e.target.checked })}
              className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <div>
              <label htmlFor="requirePairing" className="block text-sm font-medium text-gray-700 cursor-pointer">{lang === 'zh' ? '需要配对授权' : 'Require Pairing'}</label>
              <p className="text-xs text-gray-500 mt-0.5">{feishuConfig.requirePairing ? (lang === 'zh' ? '用户首次私聊需要管理员批准' : 'Users need admin approval') : (lang === 'zh' ? '所有用户可直接对话' : 'All users can chat directly')}</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800"><strong>{lang === 'zh' ? '群组规则：' : 'Group Rule: '}</strong>{lang === 'zh' ? '群组中必须 @ 机器人才会触发回复' : '@mention the bot in groups to trigger replies'}</p>
          </div>
          <div className="flex space-x-3 pt-4">
            <button onClick={handleFeishuSave} disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
              {saving ? (lang === 'zh' ? '保存中...' : 'Saving...') : (lang === 'zh' ? '保存配置' : 'Save Config')}
            </button>
            {renderStartStopButtons('feishu')}
          </div>
        </div>
      )}

      {/* Pairing 管理 */}
      {activeTab === 'pairing' && renderPairingPanel()}

      {/* 配置说明 */}
      {activeTab === 'guide' && renderFeishuGuide()}
    </div>
  );

  // ── 微信配置面板 ──────────────────────────────────────────────────
  const [wechatQrMap, setWechatQrMap] = useState<Record<string, string>>({});

  // 监听微信二维码推送（带 connectorId）
  useEffect(() => {
    const unsubscribe = api.onWechatQrCode((data: { url: string; connectorId?: string }) => {
      const cid = data.connectorId || 'wechat-1';
      setWechatQrMap(prev => ({ ...prev, [cid]: data.url }));
    });
    return () => unsubscribe?.();
  }, []);

  const renderWechatConfig = () => {
    // 获取所有微信连接器实例
    const wechatConnectors = connectors.filter(c => c.id.startsWith('wechat'));
    // 按 id 排序，确保 wechat-1 在最前面
    wechatConnectors.sort((a, b) => a.id.localeCompare(b.id));

    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <h4 className="text-sm font-medium text-green-900 mb-2">{lang === 'zh' ? '微信连接器说明' : 'WeChat Connector Info'}</h4>
          <p className="text-sm text-green-800">
            {lang === 'zh'
              ? '微信连接器通过 iLink Bot 协议连接微信。启动后会生成二维码，使用微信扫码即可登录。支持连接多个微信账号。'
              : 'WeChat connector uses the iLink Bot protocol. Scan QR code to login. Supports multiple WeChat accounts.'}
          </p>
        </div>

        {/* 微信实例列表 */}
        <div className="space-y-3">
          {wechatConnectors.map((wc, index) => {
            const qrUrl = wechatQrMap[wc.id] || null;
            const health = connectorHealthMap[wc.id];
            const isFirst = index === 0;
            const num = wc.id.match(/wechat-(\d+)/)?.[1] || '1';
            const wcDisplayName = lang === 'zh' ? `微信 ${num}` : `WeChat ${num}`;

            return (
              <div key={wc.id} className="border border-gray-200 rounded-md p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{wcDisplayName}</span>
                    {wc.enabled && health === 'healthy' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{lang === 'zh' ? '运行中' : 'Running'}</span>}
                    {wc.enabled && health === 'unhealthy' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{lang === 'zh' ? '连接失败' : 'Failed'}</span>}
                    {wc.enabled && health === 'checking' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{lang === 'zh' ? '检查中' : 'Checking'}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isFirst && !wc.enabled && (
                      <button
                        onClick={async () => {
                          if (!confirm(lang === 'zh' ? `确定要删除 ${wcDisplayName} 吗？` : `Delete ${wcDisplayName}?`)) return;
                          try {
                            await api.connectorRemoveWechat(wc.id);
                            showToast('success', lang === 'zh' ? '已删除' : 'Deleted');
                            await loadConnectors(true);
                          } catch (e) {
                            showToast('error', `${lang === 'zh' ? '删除失败' : 'Delete failed'}: ${e instanceof Error ? e.message : ''}`);
                          }
                        }}
                        className="px-2 py-1 text-xs text-red-500 hover:text-red-700 transition-colors"
                      >
                        {lang === 'zh' ? '删除' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>

                {/* 二维码弹出显示 */}
                {qrUrl && !wc.enabled && (
                  <div className="border border-gray-200 rounded-md p-4 text-center mb-3 bg-gray-50">
                    <p className="text-sm font-medium text-gray-700 mb-3">{lang === 'zh' ? '请使用微信扫描二维码登录' : 'Scan QR code with WeChat to login'}</p>
                    <div className="flex justify-center mb-3">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                        alt="WeChat QR Code"
                        className="w-48 h-48 rounded"
                      />
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(qrUrl); showToast('success', lang === 'zh' ? '链接已复制' : 'Link copied'); }}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {lang === 'zh' ? '复制链接' : 'Copy Link'}
                    </button>
                  </div>
                )}

                {renderStartStopButtons(wc.id)}
              </div>
            );
          })}
        </div>

        {/* 新增微信连接按钮 */}
        <button
          onClick={async () => {
            try {
              const result = await api.connectorCreateWechat();
              const actualResult = result.data || result;
              if (actualResult.success) {
                showToast('success', lang === 'zh' ? `已创建 ${actualResult.connectorId}` : `Created ${actualResult.connectorId}`);
                await loadConnectors(true);
              }
            } catch (e) {
              showToast('error', `${lang === 'zh' ? '创建失败' : 'Create failed'}: ${e instanceof Error ? e.message : ''}`);
            }
          }}
          className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors"
        >
          {lang === 'zh' ? '+ 新增微信连接' : '+ Add WeChat Connection'}
        </button>
      </div>
    );
  };

  // ── Pairing 管理面板 ─────────────────────────────────────────────
  const renderPairingPanel = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">{lang === 'zh' ? 'Pairing 说明' : 'Pairing Instructions'}</h4>
        <p className="text-sm text-blue-800">{lang === 'zh' ? '用户首次私聊机器人时会收到配对码，管理员在此批准后用户才能使用。' : 'Users receive a pairing code on first message. Admin must approve it here.'}</p>
      </div>
      {loadingPairing ? (
        <div className="flex items-center justify-center py-8"><div className="text-gray-500">{lang === 'zh' ? '加载中...' : 'Loading...'}</div></div>
      ) : pairingRecords.length === 0 ? (
        <div className="text-center py-8 text-gray-500">{lang === 'zh' ? '暂无配对记录' : 'No pairing records'}</div>
      ) : (
        <div className="space-y-3">
          {pairingRecords.map((record) => (
            <div key={`${record.connectorId}-${record.userId}`} className="border border-gray-200 rounded-md p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{record.userName || `${lang === 'zh' ? '用户' : 'User'}_${record.userId.slice(-8)}`}</span>
                    <span className="text-xs text-gray-400 font-mono break-all">{record.userId}</span>
                    {record.approved
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{lang === 'zh' ? '已批准' : 'Approved'}</span>
                      : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">{lang === 'zh' ? '待批准' : 'Pending'}</span>}
                    {record.isAdmin && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">{lang === 'zh' ? '管理员' : 'Admin'}</span>}
                  </div>
                  <div className="text-sm text-gray-500">{lang === 'zh' ? '配对码' : 'Code'}: <span className="font-mono font-medium">{record.pairingCode}</span></div>
                  <div className="text-xs text-gray-400">
                    {new Date(record.createdAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                    {record.approvedAt && <> · {new Date(record.approvedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</>}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!record.approved && <button onClick={() => handleApprovePairing(record.pairingCode)} className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors">{lang === 'zh' ? '批准' : 'Approve'}</button>}
                  <button onClick={() => handleSetAdmin(record.connectorId, record.userId, !record.isAdmin)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${record.isAdmin ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                    {record.isAdmin ? (lang === 'zh' ? '管理员 ✓' : 'Admin ✓') : (lang === 'zh' ? '设为管理员' : 'Set Admin')}
                  </button>
                  <button onClick={() => handleDeletePairing(record.connectorId, record.userId)} className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors">{lang === 'zh' ? '删除' : 'Delete'}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── 飞书配置说明 ──────────────────────────────────────────────────
  const renderFeishuGuide = () => (
    <div className="space-y-4 text-sm text-gray-700">
      <h2 className="text-base font-semibold text-gray-900">{lang === 'zh' ? '飞书机器人配置指南' : 'Feishu Bot Setup Guide'}</h2>
      <p>{lang === 'zh' ? '本文档介绍如何配置飞书连接器。' : 'This guide explains how to configure the Feishu connector.'} <span className="bg-yellow-200 text-yellow-900 px-1 rounded">{lang === 'zh' ? '大约 3～5 分钟。' : 'Takes about 3-5 minutes.'}</span></p>
      <div>
        <h3 className="font-semibold text-gray-800 mb-2">{lang === 'zh' ? '配置步骤' : 'Setup Steps'}</h3>
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '1. 创建飞书企业自建应用' : '1. Create a Feishu Custom App'}</h4>
            <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
              <li>{lang === 'zh' ? '访问 ' : 'Visit '}<a href="https://open.feishu.cn/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{lang === 'zh' ? '飞书开放平台' : 'Feishu Open Platform'}</a></li>
              <li>{lang === 'zh' ? '登录后，点击「创建企业自建应用」' : 'Log in and click "Create Custom App"'}</li>
            </ol>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '2. 获取 App ID 和 App Secret' : '2. Get App ID and App Secret'}</h4>
            <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
              <li>{lang === 'zh' ? '在应用详情页，进入「凭证与基础信息」' : 'Go to "Credentials & Basic Info"'}</li>
              <li>{lang === 'zh' ? '记录 App ID 和 App Secret' : 'Note down App ID and App Secret'}</li>
            </ol>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '3. 配置权限' : '3. Configure Permissions'}</h4>
            <p className="text-gray-600 mb-2">{lang === 'zh' ? '在「权限管理」页面，点击「批量导入/导出权限」粘贴以下 JSON：' : 'In "Permission Management", click "Batch Import/Export" and paste:'}</p>
            <div className="bg-gray-50 border border-gray-200 rounded p-3 font-mono text-xs text-gray-700 whitespace-pre overflow-x-auto">{`{
  "scopes": {
    "tenant": [
      "contact:contact.base:readonly",
      "contact:user.base:readonly",
      "contact:user.basic_profile:readonly",
      "docs:document.comment:create",
      "docx:document",
      "docx:document.block:convert",
      "drive:drive",
      "drive:file",
      "im:chat",
      "im:message",
      "im:message.group_at_msg:readonly",
      "im:message.group_msg",
      "im:message.p2p_msg:readonly",
      "im:message:send_as_bot",
      "im:resource",
      "sheets:spreadsheet:readonly"
    ],
    "user": []
  }
}`}</div>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '4. 配置事件订阅' : '4. Configure Event Subscriptions'}</h4>
            <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
              <li>{lang === 'zh' ? '订阅方式选择「使用长连接接收事件」' : 'Select "Use long connection to receive events"'}</li>
              <li>{lang === 'zh' ? '添加事件 im.message.receive_v1' : 'Add event im.message.receive_v1'}</li>
            </ol>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '5. 在 DeepBot 中填入凭证并启动' : '5. Enter credentials in DeepBot and start'}</h4>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '6. 发布应用' : '6. Publish the App'}</h4>
            <p className="text-gray-600 ml-2">{lang === 'zh' ? '在飞书开放平台发布应用，审核通过后即可使用。' : 'Publish the app on Feishu Open Platform.'}</p>
          </div>
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-gray-800 mb-2">{lang === 'zh' ? '使用说明' : 'Usage'}</h3>
        <div className="space-y-2">
          <div>
            <h4 className="font-medium text-gray-800 mb-1">{lang === 'zh' ? '私聊' : 'Direct Message'}</h4>
            <p className="text-gray-600 ml-2">{lang === 'zh' ? '搜索并添加机器人，发送消息即可。Pairing 模式下需管理员批准。' : 'Search and add the bot, send a message. In pairing mode, admin approval is needed.'}</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-800 mb-1">{lang === 'zh' ? '群组' : 'Group'}</h4>
            <p className="text-gray-600 ml-2">{lang === 'zh' ? '将机器人添加到群组，@机器人 发送消息即可。' : 'Add the bot to a group and @mention it.'}</p>
          </div>
        </div>
      </div>
    </div>
  );

  // ── 主渲染 ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{lang === 'zh' ? '外部通讯配置' : 'Connector Configuration'}</h3>
        <p className="text-sm text-gray-500">{lang === 'zh' ? '配置飞书、微信等外部通讯工具' : 'Configure external messaging tools like Feishu, WeChat, etc.'}</p>
      </div>

      {/* 连接器 Tab 列表 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1">
          {loading ? (
            <div className="py-3 px-4 text-sm text-gray-400">{lang === 'zh' ? '加载中...' : 'Loading...'}</div>
          ) : connectors.filter(c => !c.id.startsWith('wechat-') || c.id === connectors.find(x => x.id.startsWith('wechat'))?.id).map((connector) => {
            // 微信只显示第一个实例的 tab，内容面板统一管理所有实例
            const isWechatTab = connector.id.startsWith('wechat');
            const displayName = isWechatTab
              ? (lang === 'zh' ? '微信' : 'WeChat')
              : connector.id === 'feishu'
                ? (lang === 'zh' ? '飞书' : 'Feishu')
                : connector.name;
            // 微信 tab 不显示状态（每个实例内部已有独立状态）
            const health = isWechatTab ? undefined : connectorHealthMap[connector.id];

            return (
            <button key={connector.id}
              onClick={() => { setSelectedConnector(connector.id); setActiveTab('config'); if (!isWechatTab) loadConnectorConfig(connector.id); }}
              className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${selectedConnector === connector.id || (isWechatTab && selectedConnector?.startsWith('wechat')) ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'}`}>
              {displayName}
              {!isWechatTab && connector.enabled && health === 'healthy' && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{lang === 'zh' ? '运行中' : 'Running'}</span>}
              {!isWechatTab && connector.enabled && health === 'unhealthy' && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{lang === 'zh' ? '连接失败' : 'Failed'}</span>}
              {!isWechatTab && connector.enabled && health === 'checking' && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{lang === 'zh' ? '检查中' : 'Checking'}</span>}
            </button>
            );
          })}
        </nav>
      </div>

      {/* 连接器配置面板（根据选中的连接器渲染） */}
      {selectedConnector === 'feishu' && renderFeishuConfig()}
      {selectedConnector?.startsWith('wechat') && renderWechatConfig()}
    </div>
  );
}
