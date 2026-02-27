<div align="center">

<img src="banner.png" alt="DeepBot Terminal" width="800"/>

**🤖 通用桌面 AI 助手 | 智能、安全、可扩展**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-28+-9feaf9.svg)](https://www.electronjs.org/)

[English](README_EN.md) | [简体中文](README.md)

</div>

---

## 📖 简介

DeepBot Terminal 是由格灵深瞳灵感实验室成员开发的桌面 AI 助手，它就像为你的电脑装上了一个智能大脑。无论是整理文件、定时提醒、网页自动化，还是复杂的多步骤任务，DeepBot 都能通过 AI Agent 技术帮你轻松搞定。它支持多任务并行处理、定时任务、技能扩展等功能，同时通过严格的安全机制保护你的系统安全。

### ✨ 核心特性

- 🎯 **多任务并行处理** - 同时处理多个任务，互不干扰
- 🔧 **10 个内置工具** - 文件操作、命令执行、浏览器控制、图片生成等
- 🧠 **记忆系统** - 长期记忆用户偏好和重要信息
- ⏰ **定时任务** - 自动化执行周期性任务
- 🎨 **技能扩展** - 通过 Skills 组合工具实现复杂功能
- 🔒 **安全限制** - 严格的路径白名单机制，保护系统安全
- 🤖 **多模型支持** - 通义千问、OpenAI、Claude 等
- 🌐 **外部通讯** - 支持接入飞书等外部平台，实现跨平台交互

---

## 🚀 快速开始

### 环境要求

- **Node.js**: 20.0.0 或更高版本
- **pnpm**: 10.23.0 或更高版本
- **操作系统**: macOS、Windows、Linux

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/deepbot.git
cd deepbot

# 安装依赖
pnpm install

# 开发模式运行
pnpm run dev
```

### 构建

```bash
# 构建所有平台
pnpm run dist

# 仅构建 macOS
pnpm run dist:mac

# 仅构建 Windows
pnpm run dist:win

# 仅构建 Linux
pnpm run dist:linux
```

**macOS 构建说明**：构建过程会自动对 macOS 应用进行 ad-hoc 签名。这可以避免"应用已损坏"提示，但用户首次启动时仍会看到"无法验证开发者"提示（这是正常的，可以通过右键点击 → 打开来绕过）。

### macOS 安装问题

macOS 首次打开 DeepBot 时可能会提示安全警告，选择对应的解决方法：

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

DeepBot 采用模块化架构，主要包含以下层次：

```
┌─────────────────────────────────────────┐
│         用户界面 (Electron)              │
│      外部通讯：飞书 (已支持)             │
└─────────────────┬───────────────────────┘
                  │ IPC / WebSocket
┌─────────────────▼───────────────────────┐
│         Gateway (会话管理)               │
│    • Tab 管理 (最多 10 个)               │
│    • 消息队列                            │
│    • 连接器管理 (Connector)              │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Agent Runtime (每个 Tab 一个)       │
│    • 智能决策和工具编排                  │
│    • 自动继续机制 (最多 100 次)          │
│    • 操作追踪 (防重复，最多 3 次)        │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         10 个工具 + 安全检查             │
│    🔒 路径白名单 • 工作空间隔离          │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
    Skills   定时任务   数据存储
```

### 架构说明

- **Gateway**: 管理所有会话，每个 Tab 对应一个独立会话
- **Agent Runtime**: 基于 `@mariozechner/pi-agent-core`，负责智能决策和工具编排
- **Tools**: 10 个内置工具，提供文件、命令、浏览器等核心能力
- **安全检查**: 所有文件和命令操作都经过路径白名单验证

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

## 🔧 10 个内置工具

| 工具 | 功能 | 典型用途 |
|------|------|---------|
| **File Tool** | 文件读写操作 | 读取配置、保存数据、搜索文件 |
| **Exec Tool** | 执行命令行命令 | 运行脚本、系统操作、安装软件 |
| **Browser Tool** | 浏览器控制 | 网页截图、自动化操作、内容提取 |
| **Calendar Tool** | 日历管理 | 查看日期、计算时间、日程提醒 |
| **Environment Check** | 环境检查 | 检测系统信息、验证依赖、诊断问题 |
| **Image Generation** | AI 图片生成 | 创建图片、设计素材、视觉内容 |
| **Web Search** | 网页搜索 | 实时信息查询、资料搜集、内容研究 |
| **Memory Tool** | 记忆管理 | 存储用户偏好、读取历史信息 |
| **Skill Manager** | 技能管理 | 安装/卸载/列出技能包 |
| **Scheduled Task** | 定时任务 | 创建/管理/执行定时任务 |

### 创建自定义工具

DeepBot 支持创建自定义工具来扩展功能。所有工具都是内置工具，代码位于 `src/main/tools/` 目录。

#### 快速开始

1. **创建工具文件**

在 `src/main/tools/` 创建新文件（如 `my-tool.ts`）：

```typescript
import { Type } from '@sinclair/typebox';
import type { ToolPlugin } from './registry/tool-interface';

export const myToolPlugin: ToolPlugin = {
  metadata: {
    id: 'my-tool',
    name: 'my_tool',
    description: '我的自定义工具',
    version: '1.0.0',
  },
  
  create: (options) => ({
    name: 'my_tool',
    label: '我的工具',
    description: '执行自定义操作',
    parameters: Type.Object({
      input: Type.String({ description: '输入内容' }),
    }),
    
    execute: async (toolCallId, params, signal) => {
      // 实现工具逻辑
      return {
        content: [{ type: 'text', text: '执行成功' }],
      };
    },
  }),
};
```

2. **在 tool-loader.ts 中加载**

编辑 `src/main/tools/registry/tool-loader.ts`，添加工具导入和加载：

```typescript
import { myToolPlugin } from '../my-tool';

// 在 loadBuiltinTools() 方法中添加
const myTools = myToolPlugin.create({
  workspaceDir: this.workspaceDir,
  sessionId: this.sessionId,
  configStore,
});
tools.push(myTools);
```

3. **添加工具提示词**

编辑 `src/main/prompts/templates/CUSTOM-TOOLS.md`，添加工具使用说明：

```markdown
## my_tool - 我的工具

**功能**: 执行自定义操作

**使用场景**:
- 场景 1
- 场景 2

**参数**:
- `input` (必填): 输入内容

**示例**:
```json
{
  "input": "测试内容"
}
```

**注意事项**:
- 注意事项 1
- 注意事项 2
```

#### 高级功能

- **配置文件**: 从 `~/.deepbot/tools/<tool-name>/config.json` 读取配置
- **外部依赖**: 使用动态 `require()` 加载，避免打包到主项目
- **取消支持**: 通过 `AbortSignal` 支持用户取消操作
- **提示词管理**: 在 `CUSTOM-TOOLS.md` 中添加工具使用说明，帮助 AI 更好地理解和使用工具

#### 示例和文档

- 📖 [完整开发指南](src/main/tools/registry/README.md)
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
| **Skill 目录** | `~/.deepbot/skills` | Skill 包安装 | ✅ |
| **图片目录** | `~/.deepbot/generated-images` | AI 生成图片保存 | ✅ |

### 安全检查流程

```
工具调用 → 路径安全检查 → 在白名单内？
                           ├─ 是 → 允许执行
                           └─ 否 → 拒绝执行，返回错误
```

---

## 🧠 记忆系统

DeepBot 支持长期记忆功能，可以记住用户的偏好和重要信息：

- **存储位置**: `~/.deepbot/memory/MEMORY.md`
- **格式**: Markdown 格式，结构化存储
- **自动注入**: 每次对话自动加载到系统提示词
- **实时更新**: 记忆更新后自动重载所有 Agent

### 使用示例

```
用户: "记住：我喜欢简洁的代码"
DeepBot: "已记住你的偏好"

用户: "我的偏好是什么？"
DeepBot: "你喜欢简洁的代码..."
```

---

## ⏰ 定时任务

支持创建和管理定时任务，自动化执行周期性工作：

### 功能特性

- ✅ Cron 表达式支持
- ✅ 专用 Tab 执行（锁定不可关闭）
- ✅ 清空历史上下文
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
mkdir -p ~/.deepbot/skills/my-skill
cd ~/.deepbot/skills/my-skill
```

#### 2. 创建 SKILL.md 文件

创建 `SKILL.md` 文件（YAML frontmatter + Markdown 指令）：

```markdown
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
```

#### 3. 安装 Skill

有两种安装方式：

**方式 1：直接放置**（推荐）

将 Skill 目录放到 `~/.deepbot/skills/` 下，重启 DeepBot 即可自动加载。

**方式 2：使用 Skill Manager**

```bash
# 在 DeepBot 中使用命令
"安装本地 skill，路径是 ~/.deepbot/skills/my-skill"
```

### Skill 目录

- **默认路径**: `~/.deepbot/skills/`
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
│   │   ├── tools/              # 10 个工具
│   │   ├── scheduled-tasks/    # 定时任务
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

- [Clawdbot](https://github.com/openclaw/openclaw) - 导师项目，提供了架构参考
- [@mariozechner/pi-agent-core](https://github.com/badlogic/pi-agent) - AI Agent Runtime
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架

---

## 📧 联系方式

- **作者**: Kevin Luo
- **问题反馈**: [GitHub Issues](https://github.com/yourusername/deepbot/issues)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star！**

Made with ❤️ by Kevin Luo

</div>
