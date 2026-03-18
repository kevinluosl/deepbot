/**
 * 名称配置和会话时间相关的处理函数
 * 处理智能体名称、用户称呼、会话文件路径、日期时间等功能
 */

import * as formatters from '../api-tool.formatters';
import {
  ToolResult,
  checkAbortSignal,
  getSystemConfigStore,
  createSuccessResponse,
  createErrorResponse,
  getGatewayInstance,
  sendToFrontend,
} from './handler-utils';
import { createLogger } from '../../../shared/utils/logger';

// ==================== 日志记录器 ====================

const logger = createLogger('Name-Session-Handlers');

// ==================== 获取名字配置 ====================

/**
 * 获取名字配置
 */
export async function handleGetNameConfig(
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('获取名字配置');
    
    checkAbortSignal(signal, '获取配置');
    
    const store = await getSystemConfigStore();
    const nameConfig = store.getNameConfig();
    
    return createSuccessResponse(
      formatters.formatGetNameConfigResult(nameConfig),
      { nameConfig }
    );
  } catch (error) {
    return createErrorResponse(error, '获取名字配置');
  }
}

/**
 * 设置名字配置
 * 
 * 根据 sessionId 判断：
 * - 主 Tab (default)：设置全局名字，影响所有未单独设置名字的 Tab
 * - 非主 Tab：只设置当前 Tab 的名字
 * 
 * 注意：用户称呼只能在主 Tab 设置
 */
export async function handleSetNameConfig(
  sessionId: string,
  params: Partial<{
    agentName: string;
    userName: string;
  }>,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('设置名字配置:', { sessionId, params });
    
    checkAbortSignal(signal, '设置配置');
    
    // 至少需要提供一个参数
    if (!params.agentName && !params.userName) {
      throw new Error('至少需要提供 agentName 或 userName 参数');
    }
    
    // 判断是否是主 Tab
    const isMainTab = sessionId === 'default';
    
    const store = await getSystemConfigStore();
    const currentConfig = store.getNameConfig();
    
    // 根据 Tab 类型处理名字设置
    if (isMainTab) {
      // 主 Tab：设置全局名字
      if (params.agentName) {
        store.saveAgentName(params.agentName);
      }
      
      if (params.userName) {
        store.saveUserName(params.userName);
      }
      
      // 获取更新后的配置
      const updatedConfig = store.getNameConfig();
      
      // 更新 Gateway 中所有相关 Tab 的 title
      const gateway = await getGatewayInstance();
      if (gateway && params.agentName) {
        const tabManager = (gateway as any).tabManager;
        if (!tabManager) {
          logger.warn('TabManager 未初始化，无法更新 Tab title');
        } else {
          const tabs = tabManager.getTabs();
          
          // 更新主 Tab 的 title
          const defaultTab = tabs.get('default');
          if (defaultTab) {
            defaultTab.title = params.agentName;
            logger.info('已更新主 Tab title:', params.agentName);
          }
          
          // 遍历所有 Tab，更新没有独立名字的 Tab
          const updatedTabIds: string[] = ['default'];
          
          for (const [tabId, tab] of tabs.entries()) {
            if (tabId === 'default') continue;
            
            // 检查 Tab 是否有独立的 Agent 名字
            const tabConfig = store.getTabConfig(tabId);
            const hasIndependentName = tabConfig?.agentName != null;
            
            if (!hasIndependentName) {
              // 没有独立名字的 Tab，需要更新 title
              const match = tab.title.match(/\s+(\d+)$/);
              const number = match ? match[1] : '';
              
              if (number) {
                tab.title = `${params.agentName} ${number}`;
                logger.info(`已更新 Tab ${tabId} title: ${tab.title}`);
                updatedTabIds.push(tabId);
              }
            }
          }
          
          logger.info(`共更新了 ${updatedTabIds.length} 个 Tab 的 title`);
        }
      }
      
      // 发送事件到前端
      await sendToFrontend('name-config:updated', {
        agentName: updatedConfig.agentName,
        userName: updatedConfig.userName,
        isGlobalUpdate: true,
      });
      logger.info('已发送名字配置更新事件到前端:', updatedConfig);
      
      // 重新加载系统提示词
      if (gateway) {
        logger.info('触发系统提示词重新加载...');
        await gateway.reloadSystemPrompts();
        logger.info('系统提示词已重新加载');
      } else {
        logger.warn('Gateway 实例未设置，无法重新加载系统提示词');
      }
      
      return createSuccessResponse(
        formatters.formatSetNameConfigResult(params, currentConfig, true),
        { isGlobal: true, oldConfig: currentConfig, newConfig: updatedConfig }
      );
    } else {
      // 非主 Tab：只设置当前 Tab 的名字
      
      // 用户称呼只能在主 Tab 设置
      if (params.userName) {
        throw new Error('用户称呼只能在主 Tab 设置');
      }
      
      if (params.agentName) {
        // 保存 Tab 独立的 Agent 名字
        store.updateTabAgentName(sessionId, params.agentName);
        
        // 更新 Tab 的 title
        const gateway = await getGatewayInstance();
        if (gateway) {
          const tabManager = (gateway as any).tabManager;
          if (!tabManager) {
            logger.warn('TabManager 未初始化，无法更新 Tab title');
          } else {
            const tabs = tabManager.getTabs();
            const tab = tabs.get(sessionId);
            
            if (tab) {
              tab.title = params.agentName;
              logger.info(`已更新 Tab title: ${sessionId} -> ${params.agentName}`);
              
              // 如果 Tab 是持久化的，更新数据库
              if (tab.isPersistent) {
                const { saveTabConfig } = await import('../../database/tab-config');
                const tabType = tab.type === 'scheduled_task' ? 'task' : tab.type === 'connector' ? 'connector' : 'manual';
                
                saveTabConfig((store as any).db, {
                  id: tab.id,
                  title: tab.title,
                  type: tabType,
                  memoryFile: tab.memoryFile || null,
                  agentName: params.agentName,
                  isPersistent: tab.isPersistent,
                  createdAt: tab.createdAt,
                  lastActiveAt: tab.lastActiveAt,
                });
              }
            }
          }
        }
        
        // 发送事件到前端
        await sendToFrontend('name-config:updated', { 
          tabId: sessionId,
          agentName: params.agentName,
          userName: currentConfig.userName,
        });
        logger.info('已发送 Tab 名字更新事件到前端:', { sessionId, agentName: params.agentName });
        
        // 只重新加载当前 Tab 的系统提示词
        if (gateway) {
          logger.info('触发当前 Tab 系统提示词重新加载...');
          await gateway.reloadSessionSystemPrompt(sessionId);
          logger.info('当前 Tab 系统提示词已重新加载');
        } else{
          logger.warn('Gateway 实例未设置，无法重新加载系统提示词');
        }
        
        return createSuccessResponse(
          formatters.formatSetNameConfigResult(params, currentConfig, false),
          { isGlobal: false, tabId: sessionId, agentName: params.agentName }
        );
      }
    }
    
    // 不应该到达这里
    throw new Error('未知错误');
  } catch (error) {
    return createErrorResponse(error, '设置名字配置');
  }
}

