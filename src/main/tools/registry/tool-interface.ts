/**
 * 工具接口定义
 * 
 * ## 工具架构说明
 * 
 * DeepBot 的所有工具都是**内置工具**，代码位于 `src/main/tools/` 目录。
 * 
 * ### 工具组成
 * 
 * 1. **工具代码**：在 `src/main/tools/` 中实现 `ToolPlugin` 接口
 * 2. **配置文件**：（可选）在 `~/.deepbot/tools/<tool-name>/config.json` 中存储
 * 3. **外部依赖**：（可选）在 `~/.deepbot/tools/<tool-name>/node_modules/` 中安装
 * 
 * ### 创建新工具
 * 
 * 1. 在 `src/main/tools/` 创建工具文件（如 `my-tool.ts`）
 * 2. 实现 `ToolPlugin` 接口
 * 3. 在 `tool-loader.ts` 的 `loadTools()` 方法中导入并加载
 * 4. 如需配置，在工具执行时从用户目录读取配置文件
 * 5. 如需外部依赖，使用动态 `require()` 加载
 * 
 * ### 示例
 * 
 * - `example-tool.ts` - 基础工具模板
 * - `email-tool.ts` - 带配置和外部依赖的完整示例
 */

import type { AgentTool } from '@mariozechner/pi-agent-core';

/**
 * 工具元数据
 */
export interface ToolMetadata {
  /** 工具 ID（唯一标识符，建议使用 kebab-case） */
  id: string;
  
  /** 工具名称（显示给用户） */
  name: string;
  
  /** 工具描述 */
  description: string;
  
  /** 工具版本 */
  version: string;
  
  /** 作者信息 */
  author?: string;
  
  /** 工具分类 */
  category?: 'file' | 'network' | 'system' | 'ai' | 'custom';
  
  /** 是否需要配置 */
  requiresConfig?: boolean;
  
  /** 配置 Schema（如果需要配置） */
  configSchema?: Record<string, any>;
  
  /** 工具图标（可选，用于 UI 显示） */
  icon?: string;
  
  /** 工具标签 */
  tags?: string[];
}

/**
 * 工具配置
 */
export interface ToolConfig {
  /** 是否启用 */
  enabled: boolean;
  
  /** 工具特定配置 */
  config?: Record<string, any>;
}

/**
 * 工具创建选项
 */
export interface ToolCreateOptions {
  /** 工作目录 */
  workspaceDir: string;
  
  /** 会话 ID */
  sessionId: string;
  
  /** 工具配置 */
  config?: Record<string, any>;
  
  /** 系统配置存储 */
  configStore?: any;
  
  /** 其他依赖 */
  dependencies?: Record<string, any>;
}

/**
 * 工具插件接口
 * 
 * 第三方开发者需要实现这个接口
 */
export interface ToolPlugin {
  /** 工具元数据 */
  metadata: ToolMetadata;
  
  /**
   * 创建工具实例
   * 
   * @param options - 创建选项
   * @returns Agent 工具实例或工具数组
   */
  create(options: ToolCreateOptions): Promise<AgentTool | AgentTool[]> | AgentTool | AgentTool[];
  
  /**
   * 验证配置（可选）
   * 
   * @param config - 工具配置
   * @returns 验证结果
   */
  validateConfig?(config: Record<string, any>): { valid: boolean; error?: string };
  
  /**
   * 初始化（可选）
   * 
   * 在工具加载时调用，用于初始化资源
   */
  initialize?(options: ToolCreateOptions): Promise<void> | void;
  
  /**
   * 清理（可选）
   * 
   * 在工具卸载时调用，用于清理资源
   */
  cleanup?(): Promise<void> | void;
}

/**
 * 工具加载结果
 */
export interface ToolLoadResult {
  /** 工具插件 */
  plugin: ToolPlugin;
  
  /** 工具实例 */
  tools: AgentTool[];
  
  /** 加载状态 */
  status: 'loaded' | 'disabled' | 'error';
  
  /** 错误信息（如果有） */
  error?: string;
}
