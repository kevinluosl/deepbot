/**
 * API 工具结果格式化函数
 * 
 * 负责将配置数据格式化为用户友好的消息
 */

/**
 * 格式化获取配置的结果消息
 */
export function formatGetConfigResult(result: any): string {
  let message = `✅ 系统配置查询成功\n\n`;
  
  if (result.workspace) {
    message += `📁 工作目录配置：\n`;
    message += `  • 工作目录: ${result.workspace.workspaceDir}\n`;
    if (result.workspace.workspaceDirs && result.workspace.workspaceDirs.length > 1) {
      message += `  • 额外工作目录: ${result.workspace.workspaceDirs.slice(1).join(', ')}\n`;
    }
    message += `  • 脚本目录: ${result.workspace.scriptDir}\n`;
    message += `  • Skill 目录: ${result.workspace.skillDirs.join(', ')}\n`;
    message += `  • 默认 Skill 目录: ${result.workspace.defaultSkillDir}\n`;
    message += `  • 图片目录: ${result.workspace.imageDir}\n`;
    message += `  • 记忆目录: ${result.workspace.memoryDir}\n`;
    message += `  • 会话目录: ${result.workspace.sessionDir}\n\n`;
  }
  
  if (result.model) {
    message += `🤖 模型配置：\n`;
    message += `  • 提供商类型: ${result.model.providerType}\n`;
    message += `  • 提供商: ${result.model.providerName}\n`;
    message += `  • 主模型: ${result.model.modelId}\n`;
    if (result.model.modelId2) {
      message += `  • 快速模型: ${result.model.modelId2}\n`;
    }
    message += `  • API 地址: ${result.model.baseUrl}\n`;
    message += `  • API Key: ${result.model.apiKey ? '已配置' : '未配置'}\n`;
    message += `  • 上下文窗口: ${result.model.contextWindow ? result.model.contextWindow.toLocaleString() + ' tokens' : '未设置'}\n\n`;
  }
  
  // 🔥 图片生成工具配置 - 即使未配置也显示
  if (result.imageGeneration !== undefined) {
    const imgDisabled = result.disabledTools?.includes('image_generation');
    message += `🎨 图片生成工具配置：${imgDisabled ? '⏸️ 已禁用' : '✅ 已启用'}\n`;
    if (result.imageGeneration) {
      message += `  • 模型: ${result.imageGeneration.model}\n`;
      message += `  • API 地址: ${result.imageGeneration.apiUrl}\n`;
      message += `  • API Key: ${result.imageGeneration.apiKey ? '已配置' : '未配置'}\n\n`;
    } else {
      message += `  • 暂无配置\n\n`;
    }
  }
  
  // 🔥 Web 搜索工具配置 - 即使未配置也显示
  if (result.webSearch !== undefined) {
    const wsDisabled = result.disabledTools?.includes('web_search');
    message += `🔍 Web 搜索工具配置：${wsDisabled ? '⏸️ 已禁用' : '✅ 已启用'}\n`;
    if (result.webSearch) {
      message += `  • 提供商: ${result.webSearch.provider}\n`;
      message += `  • 模型: ${result.webSearch.model}\n`;
      message += `  • API 地址: ${result.webSearch.apiUrl}\n`;
      message += `  • API Key: ${result.webSearch.apiKey ? '已配置' : '未配置'}\n\n`;
    } else {
      message += `  • 暂无配置\n\n`;
    }
  }
  
  // 🔥 添加 Connector 配置显示
  if (result.connectors !== undefined) {
    message += `📡 外部通讯配置：\n`;
    
    // 定义所有支持的连接器（目前只有飞书）
    const supportedConnectors = [
      { id: 'feishu', name: '飞书' },
    ];
    
    if (result.connectors && result.connectors.length > 0) {
      // 创建已配置连接器的映射
      const configuredMap = new Map<string, any>(
        result.connectors.map((c: any) => [c.connectorId, c])
      );
      
      // 显示所有支持的连接器
      for (const connector of supportedConnectors) {
        const config = configuredMap.get(connector.id);
        
        if (config) {
          message += `  • ${connector.name} (${connector.id}):\n`;
          message += `    - 状态: ${config.enabled ? '✅ 已启用' : '⏸️ 已禁用'}\n`;
          message += `    - App ID: ${config.config?.appId ? '已配置' : '未配置'}\n`;
          message += `    - App Secret: ${config.config?.appSecret ? '已配置' : '未配置'}\n`;
        } else {
          message += `  • ${connector.name} (${connector.id}): ❌ 未配置\n`;
        }
      }
    } else {
      // 没有任何配置，显示所有支持的连接器为未配置
      for (const connector of supportedConnectors) {
        message += `  • ${connector.name} (${connector.id}): ❌ 未配置\n`;
      }
    }
    message += '\n';
  }
  
  // 🔥 浏览器工具状态
  if (result.browserTool !== undefined) {
    const browserDisabled = result.disabledTools?.includes('browser');
    message += `🌐 浏览器工具状态：${browserDisabled ? '⏸️ 已禁用' : '✅ 已启用'}\n`;
    if (result.browserTool.chromeInstalled) {
      message += `  • Chrome 浏览器: ✅ 已安装\n`;
      if (result.browserTool.chromePath) {
        message += `  • 安装路径: ${result.browserTool.chromePath}\n`;
      }
    } else {
      message += `  • Chrome 浏览器: ❌ 未安装\n`;
      if (result.browserTool.error) {
        message += `  • 错误信息: ${result.browserTool.error}\n`;
      }
      message += `  • 提示: 浏览器工具需要安装 Google Chrome 浏览器\n`;
    }
    message += '\n';
  }
  
  return message;
}

