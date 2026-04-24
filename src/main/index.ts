/**
 * DeepBot 主进程入口
 * 
 * 职责：
 * - 创建 Electron 窗口
 * - 初始化 Gateway
 * - 管理应用生命周期
 * - 系统托盘管理
 */

// Polyfill for undici in Electron main process
// undici 需要 File API，但 Electron 主进程中没有，所以需要 polyfill
if (typeof globalThis.File === 'undefined') {
  // @ts-ignore
  globalThis.File = class File {
    constructor(bits: any[], name: string, options?: any) {
      // 简单的 polyfill，只是为了让 undici 不报错
      return new Blob(bits, options);
    }
  };
}

import { app, BrowserWindow, ipcMain, Menu, MenuItem, dialog, Tray, nativeImage, shell } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { Gateway } from './gateway';
import { IPC_CHANNELS } from '../types/ipc';
import { registerModelConfigHandlers, setGatewayForModelConfig } from './ipc/model-config-handler';
import { hasConfig } from './config';
import { getErrorMessage } from '../shared/utils/error-handler';
import { ensureDirectoryExists } from '../shared/utils/fs-utils';
import { generateExecutionId } from '../shared/utils/id-generator';
import { safeJsonParse } from '../shared/utils/json-utils';
import { ensureWorkspaceDirectories } from './utils/ensure-directories';
import { SystemConfigStore } from './database/system-config-store';

let mainWindow: BrowserWindow | null = null;
let gateway: Gateway | null = null;
let tray: Tray | null = null; // 🔥 系统托盘
let isQuitting = false; // 🔥 是否正在退出（用于区分关闭窗口和退出应用）

/**
 * 创建系统托盘
 */