/**
 * 获取当前 Tab 的 Session 文件路径
 */
export async function handleGetSessionFilePath(
  sessionId: string,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('获取 Session 文件路径:', sessionId);
    
    checkAbortSignal(signal, '获取 Session 文件路径');
    
    const gateway = await getGatewayInstance();
    if (!gateway) {
      throw new Error('Gateway 实例未初始化');
    }
    
    // 获取 Session 文件路径
    const sessionManager = (gateway as any).sessionManager;
    if (!sessionManager) {
      throw new Error('SessionManager 未初始化');
    }
    
    const filePath = sessionManager.getSessionFilePath(sessionId);
    
    return createSuccessResponse(
      `✅ 当前 Tab 的 Session 文件路径：\n${filePath}`,
      { sessionId, filePath }
    );
  } catch (error) {
    return createErrorResponse(error, '获取 Session 文件路径');
  }
}

/**
 * 获取系统当前日期时间和时区信息
 */
export async function handleGetDateTime(
  args: { format?: string; timezone?: string },
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    logger.info('获取日期时间:', args);
    
    checkAbortSignal(signal, '获取日期时间');
    
    // 使用统一的日期时间工具
    const { getSystemTimezone, getDetailedDateTime } = await import('../../../shared/utils/datetime-utils');
    
    const format = args.format || 'full';
    const timezone = args.timezone || getSystemTimezone();
    
    // 获取详细的日期时间信息
    const dateTimeInfo = getDetailedDateTime({ timezone });
    
    // 根据格式返回相应的时间字符串
    let formattedTime: string;
    let description: string;
    
    switch (format) {
      case 'date':
        formattedTime = dateTimeInfo.formatted.date;
        description = '仅日期';
        break;
        
      case 'time':
        formattedTime = dateTimeInfo.formatted.time;
        description = '仅时间';
        break;
        
      case 'datetime':
        formattedTime = dateTimeInfo.formatted.datetime;
        description = '日期时间';
        break;
        
      case 'iso':
        formattedTime = dateTimeInfo.iso;
        description = 'ISO 格式';
        break;
        
      case 'timestamp':
        formattedTime = dateTimeInfo.timestamp.toString();
        description = '时间戳（毫秒）';
        break;
        
      case 'full':
      default:
        formattedTime = `${dateTimeInfo.formatted.date} ${dateTimeInfo.formatted.time} (${timezone})`;
        description = '完整格式';
        break;
    }
    
    // 构建详细信息
    const details = {
      success: true,
      currentTime: formattedTime,
      format: format,
      timezone: timezone,
      systemTimezone: dateTimeInfo.timezone,
      timestamp: dateTimeInfo.timestamp,
      iso: dateTimeInfo.iso,
      offsetString: dateTimeInfo.offsetString,
      year: dateTimeInfo.year,
      month: dateTimeInfo.month,
      day: dateTimeInfo.day,
      hour: dateTimeInfo.hour,
      minute: dateTimeInfo.minute,
      second: dateTimeInfo.second,
      weekday: dateTimeInfo.weekday,
    };
    
    // 构建响应消息
    let message = `🕐 当前时间（${description}）：${formattedTime}`;
    
    if (format === 'full') {
      message += `\n\n📊 详细信息：`;
      message += `\n• 系统时区：${dateTimeInfo.timezone}`;
      message += `\n• 时区偏移：UTC${dateTimeInfo.offsetString}`;
      message += `\n• 时间戳：${dateTimeInfo.timestamp}`;
      message += `\n• ISO 格式：${dateTimeInfo.iso}`;
    }
    
    return createSuccessResponse(message, details);
  } catch (error) {
    return createErrorResponse(error, '获取日期时间');
  }
}