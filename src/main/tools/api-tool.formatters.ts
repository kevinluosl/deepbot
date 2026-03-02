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
    message += `  • 脚本目录: ${result.workspace.scriptDir}\n`;
    message += `  • Skill 目录: ${result.workspace.skillDirs.join(', ')}\n`;
    message += `  • 默认 Skill 目录: ${result.workspace.defaultSkillDir}\n`;
    message += `  • 图片目录: ${result.workspace.imageDir}\n`;
    message += `  • 记忆目录: ${result.workspace.memoryDir}\n\n`;
  }
  
  if (result.model) {
    message += `🤖 模型配置：\n`;
    message += `  • 提供商类型: ${result.model.providerType}\n`;
    message += `  • 提供商: ${result.model.providerName}\n`;
    message += `  • 主模型: ${result.model.modelName}\n`;
    if (result.model.modelId2) {
      message += `  • 快速模型: ${result.model.modelId2}\n`;
    }
    message += `  • API 地址: ${result.model.baseUrl}\n`;
    message += `  • API Key: ${result.model.apiKey ? '已配置' : '未配置'}\n`;
    message += `  • 上下文窗口: ${result.model.contextWindow ? result.model.contextWindow.toLocaleString() + ' tokens' : '未设置'}\n\n`;
  }
  
  if (result.imageGeneration) {
    message += `🎨 图片生成工具配置：\n`;
    message += `  • 模型: ${result.imageGeneration.model}\n`;
    message += `  • API 地址: ${result.imageGeneration.apiUrl}\n`;
    message += `  • API Key: ${result.imageGeneration.apiKey ? '已配置' : '未配置'}\n\n`;
  }
  
  if (result.webSearch) {
    message += `🔍 Web 搜索工具配置：\n`;
    message += `  • 提供商: ${result.webSearch.provider}\n`;
    message += `  • 模型: ${result.webSearch.model}\n`;
    message += `  • API 地址: ${result.webSearch.apiUrl}\n`;
    message += `  • API Key: ${result.webSearch.apiKey ? '已配置' : '未配置'}\n`;
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
  if (params.modelName) {
    message += `  • 主模型: ${params.modelName}\n`;
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
