<div align="center">

<img src="banner.jpg" alt="DeepBot Terminal" width="500"/>

<p>

## **Intelligent ｜ Secure ｜ Extensible**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-28+-9feaf9.svg)](https://www.electronjs.org/)

[English](README_EN.md) | [简体中文](README.md)

</div>

---

## 📖 Introduction

DeepBot Terminal is a system-level AI assistant. Compared to OpenClaw's Geek-oriented approach, DeepBot provides more convenient installation and usage, with DeepBot exploring more in the direction of enterprise productivity enhancement. It can deeply integrate with existing enterprise systems, allowing AI to participate deeply in daily office efficiency across departments through multi-Agent collaboration to achieve automated complex business processes. Whether it's document processing, data analysis, system monitoring, or cross-departmental collaboration tasks, DeepBot handles it all effortlessly through AI Agent technology. It supports multi-task parallel processing, scheduled tasks, skill extensions, while protecting enterprise system security through strict safety mechanisms.

### ✨ Core Features

- 🎯 **Multi-Task Parallel Processing** - Handle multiple tasks simultaneously without interference
- 🔧 **13 Built-in Tools** - File operations, command execution, browser control, image generation, AI chat, cross-session communication, web content fetching, etc.
- 🧠 **Memory System** - Long-term memory of user preferences and important information
- ⏰ **Scheduled Tasks** - Automated execution of periodic tasks
- 🎨 **Skill Extensions** - Combine tools to implement complex functions through Skills
- 🔒 **Security Restrictions** - Strict path whitelist mechanism to protect system security
- 🤖 **Multi-Model Support** - Qwen, OpenAI, Claude, etc.
- 🌐 **External Communication** - Support integration with Feishu and other external platforms for cross-platform interaction

---

## 🚀 Quick Start

### Requirements

- **Python**: 3.11 or higher
- **Node.js**: 20.0.0 or higher (optional, for running JS scripts)
- **pnpm**: 10.23.0 or higher (optional, for running JS scripts)
- **OS**: macOS, Windows, Linux

### Installation

```bash
# Clone repository
git clone https://github.com/kevinluosl/deepbot.git
cd deepbot

# Install dependencies
pnpm install

# Run in development mode
pnpm run dev
```

### Build

```bash
# Build for all platforms
pnpm run dist

# Build for macOS only
pnpm run dist:mac

# Build for Windows only
pnpm run dist:win

# Build for Linux only
pnpm run dist:linux
```

**Note for macOS builds**: The build process automatically performs ad-hoc signing on macOS apps. This prevents the "app is damaged" message but users will still see "cannot verify developer" on first launch (which is normal and can be bypassed with right-click → Open).

### macOS Installation Issues

macOS may show security warnings when first opening DeepBot. Choose the solution based on the message you see:

#### "App is damaged" message

Run this command in Terminal, then reopen the app:

```bash
sudo xattr -rd com.apple.quarantine /Applications/DeepBot.app
```

#### "Cannot verify developer" message

**Method 1: Right-click to open**

Right-click the app icon, select "Open", then click "Open" again in the dialog.

**Method 2: System Settings**

