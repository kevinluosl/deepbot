/**
 * 连接器配置组件
 * 
 * 配置外部通讯工具（飞书、钉钉等）
 */

import React, { useState, useEffect, useRef } from 'react';

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
  verificationToken: string;
  encryptKey: string;
  botName: string;
  dmPolicy: 'open' | 'pairing' | 'allowlist';
  groupPolicy: 'open' | 'allowlist' | 'disabled';
  requireMention: boolean;
  allowFrom?: string[];
  groupAllowFrom?: string[];
}

interface PairingRecord {
  connectorId: string;
  userId: string;
  pairingCode: string;
  approved: boolean;
  createdAt: number;
  approvedAt?: number;
}

type TabType = 'config' | 'pairing';

export function ConnectorConfig({ onClose }: ConnectorConfigProps) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [feishuConfig, setFeishuConfig] = useState<FeishuConfig>({
    appId: '',
    appSecret: '',
    verificationToken: '',
    encryptKey: '',
    botName: 'DeepBot',
    dmPolicy: 'pairing',
    groupPolicy: 'open',
    requireMention: true,
  });
  const [pairingRecords, setPairingRecords] = useState<PairingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadingPairing, setLoadingPairing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
      const result = await window.deepbot.connectorGetAll();
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
      }
    } catch (error) {
      console.error('加载连接器列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConnectorConfig = async (connectorId: string) => {
    try {
      const result = await window.deepbot.connectorGetConfig(connectorId);
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success && actualResult.config) {
        setFeishuConfig(actualResult.config);
      }
      
      // 如果是 pairing 模式，加载 pairing 记录
      if (actualResult.config?.dmPolicy === 'pairing') {
        await loadPairingRecords(connectorId);
      }
    } catch (error) {
      console.error('加载连接器配置失败:', error);
    }
  };

  const loadPairingRecords = async (connectorId?: string) => {
    try {
      setLoadingPairing(true);
      const result = await window.deepbot.connectorGetPairingRecords(connectorId);
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success && actualResult.records) {
        setPairingRecords(actualResult.records);
      }
    } catch (error) {
      console.error('加载 Pairing 记录失败:', error);
    } finally {
      setLoadingPairing(false);
    }
  };

  const handleApprovePairing = async (pairingCode: string) => {
    try {
      const result = await window.deepbot.connectorApprovePairing(pairingCode);
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success) {
        showMessage('success', '配对已批准');
        await loadPairingRecords(selectedConnector || undefined);
      } else {
        showMessage('error', actualResult.error || '批准失败');
      }
    } catch (error) {
      showMessage('error', `批准失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleDeletePairing = async (connectorId: string, userId: string) => {
    if (!confirm('确定要删除此配对记录吗？')) {
      return;
    }
    
    try {
      const result = await window.deepbot.connectorDeletePairing(connectorId, userId);
      // 🔥 registerIpcHandler 会包装返回值为 { success: true, data: ... }
      const actualResult = result.data || result;
      
      if (actualResult.success) {
        showMessage('success', '配对记录已删除');
        await loadPairingRecords(selectedConnector || undefined);
      } else {
        showMessage('error', actualResult.error || '删除失败');
      }
    } catch (error) {
      showMessage('error', `删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSave = async () => {
    if (!selectedConnector) return;

    if (!feishuConfig.appId.trim()) {
      showMessage('error', '请输入 App ID');
      return;
    }
    if (!feishuConfig.appSecret.trim()) {
      showMessage('error', '请输入 App Secret');
      return;
    }
    if (!feishuConfig.botName.trim()) {
      showMessage('error', '请输入机器人名称');
      return;
    }

    setSaving(true);

    try {
      await window.deepbot.connectorSaveConfig(selectedConnector, {
        ...feishuConfig,
        enabled: false, // 保存时不自动启用
      });
      showMessage('success', '配置保存成功');
      await loadConnectors(); // 重新加载列表
    } catch (error) {
      showMessage('error', `保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async () => {
    if (!selectedConnector) return;

    const connector = connectors.find(c => c.id === selectedConnector);
    if (!connector?.hasConfig) {
      showMessage('error', '请先保存配置');
      return;
    }

    setStarting(true);

    try {
      await window.deepbot.connectorStart(selectedConnector);
      showMessage('success', '连接器已启动');
      await loadConnectors(); // 重新加载列表
    } catch (error) {
      showMessage('error', `启动失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!selectedConnector) return;

    setStarting(true);

    try {
      await window.deepbot.connectorStop(selectedConnector);
      showMessage('success', '连接器已停止');
      await loadConnectors(); // 重新加载列表
    } catch (error) {
      showMessage('error', `停止失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  const selectedConnectorData = connectors.find(c => c.id === selectedConnector);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">外部通讯配置</h3>
        <p className="text-sm text-gray-500">
          配置飞书、钉钉等外部通讯工具，让 AI 助手可以在这些平台上响应消息
        </p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`p-3 rounded-md ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 连接器列表 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1">
          {connectors.map((connector) => (
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
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  运行中
                </span>
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
                基础配置
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
                Pairing 管理
                {pairingRecords.filter(r => !r.approved).length > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    {pairingRecords.filter(r => !r.approved).length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* 基础配置标签页 */}
          {activeTab === 'config' && (
            <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">配置说明</h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>前往飞书开放平台创建企业自建应用</li>
              <li>获取 App ID 和 App Secret</li>
              <li>开启"接收消息"事件权限</li>
              <li>使用 WebSocket 长连接模式（无需公网 IP）</li>
            </ol>
          </div>

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
              placeholder="请输入 App Secret"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Verification Token */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Verification Token
            </label>
            <input
              type="text"
              value={feishuConfig.verificationToken}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, verificationToken: e.target.value })}
              placeholder="可选"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 机器人名称 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              机器人名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={feishuConfig.botName}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, botName: e.target.value })}
              placeholder="DeepBot"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* DM 策略 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              私聊策略
            </label>
            <select
              value={feishuConfig.dmPolicy}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, dmPolicy: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="open">开放（所有人可用）</option>
              <option value="pairing">配对模式（需要配对码）</option>
              <option value="allowlist">白名单模式</option>
            </select>
            <p className="text-xs text-gray-500">
              配对模式：用户首次私聊时会收到配对码，管理员批准后才能使用
            </p>
          </div>

          {/* 群组策略 */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              群组策略
            </label>
            <select
              value={feishuConfig.groupPolicy}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, groupPolicy: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="open">开放（所有群可用）</option>
              <option value="allowlist">白名单模式</option>
              <option value="disabled">禁用群消息</option>
            </select>
          </div>

          {/* 需要 @提及 */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="requireMention"
              checked={feishuConfig.requireMention}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, requireMention: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="requireMention" className="text-sm text-gray-700">
              群消息需要 @机器人
            </label>
          </div>

          {/* 操作按钮 */}
          <div className="flex space-x-3 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '保存中...' : '保存配置'}
            </button>
            
            {selectedConnectorData?.enabled ? (
              <button
                onClick={handleStop}
                disabled={starting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {starting ? '停止中...' : '停止连接器'}
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={starting || !selectedConnectorData?.hasConfig}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {starting ? '启动中...' : '启动连接器'}
              </button>
            )}
          </div>
        </div>
      )}

          {/* Pairing 管理标签页 */}
          {activeTab === 'pairing' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Pairing 说明</h4>
                <p className="text-sm text-blue-800">
                  当用户首次私聊机器人时，会收到一个配对码。管理员需要在此处批准配对码，用户才能正常使用机器人。
                </p>
              </div>

              {loadingPairing ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-gray-500">加载中...</div>
                </div>
              ) : pairingRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  暂无配对记录
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
                            <span className="text-sm font-medium text-gray-900 break-all">
                              用户 ID: {record.userId}
                            </span>
                            {record.approved ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 whitespace-nowrap">
                                已批准
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">
                                待批准
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            配对码: <span className="font-mono font-medium">{record.pairingCode}</span>
                          </div>
                          <div className="text-xs text-gray-400">
                            创建时间: {new Date(record.createdAt).toLocaleString('zh-CN')}
                            {record.approvedAt && (
                              <> · 批准时间: {new Date(record.approvedAt).toLocaleString('zh-CN')}</>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {!record.approved && (
                            <button
                              onClick={() => handleApprovePairing(record.pairingCode)}
                              className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors whitespace-nowrap"
                            >
                              批准
                            </button>
                          )}
                          <button
                            onClick={() => handleDeletePairing(record.connectorId, record.userId)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors whitespace-nowrap"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
