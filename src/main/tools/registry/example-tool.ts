/**
 * 示例工具
 * 
 * 这是一个完整的工具示例，展示如何创建自定义工具
 * 
 * ## 工具架构说明
 * 
 * DeepBot 的所有工具都是**内置工具**，代码位于 `src/main/tools/` 目录。
 * 
 * ### 关键概念
 * 
 * 1. **工具代码**：在 `src/main/tools/` 中创建（如 `my-tool.ts`）
 * 2. **配置文件**：在 `~/.deepbot/tools/my-tool/config.json` 中存储（运行时读取）
 * 3. **外部依赖**：在 `~/.deepbot/tools/my-tool/node_modules/` 中安装（按需安装）
 * 4. **工具加载**：在 `tool-loader.ts` 的 `loadTools()` 方法中导入
 * 
 * ### 创建新工具的步骤
 * 
 * 1. 复制此文件作为模板（如 `my-tool.ts`）
 * 2. 修改工具元数据和实现逻辑
 * 3. 在 `tool-loader.ts` 中导入并加载：
 *    ```typescript
 *    import { myToolPlugin } from '../my-tool';
 *    
 *    // 在 loadTools() 方法中添加
 *    tools.push(...await resolvePluginTools(myToolPlugin.create(pluginOpts)));
 *    ```
 * 4. 如果需要配置文件，在工具执行时从 `~/.deepbot/tools/my-tool/config.json` 读取
 * 5. 如果需要外部依赖，使用动态 `require()` 加载（参考 `email-tool.ts`）
 * 
 * ### 示例：带外部依赖的工具
 * 
 * 参考 `email-tool.ts`，它展示了如何：
 * - 从用户目录读取配置文件
 * - 动态加载外部依赖（nodemailer）
 * - 提供友好的错误提示
 * - 支持 AbortSignal 取消操作
 */

import { Type } from '@sinclair/typebox';
import type { ToolPlugin } from './tool-interface';
import { getErrorMessage } from '../../../shared/utils/error-handler';

// 1. 定义工具参数 Schema
const ExampleToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal('greet'),
    Type.Literal('calculate'),
    Type.Literal('echo'),
  ], {
    description: '操作类型：greet (问候), calculate (计算), echo (回显)',
  }),
  
  name: Type.Optional(Type.String({
    description: '名字（用于 greet 操作）',
  })),
  
  expression: Type.Optional(Type.String({
    description: '数学表达式（用于 calculate 操作）',
  })),
  
  message: Type.Optional(Type.String({
    description: '消息内容（用于 echo 操作）',
  })),
});

// 2. 实现工具插件
export const plugin: ToolPlugin = {
  // 工具元数据
  metadata: {
    id: 'example',
    name: '示例工具',
    description: '这是一个示例工具，展示如何创建自定义工具',
    version: '1.0.0',
    author: 'DeepBot Team',
    category: 'custom',
    tags: ['example', 'demo'],
    requiresConfig: false,
  },
  
  // 创建工具实例
  create: (options) => {
    console.log(`[Example Tool] 创建工具实例`);
    console.log(`   工作目录: ${options.workspaceDir}`);
    console.log(`   会话 ID: ${options.sessionId}`);
    
    return {
      name: 'example_tool',
      label: '示例工具',
      description: '执行示例操作：问候、计算、回显',
      parameters: ExampleToolSchema,
      
      execute: async (toolCallId, params, signal) => {
        try {
          const { action, name, expression, message } = params as any;
          
          console.log(`[Example Tool] 执行操作: ${action}`);
          
          // 检查是否被取消
          if (signal?.aborted) {
            const err = new Error('操作被取消');
            err.name = 'AbortError';
            throw err;
          }
          
          let result: string;
          
          // 根据操作类型执行不同逻辑
          switch (action) {
            case 'greet':
              if (!name) {
                throw new Error('缺少参数: name');
              }
              result = `你好，${name}！欢迎使用 DeepBot 示例工具。`;
              break;
              
            case 'calculate':
              if (!expression) {
                throw new Error('缺少参数: expression');
              }
              
              // 简单的数学计算（实际应用中应使用安全的计算库）
              try {
                // eslint-disable-next-line no-eval
                const value = eval(expression);
                result = `计算结果: ${expression} = ${value}`;
              } catch (error) {
                throw new Error(`计算失败: ${getErrorMessage(error)}`);
              }
              break;
              
            case 'echo':
              if (!message) {
                throw new Error('缺少参数: message');
              }
              result = `回显: ${message}`;
              break;
              
            default:
              throw new Error(`未知操作: ${action}`);
          }
          
          // 再次检查是否被取消
          if (signal?.aborted) {
            const err = new Error('操作被取消');
            err.name = 'AbortError';
            throw err;
          }
          
          // 返回结果
          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
            details: {
              action,
              success: true,
            },
          };
        } catch (error) {
          console.error('[Example Tool] 执行失败:', error);
          
          // 返回错误结果
          return {
            content: [
              {
                type: 'text',
                text: `❌ 执行失败: ${getErrorMessage(error)}`,
              },
            ],
            details: {
              error: getErrorMessage(error),
              success: false,
            },
            isError: true,
          };
        }
      },
    };
  },
  
  // 可选：验证配置
  validateConfig: (config) => {
    // 此工具不需要配置，直接返回 valid
    return { valid: true };
  },
  
  // 可选：初始化
  initialize: async (options) => {
    console.log('[Example Tool] 初始化...');
    // 在这里可以初始化资源，如数据库连接、HTTP 客户端等
  },
  
  // 可选：清理
  cleanup: async () => {
    console.log('[Example Tool] 清理...');
    // 在这里可以清理资源
  },
};

// 3. 默认导出（推荐）
export default plugin;
