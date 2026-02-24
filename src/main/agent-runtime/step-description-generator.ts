/**
 * 步骤描述生成器
 * 
 * 职责：根据工具名称和参数生成人类可读的步骤描述
 */

/**
 * 生成人类可读的步骤描述
 * 
 * @param toolName - 工具名称
 * @param params - 工具参数
 * @returns 人类可读的描述
 */
export function generateStepDescription(toolName: string, params: any): string {
  try {
    switch (toolName) {
      case 'browser':
        return describeBrowserAction(params);
      
      case 'read':
        return `读取文件: ${params.path || '未知文件'}`;
      
      case 'write':
        return `写入文件: ${params.path || '未知文件'}`;
      
      case 'edit':
        return `编辑文件: ${params.path || '未知文件'}`;
      
      case 'bash':
        const cmd = params.command || params.cmd || '';
        const shortCmd = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;
        return `执行命令: ${shortCmd}`;
      
      case 'calendar_get_events':
        return '获取日历事件';
      
      case 'calendar_create_event':
        return `创建日历事件: ${params.title || '未命名事件'}`;
      
      default:
        return `执行工具: ${toolName}`;
    }
  } catch (error) {
    return `执行工具: ${toolName}`;
  }
}

/**
 * 描述浏览器操作
 * 
 * @param params - 浏览器工具参数
 * @returns 人类可读的描述
 */
function describeBrowserAction(params: any): string {
  const action = params.action;
  
  switch (action) {
    case 'start':
      return '启动浏览器';
    
    case 'open':
      const url = params.targetUrl || params.url || '';
      const shortUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return `打开网页: ${shortUrl}`;
    
    case 'navigate':
      const navUrl = params.targetUrl || params.url || '';
      const shortNavUrl = navUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return `导航到: ${shortNavUrl}`;
    
    case 'snapshot':
      return '获取页面快照';
    
    case 'act':
      const request = params.request || {};
      const kind = request.kind || '';
      const selector = request.selector || '';
      
      if (kind === 'click') {
        if (selector.startsWith('@')) {
          return `点击元素`;
        }
        return `点击: ${selector}`;
      } else if (kind === 'type') {
        return `输入文本`;
      } else if (kind === 'scroll') {
        return '滚动页面';
      }
      return '执行页面操作';
    
    case 'wait':
      const timeoutMs = params.timeoutMs || params.timeout || 0;
      const seconds = Math.floor(timeoutMs / 1000);
      return `等待 ${seconds} 秒`;
    
    case 'screenshot':
      return '截取屏幕截图';
    
    case 'saveScreenshot':
      const path = params.path || '';
      const filename = path.split('/').pop() || '截图';
      return `保存截图: ${filename}`;
    
    case 'close':
      return '关闭浏览器';
    
    default:
      return `浏览器操作: ${action}`;
  }
}
