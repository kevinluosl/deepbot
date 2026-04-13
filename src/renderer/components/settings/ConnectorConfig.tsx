/**
 * 连接器配置组件
 * 
 * 配置外部通讯工具（飞书、钉钉等）
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
  const [feishuConfig, setFeishuConfig] = useState<FeishuConfig>({
    appId: '',
    appSecret: '',
    enabled: false,
    requirePairing: false,
  });
  const [pairingRecords, setPairingRecords] = useState<PairingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadingPairing, setLoadingPairing] = useState(false);
  // 连接器健康状态：connectorId -> 'healthy' | 'unhealthy' | 'checking'
  const [connectorHealthMap, setConnectorHealthMap] = useState<Record<string, 'healthy' | 'unhealthy' | 'checking'>>({});
  const hasLoadedRef = useRef(false);

  // 加载连接器列表
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    loadConnectors();
  }, []);

  const loadConnectors = async () => {
    try {
      setLoading(true);
      const result = await api.connectorGetAll();
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;

      if (actualResult.success && actualResult.connectors) {
        setConnectors(actualResult.connectors);

        // 默认选择飞书
        if (actualResult.connectors.length > 0) {
          const feishu = actualResult.connectors.find((c: any) => c.id === 'feishu');
          if (feishu) {
            setSelectedConnector('feishu');
            await loadConnectorConfig('feishu');
          }
        }

        // 健康检查：已有缓存状态则跳过，避免每次打开都重新检查
        for (const connector of actualResult.connectors) {
          if (connector.enabled) {
            // 已有缓存状态则不重复检查
            setConnectorHealthMap(prev => {
              if (prev[connector.id]) return prev;
              // 没有缓存，发起检查
              api.connectorHealthCheck(connector.id).then((healthResult: any) => {
                const actualHealth = healthResult.data || healthResult;
                const status = actualHealth.status === 'healthy' ? 'healthy' : 'unhealthy';
                setConnectorHealthMap(p => ({ ...p, [connector.id]: status }));
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
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      console.log('[ConnectorConfig] 加载配置结果:', actualResult);
      console.log('[ConnectorConfig] config 对象:', actualResult.config);
      
      if (actualResult.success && actualResult.config) {
        // 确保所有字段都有默认值，避免 controlled/uncontrolled 警告
        setFeishuConfig({
          appId: actualResult.config.appId || '',
          appSecret: actualResult.config.appSecret || '',
          enabled: actualResult.enabled || false,
          requirePairing: actualResult.config.requirePairing === true, // 默认 false
        });
      } else {
        // 如果没有配置，设置默认值
        setFeishuConfig({
          appId: '',
          appSecret: '',
          enabled: false,
          requirePairing: false,
        });
      }
      
      // pairing 记录始终加载（pairing 是固定功能）
      await loadPairingRecords(connectorId);
    } catch (error) {
      console.error('加载连接器配置失败:', error);
      // 出错时也设置默认值
      setFeishuConfig({
        appId: '',
        appSecret: '',
        enabled: false,
        requirePairing: false,
      });
    }
  };

  const loadPairingRecords = async (connectorId?: string) => {
    try {
      setLoadingPairing(true);
      const result = await api.connectorGetPairingRecords();
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      
      // records 可能是空数组，也要正常设置
      if (actualResult.success) {
        setPairingRecords(actualResult.records ?? []);
      } else {
        console.error('[Pairing] 获取失败:', actualResult.error);
        setPairingRecords([]);
      }
    } catch (error) {
      console.error('加载 Pairing 记录失败:', error);
      setPairingRecords([]);
    } finally {
      setLoadingPairing(false);
    }
  };

  const handleApprovePairing = async (pairingCode: string) => {
    try {
      const result = await api.connectorApprovePairing(pairingCode);
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success) {
        showToast('success', lang === 'zh' ? '配对已批准' : 'Pairing approved');
        await loadPairingRecords(selectedConnector || undefined);
      } else {
        showToast('error', actualResult.error || (lang === 'zh' ? '批准失败' : 'Approval failed'));
      }
    } catch (error) {
      showToast('error', lang === 'zh' ? `批准失败: ${error instanceof Error ? error.message : '未知错误'}` : `Approval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSetAdmin = async (connectorId: string, userId: string, isAdmin: boolean) => {
    try {
      const result = await api.connectorSetAdminPairing(connectorId, userId, isAdmin);
      const actualResult = result.data || result;
      if (actualResult.success) {
        showToast('success', isAdmin ? (lang === 'zh' ? '已设为管理员' : 'Set as admin') : (lang === 'zh' ? '已取消管理员' : 'Admin removed'));
        await loadPairingRecords(selectedConnector || undefined);
      } else {
        showToast('error', actualResult.error || (lang === 'zh' ? '操作失败' : 'Operation failed'));
      }
    } catch (error) {
      showToast('error', lang === 'zh' ? `操作失败: ${error instanceof Error ? error.message : '未知错误'}` : `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeletePairing = async (connectorId: string, userId: string) => {
    if (!confirm(lang === 'zh' ? '确定要删除此配对记录吗？' : 'Are you sure you want to delete this pairing record?')) {
      return;
    }
    
    try {
      const result = await api.connectorDeletePairing(connectorId, userId);
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success) {
        showToast('success', lang === 'zh' ? '配对记录已删除' : 'Pairing record deleted');
        await loadPairingRecords(selectedConnector || undefined);
      } else {
        showToast('error', actualResult.error || (lang === 'zh' ? '删除失败' : 'Delete failed'));
      }
    } catch (error) {
      showToast('error', lang === 'zh' ? `删除失败: ${error instanceof Error ? error.message : '未知错误'}` : `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSave = async () => {
    if (!selectedConnector) return;

    if (!feishuConfig.appId.trim()) {
      showToast('error', lang === 'zh' ? '请输入 App ID' : 'Please enter App ID');
      return;
    }
    if (!feishuConfig.appSecret.trim()) {
      showToast('error', lang === 'zh' ? '请输入 App Secret' : 'Please enter App Secret');
      return;
    }

    setSaving(true);

    try {
      await api.connectorSaveConfig(selectedConnector, {
        ...feishuConfig,
        enabled: false, // 保存时不自动启用
      });
      showToast('success', lang === 'zh' ? '配置保存成功' : 'Configuration saved');
      await loadConnectors(); // 重新加载列表
    } catch (error) {
      showToast('error', lang === 'zh' ? `保存失败: ${error instanceof Error ? error.message : '未知错误'}` : `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    if (!selectedConnector) return;

    const connector = connectors.find(c => c.id === selectedConnector);
    if (!connector?.hasConfig) {
      showToast('error', lang === 'zh' ? '请先保存配置' : 'Please save configuration first');
      return;
    }

    setStarting(true);

    try {
      await api.connectorStart(selectedConnector);
      showToast('success', lang === 'zh' ? '连接器已启动' : 'Connector started');
      await loadConnectors(); // 重新加载列表
    } catch (error) {
      showToast('error', lang === 'zh' ? `启动失败: ${error instanceof Error ? error.message : '未知错误'}` : `Start failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!selectedConnector) return;

    setStarting(true);

    try {
      await api.connectorStop(selectedConnector);
      showToast('success', lang === 'zh' ? '连接器已停止' : 'Connector stopped');
      await loadConnectors(); // 重新加载列表
    } catch (error) {
      showToast('error', lang === 'zh' ? `停止失败: ${error instanceof Error ? error.message : '未知错误'}` : `Stop failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setStarting(false);
    }
  };

  const selectedConnectorData = connectors.find(c => c.id === selectedConnector);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{lang === 'zh' ? '外部通讯配置' : 'Connector Configuration'}</h3>
        <p className="text-sm text-gray-500">
          {lang === 'zh' ? '配置飞书、钉钉等外部通讯工具，让 AI 助手可以在这些平台上响应消息' : 'Configure external messaging tools like Feishu, DingTalk, etc. to let the AI assistant respond on these platforms'}
        </p>
      </div>

      {/* 连接器列表 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1">
          {loading ? (
            <div className="py-3 px-4 text-sm text-gray-400">{lang === 'zh' ? '加载中...' : 'Loading...'}</div>
          ) : connectors.map((connector) => (
            <button
              key={connector.id}
              onClick={() => {
                setSelectedConnector(connector.id);
                loadConnectorConfig(connector.id);
              }}
              className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
                selectedConnector === connector.id
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {connector.name}
              {connector.enabled && (
                <>
                  {connectorHealthMap[connector.id] === 'checking' && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      {lang === 'zh' ? '检查中' : 'Checking'}
                    </span>
                  )}
                  {connectorHealthMap[connector.id] === 'healthy' && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      {lang === 'zh' ? '运行中' : 'Running'}
                    </span>
                  )}
                  {connectorHealthMap[connector.id] === 'unhealthy' && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                      {lang === 'zh' ? '连接失败' : 'Connection Failed'}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* 飞书配置 */}
      {selectedConnector === 'feishu' && (
        <div className="space-y-4">
          {/* 标签页切换 */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-1">
              <button
                onClick={() => setActiveTab('config')}
                className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'config'
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {lang === 'zh' ? '基础配置' : 'Basic Config'}
              </button>
              <button
                onClick={() => {
                  setActiveTab('pairing');
                  loadPairingRecords(selectedConnector);
                }}
                className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'pairing'
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {lang === 'zh' ? 'Pairing 管理' : 'Pairing Management'}
                {pairingRecords.filter(r => !r.approved).length > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {pairingRecords.filter(r => !r.approved).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('guide')}
                className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'guide'
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {lang === 'zh' ? '配置说明' : 'Setup Guide'}
              </button>
            </nav>
          </div>

          {/* 基础配置标签页 */}
          {activeTab === 'config' && (
            <div className="space-y-4">

          {/* App ID */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              App ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={feishuConfig.appId}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, appId: e.target.value })}
              placeholder="cli_xxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* App Secret */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              App Secret <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={feishuConfig.appSecret}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, appSecret: e.target.value })}
              placeholder={lang === 'zh' ? '请输入 App Secret' : 'Enter App Secret'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 是否需要配对授权 */}
          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              id="requirePairing"
              checked={feishuConfig.requirePairing === true}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, requirePairing: e.target.checked })}
              className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <div>
              <label htmlFor="requirePairing" className="block text-sm font-medium text-gray-700 cursor-pointer">
                {lang === 'zh' ? '需要配对授权' : 'Require Pairing Authorization'}
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                {feishuConfig.requirePairing === true
                  ? (lang === 'zh' ? '用户首次私聊需要管理员批准配对码后才能使用' : 'Users must have their pairing code approved by an admin before first use')
                  : (lang === 'zh' ? '所有飞书用户可直接对话，无需配对授权（用户会自动加入配对列表）' : 'All Feishu users can chat directly without pairing authorization (users are auto-added to the pairing list)')}
              </p>
            </div>
          </div>

          {/* 群组使用说明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              <strong>{lang === 'zh' ? '群组使用规则：' : 'Group Usage Rule: '}</strong>{lang === 'zh' ? '在群组中必须 @ 机器人才会触发回复' : 'You must @mention the bot in group chats to trigger a reply'}
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex space-x-3 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (lang === 'zh' ? '保存中...' : 'Saving...') : (lang === 'zh' ? '保存配置' : 'Save Config')}
            </button>
            
            {selectedConnectorData?.enabled ? (
              <button
                onClick={handleStop}
                disabled={starting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {starting ? (lang === 'zh' ? '停止中...' : 'Stopping...') : (lang === 'zh' ? '停止连接器' : 'Stop Connector')}
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={starting || !selectedConnectorData?.hasConfig}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {starting ? (lang === 'zh' ? '启动中...' : 'Starting...') : (lang === 'zh' ? '启动连接器' : 'Start Connector')}
              </button>
            )}
          </div>
        </div>
      )}

          {/* Pairing 管理标签页 */}
          {activeTab === 'pairing' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">{lang === 'zh' ? 'Pairing 说明' : 'Pairing Instructions'}</h4>
                <p className="text-sm text-blue-800">
                  {lang === 'zh' ? '当用户首次私聊机器人时，会收到一个配对码。管理员需要在此处批准配对码，用户才能正常使用机器人。' : 'When a user first messages the bot privately, they receive a pairing code. An admin must approve the code here before the user can use the bot.'}
                </p>
              </div>

              {loadingPairing ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-gray-500">{lang === 'zh' ? '加载中...' : 'Loading...'}</div>
                </div>
              ) : pairingRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {lang === 'zh' ? '暂无配对记录' : 'No pairing records'}
                </div>
              ) : (
                <div className="space-y-3">
                  {pairingRecords.map((record) => (
                    <div
                      key={`${record.connectorId}-${record.userId}`}
                      className="border border-gray-200 rounded-md p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">
                              {record.userName || (lang === 'zh' ? `用户_${record.userId.slice(-8)}` : `User_${record.userId.slice(-8)}`)}
                            </span>
                            <span className="text-xs text-gray-400 font-mono break-all">
                              {record.userId}
                            </span>
                            {record.approved ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 whitespace-nowrap">
                                {lang === 'zh' ? '已批准' : 'Approved'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">
                                {lang === 'zh' ? '待批准' : 'Pending'}
                              </span>
                            )}
                            {record.isAdmin && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 whitespace-nowrap">
                                {lang === 'zh' ? '管理员' : 'Admin'}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {lang === 'zh' ? '配对码' : 'Pairing Code'}: <span className="font-mono font-medium">{record.pairingCode}</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            {lang === 'zh' ? '创建时间' : 'Created'}: {new Date(record.createdAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                            {record.approvedAt && (
                              <> · {lang === 'zh' ? '批准时间' : 'Approved'}: {new Date(record.approvedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {!record.approved && (
                            <button
                              onClick={() => handleApprovePairing(record.pairingCode)}
                              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors whitespace-nowrap"
                            >
                              {lang === 'zh' ? '批准' : 'Approve'}
                            </button>
                          )}
                          <button
                            onClick={() => handleSetAdmin(record.connectorId, record.userId, !record.isAdmin)}
                            className={`px-3 py-1 text-sm rounded transition-colors whitespace-nowrap ${
                              record.isAdmin
                                ? 'bg-purple-600 text-white hover:bg-purple-700'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            {record.isAdmin ? (lang === 'zh' ? '管理员 ✓' : 'Admin ✓') : (lang === 'zh' ? '设为管理员' : 'Set Admin')}
                          </button>
                          <button
                            onClick={() => handleDeletePairing(record.connectorId, record.userId)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors whitespace-nowrap"
                          >
                            {lang === 'zh' ? '删除' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* 配置说明标签页 */}
          {activeTab === 'guide' && (
            <div className="space-y-4 text-sm text-gray-700 pr-1">
              <h2 className="text-base font-semibold text-gray-900">{lang === 'zh' ? '飞书机器人配置指南' : 'Feishu Bot Setup Guide'}</h2>
              <p>{lang === 'zh' ? '本文档介绍如何配置 DeepBot 的飞书连接器，使其能够通过飞书接收和发送消息。' : 'This guide explains how to configure the DeepBot Feishu connector to receive and send messages via Feishu.'}<span className="bg-yellow-200 text-yellow-900 px-1 rounded">{lang === 'zh' ? '大约 3 ～ 5 分钟配置完成。' : 'Takes about 3-5 minutes to set up.'}</span></p>

              <div>
                <h3 className="font-semibold text-gray-800 mb-1">{lang === 'zh' ? '前置条件' : 'Prerequisites'}</h3>
                <ol className="list-decimal list-inside space-y-1 text-gray-600">
                  <li>{lang === 'zh' ? '拥有飞书企业管理员权限' : 'Feishu enterprise admin access'}</li>
                </ol>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">{lang === 'zh' ? '配置步骤' : 'Setup Steps'}</h3>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '1. 创建飞书企业自建应用' : '1. Create a Feishu Custom App'}</h4>
                    <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
                      <li>{lang === 'zh' ? '访问 ' : 'Visit '}<a href="https://open.feishu.cn/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{lang === 'zh' ? '飞书开放平台' : 'Feishu Open Platform'}</a></li>
                      <li>{lang === 'zh' ? '登录后，点击「创建企业自建应用」' : 'Log in and click "Create Custom App"'}</li>
                      <li>{lang === 'zh' ? '填写应用名称、描述等信息' : 'Fill in the app name, description, etc.'}</li>
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '2. 获取应用凭证' : '2. Get App Credentials'}</h4>
                    <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
                      <li>{lang === 'zh' ? '在应用详情页，进入「凭证与基础信息」' : 'In the app details page, go to "Credentials & Basic Info"'}</li>
                      <li>{lang === 'zh' ? '记录 ' : 'Note down '}<strong>App ID</strong>{lang === 'zh' ? ' 和 ' : ' and '}<strong>App Secret</strong></li>
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '3. 配置应用权限' : '3. Configure App Permissions'}</h4>
                    <p className="text-gray-600 mb-2">{lang === 'zh' ? '在「权限管理」页面添加以下权限，或点击「批量导入/导出权限」粘贴下方 JSON 一键导入：' : 'Add the following permissions on the "Permission Management" page, or click "Batch Import/Export" and paste the JSON below:'}</p>
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
                    <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '4. 在 DeepBot 中配置' : '4. Configure in DeepBot'}</h4>
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-2 text-yellow-800 text-xs">
                      {lang === 'zh' ? '注意：配置事件订阅前，需要先在 DeepBot 中填入 App ID 和 App Secret，否则无法建立长连接。' : 'Note: Before configuring event subscriptions, you must first enter the App ID and App Secret in DeepBot, otherwise the long connection cannot be established.'}
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
                      <li>{lang === 'zh' ? '切换到「基础配置」标签页' : 'Switch to the "Basic Config" tab'}</li>
                      <li>{lang === 'zh' ? '填写 App ID 和 App Secret' : 'Enter App ID and App Secret'}</li>
                      <li>{lang === 'zh' ? '点击「保存配置」，再点击「启动连接器」' : 'Click "Save Config", then click "Start Connector"'}</li>
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '5. 配置事件订阅' : '5. Configure Event Subscriptions'}</h4>
                    <p className="text-gray-600 mb-1">{lang === 'zh' ? '进入应用的「事件与回调」页面：' : 'Go to the app\'s "Events & Callbacks" page:'}</p>
                    <div className="ml-2 space-y-2">
                      <div>
                        <p className="font-medium text-gray-700">{lang === 'zh' ? '事件配置：' : 'Event Configuration:'}</p>
                        <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
                          <li>{lang === 'zh' ? '订阅方式选择「使用长连接接收事件」' : 'Select "Use long connection to receive events"'}</li>
                          <li>{lang === 'zh' ? '添加事件 ' : 'Add event '}<code className="bg-gray-100 px-1 rounded">im.message.receive_v1</code></li>
                          <li>{lang === 'zh' ? '开通：接收群聊中@机器人消息、读取单聊消息、获取群组中所有消息' : 'Enable: Receive @bot messages in groups, read direct messages, get all group messages'}</li>
                        </ol>
                      </div>
                      <div>
                        <p className="font-medium text-gray-700">{lang === 'zh' ? '回调配置：' : 'Callback Configuration:'}</p>
                        <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
                          <li>{lang === 'zh' ? '订阅方式同样选择「使用长连接接收事件」' : 'Also select "Use long connection to receive events"'}</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2 pl-2 border-l-2 border-blue-400">{lang === 'zh' ? '6. 发布应用' : '6. Publish the App'}</h4>
                    <p className="text-gray-600 ml-2">{lang === 'zh' ? '完成配置后，在飞书开放平台发布应用，审核通过后即可使用。' : 'After configuration, publish the app on the Feishu Open Platform. It will be available once approved.'}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">{lang === 'zh' ? '使用说明' : 'Usage Instructions'}</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">{lang === 'zh' ? '私聊（Pairing 模式）' : 'Direct Message (Pairing Mode)'}</h4>
                    <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-2">
                      <li>{lang === 'zh' ? '在飞书中搜索并添加机器人，发送任意消息' : 'Search and add the bot in Feishu, send any message'}</li>
                      <li>{lang === 'zh' ? '机器人返回配对码' : 'The bot returns a pairing code'}</li>
                      <li>{lang === 'zh' ? '管理员在「Pairing 管理」标签页批准配对码' : 'Admin approves the pairing code in the "Pairing Management" tab'}</li>
                      <li>{lang === 'zh' ? '批准后用户即可正常对话' : 'After approval, the user can chat normally'}</li>
                    </ol>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 mb-1">{lang === 'zh' ? '群组使用' : 'Group Usage'}</h4>
                    <p className="text-gray-600 ml-2">{lang === 'zh' ? '将机器人添加到群组，在群组中 @机器人 发送消息即可。' : 'Add the bot to a group and @mention the bot to send messages.'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
