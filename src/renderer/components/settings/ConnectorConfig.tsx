/**
 * 连接器配置组件
 * 
 * 配置外部通讯工具（飞书、微信等）
 */

import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { showToast } from '../../utils/toast';
import { getLanguage } from '../../i18n';
import { Check, Shield, Trash2, Copy, Link, Play, Square, X, FileText, RefreshCw } from 'lucide-react';

interface ConnectorConfigProps {
  onClose: () => void;
  onNavigate?: (tab: string) => void;
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

interface SmartKfConfig {
  wsUrl: string;
  wsKey: string;
  enabled?: boolean;
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

export function ConnectorConfig({ onClose, onNavigate }: ConnectorConfigProps) {
  const lang = getLanguage();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [feishuConfig, setFeishuConfig] = useState<FeishuConfig>({ appId: '', appSecret: '', enabled: false, requirePairing: false });
  const [smartKfConfig, setSmartKfConfig] = useState<SmartKfConfig>({ wsUrl: '', wsKey: '', enabled: false });
  const [pairingRecords, setPairingRecords] = useState<PairingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startingMap, setStartingMap] = useState<Record<string, boolean>>({});
  const [loadingPairing, setLoadingPairing] = useState(false);
  const [connectorHealthMap, setConnectorHealthMap] = useState<Record<string, 'healthy' | 'unhealthy' | 'checking'>>({});
  const hasLoadedRef = useRef(false);
  const [wecomConfigs, setWecomConfigs] = useState<Record<string, { botId: string; secret: string; botName?: string }>>({});
  // 统一工作提示词弹窗
  const [showWorkPromptModal, setShowWorkPromptModal] = useState(false);
  const [workPromptContent, setWorkPromptContent] = useState('');
  const [workPromptTitle, setWorkPromptTitle] = useState('');
  const [workPromptSettingKey, setWorkPromptSettingKey] = useState('');
  const [workPromptConnectorId, setWorkPromptConnectorId] = useState('');
  // 智能客服账号列表
  const [kfAccountList, setKfAccountList] = useState<Array<{ open_kfid: string; name: string; avatar: string }>>([]);
  const [kfListLoading, setKfListLoading] = useState(false);
  const [showKfWelcomePrompt, setShowKfWelcomePrompt] = useState(false);
  const [kfWelcomeOpenKfId, setKfWelcomeOpenKfId] = useState('');
  const [kfWelcomeName, setKfWelcomeName] = useState('');
  const [kfWelcomeContent, setKfWelcomeContent] = useState('');

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    loadConnectors();
  }, []);

  // 智能客服连接器启动后自动获取客服列表
  const loadKfList = async () => {
    setKfListLoading(true);
    try {
      const result = await api.connectorGetKfList();
      const actualResult = result?.data || result;
      if (actualResult?.success && actualResult.accountList) {
        setKfAccountList(actualResult.accountList);
      } else {
        setKfAccountList([]);
      }
    } catch {
      setKfAccountList([]);
    } finally {
      setKfListLoading(false);
    }
  };

  // 当选中 smart-kf 且连接器已启动时，自动加载客服列表
  useEffect(() => {
    if (selectedConnector === 'smart-kf') {
      const smartKf = connectors.find(c => c.id === 'smart-kf');
      if (smartKf?.enabled) {
        loadKfList();
      }
    }
  }, [selectedConnector, connectors]);

  // 打开工作提示词弹窗
  const openWorkPromptModal = async (title: string, settingKey: string, connectorId: string) => {
    try {
      const result = await api.getAppSetting(settingKey);
      setWorkPromptContent(result?.value || '');
    } catch {
      setWorkPromptContent('');
    }
    setWorkPromptTitle(title);
    setWorkPromptSettingKey(settingKey);
    setWorkPromptConnectorId(connectorId);
    setShowWorkPromptModal(true);
  };

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
        // 加载所有企业微信实例的配置（用于显示 BotID/Secret）
        const wecomInstances = actualResult.connectors.filter((c: any) => c.id.startsWith('wecom'));
        if (wecomInstances.length > 0) {
          const configs: Record<string, { botId: string; secret: string; botName?: string }> = {};
          for (const wc of wecomInstances) {
            try {
              const cfgResult = await api.connectorGetConfig(wc.id);
              const cfg = cfgResult.data || cfgResult;
              if (cfg.success && cfg.config) {
                configs[wc.id] = { botId: cfg.config.botId || '', secret: cfg.config.secret || '', botName: cfg.config.botName || '' };
              }
            } catch { /* 静默 */ }
          }
          setWecomConfigs(configs);
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
      } else if (connectorId === 'smart-kf') {
        if (actualResult.success && actualResult.config) {
          setSmartKfConfig({ wsUrl: actualResult.config.wsUrl || '', wsKey: actualResult.config.wsKey || '', enabled: actualResult.enabled || false });
        } else {
          setSmartKfConfig({ wsUrl: '', wsKey: '', enabled: false });
        }
      }
      await loadPairingRecords();
    } catch (error) {
      console.error('加载连接器配置失败:', error);
      if (connectorId === 'feishu') setFeishuConfig({ appId: '', appSecret: '', enabled: false, requirePairing: false });
      if (connectorId === 'smart-kf') setSmartKfConfig({ wsUrl: '', wsKey: '', enabled: false });
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
      // 飞书：启动前自动保存配置
      if (connectorId === 'feishu') {
        if (!feishuConfig.appId.trim() || !feishuConfig.appSecret.trim()) {
          showToast('error', lang === 'zh' ? '请输入 App ID 和 App Secret' : 'Please enter App ID and App Secret');
          setStartingMap(prev => ({ ...prev, [connectorId]: false }));
          return;
        }
        await api.connectorSaveConfig('feishu', { ...feishuConfig, enabled: false });
      } else if (connectorId.startsWith('wechat')) {
        await api.connectorSaveConfig(connectorId, { enabled: false });
      } else if (connectorId === 'smart-kf') {
        if (!smartKfConfig.wsUrl.trim() || !smartKfConfig.wsKey.trim()) {
          showToast('error', lang === 'zh' ? '请输入 API URL 和 API Key' : 'Please enter API URL and API Key');
          setStartingMap(prev => ({ ...prev, [connectorId]: false }));
          return;
        }
        await api.connectorSaveConfig('smart-kf', { ...smartKfConfig, enabled: false });
      } else if (connectorId.startsWith('wecom')) {
        // 企业微信多实例：从 state 读取 BotID 和 Secret
        const botId = wecomConfigs[connectorId]?.botId?.trim() || '';
        const secret = wecomConfigs[connectorId]?.secret?.trim() || '';
        const botName = wecomConfigs[connectorId]?.botName?.trim() || '';
        if (!botId || !secret) {
          showToast('error', lang === 'zh' ? '请输入 Bot ID 和 Secret' : 'Please enter Bot ID and Secret');
          setStartingMap(prev => ({ ...prev, [connectorId]: false }));
          return;
        }
        if (!botName) {
          showToast('error', lang === 'zh' ? '请输入机器人名称' : 'Please enter Bot Name');
          setStartingMap(prev => ({ ...prev, [connectorId]: false }));
          return;
        }
        if (botName.length > 20) {
          showToast('error', lang === 'zh' ? '机器人名称不能超过10个字' : 'Bot Name cannot exceed 10 characters');
          setStartingMap(prev => ({ ...prev, [connectorId]: false }));
          return;
        }
        if (!/^[\u4e00-\u9fa5a-zA-Z0-9]+$/.test(botName)) {
          showToast('error', lang === 'zh' ? '机器人名称只能包含中文、英文和数字' : 'Bot Name can only contain letters, numbers and Chinese characters');
          setStartingMap(prev => ({ ...prev, [connectorId]: false }));
          return;
        }
        await api.connectorSaveConfig(connectorId, { botId, secret, botName, enabled: false });
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
          // 智能客服启动成功后自动获取客服列表
          if (connectorId === 'smart-kf' && ah.status === 'healthy') {
            loadKfList();
          }
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

    if (connectorData?.enabled) {
      return (
        <button onClick={() => handleStop(connectorId)} disabled={isStarting}
          className="skill-icon-button connector-stop-button">
          <Square size={14} />
          <span>{isStarting ? (lang === 'zh' ? '停止中...' : 'Stopping...') : (lang === 'zh' ? '停止连接器' : 'Stop Connector')}</span>
        </button>
      );
    }
    return (
      <button onClick={() => handleStart(connectorId)} disabled={isStarting}
        className="skill-icon-button connector-start-button">
        <Play size={14} />
        <span>{isStarting
          ? (lang === 'zh' ? '启动中...' : 'Starting...')
          : connectorId.startsWith('wechat')
            ? (lang === 'zh' ? '启动连接器（扫码登录）' : 'Start Connector (QR Login)')
            : (lang === 'zh' ? '启动连接器' : 'Start Connector')}</span>
      </button>
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
              className={`settings-tab ${activeTab === tab ? 'active' : ''}`}>
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
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">App ID <span className="text-red-500">*</span></label>
              <button
                className="skill-card-action flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
                onClick={() => openWorkPromptModal(
                  lang === 'zh' ? '飞书工作提示词' : 'Feishu Work Prompt',
                  'feishu_default_work_prompt',
                  'feishu'
                )}
              >
                <FileText size={12} />
                <span>{lang === 'zh' ? '工作提示词' : 'Work Prompt'}</span>
              </button>
            </div>
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
          <div className="settings-alert settings-alert-info">
            <p className="text-sm text-blue-800"><strong>{lang === 'zh' ? '群组规则：' : 'Group Rule: '}</strong>{lang === 'zh' ? '群组中必须 @ 机器人才会触发回复' : '@mention the bot in groups to trigger replies'}</p>
          </div>
          <div className="flex items-center gap-2 pt-4">
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
        <div className="settings-alert settings-alert-success">
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
                        className="skill-card-action flex items-center gap-1 px-2 py-1 text-xs text-red-600 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                        <span>{lang === 'zh' ? '删除' : 'Delete'}</span>
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
                      className="skill-card-action flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary rounded transition-colors"
                    >
                      <Copy size={14} />
                      <span>{lang === 'zh' ? '复制链接' : 'Copy Link'}</span>
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
          className="skill-icon-button skill-icon-button-accent"
          style={{ padding: '4px 12px', gap: '4px', display: 'inline-flex', alignItems: 'center', fontSize: '12px' }}
        >
          <Link size={14} />
          <span>{lang === 'zh' ? '新增微信连接' : 'Add WeChat'}</span>
        </button>
      </div>
    );
  };

  // ── 企业微信配置面板 ──────────────────────────────────────────────
  const renderWecomConfig = () => {
    // 获取所有企业微信连接器实例
    const wecomConnectors = connectors.filter(c => c.id.startsWith('wecom'));
    wecomConnectors.sort((a, b) => a.id.localeCompare(b.id));

    return (
    <div className="space-y-4">
      {/* 子标签页 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1">
          {(['config', 'guide'] as TabType[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`settings-tab ${activeTab === tab ? 'active' : ''}`}>
              {tab === 'config' ? (lang === 'zh' ? '基础配置' : 'Basic Config') : (lang === 'zh' ? '配置说明' : 'Setup Guide')}
            </button>
          ))}
        </nav>
      </div>

      {/* 基础配置 */}
      {activeTab === 'config' && (
        <>
      {/* 企业微信实例列表 */}
      <div className="space-y-3">
        {wecomConnectors.map((wc, index) => {
          const health = connectorHealthMap[wc.id];
          const isFirst = index === 0;
          const num = wc.id.match(/wecom-(\d+)/)?.[1] || '1';
          const wcDisplayName = lang === 'zh' ? `机器人 ${num}` : `Bot ${num}`;

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
                  <button
                    className="skill-card-action flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
                    onClick={() => openWorkPromptModal(
                      lang === 'zh' ? `工作提示词 - ${wcDisplayName}` : `Work Prompt - ${wcDisplayName}`,
                      `wecom_work_prompt_${wc.id}`,
                      wc.id
                    )}
                  >
                    <FileText size={12} />
                    <span>{lang === 'zh' ? '工作提示词' : 'Work Prompt'}</span>
                  </button>
                  {!isFirst && !wc.enabled && (
                    <button
                      onClick={async () => {
                        if (!confirm(lang === 'zh' ? `确定要删除 ${wcDisplayName} 吗？` : `Delete ${wcDisplayName}?`)) return;
                        try {
                          await api.connectorRemoveWecom(wc.id);
                          showToast('success', lang === 'zh' ? '已删除' : 'Deleted');
                          await loadConnectors(true);
                        } catch (e) {
                          showToast('error', `${lang === 'zh' ? '删除失败' : 'Delete failed'}: ${e instanceof Error ? e.message : ''}`);
                        }
                      }}
                      className="skill-card-action flex items-center gap-1 px-2 py-1 text-xs text-red-600 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                      <span>{lang === 'zh' ? '删除' : 'Delete'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bot ID</label>
                  <input type="text"
                    value={wecomConfigs[wc.id]?.botId || ''}
                    onChange={(e) => setWecomConfigs(prev => ({ ...prev, [wc.id]: { ...prev[wc.id] || { botId: '', secret: '', botName: '' }, botId: e.target.value } }))}
                    placeholder="BotID"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    id={`wecom-botid-${wc.id}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Secret</label>
                  <input type="password"
                    value={wecomConfigs[wc.id]?.secret || ''}
                    onChange={(e) => setWecomConfigs(prev => ({ ...prev, [wc.id]: { ...prev[wc.id] || { botId: '', secret: '', botName: '' }, secret: e.target.value } }))}
                    placeholder="Secret"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    id={`wecom-secret-${wc.id}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'zh' ? '机器人名称' : 'Bot Name'} <span className="text-red-500">*</span></label>
                  <input type="text"
                    value={wecomConfigs[wc.id]?.botName || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.length <= 20) {
                        setWecomConfigs(prev => ({ ...prev, [wc.id]: { ...prev[wc.id] || { botId: '', secret: '', botName: '' }, botName: val } }));
                      }
                    }}
                    placeholder={lang === 'zh' ? '中文/英文/数字，不超过10个字' : 'Letters/numbers/Chinese, max 10 chars'}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    id={`wecom-botname-${wc.id}`}
                    maxLength={20}
                  />
                </div>
              </div>

              {renderStartStopButtons(wc.id)}
            </div>
          );
        })}
      </div>

      <div className="settings-alert settings-alert-info">
        <p className="text-sm text-blue-800"><strong>{lang === 'zh' ? '群组规则：' : 'Group Rule: '}</strong>{lang === 'zh' ? '群组中必须 @ 机器人才会触发回复' : '@mention the bot in groups to trigger replies'}</p>
      </div>

      {/* 新增企业微信机器人按钮 */}
      <button
        onClick={async () => {
          try {
            const result = await api.connectorCreateWecom();
            const actualResult = result.data || result;
            if (actualResult.success) {
              showToast('success', lang === 'zh' ? `已创建 ${actualResult.connectorId}` : `Created ${actualResult.connectorId}`);
              await loadConnectors(true);
            }
          } catch (e) {
            showToast('error', `${lang === 'zh' ? '创建失败' : 'Create failed'}: ${e instanceof Error ? e.message : ''}`);
          }
        }}
        className="skill-icon-button skill-icon-button-accent"
        style={{ padding: '4px 12px', gap: '4px', display: 'inline-flex', alignItems: 'center', fontSize: '12px' }}
      >
        <Link size={14} />
        <span>{lang === 'zh' ? '新增机器人' : 'Add Bot'}</span>
      </button>
        </>
      )}

      {/* 配置说明 */}
      {activeTab === 'guide' && (
        <div className="space-y-4 text-sm text-gray-700">
          <h2 className="text-base font-semibold text-gray-900">{lang === 'zh' ? '企业微信智能机器人配置指南' : 'WeCom AI Bot Setup Guide'}</h2>
          <div>
            <h3 className="font-semibold text-gray-800 mb-2">{lang === 'zh' ? '配置步骤' : 'Setup Steps'}</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '1. 创建智能机器人' : '1. Create AI Bot'}</h4>
                <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
                  <li>{lang === 'zh' ? '登录企业微信管理后台' : 'Log in to WeCom Admin'} (<a href="https://work.weixin.qq.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">work.weixin.qq.com</a>)</li>
                  <li>{lang === 'zh' ? '进入「安全与管理」→「管理工具」→「智能机器人」' : 'Go to "Security & Admin" → "Admin Tools" → "AI Bot"'}</li>
                  <li>{lang === 'zh' ? '点击「创建机器人」→「手动创建」' : 'Click "Create Bot" → "Create Manually"'}</li>
                  <li>{lang === 'zh' ? '填写机器人名称和头像' : 'Fill in bot name and avatar'}</li>
                  <li>{lang === 'zh' ? '页面拉到最下面，选择「API 模式」创建' : 'Scroll to the bottom, select "API Mode" to create'}</li>
                </ol>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '2. 获取 Bot ID 和 Secret' : '2. Get Bot ID and Secret'}</h4>
                <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
                  <li>{lang === 'zh' ? '创建完成后进入机器人配置页面' : 'After creation, enter bot settings page'}</li>
                  <li>{lang === 'zh' ? '在「配置方式」中选择「长连接」' : 'Select "WebSocket" in "Configuration Method"'}</li>
                  <li>{lang === 'zh' ? '记录页面上显示的 Bot ID 和 Secret' : 'Note down Bot ID and Secret shown on the page'}</li>
                </ol>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '3. 在 DeepBot 中配置' : '3. Configure in DeepBot'}</h4>
                <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
                  <li>{lang === 'zh' ? '在「基础配置」Tab 中填入 Bot ID 和 Secret' : 'Enter Bot ID and Secret in "Basic Config" tab'}</li>
                  <li>{lang === 'zh' ? '点击「启动连接器」' : 'Click "Start Connector"'}</li>
                  <li>{lang === 'zh' ? '状态显示「运行中」即配置成功' : 'Status shows "Running" means success'}</li>
                </ol>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '4. 使用方式' : '4. Usage'}</h4>
                <div className="text-gray-600 ml-2 space-y-1">
                  <p>{lang === 'zh' ? '• 单聊：在企业微信中直接给机器人发消息' : '• Private chat: Send messages directly to the bot in WeCom'}</p>
                  <p>{lang === 'zh' ? '• 群聊：将机器人添加到群组，@机器人 发送消息' : '• Group chat: Add bot to group, @mention it to send messages'}</p>
                  <p>{lang === 'zh' ? '• 支持文本、图片、文件、语音、视频消息' : '• Supports text, image, file, voice, video messages'}</p>
                  <p>{lang === 'zh' ? '• 回复内容支持 Markdown 格式' : '• Replies support Markdown format'}</p>
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '5. 安装 wecom-cli（可选，解锁办公能力）' : '5. Install wecom-cli (Optional, unlock office features)'}</h4>
                <p className="text-gray-600 ml-2 mb-2">{lang === 'zh' ? '安装后可使用通讯录查询、待办管理、会议管理、日程管理、文档管理等企业微信办公能力。' : 'After installation, you can use contacts, todo, meeting, schedule, and document management features.'}</p>
                <div className="bg-gray-50 border border-gray-200 rounded p-3 font-mono text-xs text-gray-700 space-y-2 ml-2">
                  <p><span className="text-gray-400"># {lang === 'zh' ? '安装 CLI' : 'Install CLI'}</span></p>
                  <p>npm install -g @wecom/cli</p>
                  <p><span className="text-gray-400"># {lang === 'zh' ? '安装 CLI Skill（必需）' : 'Install CLI Skill (required)'}</span></p>
                  <p>npx skills add WeComTeam/wecom-cli -y -g</p>
                  <p><span className="text-gray-400"># {lang === 'zh' ? '配置凭证（交互式，仅需一次）' : 'Configure credentials (interactive, one-time)'}</span></p>
                  <p>wecom-cli init</p>
                </div>
              </div>
            </div>
          </div>
          <div className="settings-alert settings-alert-info">
            <p className="text-sm text-blue-800">
              {lang === 'zh'
                ? '💡 提示：每个机器人同一时间只能保持一个长连接。如需多个机器人，请在企微后台创建多个智能机器人，然后在 DeepBot 中分别配置。'
                : '💡 Tip: Each bot can only maintain one WebSocket connection at a time. For multiple bots, create them in WeCom Admin and configure each in DeepBot.'}
            </p>
          </div>
        </div>
      )}

    </div>
    );
  };

  // ── 智能客服配置面板 ──────────────────────────────────────────────
  const renderSmartKfConfig = () => (
    <div className="space-y-4">
      <div className="settings-alert settings-alert-success">
        <h4 className="text-sm font-medium text-green-900 mb-2">{lang === 'zh' ? '智能客服连接器说明' : 'Smart KF Connector Info'}</h4>
        <p className="text-sm text-green-800">
          {lang === 'zh'
            ? '智能客服连接器通过 WebSocket 连接"微信客服"云端服务，接收 kf.weixin.qq.com 中配置的客服账号。支持同时连接多个客服，针对每个客服设置（训练）为不同的应答方式，100% 灵活自主配置。'
            : 'Smart KF connector connects to WeChat Customer Service cloud via WebSocket, receiving messages from KF accounts configured at kf.weixin.qq.com. Supports multiple KF accounts with independent response training.'}
        </p>
        <p className="text-sm text-green-800 mt-2">
          {lang === 'zh' ? '如需使用请扫码' : 'To subscribe, scan the QR code in '}<a href="#" onClick={(e) => { e.preventDefault(); onNavigate?.('subscription'); }} className="font-medium underline text-green-900 hover:text-green-700 cursor-pointer">{lang === 'zh' ? '「订阅及付费」' : '"Subscribe & Pay"'}</a>{lang === 'zh' ? '中的二维码获取服务。' : ' to get the service.'}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">API URL <span className="text-red-500">*</span></label>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await loadKfList();
                showToast('success', lang === 'zh' ? '客服列表已刷新' : 'KF list refreshed');
              }}
              className="skill-card-action flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
              disabled={kfListLoading || !connectors.find(c => c.id === 'smart-kf')?.enabled}
            >
              <RefreshCw size={12} style={{ animation: kfListLoading ? 'spin 1s linear infinite' : 'none' }} />
              <span>{lang === 'zh' ? '刷新客服列表' : 'Refresh KF List'}</span>
            </button>
          </div>
        </div>
        <input type="text" value={smartKfConfig.wsUrl} onChange={(e) => setSmartKfConfig({ ...smartKfConfig, wsUrl: e.target.value })}
          placeholder="wss://your-service-url/webhook/ws/" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">API Key <span className="text-red-500">*</span></label>
        <input type="password" value={smartKfConfig.wsKey} onChange={(e) => setSmartKfConfig({ ...smartKfConfig, wsKey: e.target.value })}
          placeholder={lang === 'zh' ? '请输入认证密钥' : 'Enter authentication key'} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="flex items-center gap-2 pt-2">
        {renderStartStopButtons('smart-kf')}
      </div>

      {/* 客服账号列表 */}
      {connectors.find(c => c.id === 'smart-kf')?.enabled && kfAccountList.length > 0 && (
        <div className="space-y-2 pt-2">
          <label className="block text-sm font-medium text-gray-700">{lang === 'zh' ? '客服账号列表' : 'KF Account List'}</label>
          <div className="space-y-2">
            {kfAccountList.map((kf) => (
              <div key={kf.open_kfid} className="flex items-center justify-between p-3 border border-gray-200 rounded-md">
                <div className="flex items-center gap-3">
                  {kf.avatar && (
                    <img src={kf.avatar} alt={kf.name} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  <div className="text-sm font-medium text-gray-900">{kf.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openWorkPromptModal(
                      lang === 'zh' ? `工作提示词 - ${kf.name}` : `Work Prompt - ${kf.name}`,
                      `smart_kf_work_prompt_${kf.open_kfid}`,
                      'smart-kf'
                    )}
                    className="skill-card-action flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
                  >
                    <FileText size={12} />
                    <span>{lang === 'zh' ? '工作提示词' : 'Prompt'}</span>
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const result = await api.connectorGetKfWelcome(kf.open_kfid);
                        const actualResult = result?.data || result;
                        setKfWelcomeContent(actualResult?.value || '');
                      } catch {
                        setKfWelcomeContent('');
                      }
                      setKfWelcomeOpenKfId(kf.open_kfid);
                      setKfWelcomeName(kf.name);
                      setShowKfWelcomePrompt(true);
                    }}
                    className="skill-card-action flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
                  >
                    <FileText size={12} />
                    <span>{lang === 'zh' ? '欢迎语' : 'Welcome'}</span>
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const result = await api.connectorGetKfUrl(kf.open_kfid);
                        const actualResult = result?.data || result;
                        if (actualResult?.success && actualResult.url) {
                          await navigator.clipboard.writeText(actualResult.url);
                          showToast('success', lang === 'zh' ? '链接已复制到剪贴板' : 'URL copied to clipboard');
                        } else {
                          showToast('error', actualResult?.error || (lang === 'zh' ? '获取链接失败' : 'Failed to get URL'));
                        }
                      } catch {
                        showToast('error', lang === 'zh' ? '获取链接失败' : 'Failed to get URL');
                      }
                    }}
                    className="skill-card-action flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
                  >
                    <Link size={12} />
                    <span>{lang === 'zh' ? '获取链接' : 'Get URL'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 连接器已启动但客服列表为空 */}
      {connectors.find(c => c.id === 'smart-kf')?.enabled && kfAccountList.length === 0 && !kfListLoading && (
        <div className="text-center py-4 text-gray-400 text-sm">
          {lang === 'zh' ? '暂无客服账号，请点击"刷新客服列表"获取' : 'No KF accounts found. Click "Refresh KF List" to fetch.'}
        </div>
      )}

      {/* 客服欢迎语设置弹窗 */}
      {showKfWelcomePrompt && (
        <div className="settings-overlay" onClick={() => setShowKfWelcomePrompt(false)}>
          <div
            className="settings-container tab-model-picker-container"
            style={{ width: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header">
              <h2 className="settings-title">
                {lang === 'zh' ? `设置欢迎语 - ${kfWelcomeName}` : `Welcome Message - ${kfWelcomeName}`}
              </h2>
              <button className="settings-close-button" onClick={() => setShowKfWelcomePrompt(false)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
              <div className="settings-alert settings-alert-success" style={{ marginBottom: '12px', flexShrink: 0 }}>
                <h4 className="text-sm font-medium text-green-900 mb-2">{lang === 'zh' ? '💡 什么是欢迎语？' : '💡 What is Welcome Message?'}</h4>
                <p className="text-sm text-green-800">
                  {lang === 'zh'
                    ? '当用户首次进入客服会话时（48小时内未收过欢迎语且未发过消息），系统会自动发送此欢迎语。留空则不发送欢迎语。'
                    : 'When a user enters the KF session for the first time (no welcome message received and no message sent in 48 hours), this welcome message will be sent automatically. Leave empty to disable.'}
                </p>
              </div>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <textarea
                  value={kfWelcomeContent}
                  onChange={(e) => { if (e.target.value.length <= 2048) setKfWelcomeContent(e.target.value); }}
                  className="settings-input"
                  style={{ width: '100%', minHeight: '300px', height: '100%', resize: 'none', fontFamily: 'inherit', fontSize: '13px', lineHeight: '1.5' }}
                  placeholder={lang === 'zh' ? '例如：你好！我是AI客服，有什么可以帮您？' : 'e.g. Hello! I am an AI assistant, how can I help you?'}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--settings-border, #e5e7eb)', marginTop: '12px', flexShrink: 0 }}>
                <span style={{ fontSize: '12px', color: 'var(--terminal-text-dim, #999)' }}>
                  {kfWelcomeContent.length} / 2048
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {kfWelcomeContent && (
                    <button
                      onClick={async () => {
                        await api.connectorSaveKfWelcome(kfWelcomeOpenKfId, '');
                        setShowKfWelcomePrompt(false);
                        showToast('success', lang === 'zh' ? '已清空欢迎语' : 'Welcome message cleared');
                      }}
                      className="skill-icon-button"
                      style={{ padding: '8px 20px', fontSize: '13px' }}
                    >
                      {lang === 'zh' ? '清空' : 'Clear'}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      await api.connectorSaveKfWelcome(kfWelcomeOpenKfId, kfWelcomeContent.trim());
                      setShowKfWelcomePrompt(false);
                      showToast('success', lang === 'zh' ? '欢迎语已保存' : 'Welcome message saved');
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    {lang === 'zh' ? '保存配置' : 'Save Configuration'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Pairing 管理面板 ─────────────────────────────────────────────
  const renderPairingPanel = () => (
    <div className="space-y-4">
      <div className="settings-alert settings-alert-info">
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
                  {!record.approved && <button onClick={() => handleApprovePairing(record.pairingCode)} className="skill-card-action flex items-center gap-1 px-3 py-1.5 text-xs text-green-600 rounded transition-colors"><Check size={14} /><span>{lang === 'zh' ? '批准' : 'Approve'}</span></button>}
                  <button onClick={() => handleSetAdmin(record.connectorId, record.userId, !record.isAdmin)}
                    className="skill-card-action flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary rounded transition-colors">
                    <Shield size={14} />
                    <span>{record.isAdmin ? (lang === 'zh' ? '管理员 ✓' : 'Admin ✓') : (lang === 'zh' ? '设为管理员' : 'Set Admin')}</span>
                  </button>
                  <button onClick={() => handleDeletePairing(record.connectorId, record.userId)} className="skill-card-action flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 rounded transition-colors"><Trash2 size={14} /><span>{lang === 'zh' ? '删除' : 'Delete'}</span></button>
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
          ) : connectors.filter(c => (!c.id.startsWith('wechat-') || c.id === connectors.find(x => x.id.startsWith('wechat'))?.id) && (!c.id.startsWith('wecom-') || c.id === connectors.find(x => x.id.startsWith('wecom'))?.id)).map((connector) => {
            // 微信和企业微信只显示第一个实例的 tab，内容面板统一管理所有实例
            const isWechatTab = connector.id.startsWith('wechat');
            const isWecomTab = connector.id.startsWith('wecom');
            const isMultiInstanceTab = isWechatTab || isWecomTab;
            const displayName = isWechatTab
              ? (lang === 'zh' ? '微信' : 'WeChat')
              : isWecomTab
                ? (lang === 'zh' ? '企业微信' : 'WeCom')
                : connector.id === 'feishu'
                  ? (lang === 'zh' ? '飞书' : 'Feishu')
                  : connector.id === 'smart-kf'
                    ? (lang === 'zh' ? '智能客服' : 'Smart KF')
                    : connector.name;
            // 多实例 tab 不显示状态（每个实例内部已有独立状态）
            const health = isMultiInstanceTab ? undefined : connectorHealthMap[connector.id];

            return (
            <button key={connector.id}
              onClick={() => { setSelectedConnector(connector.id); setActiveTab('config'); if (!isMultiInstanceTab) loadConnectorConfig(connector.id); }}
              className={`settings-tab ${selectedConnector === connector.id || (isWechatTab && selectedConnector?.startsWith('wechat')) || (isWecomTab && selectedConnector?.startsWith('wecom')) ? 'active' : ''}`}>
              {displayName}
              {!isMultiInstanceTab && connector.enabled && health === 'healthy' && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{lang === 'zh' ? '运行中' : 'Running'}</span>}
              {!isMultiInstanceTab && connector.enabled && health === 'unhealthy' && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{lang === 'zh' ? '连接失败' : 'Failed'}</span>}
              {!isMultiInstanceTab && connector.enabled && health === 'checking' && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{lang === 'zh' ? '检查中' : 'Checking'}</span>}
            </button>
            );
          })}
        </nav>
      </div>

      {/* 连接器配置面板（根据选中的连接器渲染） */}
      {selectedConnector === 'feishu' && renderFeishuConfig()}
      {selectedConnector?.startsWith('wechat') && renderWechatConfig()}
      {selectedConnector?.startsWith('wecom') && renderWecomConfig()}
      {/* 统一工作提示词弹窗 */}
      {showWorkPromptModal && (
        <div className="settings-overlay" onClick={() => setShowWorkPromptModal(false)}>
          <div
            className="settings-container tab-model-picker-container"
            style={{ width: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-header">
              <h2 className="settings-title">{workPromptTitle}</h2>
              <button className="settings-close-button" onClick={() => setShowWorkPromptModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
              <div className="settings-alert settings-alert-success" style={{ marginBottom: '12px', flexShrink: 0 }}>
                <h4 className="text-sm font-medium text-green-900 mb-2">{lang === 'zh' ? '💡 工作提示词' : '💡 Work Prompt'}</h4>
                <p className="text-sm text-green-800">
                  {lang === 'zh'
                    ? '工作提示词会注入到 AI 的系统提示中，指导 AI 在对话中的行为方式、回复风格和专业领域。'
                    : 'The work prompt is injected into the AI system prompt, guiding its behavior, response style, and expertise in conversations.'}
                </p>
              </div>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <textarea
                  value={workPromptContent}
                  onChange={(e) => { if (e.target.value.length <= 10000) setWorkPromptContent(e.target.value); }}
                  className="settings-input"
                  style={{ width: '100%', minHeight: '300px', height: '100%', resize: 'none', fontFamily: 'inherit', fontSize: '13px', lineHeight: '1.5' }}
                  placeholder={
                    lang === 'zh'
                      ? workPromptConnectorId === 'feishu'
                        ? '例如：\n你是公司的AI助理，帮助员工处理日常工作：\n1. 协助撰写文档、邮件和报告\n2. 回答公司制度和流程相关问题\n3. 帮助整理会议纪要和待办事项'
                        : workPromptConnectorId === 'smart-kf'
                          ? '例如：\n你是AI客服，请注意以下几点：\n1. 回复要简洁友好，不超过200字\n2. 遇到技术问题，先询问具体情况再给建议\n3. 无法解决的问题，引导用户联系人工客服\n4. 回答前先读取 ~/knowledge-base/ 文件夹中的文档作为参考'
                          : '例如：\n你是公司的AI助理，帮助员工处理日常工作：\n1. 协助撰写文档、方案和总结\n2. 回答公司业务和流程相关问题\n3. 帮助分析数据和生成报表'
                      : 'e.g. You are a professional assistant...'
                  }
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid var(--settings-border, #e5e7eb)', marginTop: '12px', flexShrink: 0 }}>
                <span style={{ fontSize: '12px', color: 'var(--terminal-text-dim, #999)' }}>
                  {workPromptContent.length} / 10000
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {workPromptContent && (
                    <button
                      onClick={async () => {
                        await api.connectorSaveWorkPrompt(workPromptSettingKey, '', workPromptConnectorId);
                        setShowWorkPromptModal(false);
                        showToast('success', lang === 'zh' ? '已清空工作提示词' : 'Work prompt cleared');
                      }}
                      className="skill-icon-button"
                      style={{ padding: '8px 20px', fontSize: '13px' }}
                    >
                      {lang === 'zh' ? '清空' : 'Clear'}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      await api.connectorSaveWorkPrompt(workPromptSettingKey, workPromptContent.trim(), workPromptConnectorId);
                      setShowWorkPromptModal(false);
                      showToast('success', lang === 'zh' ? '工作提示词已保存' : 'Work prompt saved');
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    {lang === 'zh' ? '保存' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedConnector === 'smart-kf' && renderSmartKfConfig()}
    </div>
  );
}
