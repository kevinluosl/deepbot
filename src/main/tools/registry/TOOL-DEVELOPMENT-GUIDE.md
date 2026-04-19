# DeepBot 工具开发指南

## 概述

所有工具统一使用 `ToolPlugin` 接口，代码位于 `src/main/tools/` 目录。

## 快速开始

### 1. 在 `tool-names.ts` 注册工具名称

```typescript
export const TOOL_NAMES = {
  // ...已有工具
  MY_TOOL: 'my_tool',
};
```

### 2. 创建工具文件

在 `src/main/tools/` 创建 `my-tool.ts`：

```typescript
import { Type } from '@sinclair/typebox';
import type { ToolPlugin, ToolCreateOptions } from './registry/tool-interface';
import { TOOL_NAMES } from './tool-names';

export const myToolPlugin: ToolPlugin = {
  // 工具元数据（用于 UI 展示和管理）
  metadata: {
    id: 'my-tool',              // 唯一标识，kebab-case，不带 -tool 后缀
    name: '我的工具',            // 显示名称（给用户看，中文）
    description: '我的自定义工具',
    version: '1.0.0',
    author: 'DeepBot',
    category: 'custom',         // 分类：file | network | system | ai | custom
    tags: ['custom'],
  },

  // 创建工具实例
  create: (options: ToolCreateOptions) => ({
    name: TOOL_NAMES.MY_TOOL,   // AI 调用时使用的工具名
    label: '我的工具',           // 执行步骤中显示的标签
    description: '执行自定义操作',  // 告诉 AI 这个工具做什么

    // 参数定义（TypeBox），AI 根据 description 自动填充
    // 常见类型：
    //   Type.String({ description: '...' })                    — 字符串
    //   Type.Number({ description: '...' })                    — 数字
    //   Type.Boolean({ description: '...' })                   — 布尔值
    //   Type.Optional(Type.String({ description: '...' }))     — 可选参数
    //   Type.Union([Type.Literal('a'), Type.Literal('b')])     — 枚举
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('search'),
        Type.Literal('create'),
      ], { description: '操作类型' }),
      query: Type.String({ description: '搜索关键词' }),
      limit: Type.Optional(Type.Number({ description: '最大结果数' })),
    }),

    execute: async (toolCallId, params, signal) => {
      // signal: AbortSignal，用户停止时触发
      // params: 已经过 schema 验证的参数对象

      return {
        // content: 返回给 AI 的内容（AI 基于此决定下一步）
        content: [{ type: 'text', text: '执行成功' }],
        // details: 结构化数据，用于 UI 渲染或日志（AI 不可见）
        details: { success: true },
      };
    },
  }),
};
```

### 3. 在 `tool-loader.ts` 中加载

```typescript
import { myToolPlugin } from '../my-tool';

// 在 loadTools() 方法中添加：
tools.push(...await resolvePluginTools(myToolPlugin.create(pluginOpts)));
```

### 4. 验证

```bash
pnpm run type-check
```


## 命名规范

| 字段 | 规范 | 示例 |
|------|------|------|
| `metadata.id` | kebab-case，不带 `-tool` 后缀 | `web-search`、`image-generation` |
| `metadata.name` | 中文显示名 | `Web 搜索`、`图片生成` |
| `TOOL_NAMES` 常量 | UPPER_SNAKE_CASE | `WEB_SEARCH`、`IMAGE_GENERATION` |
| `AgentTool.name` | snake_case（AI 调用用） | `web_search`、`image_generation` |
| plugin 变量名 | camelCase + `Plugin` 后缀 | `webSearchToolPlugin` |

## 返回多个工具

一个 plugin 可以返回多个工具（如 `connector-tool.ts` 返回 3 个工具）：

```typescript
create: (options) => [
  { name: TOOL_NAMES.TOOL_A, label: '工具 A', ... },
  { name: TOOL_NAMES.TOOL_B, label: '工具 B', ... },
],
```

## 需要配置的工具

如果工具需要 `configStore`（如 API Key），在 `create` 中检查：

```typescript
create: (options: ToolCreateOptions) => {
  if (!options.configStore) throw new Error('myToolPlugin 需要 configStore');
  return createMyTool(options.configStore);
},
```

对应在 `tool-loader.ts` 中用条件加载：

```typescript
if (configStore && isEnabled(TOOL_NAMES.MY_TOOL)) {
  tools.push(...await resolvePluginTools(myToolPlugin.create(pluginOpts)));
}
```

## 示例文件

| 文件 | 说明 |
|------|------|
| `registry/example-tool.ts` | 基础工具模板 |
| `web-fetch-tool.ts` | 简单工具（无配置） |
| `web-search-tool.ts` | 需要 configStore 的工具 |
| `connector-tool.ts` | 返回多个工具的 plugin |
| `email-tool.ts` | 带外部依赖的工具 |

## 相关文件

| 文件 | 说明 |
|------|------|
| `tool-interface.ts` | ToolPlugin 接口定义 |
| `tool-loader.ts` | 工具加载器（resolvePluginTools） |
| `tool-names.ts` | 工具名称常量 |
| `tool-registry.ts` | 工具注册表（启用/禁用） |
