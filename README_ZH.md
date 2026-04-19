<div align="center">

<img src="banner.jpg" alt="DeepBot Terminal" width="500"/>

<p>

 **让 AI 深入参与企业日常办公，成为你真正干活的伙伴**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-28+-9feaf9.svg)](https://www.electronjs.org/)

[English](README.md) | [简体中文](README_ZH.md)

</div>

---

## 📖 简介

DeepBot 是一个系统级 AI 助手，会更多探索企业生产提效方向。它能够与企业现有系统深度结合，让 AI 深入参与各部门的日常办公提效，通过多 Agent 协作模式实现复杂业务流程的自动化。无论是文档处理、数据分析、系统监控，还是跨部门协作任务，DeepBot 都能通过 AI Agent 技术帮助企业轻松搞定。它支持多任务并行处理、定时任务、技能扩展等功能，同时通过严格的安全机制保护企业系统安全。

### ✨ 核心特性

- 🎯 **多任务并行处理** - 同时处理多个任务，互不干扰
- 🔧 **14 个内置工具** - 文件操作、命令执行、浏览器控制、图片生成、AI 对话、跨会话通信、网页内容获取、飞书云文档操作等
- 🧠 **记忆系统** - 长期记忆用户偏好和重要信息
- ⏰ **定时任务** - 自动化执行周期性任务
- 🎨 **技能扩展** - 通过 Skills 组合工具实现复杂功能
- 🔒 **安全限制** - 严格的路径白名单机制，保护系统安全
- 🤖 **多模型支持** - 通义千问、OpenAI、Claude 等
- 🌐 **外部通讯** - 支持接入飞书等外部平台，实现跨平台交互

---

## 🚀 快速开始

### 环境要求

- **Python**: 3.11 或更高版本
- **Node.js**: 20.0.0 或更高版本（可选，用于运行 JS 脚本）
- **pnpm**: 10.23.0 或更高版本（可选，用于运行 JS 脚本）
- **操作系统**: macOS、Windows（桌面版），Linux/Docker

### 安装

```bash
# 克隆仓库
git clone https://github.com/kevinluosl/deepbot.git
cd deepbot

# 安装依赖
pnpm install

# 开发模式运行
pnpm run dev
```

### 构建桌面版

```bash
# 构建所有平台
pnpm run dist

# macOS（含代码签名 + 公证，需要 Apple 开发者账号）
pnpm run dist:mac

# macOS 本地构建（无签名、无公证，用于开发/测试）
pnpm run dist:mac:local

# 仅构建 Windows
pnpm run dist:win
```

**`dist:mac` 与 `dist:mac:local` 的区别**：

| | `dist:mac` | `dist:mac:local` |
|---|---|---|
| 代码签名 | ✅ Apple Developer ID 签名 | ❌ 无签名 |
| 公证 | ✅ Apple 公证 | ❌ 无公证 |
| Gatekeeper | ✅ 通过验证 | ❌ 触发安全警告 |
| 前置条件 | Apple 开发者账号 + `.env` 中配置签名凭证 | 无 |

使用 `dist:mac` 需要在 `.env` 文件中配置以下信息：

```bash
# Apple 签名和公证（仅 macOS Electron 打包用）
APPLE_ID=your-apple-id@example.com
APPLE_ID_PASSWORD=your-app-specific-password
APPLE_APP_SPECIFIC_PASSWORD=your-app-specific-password
APPLE_TEAM_ID=your-team-id
```

> App 专用密码可在 [appleid.apple.com](https://appleid.apple.com) 生成。Team ID 可在 [Apple 开发者账号](https://developer.apple.com/account) 中查看。
| 适用场景 | 正式发布 | 本地开发 / 测试 |

> **注意**：`dist:mac:local` 构建的应用首次启动时会触发 macOS 安全警告，解决方法见下方说明。

### Docker 部署

适用于 Linux 服务器或任何支持 Docker 的环境：

```bash
# 构建 Docker 镜像
docker build -t deepbot:latest .

# 使用 docker-compose 启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

启动后访问 `http://localhost:3008` 即可通过 Web 页面访问。

配置说明：
- 复制 `.env.example` 为 `.env`，填入模型 API Key 等配置
- `docker-compose.yml` 中可调整端口映射和数据卷挂载
- 数据默认持久化到 `./data` 目录

**macOS 构建说明**：正式签名构建（`dist:mac`）通过 Gatekeeper 验证，无安全问题。本地构建（`dist:mac:local`）未签名，首次启动会触发安全警告，解决方法见下方。

### macOS 安装问题（本地构建）

使用 `dist:mac:local`（未签名构建）时，macOS 首次打开可能会提示安全警告：

#### 提示"应用已损坏"

在终端执行以下命令后重新打开：

```bash
sudo xattr -rd com.apple.quarantine /Applications/DeepBot.app
```

#### 提示"无法验证开发者"

**方法 1：右键打开**

右键点击应用图标，选择"打开"，在弹出的对话框中再次点击"打开"。

**方法 2：系统设置**

1. 尝试打开应用（会看到安全提示，点击"取消"）
2. 打开"系统设置" → "隐私与安全性"
3. 向下滚动找到"安全性"部分
4. 点击"仍要打开"按钮
5. 再次打开应用，在对话框中点击"打开"

---

## 🏗️ 架构设计

DeepBot 采用模块化架构，支持多 Agent 互相对话和协作：

```
┌─────────────────────────────────────────┐
│         用户界面 (Electron)              │
│      外部通讯：飞书 (已支持)             │
└─────────────────┬───────────────────────┘
                  │ IPC / WebSocket
┌─────────────────▼───────────────────────┐
│         Gateway (会话管理)               │
│    • Session 管理 (每个 Tab 一个)       │
│    • 消息队列和路由                      │
│    • 连接器管理 (Connector)              │
│    • 跨 Tab 消息路由 🆕                  │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   Session 1  Session 2  Session N
   (Tab 1)    (Tab 2)    (Tab N)
        │         │         │
        ▼         ▼         ▼
┌─────────────────────────────────────────┐
│      Agent Runtime (每个 Session 一个)   │
│    • 智能决策和工具编排                  │
│    • 自动继续机制 (最多 100 次)          │
│    • 操作追踪 (防重复，最多 3 次)        │
│    • 独立记忆和上下文                    │
│    • 跨 Tab 调用工具 🆕                  │
│    • 系统提示词动态组装 🆕                │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│       系统提示词组装层 🆕                 │
│    • 基础 Agent 提示 (AGENT.md)         │
│    • 工具说明 (TOOLS.md)                │
│    • 自定义工具说明 (CUSTOM-TOOLS.md)   │
│    • 全局记忆 (MEMORY.md)               │
│    • 独立记忆 (memory-<tab-id>.md)      │
│    • Skills 指令 (SKILL.md)             │
│    • 动态加载和实时更新                  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         14 个工具 + 安全检查             │
│    🔒 路径白名单 • 工作空间隔离          │
│    🔄 跨 Tab 消息工具 🆕                 │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
    Skills   定时任务   数据存储
```

### 多 Agent 协作架构 🆕

```
┌─────────────────────────────────────────┐
│           多 Agent 协作系统               │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ 销售     │ │ Gateway │ │ 市场     │
│AI助手    │ │消息路由  │ │AI助手    │
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     └───────────┼───────────┘
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│解决方案  │ │ 产品     │  │ 研发    │
│AI助手    │ │AI助手   │  │AI助手   │
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     └───────────┼───────────┘
                 │
                 ▼
           ┌─────────┐
           │项目管理  │
           │AI助手   │
           └─────────┘
```

### 架构说明

- **Gateway**: 管理所有 Session，每个 Tab 对应一个独立 Session，支持跨 Tab 消息路由
- **Session**: 独立的会话单元，包含独立的 Agent Runtime、记忆和上下文
- **Agent Runtime**: 基于 `@mariozechner/pi-agent-core`，负责智能决策和工具编排
- **系统提示词组装层**: 动态组装系统提示词，包含基础系统提示、工具说明、记忆文件、Skills 指令等
- **Tools**: 13 个内置工具，包括跨 Tab 调用工具，支持 Agent 间通信
- **安全检查**: 所有文件和命令操作都经过路径白名单验证
- **多 Agent 协作**: 不同 Tab 的 Agent 可以互相发送消息，实现协作完成复杂任务

#### 系统提示词组装流程 🆕

```
Agent 启动 → 加载基础 Agent 提示 (AGENT.md)
           ↓
         加载工具说明 (TOOLS.md + CUSTOM-TOOLS.md)
           ↓
         加载全局记忆 (MEMORY.md)
           ↓
         加载独立记忆 (memory-<tab-id>.md)
           ↓
         加载 Skills 指令 (各个 SKILL.md)
           ↓
         组装完整系统提示词
           ↓
         发送给 AI 模型
```

**动态更新机制**：
- 记忆文件更新时，自动重载所有 Agent 的系统提示词
- Skills 安装/卸载时，自动更新工具说明
- 支持运行时热更新，无需重启应用

---

## 🌐 外部通讯 (Connector)

DeepBot 支持通过 Connector 系统接入外部平台，实现跨平台交互。

### 已支持平台

#### 飞书 (Feishu)

通过飞书机器人与 DeepBot 交互，支持私聊和群聊。

**功能特性**：
- ✅ 私聊消息（需配对授权）
- ✅ 群聊消息（支持 @提及）
- ✅ 消息去重（防止重复响应）
- ✅ 独立会话管理（每个对话独立 Tab）
- ✅ 发送图片/文件给用户
- ✅ 飞书云文档操作（创建、读取、编辑、删除、评论）

**配置步骤**：

1. 在 DeepBot 中打开「系统设置」→「外部连接」→「飞书」
2. 填写飞书应用配置（App ID、App Secret、机器人名称）
3. 配置安全策略（私聊策略、群聊策略）
4. 点击「保存」并「启动」连接器

**详细配置指南**：

📖 [飞书机器人配置指南](docs/飞书机器人配置指南.md)

包含完整的飞书开放平台配置步骤、权限设置、安全策略说明等。

### 未来计划

- 🔜 Discord
- 🔜 Slack
- 🔜 企业微信
- 🔜 钉钉

---

## 🔧 14 个内置工具

| 工具 | 功能 | 典型用途 |
|------|------|---------|
| **File Tool** | 文件读写操作 | 读取配置、保存数据、搜索文件 |
| **Exec Tool** | 执行命令行命令 | 运行脚本、系统操作、安装软件 |
| **Browser Tool** | 浏览器控制 | 网页截图、自动化操作、内容提取 |
| **Calendar Tool** | 日历管理 | 查看日期、计算时间、日程提醒 |
| **Environment Check** | 环境检查 | 检测系统信息、验证依赖、诊断问题 |
| **Image Generation** | AI 图片生成 | 创建图片、设计素材、视觉内容 |
| **Web Search** | 网页搜索 | 实时信息查询、资料搜集、内容研究 |
| **Web Fetch** | 网页内容获取 | 获取网页正文、提取文章内容、下载网页数据 |
| **Memory Tool** | 记忆管理 | 存储用户偏好、读取历史信息 |
| **Skill Manager** | 技能管理 | 安装/卸载/列出技能包 |
| **Scheduled Task** | 定时任务 | 创建/管理/执行定时任务 |
| **Chat Tool** | AI 对话处理 | 工具内部调用 AI、后端 AI 处理、不占用主 Agent 上下文 |
| **Cross Tab Call** 🆕 | 跨 Tab 通信 | Agent 间互相发送消息、多 Agent 协作完成复杂任务 |
| **Feishu Doc Tool** | 飞书云文档操作 | 创建文档、读取内容、追加/更新/删除块、添加评论、删除文档 |

### 创建自定义工具

所有工具统一使用 `ToolPlugin` 接口，代码位于 `src/main/tools/` 目录。

#### 快速开始

1. **创建工具文件**

在 `src/main/tools/` 创建新文件（如 `my-tool.ts`）：

```typescript
import { Type } from '@sinclair/typebox';
import type { ToolPlugin } from './registry/tool-interface';
import { TOOL_NAMES } from './tool-names';

export const myToolPlugin: ToolPlugin = {
  // 工具元数据（用于 UI 展示和管理）
  metadata: {
    id: 'my-tool',              // 唯一标识，kebab-case
    name: '我的工具',            // 显示名称（给用户看）
    description: '我的自定义工具',
    version: '1.0.0',
    author: 'DeepBot',
    category: 'custom',         // 分类：file | network | system | ai | custom
    tags: ['custom'],
  },
  
  // 创建工具实例，接收运行时上下文（工作目录、会话 ID、配置等）
  create: (options) => ({
    name: TOOL_NAMES.MY_TOOL,   // AI 调用时使用的工具名（必须在 tool-names.ts 中注册）
    label: '我的工具',           // 执行步骤中显示的标签
    description: '执行自定义操作',  // 告诉 AI 这个工具做什么
    // 参数定义（使用 TypeBox，AI 会根据 description 自动填充参数）
    // 常见参数类型示例：
    //   Type.String({ description: '...' })                    — 字符串
    //   Type.Number({ description: '...' })                    — 数字
    //   Type.Boolean({ description: '...' })                   — 布尔值
    //   Type.Optional(Type.String({ description: '...' }))     — 可选参数
    //   Type.Union([Type.Literal('a'), Type.Literal('b')])     — 枚举（AI 只能选其中一个）
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal('search'),
        Type.Literal('create'),
        Type.Literal('delete'),
      ], { description: '操作类型' }),
      query: Type.String({ description: '搜索关键词或目标名称' }),
      limit: Type.Optional(Type.Number({ description: '最大结果数（默认 10）' })),
      force: Type.Optional(Type.Boolean({ description: '跳过确认直接执行' })),
    }),
    
    execute: async (toolCallId, params, signal) => {
      // signal: AbortSignal，用户停止时会触发
      // params: 已经过 schema 验证的参数对象
      
      return {
        // content: 返回给 AI 的内容（AI 会基于此决定下一步）
        content: [{ type: 'text', text: '执行成功' }],
        // details: 结构化数据，用于 UI 渲染或日志记录（AI 不可见）
        details: { success: true },
      };
    },
  }),
};
```

2. **在 tool-loader.ts 中加载**

编辑 `src/main/tools/registry/tool-loader.ts`，添加工具导入和加载：

```typescript
import { myToolPlugin } from '../my-tool';

// 在 loadTools() 方法中，和其他 plugin 一起添加：
tools.push(...await resolvePluginTools(myToolPlugin.create(pluginOpts)));
```

3. **注册工具名称常量**

编辑 `src/main/tools/tool-names.ts`，添加工具名称常量：

```typescript
export const TOOL_NAMES = {
  // ...已有工具
  MY_TOOL: 'my_tool',
};
```

然后在工具定义中使用 `TOOL_NAMES.MY_TOOL` 代替硬编码字符串。

4. **添加工具提示词**

编辑 `src/main/prompts/templates/CUSTOM-TOOLS.md`，添加工具使用说明。

以 Email 工具为例，说明文档应包含以下部分：

````markdown
## Email（邮件发送工具）

### 核心原则
1. 必须先配置 SMTP 账号才能使用
2. 配置文件路径固定，不要告诉用户错误路径
3. 发送失败时，根据错误信息指导用户修复配置
4. 不要重复调用，失败一次就告知用户原因

### 使用前提

**配置文件路径**（按优先级查找）：
1. 项目级别：`<workspace>/.deepbot/tools/email-tool/config.json`
2. 用户级别：`~/.deepbot/tools/email-tool/config.json`

**配置文件格式**：
```json
{
  "user": "your-email@example.com",
  "password": "your-password-or-auth-code",
  "smtpServer": "smtp.example.com",
  "smtpPort": 465,
  "useSsl": true,
  "fromName": "Your Name"
}
```

**常见邮箱配置**：
- QQ 邮箱：必须使用授权码（不是 QQ 密码）
- Gmail：必须使用应用专用密码
- 163 邮箱：必须开启 SMTP 服务并使用授权码

### 使用场景
- ✅ 发送通知邮件、报告邮件
- ✅ 发送带附件的邮件
- ✅ 发送 HTML 格式的邮件
- ❌ 不要用于批量营销邮件（可能被封号）
- ❌ 不要发送敏感信息（邮件不加密）

### 示例

1. 发送简单文本邮件：
```json
{
  "to": "recipient@example.com",
  "subject": "测试邮件",
  "body": "这是一封测试邮件"
}
```

2. 发送 HTML 邮件：
```json
{
  "to": "team@company.com",
  "subject": "项目进度报告",
  "body": "<h1>项目进度</h1><ul><li>功能 A：已完成</li></ul>",
  "html": true
}
```

3. 发送带附件的邮件：
```json
{
  "to": "client@example.com",
  "subject": "合同文件",
  "body": "请查收附件中的合同",
  "attachments": ["~/Documents/contract.pdf"]
}
```

### 错误处理

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| "nodemailer 未安装" | 依赖未安装 | 告诉用户需要安装 nodemailer |
| "邮件工具未配置" | 配置文件不存在 | 告诉用户需要创建配置文件 |
| "认证失败" | 账号或密码错误 | 检查配置中的账号和授权码 |
````

**说明文档结构**：
- **核心原则**：AI 必须遵守的规则
- **使用前提**：使用工具前需要满足的条件（如配置文件、依赖安装）
- **使用场景**：什么时候用/不用这个工具
- **示例**：实际使用案例（从简单到复杂）
- **错误处理**：常见错误和解决方案

#### 高级功能

- **配置文件**: 从 `~/.deepbot/tools/<tool-name>/config.json` 读取配置
- **外部依赖**: 使用动态 `require()` 加载，避免打包到主项目
- **取消支持**: 通过 `AbortSignal` 支持用户取消操作
- **提示词管理**: 在 `CUSTOM-TOOLS.md` 中添加工具使用说明，帮助 AI 更好地理解和使用工具

#### 示例和文档

- 📖 [完整开发指南](src/main/tools/registry/TOOL-DEVELOPMENT-GUIDE.md)
- 📝 [示例工具模板](src/main/tools/registry/example-tool.ts)
- 🔧 [邮件工具示例](src/main/tools/email-tool.ts) - 带配置和外部依赖的完整示例

---

## 🔒 安全机制

DeepBot 实现了严格的安全限制，确保 AI Agent 只能访问用户明确授权的目录：

### 路径白名单

只允许访问以下配置的目录及其子目录：

| 目录类型 | 默认路径 | 用途 | 可配置 |
|---------|---------|------|--------|
| **工作目录** | `~` (用户主目录) | 文件读写、命令执行 | ✅ |
| **脚本目录** | `~/.deepbot/scripts` | Python 脚本存储 | ✅ |
| **Skill 目录** | `~/.agents/skills` | Skill 包安装 | ✅ |
| **图片目录** | `~/.deepbot/generated-images` | AI 生成图片保存 | ✅ |

### 安全检查流程

```
工具调用 → 路径安全检查 → 在白名单内？
                           ├─ 是 → 允许执行
                           └─ 否 → 拒绝执行，返回错误
```

---

## 🧠 记忆系统

DeepBot 支持强大的长期记忆功能，可以记住用户的偏好和重要信息。

### 全局记忆

- **存储位置**: `~/.deepbot/memory/MEMORY.md`
- **格式**: Markdown 格式，结构化存储
- **自动注入**: 每次对话自动加载到系统提示词
- **实时更新**: 记忆更新后自动重载所有 Agent
- **作用范围**: 所有 Tab 共享，存储通用偏好和重要信息

### 独立记忆（多 Agent 支持）

每个 Tab（Agent）可以拥有独立的记忆文件，实现真正的多角色协作：

- **独立记忆文件**: 每个 Tab 可以有自己的 `memory-<tab-id>.md`
- **独立角色设定**: 不同 Tab 可以扮演不同角色（如产品经理、开发工程师、测试工程师）
- **独立工作偏向**: 每个 Agent 可以有自己的专业领域和工作方式
- **持久化存储**: Tab 的记忆和角色设定会被持久化保存

### 使用场景

**全局记忆**：
```
用户: "记住：我喜欢简洁的代码"
DeepBot: "已记住你的偏好"
```

**独立记忆**：
```
用户: "创建一个销售分析 Agent"
DeepBot: "已创建新 Tab，这个 Agent 将专注于客户关系管理和销售数据分析"

用户: "记住：你是销售专家，负责客户跟进和销售业绩分析"
销售分析 Agent: "已记住我的职责范围"
```

### 多 Agent 协作示例

1. **销售 Agent**: 负责客户关系管理和销售流程，记忆中存储客户信息和销售策略
2. **市场 Agent**: 负责市场分析和营销活动，记忆中存储市场数据和推广方案
3. **解决方案 Agent**: 负责技术方案设计和客户需求分析，记忆中存储解决方案模板和技术规范
4. **产品 Agent**: 负责产品规划和需求管理，记忆中存储产品路线图和用户反馈
5. **研发 Agent**: 负责技术开发和系统实现，记忆中存储技术文档和开发规范
6. **项目管理 Agent**: 负责项目协调和进度管控，记忆中存储项目计划和资源分配

每个 Agent 都有独立的记忆和专业领域，可以专注于自己的业务范围，实现跨部门高效协作。

---

## ⏰ 定时任务

支持创建和管理定时任务，自动化执行周期性工作：

### 功能特性

- ✅ Cron 表达式支持
- ✅ 专用 Tab 执行（锁定不可关闭）
- ✅ 清空历史上下文（保留上一轮执行结果作为上下文）
- ✅ 执行历史记录

### 使用示例

```
用户: "每天早上 9 点检查桌面文件"
DeepBot: "已创建定时任务，将在每天 9:00 执行"
```

---

## 🎨 技能扩展 (Skills)

通过 Skills 系统可以组合多个工具实现复杂功能。

### 安装现有 Skill

```bash
# 在 DeepBot 中使用 Skill Manager 工具
"安装 weather skill"
```

### 创建自定义 Skill

用户可以创建自己的 Skill 来实现特定功能。Skill 是包含 SKILL.md 文件的目录，使用 YAML frontmatter + Markdown 格式。

#### 1. 创建 Skill 目录

```bash
mkdir -p ~/.agents/skills/my-skill
cd ~/.agents/skills/my-skill
```

#### 2. 创建 SKILL.md 文件

创建 `SKILL.md` 文件（YAML frontmatter + Markdown 指令）：

````markdown
---
name: my-skill
description: 我的自定义技能，用于处理特定任务
version: 1.0.0
author: Your Name
---

# 我的自定义技能

## 何时使用此技能

当用户需要执行以下操作时使用此技能：
- 操作 1
- 操作 2

## 如何使用

### 步骤 1：读取文件

使用 file_read 工具读取文件：

```json
{
  "path": "~/example.txt"
}
```

### 步骤 2：处理数据

对读取的数据进行处理...

### 步骤 3：保存结果

使用 file_write 工具保存结果...

## 注意事项

- 注意事项 1
- 注意事项 2
````

#### 3. 安装 Skill

有两种安装方式：

**方式 1：直接放置**（推荐）

将 Skill 目录放到 `~/.agents/skills/` 下，重启 DeepBot 即可自动加载。

**方式 2：使用 Skill Manager**

```bash
# 在 DeepBot 中使用命令
"安装本地 skill，路径是 ~/.agents/skills/my-skill"
```

### Skill 目录

- **默认路径**: `~/.agents/skills/`
- **自动发现**: 启动时自动加载所有已安装的 Skills
- **动态管理**: 支持运行时安装/卸载

### Skill 开发文档

- 📖 Skill 可以调用所有内置工具
- 📝 支持异步操作和错误处理
- 🔧 可以组合多个工具实现复杂功能

---

## 🤖 支持的 AI 模型

DeepBot 支持多种 AI 模型提供商：

- **通义千问** (阿里云) - 默认模型
- **OpenAI** (GPT-4、GPT-3.5)
- **Claude** (Anthropic)

### 配置 API 密钥

在系统设置中配置对应的 API 密钥即可使用。

### ⚠️ 重要提示

**不建议使用：带有"思考"或"推理"能力的模型**

DeepBot 针对标准对话模型进行了优化。带有内置思考/推理模式的模型（如通义千问的 QwQ 系列、OpenAI 的 o1 系列，或其他具有显式推理步骤的模型）可能会导致：

- 思考标签（`<think>...</think>`）显示问题
- 响应速度变慢
- 简单任务产生不必要的推理开销


**不推荐使用：**
- ❌ QwQ-32B-Preview（推理模型）
- ❌ OpenAI o1、o1-mini、o1-preview（推理模型）
- ❌ DeepSeek-R1（推理模型）
- ❌ 其他具有显式思考/推理模式的模型

---

## 📦 外部服务

DeepBot 集成了以下外部服务：

| 服务 | 用途 | 配置位置 |
|------|------|---------|
| **Tavily API** | 网页搜索 | 系统设置 → Web Search |
| **Gemini** | 图片生成 (Imagen 3) | 系统设置 → Image Generation |

---

## 🛠️ 开发指南

### 项目结构

```
deepbot/
├── src/
│   ├── main/           # 主进程代码
│   │   ├── gateway.ts          # 会话管理
│   │   ├── agent-runtime/      # Agent 运行时
│   │   ├── tools/              # 工具系统
│   │   ├── scheduled-tasks/    # 定时任务
│   │   ├── connectors/         # 外部连接器
│   │   └── database/           # 数据存储
│   ├── renderer/       # 渲染进程代码 (React)
│   ├── shared/         # 共享代码
│   └── types/          # 类型定义
├── docs/               # 文档
└── scripts/            # 构建脚本
```

---

## 📝 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 🙏 致谢

DeepBot 的开发受到以下项目的启发：

- [Clawdbot](https://github.com/openclaw/openclaw) - 提供了架构参考
- [@mariozechner/pi-agent-core](https://github.com/badlogic/pi-agent) - AI Agent Runtime

---

## 📧 联系方式

- **作者**: K罗@格灵深瞳
- **问题反馈**: [GitHub Issues](https://github.com/kevinluosl/deepbot/issues)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star！**

</div>