1. Try to open the app (you'll see a security warning, click "Cancel")
2. Open "System Settings" → "Privacy & Security"
3. Scroll down to the "Security" section
4. Click "Open Anyway" button
5. Try opening the app again, click "Open" in the dialog

---

## 🏗️ Architecture Design

DeepBot adopts a modular architecture that supports multi-Agent communication and collaboration:

```
┌─────────────────────────────────────────┐
│      User Interface (Electron)          │
│   External Communication: Feishu        │
└─────────────────┬───────────────────────┘
                  │ IPC / WebSocket
┌─────────────────▼───────────────────────┐
│      Gateway (Session Management)       │
│    • Session Management (One per Tab)   │
│    • Message Queue & Routing            │
│    • Connector Management               │
│    • Cross-Tab Message Routing 🆕       │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   Session 1  Session 2  Session N
   (Tab 1)    (Tab 2)    (Tab N)
        │         │         │
        ▼         ▼         ▼
┌─────────────────────────────────────────┐
│   Agent Runtime (One per Session)       │
│    • Intelligent Decision & Orchestration│
│    • Auto-Continue (Max 100 times)      │
│    • Operation Tracking (Max 3 times)   │
│    • Independent Memory & Context       │
│    • Cross-Tab Calling Tool 🆕          │
│    • Dynamic System Prompt Assembly 🆕  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│     System Prompt Assembly Layer 🆕     │
│    • Base Agent Prompt (AGENT.md)       │
│    • Tool Instructions (TOOLS.md)       │
│    • Custom Tool Instructions (CUSTOM-TOOLS.md)│
│    • Global Memory (MEMORY.md)          │
│    • Independent Memory (memory-<tab-id>.md)│
│    • Skills Instructions (SKILL.md)     │
│    • Dynamic Loading & Real-time Update │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      13 Tools + Security Check          │
│    🔒 Path Whitelist • Workspace Isolation│
│    🔄 Cross-Tab Message Tool 🆕          │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
    Skills   Scheduled   Data Storage
                Tasks
```

### Multi-Agent Collaboration Architecture 🆕

```
┌─────────────────────────────────────────┐
│      Enterprise Full-Process AI System  │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Sales   │ │ Gateway │ │Marketing│
│AI Agent │ │Message  │ │AI Agent │
└────┬────┘ │Router   │ └────┬────┘
     │      └────┬────┘      │
     └───────────┼───────────┘
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Solution │ │Product  │ │R&D      │
│AI Agent │ │AI Agent │ │AI Agent │
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     └───────────┼───────────┘
                 │
                 ▼
           ┌─────────┐
           │Project  │
           │Manager  │
           │AI Agent │
           └─────────┘
```

### Architecture Overview

- **Gateway**: Manages all Sessions, each Tab corresponds to an independent Session, supports cross-Tab message routing
- **Session**: Independent conversation unit with its own Agent Runtime, memory, and context
- **Agent Runtime**: Based on `@mariozechner/pi-agent-core`, responsible for intelligent decision-making and tool orchestration
- **System Prompt Assembly Layer**: Dynamically assembles system prompts including base system prompts, tool instructions, memory files, Skills instructions, etc.
- **Tools**: 13 built-in tools including cross-Tab calling tool for inter-Agent communication
- **Security Check**: All file and command operations are validated through path whitelist
- **Multi-Agent Collaboration**: Agents in different Tabs can send messages to each other for collaborative complex task completion

#### System Prompt Assembly Process 🆕

```
Agent Startup → Load Base Agent Prompt (AGENT.md)
              ↓
            Load Tool Instructions (TOOLS.md + CUSTOM-TOOLS.md)
              ↓
            Load Global Memory (MEMORY.md)
              ↓
            Load Independent Memory (memory-<tab-id>.md)
              ↓
            Load Skills Instructions (SKILL.md files)
              ↓
            Assemble Complete System Prompt
              ↓
            Send to AI Model
```

**Dynamic Update Mechanism**:
- When memory files are updated, automatically reload system prompts for all Agents
- When Skills are installed/uninstalled, automatically update tool instructions
- Supports runtime hot updates without application restart

---

## 🌐 External Communication (Connector)

DeepBot supports integration with external platforms through the Connector system for cross-platform interaction.

### Supported Platforms

#### Feishu (Lark)

Interact with DeepBot through Feishu bot, supporting private chats and group chats.

**Features**:
- ✅ Private messages (requires pairing authorization)
- ✅ Group messages (supports @mention)
- ✅ Message deduplication (prevents duplicate responses)
- ✅ Independent session management (each conversation has its own Tab)

**Configuration Steps**:

1. Open "System Settings" → "External Connections" → "Feishu" in DeepBot
2. Fill in Feishu app configuration (App ID, App Secret, Bot Name)
3. Configure security policies (DM policy, group policy)
4. Click "Save" and "Start" the connector

**Detailed Configuration Guide**:

📖 [Feishu Bot Configuration Guide](docs/飞书机器人配置指南.md) (Chinese)

Includes complete Feishu Open Platform configuration steps, permission settings, security policy explanations, etc.

### Future Plans

- 🔜 Discord
- 🔜 Slack
- 🔜 WeChat Work
- 🔜 DingTalk

---

## 🔧 13 Built-in Tools

| Tool | Function | Typical Use Cases |
|------|----------|-------------------|
| **File Tool** | File read/write operations | Read configs, save data, search files |
| **Exec Tool** | Execute command-line commands | Run scripts, system operations, install software |
| **Browser Tool** | Browser control | Web screenshots, automation, content extraction |
| **Calendar Tool** | Calendar management | View dates, calculate time, schedule reminders |
| **Environment Check** | Environment inspection | Detect system info, verify dependencies, diagnose issues |
| **Image Generation** | AI image generation | Create images, design materials, visual content |
| **Web Search** | Web search | Real-time info queries, data collection, content research |
| **Web Fetch** | Web content fetching | Get webpage content, extract articles, download web data |
| **Memory Tool** | Memory management | Store user preferences, read historical information |
| **Skill Manager** | Skill management | Install/uninstall/list skill packages |
| **Scheduled Task** | Scheduled tasks | Create/manage/execute scheduled tasks |
| **Chat Tool** | AI conversation processing | Internal tool AI calls, backend AI processing, independent from main Agent context |
| **Cross Tab Call** 🆕 | Cross-Tab communication | Inter-Agent messaging and multi-Agent collaboration for complex tasks |

### Creating Custom Tools

DeepBot supports creating custom tools to extend functionality. All tools are built-in tools with code located in the `src/main/tools/` directory.

#### Quick Start

1. **Create Tool File**

Create a new file in `src/main/tools/` (e.g., `my-tool.ts`):

```typescript
import { Type } from '@sinclair/typebox';
import type { ToolPlugin } from './registry/tool-interface';

export const myToolPlugin: ToolPlugin = {
  metadata: {
    id: 'my-tool',
    name: 'my_tool',
    description: 'My custom tool',
    version: '1.0.0',
  },
  
  create: (options) => ({
    name: 'my_tool',
    label: 'My Tool',
    description: 'Execute custom operations',
    parameters: Type.Object({
      input: Type.String({ description: 'Input content' }),
    }),
    
    execute: async (toolCallId, params, signal) => {
      // Implement tool logic
      return {
        content: [{ type: 'text', text: 'Success' }],
      };
    },
  }),
};
```

2. **Load in tool-loader.ts**

Edit `src/main/tools/registry/tool-loader.ts` to import and load the tool:

```typescript
import { myToolPlugin } from '../my-tool';

// Add in loadBuiltinTools() method
const myTools = myToolPlugin.create({
  workspaceDir: this.workspaceDir,
  sessionId: this.sessionId,
  configStore,
});
tools.push(myTools);
```

3. **Add Tool Prompts**

Edit `src/main/prompts/templates/CUSTOM-TOOLS.md` to add tool usage instructions.

Using Email tool as an example, the documentation should include the following sections:

````markdown
## Email (Email Sending Tool)

### Core Principles
1. SMTP account must be configured before use
2. Configuration file path is fixed, don't tell users wrong paths
3. When sending fails, guide users to fix configuration based on error messages
4. Don't retry repeatedly, inform users of the reason after one failure

### Prerequisites

**Configuration File Path** (searched in priority order):
1. Project level: `<workspace>/.deepbot/tools/email-tool/config.json`
2. User level: `~/.deepbot/tools/email-tool/config.json`

**Configuration File Format**:
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

**Common Email Provider Settings**:
- QQ Mail: Must use authorization code (not QQ password)
- Gmail: Must use app-specific password
- 163 Mail: Must enable SMTP service and use authorization code

### Use Cases
- ✅ Send notification emails, report emails
- ✅ Send emails with attachments
- ✅ Send HTML formatted emails
- ❌ Don't use for bulk marketing emails (may get banned)
- ❌ Don't send sensitive information (emails are not encrypted)

### Examples

1. Send simple text email:
```json
{
  "to": "recipient@example.com",
  "subject": "Test Email",
  "body": "This is a test email"
}
```

2. Send HTML email:
```json
{
  "to": "team@company.com",
  "subject": "Project Progress Report",
  "body": "<h1>Progress</h1><ul><li>Feature A: Completed</li></ul>",
  "html": true
}
```

3. Send email with attachments:
```json
{
  "to": "client@example.com",
  "subject": "Contract Documents",
  "body": "Please find the contract in the attachment",
  "attachments": ["~/Documents/contract.pdf"]
}
```

### Error Handling

| Error Message | Cause | Solution |
|--------------|-------|----------|
| "nodemailer not installed" | Dependency not installed | Tell user to install nodemailer |
| "Email tool not configured" | Config file doesn't exist | Tell user to create config file |
| "Authentication failed" | Wrong credentials | Check account and authorization code |
````

**Documentation Structure**:
- **Core Principles**: Rules that AI must follow
- **Prerequisites**: Conditions that must be met before using the tool (e.g., config files, dependencies)
- **Use Cases**: When to use/not use this tool
- **Examples**: Real usage examples (from simple to complex)
- **Error Handling**: Common errors and solutions

#### Advanced Features

- **Config Files**: Read configuration from `~/.deepbot/tools/<tool-name>/config.json`
- **External Dependencies**: Use dynamic `require()` to load dependencies without bundling
- **Cancellation Support**: Support user cancellation via `AbortSignal`
- **Prompt Management**: Add tool usage instructions in `CUSTOM-TOOLS.md` to help AI better understand and use the tool

#### Examples and Documentation

- 📖 [Complete Development Guide](src/main/tools/registry/README.md)
- 📝 [Example Tool Template](src/main/tools/registry/example-tool.ts)
- 🔧 [Email Tool Example](src/main/tools/email-tool.ts) - Complete example with config and external dependencies

---

## 🔒 Security Mechanism

DeepBot implements strict security restrictions to ensure AI Agent can only access user-authorized directories:

### Path Whitelist

Only allows access to the following configured directories and their subdirectories:

| Directory Type | Default Path | Purpose | Configurable |
|---------------|--------------|---------|--------------|
| **Workspace** | `~` (User home) | File read/write, command execution | ✅ |
| **Scripts** | `~/.deepbot/scripts` | Python script storage | ✅ |
| **Skills** | `~/.agents/skills` | Skill package installation | ✅ |
| **Images** | `~/.deepbot/generated-images` | AI-generated image storage | ✅ |

### Security Check Flow

```
Tool Call → Path Security Check → Within Whitelist?
                                   ├─ Yes → Allow Execution
                                   └─ No → Reject, Return Error
```

---

## 🧠 Memory System

DeepBot supports powerful long-term memory functionality to remember user preferences and important information.

### Global Memory

- **Storage Location**: `~/.deepbot/memory/MEMORY.md`
- **Format**: Markdown format, structured storage
- **Auto-Injection**: Automatically loaded into system prompt for each conversation
- **Real-time Update**: Memory updates automatically reload all Agents
- **Scope**: Shared across all Tabs, stores general preferences and important information

### Independent Memory (Multi-Agent Support)

Each Tab (Agent) can have its own independent memory file for true multi-role collaboration:

- **Independent Memory Files**: Each Tab can have its own `memory-<tab-id>.md`
- **Independent Role Settings**: Different Tabs can play different roles (e.g., Product Manager, Developer, QA Engineer)
- **Independent Work Preferences**: Each Agent can have its own expertise and working style
- **Persistent Storage**: Tab memory and role settings are persisted

### Usage Scenarios

**Global Memory**:
```
User: "Remember: I prefer concise code"
DeepBot: "I've remembered your preference"
```

**Independent Memory**:
```
User: "Create a Sales Analysis Agent"
DeepBot: "New Tab created, this Agent will focus on customer relationship management and sales data analysis"

User: "Remember: You are a Sales Expert responsible for customer follow-up and sales performance analysis"
Sales Analysis Agent: "I've remembered my responsibilities"
```

### Multi-Agent Collaboration Example

1. **Sales Agent**: Responsible for customer relationship management and sales processes, stores customer information and sales strategies in memory
2. **Marketing Agent**: Responsible for market analysis and marketing activities, stores market data and promotion plans in memory
3. **Solution Agent**: Responsible for technical solution design and customer requirement analysis, stores solution templates and technical specifications in memory
4. **Product Agent**: Responsible for product planning and requirement management, stores product roadmaps and user feedback in memory
5. **R&D Agent**: Responsible for technical development and system implementation, stores technical documentation and development standards in memory
6. **Project Manager Agent**: Responsible for project coordination and progress control, stores project plans and resource allocation in memory

Each Agent has independent memory and expertise, can focus on their own business domain for efficient cross-departmental collaboration.

---

## ⏰ Scheduled Tasks

Support for creating and managing scheduled tasks to automate periodic work:

### Features

- ✅ Cron expression support
- ✅ Dedicated Tab execution (locked, cannot be closed)
- ✅ Clear historical context
- ✅ Execution history tracking

### Usage Example

```
User: "Check desktop files every day at 9 AM"
DeepBot: "Scheduled task created, will execute daily at 9:00"
```

---

## 🎨 Skill Extensions

The Skills system allows combining multiple tools to implement complex functions.

### Install Existing Skills

```bash
# Use Skill Manager tool in DeepBot
"Install weather skill"
```

### Create Custom Skills

Users can create their own Skills to implement specific functionality. A Skill is a directory containing a SKILL.md file using YAML frontmatter + Markdown format.

#### 1. Create Skill Directory

```bash
mkdir -p ~/.agents/skills/my-skill
cd ~/.agents/skills/my-skill
```

#### 2. Create SKILL.md File

Create `SKILL.md` file (YAML frontmatter + Markdown instructions):

````markdown
---
name: my-skill
description: My custom skill for handling specific tasks
version: 1.0.0
author: Your Name
---

# My Custom Skill

## When to use this skill

Use this skill when the user needs to:
- Operation 1
- Operation 2

## How to use

### Step 1: Read file

Use file_read tool to read file:

```json
{
  "path": "~/example.txt"
}
```

### Step 2: Process data

Process the read data...

### Step 3: Save results

Use file_write tool to save results...

## Notes

- Note 1
- Note 2
````

#### 3. Install Skill

Two installation methods:

**Method 1: Direct Placement** (Recommended)

Place the Skill directory under `~/.agents/skills/`, restart DeepBot to auto-load.

**Method 2: Use Skill Manager**

```bash
# Use command in DeepBot
"Install local skill at path ~/.agents/skills/my-skill"
```

### Skill Directory

- **Default Path**: `~/.agents/skills/`
- **Auto-Discovery**: Automatically loads all installed Skills at startup
- **Dynamic Management**: Supports runtime install/uninstall

### Skill Development Documentation

- 📖 Skills can call all built-in tools
- 📝 Supports async operations and error handling
- 🔧 Can combine multiple tools for complex functionality

---

## 🤖 Supported AI Models

DeepBot supports multiple AI model providers:

- **Qwen** (Alibaba Cloud) - Default model
- **OpenAI** (GPT-4, GPT-3.5)
- **Claude** (Anthropic)

### Configure API Keys

Configure the corresponding API keys in system settings to use.

### ⚠️ Important Notes

**Not Recommended: Models with "think" or "reasoning" capabilities**

DeepBot is optimized for standard conversational models. Models with built-in thinking/reasoning modes (such as Qwen's QwQ series, OpenAI's o1 series, or other models with explicit reasoning steps) may cause:

- Display issues with thinking tags (`<think>...</think>`)
- Slower response times
- Unnecessary reasoning overhead for simple tasks



**Not Recommended:**
- ❌ QwQ-32B-Preview (reasoning model)
- ❌ OpenAI o1, o1-mini, o1-preview (reasoning models)
- ❌ DeepSeek-R1 (reasoning model)
- ❌ Other models with explicit thinking/reasoning modes

---

## 📦 External Services

DeepBot integrates the following external services:

| Service | Purpose | Configuration |
|---------|---------|---------------|
| **Tavily API** | Web search | System Settings → Web Search |
| **Gemini** | Image generation (Imagen 3) | System Settings → Image Generation |

---

## 🛠️ Development Guide

### Project Structure

```
deepbot/
├── src/
│   ├── main/           # Main process code
│   │   ├── gateway.ts          # Session management
│   │   ├── agent-runtime/      # Agent runtime
│   │   ├── tools/              # Tool system
│   │   ├── scheduled-tasks/    # Scheduled tasks
│   │   ├── connectors/         # External connectors
│   │   └── database/           # Data storage
│   ├── renderer/       # Renderer process code (React)
│   ├── shared/         # Shared code
│   └── types/          # Type definitions
├── docs/               # Documentation
└── scripts/            # Build scripts
```

---

## 📝 License

This project is licensed under the [MIT License](LICENSE).

---

## 🙏 Acknowledgments

DeepBot's development was inspired by the following projects:

- [Clawdbot](https://github.com/openclaw/openclaw) - Mentor project, provided architectural reference
- [@mariozechner/pi-agent-core](https://github.com/badlogic/pi-agent) - AI Agent Runtime
- [Electron](https://www.electronjs.org/) - Cross-platform desktop application framework

---

## 📧 Contact

- **Author**: Kevin Luo @ Deepglint
- **Issue Reporting**: [GitHub Issues](https://github.com/kevinluosl/deepbot/issues)

---

<div align="center">

**⭐ If this project helps you, please give it a Star!**

</div>