function createTray() {
  // 🔥 根据平台选择不同的托盘图标
  let iconFileName = 's-logo.png'; // 默认图标
  
  if (process.platform === 'win32') {
    iconFileName = 's-logo-win.png'; // Windows 专用图标
  } else if (process.platform === 'darwin') {
    iconFileName = 's-logo-mac.png'; // macOS 专用图标
  }
  
  const iconPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, `../../src/renderer/assets/${iconFileName}`)
    : path.join(process.resourcesPath, `app.asar.unpacked/src/renderer/assets/${iconFileName}`);
  
  // 🔥 创建托盘图标
  const icon = nativeImage.createFromPath(iconPath);
  
  if (process.platform === 'darwin') {
    // macOS 托盘图标设置
    icon.setTemplateImage(true); // 使用模板图像（自动适配深色/浅色模式）
  }
  
  tray = new Tray(icon);
  
  // 🔥 设置托盘提示文字
  tray.setToolTip('DeepBot Terminal');
  
  // 🔥 创建托盘菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      type: 'separator',
    },
    {
      label: '退出',
      click: () => {
        // 🔥 设置标志，允许真正退出
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // 🔥 点击托盘图标显示窗口（Windows 和 Linux）
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
  
  console.log('[Tray] ✅ 系统托盘已创建');
}

/**
 * 创建主窗口
 */
function createWindow() {
  // 🔥 根据平台选择不同的窗口图标
  let iconFileName = 's-logo.png'; // 默认图标
  
  if (process.platform === 'win32') {
    iconFileName = 's-logo-win.png'; // Windows 专用图标
  } else if (process.platform === 'darwin') {
    iconFileName = 's-logo-mac.png'; // macOS 专用图标
  }
  
  const windowIconPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, `../../src/renderer/assets/${iconFileName}`)
    : path.join(process.resourcesPath, `app.asar.unpacked/src/renderer/assets/${iconFileName}`);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'DeepBot Terminal', // 🔥 设置窗口标题
    icon: windowIconPath, // 🔥 设置窗口图标
    backgroundColor: '#0a0e1a', // 🔥 设置背景色（深蓝黑色）
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset' as const, // macOS 隐藏标题栏（保留交通灯按钮）
      trafficLightPosition: { x: 15, y: 15 }, // macOS 交通灯位置
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../main/preload.js'), // 修正路径
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发模式加载 Vite 开发服务器
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式加载构建后的文件
    const indexPath = path.join(__dirname, '../../dist/index.html');
    console.log('Loading index.html from:', indexPath);
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Failed to load index.html:', err);
    });
  }

  // 监听渲染进程的控制台输出
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer ${level}] ${message} (${sourceId}:${line})`);
  });

  // 监听渲染进程错误
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load page:', errorCode, errorDescription);
  });

  // 添加快捷键：Cmd+Option+I 打开开发者工具（生产环境也可用）
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.alt && input.key.toLowerCase() === 'i' && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // 🔥 拦截窗口关闭事件，最小化到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      
      // 🔥 macOS 和 Windows 显示不同的提示
      if (process.platform === 'darwin') {
        console.log('[Main] 窗口已隐藏到 Dock');
      } else {
        console.log('[Main] 窗口已最小化到系统托盘');
      }
      
      return false;
    }
  });

  // 拦截外部链接，使用系统默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('data:')) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // 拦截页面内导航到外部链接
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() || '';
    // 如果不是当前页面的刷新/内部导航，用系统浏览器打开
    if (url !== currentUrl && !url.startsWith('file://') && !url.startsWith('http://localhost')) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  // 添加右键菜单支持
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();
    
    // 如果是图片，添加"另存为"选项
    if (params.mediaType === 'image') {
      menu.append(new MenuItem({
        label: '另存为...',
        click: async () => {
          try {
            // 显示保存对话框
            const result = await dialog.showSaveDialog(mainWindow!, {
              defaultPath: params.suggestedFilename || 'image.png',
              filters: [
                { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
                { name: '所有文件', extensions: ['*'] }
              ]
            });
            
            if (!result.canceled && result.filePath) {
              // 下载图片
              mainWindow!.webContents.downloadURL(params.srcURL);
              
              // 监听下载完成事件
              const downloadListener = (_e: any, item: any) => {
                // 设置保存路径
                item.setSavePath(result.filePath);
                
                item.once('done', (_event: any, state: string) => {
                  if (state === 'completed') {
                    console.log('[Main] 图片保存成功:', result.filePath);
                  } else {
                    console.error('[Main] 图片保存失败:', state);
                  }
                });
              };
              
              mainWindow!.webContents.session.once('will-download', downloadListener);
            }
          } catch (error) {
            console.error('[Main] 保存图片失败:', error);
          }
        }
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
    }
    
    // 文本选择相关操作
    if (params.selectionText) {
      menu.append(new MenuItem({
        label: '复制',
        role: 'copy'
      }));
    }
    
    // 如果是可编辑区域（输入框）
    if (params.isEditable) {
      if (params.selectionText) {
        menu.append(new MenuItem({
          label: '剪切',
          role: 'cut'
        }));
      }
      
      menu.append(new MenuItem({
        label: '粘贴',
        role: 'paste'
      }));
      
      menu.append(new MenuItem({ type: 'separator' }));
      
      menu.append(new MenuItem({
        label: '全选',
        role: 'selectAll'
      }));
    } else if (params.selectionText) {
      // 非编辑区域，只显示全选
      menu.append(new MenuItem({
        label: '全选',
        role: 'selectAll'
      }));
    }
    
    // 如果菜单有项目，显示菜单
    if (menu.items.length > 0) {
      menu.popup();
    }
  });

  // 初始化 Gateway
  gateway = new Gateway();
  gateway.setMainWindow(mainWindow);
  
  // 设置全局 Gateway 实例
  const { setGlobalGatewayInstance } = require('./gateway');
  setGlobalGatewayInstance(gateway);
  
  // 🔥 设置 Gateway 实例供 connector-handler 使用
  const { setGatewayForConnectorHandler } = require('./ipc/connector-handler');
  setGatewayForConnectorHandler(gateway);
  
  // 🔥 将 Gateway 实例传递给 model-config-handler
  setGatewayForModelConfig(gateway);
  
  // 窗口加载完成后，Gateway 会自动处理历史消息加载和欢迎消息
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] 窗口加载完成');
    
    // 延迟 500ms，确保前端已准备好
    setTimeout(() => {
      console.log('[Main] 前端已准备就绪，Gateway 将自动处理历史消息和欢迎消息');
    }, 500);
  });
}

/**
 * 注册 IPC 处理器
 */
function registerIpcHandlers() {
  // 处理发送消息
  ipcMain.handle(IPC_CHANNELS.SEND_MESSAGE, async (_event, { content, sessionId, displayContent }) => {
    console.log('IPC: 收到发送消息请求', { content, sessionId });
    
    if (!gateway) {
      throw new Error('Gateway 未初始化');
    }

    await gateway.handleSendMessage(content, sessionId, displayContent);
    return { success: true };
  });

  // 处理停止生成
  ipcMain.handle(IPC_CHANNELS.STOP_GENERATION, async (_event, { sessionId }) => {
    console.log('IPC: 收到停止生成请求', { sessionId });
    
    if (!gateway) {
      throw new Error('Gateway 未初始化');
    }

    await gateway.handleStopGeneration(sessionId);
    return { success: true };
  });
  
  // 标记系统提示词需要重建
  ipcMain.handle(IPC_CHANNELS.INVALIDATE_SYSTEM_PROMPTS, async () => {
    if (gateway) {
      gateway.invalidateAllSystemPrompts();
    }
  });

  // Skill 管理器
  ipcMain.handle(IPC_CHANNELS.SKILL_MANAGER, async (_event, request) => {
    console.log('IPC: 收到 Skill Manager 请求', request);
    
    if (!gateway) {
      throw new Error('Gateway 未初始化');
    }

    try {
      const result = await gateway.handleSkillManagerRequest(request);
      return result;
    } catch (error) {
      console.error('Skill Manager 请求失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });
  
  // 定时任务管理
  ipcMain.handle(IPC_CHANNELS.SCHEDULED_TASK, async (_event, request) => {
    console.log('IPC: 收到定时任务请求', request);
    
    // 直接调用 scheduled-task-tool 的 execute 方法
    const { createScheduledTaskTool } = await import('./tools/scheduled-task-tool');
    const tool = createScheduledTaskTool();
    
    try {
      const result = await tool.execute(
        generateExecutionId('scheduled-task'),
        request,
        new AbortController().signal,
        () => {}
      );
      
      // 解析结果
      const firstContent = result.content[0];
      if (firstContent && firstContent.type === 'text') {
        // 尝试解析 JSON
        const parsed = safeJsonParse(firstContent.text, null);
        if (parsed !== null) {
          return parsed;
        }
        // 如果不是 JSON，返回错误
        return {
          success: false,
          message: firstContent.text,
        };
      }
      
      // 返回详细信息
      return result.details || { success: true };
    } catch (error) {
      console.error('定时任务请求失败:', error);
      return {
        success: false,
        message: getErrorMessage(error),
      };
    }
  });
  
  // 环境检查
  ipcMain.handle(IPC_CHANNELS.ENVIRONMENT_CHECK, async (_event, { action }) => {
    console.log('IPC: 收到环境检查请求', { action });
    
    try {
      const { createEnvironmentCheckTool } = await import('./tools/environment-check-tool');
      const tool = createEnvironmentCheckTool();
      
      const result = await tool.execute(
        generateExecutionId('environment-check'),
        { action },
        new AbortController().signal,
        () => {}
      );
      
      // 返回详细信息
      return result.details || { success: true };
    } catch (error) {
      console.error('环境检查失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 获取工作目录配置
  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE_SETTINGS, async () => {
    console.log('IPC: 收到获取工作目录配置请求');
    
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      return {
        success: true,
        settings,
      };
    } catch (error) {
      console.error('获取工作目录配置失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 获取默认工作目录配置（绝对路径）
  ipcMain.handle(IPC_CHANNELS.GET_DEFAULT_WORKSPACE_SETTINGS, async () => {
    console.log('IPC: 收到获取默认工作目录配置请求');
    
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const defaultSettings = store.getDefaultWorkspaceSettings();
      
      return {
        success: true,
        settings: defaultSettings,
      };
    } catch (error) {
      console.error('获取默认工作目录配置失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 保存工作目录配置
  ipcMain.handle(IPC_CHANNELS.SAVE_WORKSPACE_SETTINGS, async (_event, settings) => {
    console.log('IPC: 收到保存工作目录配置请求', settings);
    
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      store.saveWorkspaceSettings(settings);
      
      // 🔥 重新加载 Gateway 配置
      if (gateway) {
        console.log('[IPC] 工作目录配置已更新，重新加载 Gateway...');
        
        // 🔥 重新加载所有工作目录配置（包括 SessionManager 和 AgentRuntime）
        await gateway.reloadWorkspaceConfig();
        
        console.log('[IPC] ✅ Gateway 工作目录配置已重新加载');
      }
      
      return {
        success: true,
      };
    } catch (error) {
      console.error('保存工作目录配置失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 添加 Skill 目录
  ipcMain.handle(IPC_CHANNELS.ADD_SKILL_DIR, async (_event, { dir }) => {
    console.log('IPC: 收到添加 Skill 目录请求', { dir });
    
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.addSkillDir(dir);
      
      return {
        success: true,
        settings,
      };
    } catch (error) {
      console.error('添加 Skill 目录失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 删除 Skill 目录
  ipcMain.handle(IPC_CHANNELS.REMOVE_SKILL_DIR, async (_event, { dir }) => {
    console.log('IPC: 收到删除 Skill 目录请求', { dir });
    
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.removeSkillDir(dir);
      
      return {
        success: true,
        settings,
      };
    } catch (error) {
      console.error('删除 Skill 目录失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 设置默认 Skill 目录
  ipcMain.handle(IPC_CHANNELS.SET_DEFAULT_SKILL_DIR, async (_event, { dir }) => {
    console.log('IPC: 收到设置默认 Skill 目录请求', { dir });
    
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.setDefaultSkillDir(dir);
      
      return {
        success: true,
        settings,
      };
    } catch (error) {
      console.error('设置默认 Skill 目录失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 添加工作目录
  ipcMain.handle(IPC_CHANNELS.ADD_WORKSPACE_DIR, async (_event, { dir }) => {
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.addWorkspaceDir(dir);
      return { success: true, settings };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 删除工作目录
  ipcMain.handle(IPC_CHANNELS.REMOVE_WORKSPACE_DIR, async (_event, { dir }) => {
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.removeWorkspaceDir(dir);
      return { success: true, settings };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 读取图片并转换为 base64
  ipcMain.handle(IPC_CHANNELS.READ_IMAGE, async (_event, { path: imagePath }) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { assertPathAllowed } = await import('./utils/path-security');
      const { imageToDataUrl } = await import('../shared/utils/mime-utils');
      
      // 安全检查：只允许读取配置的目录下的文件
      assertPathAllowed(imagePath);
      
      // 解析为绝对路径
      const resolvedPath = path.resolve(imagePath.replace(/^~/, process.env.HOME || '~'));
      
      // 检查文件是否存在
      if (!fs.existsSync(resolvedPath)) {
        throw new Error('图片文件不存在');
      }
      
      // 读取文件并转换为 Data URL
      const imageBuffer = fs.readFileSync(resolvedPath);
      const ext = path.extname(resolvedPath);
      const dataUrl = imageToDataUrl(imageBuffer, ext);
      
      return {
        success: true,
        data: dataUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 用系统默认应用打开本地文件
  ipcMain.handle(IPC_CHANNELS.OPEN_PATH, async (_event, { filePath }) => {
    try {
      const resolvedPath = filePath.replace(/^~/, process.env.HOME || '~');
      await shell.openPath(resolvedPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 打开文件夹选择对话框
  ipcMain.handle(IPC_CHANNELS.SELECT_FOLDER, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      return { success: true, path: result.filePaths[0] };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 打开保存文件对话框
  ipcMain.handle('dialog:save-file', async (_event, { defaultName }) => {
    try {
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 打开文件选择对话框（选择 zip 文件）
  ipcMain.handle('dialog:open-zip', async () => {
    try {
      const result = await dialog.showOpenDialog({
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      return { success: true, path: result.filePaths[0] };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 设置 Tab 模型配置
  ipcMain.handle(IPC_CHANNELS.SET_TAB_MODEL_CONFIG, async (_event, { tabId, modelConfig }) => {
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const { updateTabModelConfig } = await import('./database/tab-config');
      const store = SystemConfigStore.getInstance();

      // 如果用户没有手动设置 contextWindow，自动推断
      if (modelConfig && modelConfig.modelId && !modelConfig.contextWindow) {
        const { getContextWindowFromModelId } = await import('./utils/model-info-fetcher');
        modelConfig.contextWindow = getContextWindowFromModelId(modelConfig.modelId);
        console.log(`[IPC] Tab 模型上下文窗口自动推断: ${modelConfig.modelId} → ${modelConfig.contextWindow}`);
      }

      updateTabModelConfig(store.getDb(), tabId, modelConfig);
      
      // 销毁该 tab 的 Runtime，下次使用时用新配置重建
      if (gateway) {
        await gateway.destroySessionRuntime(tabId);
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 获取 Tab 模型配置
  ipcMain.handle(IPC_CHANNELS.GET_TAB_MODEL_CONFIG, async (_event, { tabId }) => {
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const tabConfig = store.getTabConfig(tabId);
      return { success: true, modelConfig: tabConfig?.modelConfig || null };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 重命名 Tab
  ipcMain.handle(IPC_CHANNELS.RENAME_TAB, async (_event, { tabId, title }) => {
    try {
      if (!gateway) return { success: false, error: 'Gateway 未初始化' };
      const tabManager = gateway.getTabManager();
      
      // 获取 tab 信息，连接器 tab 自动加前缀
      const allTabs = tabManager.getAllTabs();
      const tab = allTabs.find(t => t.id === tabId);
      if (title.length > 10) {
        return { success: false, error: '名称不能超过 10 个字符' };
      }
      let finalTitle = title;
      if (tab?.type === 'connector') {
        if (tab.connectorId === 'feishu' && !title.startsWith('FS-')) {
          finalTitle = `FS-${title}`;
        } else if (tab.connectorId?.startsWith('wechat') && !title.startsWith('WX-')) {
          finalTitle = `WX-${title}`;
        }
      }
      
      // 检查重名
      const duplicate = allTabs.find(t => t.id !== tabId && t.title === finalTitle);
      if (duplicate) {
        return { success: false, error: `名称 "${finalTitle}" 已被其他 Tab 使用` };
      }
      
      // 更新 tab 标题
      tabManager.updateTabTitle(tabId, finalTitle);
      
      // 更新 agentName（提示符和系统提示词用的是 agentName）
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      store.updateTabAgentName(tabId, title); // 存原始名字（不带前缀）
      
      // 同步更新内存中 tab 的 agentName
      if (tab) tab.agentName = title;
      
      // 发送前端通知更新提示符
      const mainWindow = gateway.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('name-config:updated', {
          tabId,
          agentName: finalTitle,
        });
      }
      
      // 标记系统提示词需要重建
      gateway.invalidateAllSystemPrompts();
      
      return { success: true, title: finalTitle };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 上传图片（保存到临时目录）
  ipcMain.handle(IPC_CHANNELS.UPLOAD_IMAGE, async (_event, { name, dataUrl, size }) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const crypto = await import('crypto');
      
      // 检查文件大小（最大 5MB）
      if (size > 5 * 1024 * 1024) {
        throw new Error('图片大小不能超过 5MB');
      }
      
      // 从数据库读取工作目录配置
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      // 创建临时目录（在工作目录下）
      const tempDir = path.join(settings.workspaceDir, '.deepbot', 'temp', 'uploads');
      ensureDirectoryExists(tempDir);
      
      // 生成唯一文件名
      const id = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(name);
      const fileName = `${id}${ext}`;
      const filePath = path.join(tempDir, fileName);
      
      // 解析 base64 数据
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('无效的图片数据格式');
      }
      
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      
      // 保存文件
      fs.writeFileSync(filePath, buffer);
      
      console.log('[Upload Image] 图片上传成功:', filePath);
      
      return {
        success: true,
        image: {
          id,
          path: filePath,
          name,
          size,
          dataUrl,
        },
      };
    } catch (error) {
      console.error('[Upload Image] 上传失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 上传文件（保存到临时目录）
  ipcMain.handle(IPC_CHANNELS.UPLOAD_FILE, async (_event, { name, dataUrl, size, type }) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const crypto = await import('crypto');
      
      // 检查文件大小（最大 500MB）
      if (size > 500 * 1024 * 1024) {
        throw new Error('文件大小不能超过 500MB');
      }
      
      // 从数据库读取工作目录配置
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      // 创建临时目录（在工作目录下）
      const tempDir = path.join(settings.workspaceDir, '.deepbot', 'temp', 'uploads');
      ensureDirectoryExists(tempDir);
      
      // 生成唯一文件名
      const id = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(name);
      const fileName = `${id}${ext}`;
      const filePath = path.join(tempDir, fileName);
      
      // 解析 base64 数据
      const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('无效的文件数据格式');
      }
      
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      
      // 保存文件
      fs.writeFileSync(filePath, buffer);
      
      console.log('[Upload File] 文件上传成功:', filePath);
      
      return {
        success: true,
        file: {
          id,
          path: filePath,
          name,
          size,
          type,
        },
      };
    } catch (error) {
      console.error('[Upload File] 上传失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 删除临时文件
  ipcMain.handle(IPC_CHANNELS.DELETE_TEMP_FILE, async (_event, { path: filePath }) => {
    try {
      const path = await import('path');
      const { safeRemove } = await import('../shared/utils/fs-utils');
      
      // 从数据库读取工作目录配置
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const settings = store.getWorkspaceSettings();
      
      // 验证文件路径在临时目录内
      const tempDir = path.join(settings.workspaceDir, '.deepbot', 'temp', 'uploads');
      const normalizedPath = path.normalize(filePath);
      const normalizedTempDir = path.normalize(tempDir);
      
      if (!normalizedPath.startsWith(normalizedTempDir)) {
        throw new Error('只能删除临时目录中的文件');
      }
      
      // 删除文件
      const deleted = safeRemove(filePath);
      if (deleted) {
        console.log('[Delete Temp File] 删除成功:', filePath);
      }
      
      return {
        success: true,
      };
    } catch (error) {
      console.error('[Delete Temp File] 删除失败:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // ==================== 工具配置 ====================

  // 获取图片生成工具配置
  ipcMain.handle(IPC_CHANNELS.GET_IMAGE_GENERATION_TOOL_CONFIG, async () => {
    try {
      console.log('[IPC] 获取图片生成工具配置');
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const config = store.getImageGenerationToolConfig();
      return config;
    } catch (error) {
      console.error('[IPC] 获取图片生成工具配置失败:', error);
      throw error;
    }
  });

  // 保存图片生成工具配置
  ipcMain.handle(IPC_CHANNELS.SAVE_IMAGE_GENERATION_TOOL_CONFIG, async (_event, config) => {
    try {
      console.log('[IPC] 保存图片生成工具配置:', config);
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      store.saveImageGenerationToolConfig(config);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 保存图片生成工具配置失败:', error);
      throw error;
    }
  });

  // 获取 Web Search 工具配置
  ipcMain.handle(IPC_CHANNELS.GET_WEB_SEARCH_TOOL_CONFIG, async () => {
    try {
      console.log('[IPC] 获取 Web Search 工具配置');
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      const config = store.getWebSearchToolConfig();
      return { success: true, config };
    } catch (error) {
      console.error('[IPC] 获取 Web Search 工具配置失败:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 保存 Web Search 工具配置
  ipcMain.handle(IPC_CHANNELS.SAVE_WEB_SEARCH_TOOL_CONFIG, async (_event, { config }) => {
    try {
      console.log('[IPC] 保存 Web Search 工具配置:', config);
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      store.saveWebSearchToolConfig(config);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 保存 Web Search 工具配置失败:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 获取禁用工具列表
  ipcMain.handle(IPC_CHANNELS.GET_DISABLED_TOOLS, async () => {
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();
      return { success: true, disabledTools: store.getDisabledTools() };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // 批量保存工具禁用配置并 reset AgentRuntime
  ipcMain.handle(IPC_CHANNELS.SAVE_DISABLED_TOOLS, async (_event, { disabledTools }: { disabledTools: string[] }) => {
    try {
      const { SystemConfigStore } = await import('./database/system-config-store');
      const store = SystemConfigStore.getInstance();

      // 先清空所有禁用，再写入新的
      const current = store.getDisabledTools();
      for (const name of current) store.setToolDisabled(name, false);
      for (const name of disabledTools) store.setToolDisabled(name, true);

      // 重置所有 AgentRuntime，下次对话时用新工具列表重建
      const { getGatewayInstance } = await import('./gateway');
      const gateway = getGatewayInstance();
      if (gateway) await gateway.reloadToolConfig();

      return { success: true };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  });

  // ==================== 浏览器工具 ====================
  
  // 启动 Chrome 浏览器（带远程调试）
  ipcMain.handle(IPC_CHANNELS.LAUNCH_CHROME_WITH_DEBUG, async (_event, { port }) => {
    try {
      console.log(`[IPC] 启动 Chrome，端口: ${port}`);
      
      // 先检查是否已经有 Chrome 在运行
      try {
        const { httpGet } = await import('../shared/utils/http-utils');
        const response = await httpGet(`http://127.0.0.1:${port}/json/version`, { timeout: 2000 });
        
        if (response.ok) {
          console.log('[IPC] ✅ Chrome 已在运行，无需重复启动');
          console.log('[IPC] Chrome 版本信息:', response.data);
          return {
            success: true,
            message: `Chrome 已在运行（端口 ${port}）`,
          };
        } else {
          console.log('[IPC] Chrome 未运行，开始启动...');
          console.log('[IPC] 连接检查失败:', response.error || `HTTP ${response.status}`);
        }
      } catch (checkError) {
        console.log('[IPC] Chrome 未运行，开始启动...');
        console.log('[IPC] 连接检查异常:', getErrorMessage(checkError));
      }
      
      // 根据平台选择命令
      const platform = process.platform;
      let command: string;
      const { expandUserPath } = await import('../shared/utils/path-utils');
      
      if (platform === 'darwin') {
        // macOS: 直接调用 Chrome 可执行文件，前台运行
        const userDataDir = expandUserPath('~/.deepbot/browser-profile');
        const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        command = `"${chromePath}" --remote-debugging-port=${port} --user-data-dir="${userDataDir}" --no-first-run --no-default-browser-check`;
      } else if (platform === 'win32') {
        // Windows
        command = `start chrome --remote-debugging-port=${port} --user-data-dir=%USERPROFILE%\\.deepbot\\browser-profile --no-first-run --no-default-browser-check`;
      } else {
        // Linux
        const userDataDir = expandUserPath('~/.deepbot/browser-profile');
        command = `google-chrome --remote-debugging-port=${port} --user-data-dir="${userDataDir}" --no-first-run --no-default-browser-check`;
      }
      
      // 执行命令（使用 spawn 而不是 exec，避免阻塞）
      const { spawn } = await import('child_process');
      
      console.log(`[IPC] 执行命令: ${command}`);
      
      // 使用 spawn 启动 Chrome，不等待进程结束
      if (platform === 'darwin' || platform === 'linux') {
        // macOS 和 Linux: 使用 shell 执行
        spawn(command, [], {
          shell: true,
          detached: true,
          stdio: 'ignore',
        }).unref();
      } else {
        // Windows: 使用 cmd 执行
        spawn('cmd', ['/c', command], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      }
      
      console.log('[IPC] ✅ Chrome 启动命令已执行');
      
      // 等待 Chrome 就绪（最多 10 秒）
      const { httpGet } = await import('../shared/utils/http-utils');
      let ready = false;
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const response = await httpGet(`http://127.0.0.1:${port}/json/version`, { timeout: 2000 });
          if (response.ok) {
            ready = true;
            console.log(`[IPC] ✅ Chrome 已就绪（耗时 ${i + 1} 秒）`);
            break;
          }
        } catch {
          // 忽略异常，继续等待
        }
        console.log(`[IPC] ⏳ 等待 Chrome 启动... (${i + 1}/10)`);
      }
      
      if (!ready) {
        throw new Error('Chrome 启动超时，请检查是否正确安装');
      }
      
      return {
        success: true,
        message: `Chrome 已启动，远程调试端口: ${port}`,
      };
    } catch (error) {
      console.error('[IPC] 启动 Chrome 失败:', error);
      
      const errorMsg = getErrorMessage(error);
      
      // 提供更友好的错误提示
      let message = '启动失败';
      
      if (errorMsg.includes('not found') || errorMsg.includes('找不到')) {
        message = 'Chrome 浏览器未安装或不在默认路径';
      } else if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
        message = 'Chrome 启动超时，请检查是否正确安装';
      } else {
        message = `启动失败: ${errorMsg}`;
      }
      
      return {
        success: false,
        message,
      };
    }
  });

  // ==================== 名字配置 ====================
  
  // 获取名字配置
  ipcMain.handle(IPC_CHANNELS.GET_NAME_CONFIG, async () => {
    try {
      console.log('[IPC] 获取名字配置');
      const configStore = SystemConfigStore.getInstance();
      const config = configStore.getNameConfig();
      return { success: true, config };
    } catch (error) {
      console.error('[IPC] 获取名字配置失败:', error);
      throw error;
    }
  });
  
  // 获取 Tab 的 Agent 名字（考虑继承）
  ipcMain.handle(IPC_CHANNELS.GET_TAB_AGENT_NAME, async (_event, { tabId }) => {
    try {
      console.log('[IPC] 获取 Tab Agent 名字:', tabId);
      const configStore = SystemConfigStore.getInstance();
      
      // 获取全局名字配置
      const nameConfig = configStore.getNameConfig();
      let agentName = nameConfig.agentName;
      
      // 如果不是主 Tab，检查是否有独立配置
      if (tabId && tabId !== 'default') {
        const tabConfig = configStore.getTabConfig(tabId);
        console.log('[IPC] Tab 配置:', tabConfig); // 🔥 调试日志
        if (tabConfig?.agentName) {
          agentName = tabConfig.agentName;
          console.log('[IPC] 使用 Tab 独立名字:', agentName); // 🔥 调试日志
        } else {
          console.log('[IPC] Tab 没有独立名字，使用全局名字:', agentName); // 🔥 调试日志
        }
      }
      
      return { success: true, agentName, userName: nameConfig.userName };
    } catch (error) {
      console.error('[IPC] 获取 Tab Agent 名字失败:', error);
      throw error;
    }
  });
  
  // 保存智能体名字
  ipcMain.handle(IPC_CHANNELS.SAVE_AGENT_NAME, async (_event, { agentName }) => {
    try {
      console.log('[IPC] 保存智能体名字:', agentName);
      const configStore = SystemConfigStore.getInstance();
      configStore.saveAgentName(agentName);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 保存智能体名字失败:', error);
      throw error;
    }
  });
  
  // 保存用户称呼
  ipcMain.handle(IPC_CHANNELS.SAVE_USER_NAME, async (_event, { userName }) => {
    try {
      console.log('[IPC] 保存用户称呼:', userName);
      const configStore = SystemConfigStore.getInstance();
      configStore.saveUserName(userName);
      return { success: true };

    } catch (error) {
      console.error('[IPC] 保存用户称呼失败:', error);
      throw error;
    }
  });
  
  // 保存应用设置（通用 key-value）
  ipcMain.handle('app-setting:save', async (_event, { key, value }) => {
    try {
      const configStore = SystemConfigStore.getInstance();
      configStore.setAppSetting(key, value);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 保存应用设置失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取应用设置
  ipcMain.handle('app-setting:get', async (_event, { key }) => {
    try {
      const configStore = SystemConfigStore.getInstance();
      return { success: true, value: configStore.getAppSetting(key) };
    } catch (error) {
      return { success: false, value: null };
    }
  });
  
  // ==================== Tab 管理 ====================
  
  // 创建新 Tab
  ipcMain.handle(IPC_CHANNELS.CREATE_TAB, async (_event, { title }) => {
    console.log('IPC: 收到创建 Tab 请求', { title });
    
    if (!gateway) {
      throw new Error('Gateway 未初始化');
    }
    
    try {
      const tab = await gateway.createTab({ title });
      
      // 🔥 只返回可序列化的字段，避免 "An object could not be cloned" 错误
      return {
        success: true,
        tab: {
          id: tab.id,
          title: tab.title,
          type: tab.type,
          messages: tab.messages,
          isLoading: tab.isLoading,
          createdAt: tab.createdAt,
          lastActiveAt: tab.lastActiveAt,
          isLocked: tab.isLocked,
          taskId: tab.taskId,
          connectorId: tab.connectorId,
          conversationId: tab.conversationId,
          conversationKey: tab.conversationKey,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });
  
  // 关闭 Tab
  ipcMain.handle(IPC_CHANNELS.CLOSE_TAB, async (_event, { tabId }) => {
    console.log('IPC: 收到关闭 Tab 请求', { tabId });
    
    if (!gateway) {
      throw new Error('Gateway 未初始化');
    }
    
    try {
      await gateway.closeTab(tabId);
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });
  
  // 获取所有 Tab
  ipcMain.handle(IPC_CHANNELS.GET_TABS, async () => {
    console.log('IPC: 收到获取所有 Tab 请求');
    
    if (!gateway) {
      throw new Error('Gateway 未初始化');
    }
    
    try {
      const tabs = gateway.getAllTabs();
      return {
        success: true,
        tabs,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });
  
  // 切换 Tab（更新活跃时间）
  ipcMain.handle(IPC_CHANNELS.SWITCH_TAB, async (_event, { tabId }) => {
    console.log('IPC: 收到切换 Tab 请求', { tabId });
    
    if (!gateway) {
      throw new Error('Gateway 未初始化');
    }
    
    try {
      gateway.updateTabActivity(tabId);
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  });

  // 下载更新
  ipcMain.handle('update:download', async () => {
    if (!process.env.VITE_DEV_SERVER_URL) {
      autoUpdater.downloadUpdate();
    }
  });

  // 安装更新并重启
  ipcMain.handle('update:install', async () => {
    if (!process.env.VITE_DEV_SERVER_URL) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  // 手动检查更新
  ipcMain.handle('update:check', async () => {
    if (!process.env.VITE_DEV_SERVER_URL) {
      try {
        await autoUpdater.checkForUpdates();
      } catch (error) {
        console.error('[Updater] checkForUpdates 失败:', error);
      }
    }
  });
}

/**
 * 应用准备就绪
 */
app.whenReady().then(() => {
  // 确保所有工作目录存在
  try {
    ensureWorkspaceDirectories();
  } catch (error) {
    console.error('❌ 初始化工作目录失败:', error);
  }
  
  // 注册 IPC 处理器
  registerIpcHandlers();
  registerModelConfigHandlers();
  
  // 🔥 注册连接器 IPC 处理器
  const { registerConnectorHandlers, setGatewayForConnectorHandler } = require('./ipc/connector-handler');
  registerConnectorHandlers();
  
  // 🔥 创建系统托盘
  createTray();
  
  // 创建窗口
  createWindow();

  // 🔥 自动更新（生产环境）
  if (!process.env.VITE_DEV_SERVER_URL) {
    autoUpdater.autoDownload = false;
    
    autoUpdater.on('error', (error) => {
      console.error('[Updater] 错误:', error?.message);
    });

    autoUpdater.on('checking-for-update', () => {
      console.info('[Updater] 正在检查更新...');
    });

    autoUpdater.on('update-not-available', (info) => {
      console.info('[Updater] 已是最新版本:', info?.version);
    });
    
    autoUpdater.on('update-available', (info: any) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-available', info);
      }
    });
    
    autoUpdater.on('download-progress', (progress: any) => {
      if (mainWindow) {
        mainWindow.webContents.send('update-download-progress', progress);
      }
    });
    
    autoUpdater.on('update-downloaded', () => {
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded');
      }
    });
    
    // 启动后延迟 10 秒检查更新，避免影响启动速度
    setTimeout(() => autoUpdater.checkForUpdates(), 10_000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      // 🔥 macOS 点击 Dock 图标时显示窗口
      mainWindow.show();
    }
  });
});

/**
 * 所有窗口关闭
 */
app.on('window-all-closed', () => {
  // 🔥 macOS 和 Windows/Linux 不同的行为
  if (process.platform === 'darwin') {
    // macOS: 窗口关闭后不退出应用，保持在 Dock
    console.log('[Main] 所有窗口已关闭，应用继续运行（macOS）');
  } else {
    // Windows/Linux: 窗口关闭后继续在托盘运行
    console.log('[Main] 所有窗口已关闭，应用继续在托盘运行');
  }
});

/**
 * 应用退出前清理
 */
app.on('before-quit', async () => {
  console.log('DeepBot 正在退出...');
  
  // 🔥 设置退出标志
  isQuitting = true;
  
  // 清理非持久化的 Tab 配置
  try {
    const { SystemConfigStore } = await import('./database/system-config-store');
    const store = SystemConfigStore.getInstance();
    store.deleteNonPersistentTabs();
    console.log('[Main] ✅ 已清理非持久化 Tab 配置');
  } catch (error) {
    console.error('[Main] ❌ 清理非持久化 Tab 配置失败:', error);
  }
  
  // 🔥 销毁托盘
  if (tray) {
    tray.destroy();
    tray = null;
    console.log('[Main] ✅ 系统托盘已销毁');
  }
  
  gateway = null;
});
