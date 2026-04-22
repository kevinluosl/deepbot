/**
 * 工具检查相关的处理函数
 * 检查浏览器工具和邮件工具的状态
 */

import { getErrorMessage } from '../../../shared/utils/error-handler';

/**
 * 检查浏览器工具状态（Chrome 安装情况）
 */
export async function checkBrowserToolStatus(): Promise<{
  chromeInstalled: boolean;
  chromePath?: string;
  error?: string;
}> {
  try {
    const { platform } = await import('os');
    const { existsSync } = await import('fs');
    const { isDockerMode } = await import('../../../shared/utils/docker-utils');
    
    // Docker 模式：检查 Playwright 内置 Chromium
    if (isDockerMode()) {
      try {
        const { execSync } = await import('child_process');
        const chromiumPath = execSync(
          'find /ms-playwright -name "chrome" -path "*/chrome-linux/*" 2>/dev/null | head -1',
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();
        
        if (chromiumPath && existsSync(chromiumPath)) {
          return {
            chromeInstalled: true,
            chromePath: chromiumPath,
          };
        }
      } catch {
        // find 命令失败，继续检查常见路径
      }
      
      // 降级：检查常见 Chromium 路径
      const linuxPaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
      ];
      const found = linuxPaths.find(p => existsSync(p));
      if (found) {
        return { chromeInstalled: true, chromePath: found };
      }
      
      return {
        chromeInstalled: false,
        error: 'Playwright Chromium 未安装，请执行: npx playwright install chromium --with-deps',
      };
    }
    
    const platformName = platform();
    let chromePath: string;
    
    // Chrome 默认安装路径
    if (platformName === 'darwin') {
      chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else if (platformName === 'win32') {
      const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];
      chromePath = possiblePaths.find(p => existsSync(p)) || possiblePaths[0];
    } else {
      // Linux（非 Docker）
      const linuxPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
      chromePath = linuxPaths.find(p => existsSync(p)) || '/usr/bin/google-chrome';
    }
    
    const installed = existsSync(chromePath);
    
    return {
      chromeInstalled: installed,
      chromePath: installed ? chromePath : undefined,
      error: installed ? undefined : 'Chrome 浏览器未安装或不在默认路径',
    };
  } catch (error) {
    return {
      chromeInstalled: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * 检查邮件工具配置状态
 */
export async function checkEmailToolConfig(workspaceDir: string): Promise<{
  configured: boolean;
  configPath?: string;
  error?: string;
}> {
  try {
    const { existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const { safeJsonParse } = await import('../../../shared/utils/json-utils');
    
    // 配置文件查找顺序：项目级别 > 用户级别
    const configPaths = [
      join(workspaceDir, '.deepbot', 'tools', 'email-tool', 'config.json'),
      join(homedir(), '.deepbot', 'tools', 'email-tool', 'config.json'),
    ];
    
    for (const configPath of configPaths) {
      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf-8');
          const config = safeJsonParse<any>(content, {});
          
          // 验证必填字段
          if (!config.user || !config.password || !config.smtpServer) {
            return {
              configured: false,
              configPath,
              error: '配置文件存在但缺少必填字段（user、password、smtpServer）',
            };
          }
          
          return {
            configured: true,
            configPath,
          };
        } catch (error) {
          return {
            configured: false,
            configPath,
            error: `配置文件解析失败: ${getErrorMessage(error)}`,
          };
        }
      }
    }
    
    // 未找到配置文件
    return {
      configured: false,
      error: '未找到邮件工具配置文件',
    };
  } catch (error) {
    return {
      configured: false,
      error: getErrorMessage(error),
    };
  }
}