/**
 * 格式化设置工作目录配置的结果消息
 */
export function formatSetWorkspaceConfigResult(params: any): string {
  let message = `✅ 工作目录配置已更新\n\n`;
  
  if (params.workspaceDir) {
    message += `  • 工作目录: ${params.workspaceDir}\n`;
  }
  if (params.scriptDir) {
    message += `  • 脚本目录: ${params.scriptDir}\n`;
  }
  if (params.skillDirs) {
    message += `  • Skill 目录: ${params.skillDirs.join(', ')}\n`;
  }
  if (params.defaultSkillDir) {
    message += `  • 默认 Skill 目录: ${params.defaultSkillDir}\n`;
  }
  if (params.imageDir) {
    message += `  • 图片目录: ${params.imageDir}\n`;
  }
  if (params.memoryDir) {
    message += `  • 记忆目录: ${params.memoryDir}\n`;
  }
  if (params.sessionDir) {
    message += `  • 会话目录: ${params.sessionDir}\n`;
  }
  
  message += `\n⚠️ 注意：配置已更新，下次创建新会话时生效`;
  
  return message;
}

/**
 * 格式化设置模型配置的结果消息
 */
export function formatSetModelConfigResult(params: any): string {
  let message = `✅ 模型配置已更新\n\n`;
  
  if (params.providerType) {
    message += `  • 提供商类型: ${params.providerType}\n`;
  }
  if (params.providerName) {
    message += `  • 提供商: ${params.providerName}\n`;
  }
  if (params.modelId) {
    message += `  • 主模型: ${params.modelId}\n`;
  }
  if (params.modelId2 !== undefined) {
    message += `  • 快速模型: ${params.modelId2 || '未设置'}\n`;
  }
  if (params.baseUrl) {
    message += `  • API 地址: ${params.baseUrl}\n`;
  }
  if (params.apiKey) {
    message += `  • API Key: 已更新\n`;
  }
  if (params.contextWindow) {
    message += `  • 上下文窗口: ${params.contextWindow.toLocaleString()} tokens\n`;
  }
  
  message += `\n⚠️ 注意：配置已更新，下次创建新会话时生效`;
  
  return message;
}

/**
 * 格式化设置图片生成工具配置的结果消息
 */
export function formatSetImageGenerationConfigResult(params: any): string {
  let message = `✅ 图片生成工具配置已更新\n\n`;
  
  if (params.model) {
    message += `  • 模型: ${params.model}\n`;
  }
  if (params.apiUrl) {
    message += `  • API 地址: ${params.apiUrl}\n`;
  }
  if (params.apiKey) {
    message += `  • API Key: 已更新\n`;
  }
  
  message += `\n⚠️ 注意：配置已更新，下次创建新会话时生效`;
  
  return message;
}

/**
 * 格式化设置 Web 搜索工具配置的结果消息
 */
export function formatSetWebSearchConfigResult(params: any): string {
  let message = `✅ Web 搜索工具配置已更新\n\n`;
  
  if (params.provider) {
    message += `  • 提供商: ${params.provider}\n`;
  }
  if (params.model) {
    message += `  • 模型: ${params.model}\n`;
  }
  if (params.apiUrl) {
    message += `  • API 地址: ${params.apiUrl}\n`;
  }
  if (params.apiKey) {
    message += `  • API Key: 已更新\n`;
  }
  
  message += `\n⚠️ 注意：配置已更新，下次创建新会话时生效`;
  
  return message;
}

/**
 * 格式化获取名字配置的结果消息
 */
export function formatGetNameConfigResult(nameConfig: any): string {
  return `✅ 名字配置查询成功\n\n` +
    `👤 智能体名字: ${nameConfig.agentName}\n` +
    `👥 用户称呼: ${nameConfig.userName}`;
}

/**
 * 格式化设置名字配置的结果消息
 */
export function formatSetNameConfigResult(params: any, currentConfig: any, isGlobal: boolean): string {
  let message = `✅ 名字配置已更新\n\n`;
  
  if (params.agentName) {
    if (isGlobal) {
      message += `  • 智能体名字（全局）: ${currentConfig.agentName} → ${params.agentName}\n`;
      message += `  • 影响范围: 所有未单独设置名字的 Tab\n`;
    } else {
      message += `  • 智能体名字（当前 Tab）: ${params.agentName}\n`;
      message += `  • 影响范围: 仅当前 Tab\n`;
    }
  }
  if (params.userName) {
    message += `  • 用户称呼: ${currentConfig.userName} → ${params.userName}\n`;
  }
  
  message += `\n✨ 配置已立即生效`;
  
  return message;
}


/**
 * 格式化设置飞书连接器配置的结果消息
 */
export function formatSetFeishuConnectorConfigResult(params: any, enabled: boolean): string {
  let message = `✅ 飞书连接器配置已更新\n\n`;
  
  message += `  • App ID: ${params.appId}\n`;
  message += `  • App Secret: 已设置\n`;
  message += `  • 状态: ${enabled ? '✅ 已启用' : '⏸️ 已禁用'}\n`;
  
  message += `\n⚠️ 注意：配置已保存，${enabled ? '飞书连接器将在下次启动时生效' : '需要启用后才能使用'}`;
  
  return message;
}


/**
 * 格式化启用/禁用连接器的结果消息
 */
export function formatSetConnectorEnabledResult(params: { connectorId: string; enabled: boolean }): string {
  const connectorNames: Record<string, string> = {
    feishu: '飞书',
  };
  
  const connectorName = connectorNames[params.connectorId] || params.connectorId;
  
  if (params.enabled) {
    return `✅ ${connectorName}连接器已启用并立即启动\n\n连接器已在后台运行，可以立即接收和处理消息`;
  } else {
    return `⏸️ ${connectorName}连接器已禁用并立即停止\n\n连接器已停止运行，不再接收和处理消息`;
  }
}


/**
 * 格式化获取配对记录的结果消息
 */
export function formatGetPairingRecordsResult(
  records: Array<{
    connectorId: string;
    connectorName: string;
    userId: string;
    openId?: string;
    userName?: string;
    isAdmin?: boolean;
    pairingCode: string;
    approved: boolean;
    createdAt: string;
    approvedAt?: string;
  }>,
  pendingCount: number,
  approvedCount: number
): string {
  let message = `✅ 配对记录查询成功\n\n`;
  
  message += `📊 统计信息：\n`;
  message += `  • 待审核: ${pendingCount} 个\n`;
  message += `  • 已审核: ${approvedCount} 个\n`;
  message += `  • 总计: ${records.length} 个\n\n`;
  
  if (records.length === 0) {
    message += `暂无配对记录`;
    return message;
  }
  
  // 按连接器分组
  const groupedRecords: Record<string, typeof records> = {};
  for (const record of records) {
    if (!groupedRecords[record.connectorId]) {
      groupedRecords[record.connectorId] = [];
    }
    groupedRecords[record.connectorId].push(record);
  }
  
  // 显示每个连接器的配对记录
  for (const [connectorId, connectorRecords] of Object.entries(groupedRecords)) {
    const connectorName = connectorRecords[0].connectorName;
    message += `📱 ${connectorName} (${connectorId})：\n`;
    
    for (const record of connectorRecords) {
      const status = record.approved ? '✅ 已审核' : '⏳ 待审核';
      const adminTag = record.isAdmin ? ' 👑 管理员' : '';
      const createdTime = new Date(record.createdAt).toLocaleString('zh-CN');
      
      message += `  • 用户: ${record.userName || '未知'}${adminTag}\n`;
      message += `    - userId (user_id): ${record.userId}\n`;
      if (record.openId) {
        message += `    - openId (open_id): ${record.openId}\n`;
      }
      message += `    - 配对码: ${record.pairingCode}\n`;
      message += `    - 状态: ${status}\n`;
      message += `    - 创建时间: ${createdTime}\n`;
      
      if (record.approved && record.approvedAt) {
        const approvedTime = new Date(record.approvedAt).toLocaleString('zh-CN');
        message += `    - 审核时间: ${approvedTime}\n`;
      }
      
      message += `\n`;
    }
  }
  
  return message;
}

/**
 * 格式化审核配对的结果消息
 */
export function formatApprovePairingResult(
  pairingCode: string,
  record: { connectorId: string; userId: string }
): string {
  const connectorNames: Record<string, string> = {
    feishu: '飞书',
  };
  
  const connectorName = connectorNames[record.connectorId] || record.connectorId;
  
  return `✅ 配对请求已审核通过\n\n` +
    `  • 配对码: ${pairingCode}\n` +
    `  • 连接器: ${connectorName}\n` +
    `  • 用户 ID: ${record.userId}\n\n` +
    `⚠️ 注意：用户现在可以通过该连接器与 DeepBot 进行私聊`;
}

/**
 * 格式化拒绝配对的结果消息
 */
export function formatRejectPairingResult(connectorId: string, userId: string): string {
  const connectorNames: Record<string, string> = {
    feishu: '飞书',
  };
  
  const connectorName = connectorNames[connectorId] || connectorId;
  
  return `❌ 配对请求已拒绝\n\n` +
    `  • 连接器: ${connectorName}\n` +
    `  • 用户 ID: ${userId}\n\n` +
    `⚠️ 注意：该用户的配对记录已删除，需要重新申请配对`;
}

/**
 * 格式化 Tab 列表查询结果
 */
export function formatGetTabsResult(tabs: any[], groupNameQuery?: string): string {
  if (tabs.length === 0) {
    return groupNameQuery
      ? `未找到群名称包含"${groupNameQuery}"的 Tab`
      : '当前没有任何 Tab';
  }

  const lines: string[] = [];
  if (groupNameQuery) {
    lines.push(`🔍 群名称包含"${groupNameQuery}"的 Tab（共 ${tabs.length} 个）：\n`);
  } else {
    lines.push(`📋 当前所有 Tab（共 ${tabs.length} 个）：\n`);
  }

  for (const tab of tabs) {
    lines.push(`- 标题：${tab.title}`);
    lines.push(`  类型：${tab.typeLabel}`);
    if (tab.connectorId) lines.push(`  连接器：${tab.connectorId}`);
    if (tab.conversationId) lines.push(`  chat_id：${tab.conversationId}`);
    if (tab.groupName) lines.push(`  群名称：${tab.groupName}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
