<div align="center">

<img src="banner.jpg" alt="DeepBot Terminal" width="500"/>

<p>

**Bring AI into your enterprise workflows — a real working partner, not just a chatbot**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-28+-9feaf9.svg)](https://www.electronjs.org/)

[English](README.md) | [简体中文](README_ZH.md)

</div>

---

## 📖 Introduction

DeepBot is a system-level AI assistant focused on enterprise productivity. It integrates deeply with existing enterprise systems, enabling AI to participate in day-to-day operations across departments through multi-Agent collaboration — automating complex business workflows. Whether it's document processing, data analysis, system monitoring, or cross-department coordination, DeepBot handles it through AI Agent technology. It supports parallel task execution, scheduled tasks, and skill extensions, all protected by strict security controls.

### ✨ Core Features

- 🎯 **Parallel Task Processing** — Run multiple tasks simultaneously without interference
- 🔧 **14 Built-in Tools** — File operations, command execution, browser control, image generation, AI chat, cross-session messaging, web fetching, Feishu document operations, and more
- 🧠 **Memory System** — Long-term memory for user preferences and important context
- ⏰ **Scheduled Tasks** — Automate recurring work with cron-based scheduling
- 🎨 **Skill Extensions** — Compose tools into reusable Skills for complex workflows
- 🔒 **Security Controls** — Strict path whitelist to protect system access
- 🤖 **Multi-Model Support** — Qwen, OpenAI, Claude, and more
- 🌐 **External Integrations** — Connect with Feishu and other platforms for cross-platform interaction

---

## 🚀 Quick Start

### Requirements

- **Python**: 3.11+
- **Node.js**: 20.0.0+ (optional, for running JS scripts)
- **pnpm**: 10.23.0+ (optional, for running JS scripts)
- **OS**: macOS, Windows (desktop), Linux/Docker

### Installation

```bash
# Clone the repository
git clone https://github.com/kevinluosl/deepbot.git
cd deepbot

# Install dependencies
pnpm install

# Start in development mode
pnpm run dev
```

### Build Desktop App

```bash
# Build for all platforms
pnpm run dist

# macOS only
pnpm run dist:mac

# Windows only
pnpm run dist:win
```

### Docker Deployment

For Linux servers or any Docker-supported environment:

```bash
# Build the Docker image
docker build -t deepbot:latest .

# Start with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

Once running, open `http://localhost:3008` to access the web interface.

Configuration:
- Copy `.env.example` to `.env` and fill in your model API keys
- Adjust port mappings and volume mounts in `docker-compose.yml`
- Data is persisted to `./data` by default

**Note for macOS builds**: The build process automatically applies ad-hoc signing. This prevents the "app is damaged" error, but users will still see "cannot verify developer" on first launch — which is expected and can be bypassed with right-click → Open.

### macOS Security Warnings

macOS may show a security warning the first time you open DeepBot. Use the appropriate fix based on the message:

#### "App is damaged"

Run this in Terminal, then reopen the app:

```bash
sudo xattr -rd com.apple.quarantine /Applications/DeepBot.app
```

#### "Cannot verify developer"

**Option 1: Right-click to open**

Right-click the app icon, select "Open", then click "Open" again in the dialog.

**Option 2: System Settings**

1. Try to open the app (you'll see a security warning — click "Cancel")
2. Go to "System Settings" → "Privacy & Security"
3. Scroll to the "Security" section
4. Click "Open Anyway"
5. Try opening the app again and click "Open" in the dialog

---

## 🏗️ Architecture

DeepBot uses a modular architecture with support for multi-Agent communication and collaboration:

```
┌─────────────────────────────────────────┐
│      User Interface (Electron)          │
│   External Communication: Feishu        │
└─────────────────┬───────────────────────┘
                  │ IPC / WebSocket
┌─────────────────▼───────────────────────┐
│      Gateway (Session Management)       │
│    • Session per Tab                    │
│    • Message queue & routing            │
│    • Connector management               │
│    • Cross-Tab message routing 🆕       │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   Session 1  Session 2  Session N
   (Tab 1)    (Tab 2)    (Tab N)
        │         │         │
        ▼         ▼         ▼
┌─────────────────────────────────────────┐
│   Agent Runtime (one per Session)       │
│    • Intelligent decision & orchestration│
│    • Auto-continue (up to 100 times)    │
│    • Operation tracking (max 3 retries) │
│    • Independent memory & context       │
│    • Cross-Tab calling tool 🆕          │
│    • Dynamic system prompt assembly 🆕  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│     System Prompt Assembly Layer 🆕     │
│    • Base Agent prompt (AGENT.md)       │
│    • Tool instructions (TOOLS.md)       │
│    • Custom tool instructions           │
│    • Global memory (MEMORY.md)          │
│    • Per-tab memory (memory-<tab>.md)   │
│    • Skills instructions (SKILL.md)     │
│    • Dynamic loading & live updates     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      14 Tools + Security Check          │
│    🔒 Path whitelist • Workspace isolation│
│    🔄 Cross-Tab messaging tool 🆕        │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
    Skills   Scheduled   Data Storage
                Tasks
```

### Multi-Agent Collaboration 🆕

```
┌─────────────────────────────────────────┐
│      Enterprise Multi-Agent System      │
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
│Solutions│ │Product  │ │  R&D    │
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

- **Gateway**: Manages all Sessions. Each Tab maps to an independent Session with cross-Tab message routing.
- **Session**: An isolated conversation unit with its own Agent Runtime, memory, and context.
- **Agent Runtime**: Built on `@mariozechner/pi-agent-core`, handles intelligent decision-making and tool orchestration.
- **System Prompt Assembly Layer**: Dynamically assembles system prompts from base prompts, tool instructions, memory files, and Skills.
- **Tools**: 14 built-in tools including a cross-Tab messaging tool for inter-Agent communication.
- **Security Check**: All file and command operations are validated against a path whitelist.
- **Multi-Agent Collaboration**: Agents in different Tabs can message each other to collaborate on complex tasks.

#### System Prompt Assembly Flow 🆕

```
Agent starts → Load base Agent prompt (AGENT.md)
             ↓
           Load tool instructions (TOOLS.md + CUSTOM-TOOLS.md)
             ↓
           Load global memory (MEMORY.md)
             ↓
           Load per-tab memory (memory-<tab-id>.md)
             ↓
           Load Skills instructions (SKILL.md files)
             ↓
           Assemble complete system prompt
             ↓
           Send to AI model
```

**Dynamic Updates**:
- When memory files change, all Agent system prompts reload automatically
- Installing or uninstalling Skills updates tool instructions in real time
- Hot updates are supported — no app restart required

---

## 🌐 External Integrations (Connectors)

DeepBot connects to external platforms via the Connector system for cross-platform interaction.

### Supported Platforms

#### Feishu (Lark)

Interact with DeepBot through a Feishu bot, supporting both direct messages and group chats.

**Features**:
- ✅ Direct messages (requires pairing authorization)
- ✅ Group messages (supports @mention)
- ✅ Message deduplication (prevents duplicate responses)
- ✅ Independent session per conversation (each chat gets its own Tab)
- ✅ Send images and files to users
- ✅ Feishu document operations (create, read, edit, delete, comment)

**Setup**:

1. In DeepBot, go to "System Settings" → "External Connections" → "Feishu"
2. Enter your Feishu app credentials (App ID, App Secret, Bot Name)
3. Configure security policies (DM policy, group policy)
4. Click "Save" then "Start" the connector

**Detailed Configuration Guide**:

📖 [Feishu Bot Configuration Guide](docs/飞书机器人配置指南.md) (Chinese)

Covers the full Feishu Open Platform setup, permission configuration, and security policy details.

### Coming Soon

- 🔜 Discord
- 🔜 Slack
- 🔜 WeCom (WeChat Work)
- 🔜 DingTalk

---

## 🔧 14 Built-in Tools

| Tool | Function | Typical Use Cases |
|------|----------|-------------------|
| **File Tool** | File read/write | Read configs, save data, search files |
| **Exec Tool** | Run shell commands | Execute scripts, system operations, install packages |
| **Browser Tool** | Browser automation | Screenshots, web automation, content extraction |
| **Calendar Tool** | Calendar management | Check dates, calculate time, schedule reminders |
| **Environment Check** | System inspection | Detect system info, verify dependencies, diagnose issues |
| **Image Generation** | AI image generation | Create images, design assets, visual content |
| **Web Search** | Web search | Real-time queries, research, data collection |
| **Web Fetch** | Fetch web content | Extract articles, download page data |
| **Memory Tool** | Memory management | Store preferences, retrieve historical context |
| **Skill Manager** | Skill management | Install, uninstall, and list skill packages |
| **Scheduled Task** | Task scheduling | Create and manage cron-based tasks |
| **Chat Tool** | AI conversation | Internal AI calls, backend processing, isolated from main Agent context |
| **Cross Tab Call** 🆕 | Cross-Tab messaging | Inter-Agent communication for multi-Agent collaboration |
| **Feishu Doc Tool** | Feishu document ops | Create, read, append, update, delete blocks, add comments |

### Creating Custom Tools

All tools are built-in and live in `src/main/tools/`. You can add your own by following the pattern below.

#### Quick Start

1. **Create a tool file**

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

2. **Register in tool-loader.ts**

Edit `src/main/tools/registry/tool-loader.ts`:

```typescript
import { myToolPlugin } from '../my-tool';

// Inside loadBuiltinTools()
const myTools = myToolPlugin.create({
  workspaceDir: this.workspaceDir,
  sessionId: this.sessionId,
  configStore,
});
tools.push(myTools);
```

3. **Add tool instructions**

Edit `src/main/prompts/templates/CUSTOM-TOOLS.md` to document how the AI should use your tool.

Using the Email tool as an example:

````markdown
## Email (Email Sending Tool)

### Core Principles
1. SMTP must be configured before use
2. The config file path is fixed — don't give users incorrect paths
3. On failure, guide users to fix their config based on the error message
4. Don't retry repeatedly — report the failure reason after one attempt

### Prerequisites

**Config file path** (searched in priority order):
1. Project-level: `<workspace>/.deepbot/tools/email-tool/config.json`
2. User-level: `~/.deepbot/tools/email-tool/config.json`

**Config file format**:
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

**Common provider notes**:
- QQ Mail: Use authorization code, not your QQ password
- Gmail: Use an app-specific password
- 163 Mail: Enable SMTP service and use an authorization code

### Use Cases
- ✅ Notification emails, report emails
- ✅ Emails with attachments
- ✅ HTML-formatted emails
- ❌ Bulk marketing emails (risk of account suspension)
- ❌ Sensitive information (emails are not encrypted)

### Examples

1. Plain text email:
```json
{
  "to": "recipient@example.com",
  "subject": "Test Email",
  "body": "This is a test email"
}
```

2. HTML email:
```json
{
  "to": "team@company.com",
  "subject": "Project Progress Report",
  "body": "<h1>Progress</h1><ul><li>Feature A: Done</li></ul>",
  "html": true
}
```

3. Email with attachment:
```json
{
  "to": "client@example.com",
  "subject": "Contract Documents",
  "body": "Please find the contract attached",
  "attachments": ["~/Documents/contract.pdf"]
}
```

### Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| "nodemailer not installed" | Missing dependency | Ask user to install nodemailer |
| "Email tool not configured" | Config file missing | Ask user to create the config file |
| "Authentication failed" | Wrong credentials | Check account and authorization code |
````

**Documentation structure**:
- **Core Principles**: Rules the AI must follow
- **Prerequisites**: Required setup (config files, dependencies)
- **Use Cases**: When to use or avoid this tool
- **Examples**: Real usage from simple to complex
- **Error Handling**: Common errors and how to resolve them

#### Advanced Features

- **Config files**: Read from `~/.deepbot/tools/<tool-name>/config.json`
- **External dependencies**: Use dynamic `require()` to avoid bundling
- **Cancellation**: Support user cancellation via `AbortSignal`
- **Prompt management**: Document tool behavior in `CUSTOM-TOOLS.md` so the AI uses it correctly

#### References

- 📖 [Full Development Guide](src/main/tools/registry/README.md)
- 📝 [Example Tool Template](src/main/tools/registry/example-tool.ts)
- 🔧 [Email Tool Example](src/main/tools/email-tool.ts) — complete example with config and external dependencies

---

## 🔒 Security

DeepBot enforces strict access controls so AI Agents can only reach directories you've explicitly authorized.

### Path Whitelist

Only the following directories (and their subdirectories) are accessible:

| Type | Default Path | Purpose | Configurable |
|------|-------------|---------|--------------|
| **Workspace** | `~` (home directory) | File read/write, command execution | ✅ |
| **Scripts** | `~/.deepbot/scripts` | Python script storage | ✅ |
| **Skills** | `~/.agents/skills` | Skill package installation | ✅ |
| **Images** | `~/.deepbot/generated-images` | AI-generated image storage | ✅ |

### Security Check Flow

```
Tool call → Path security check → Within whitelist?
                                   ├─ Yes → Allow execution
                                   └─ No  → Reject, return error
```

---

## 🧠 Memory System

DeepBot supports persistent long-term memory to retain user preferences and important context across sessions.

### Global Memory

- **Location**: `~/.deepbot/memory/MEMORY.md`
- **Format**: Structured Markdown
- **Auto-injection**: Loaded into every conversation's system prompt
- **Live updates**: Memory changes automatically reload all active Agents
- **Scope**: Shared across all Tabs — stores general preferences and shared context

### Per-Tab Memory (Multi-Agent Support)

Each Tab (Agent) can have its own independent memory file, enabling true multi-role collaboration:

- **Independent memory files**: Each Tab can have its own `memory-<tab-id>.md`
- **Independent role definitions**: Different Tabs can take on different roles (e.g., Product Manager, Developer, QA Engineer)
- **Independent work styles**: Each Agent can have its own domain expertise and preferences
- **Persistent storage**: Tab memory and role settings are saved across sessions

### Usage Examples

**Global memory**:
```
User: "Remember: I prefer concise code"
DeepBot: "Got it, I'll keep that in mind"
```

**Per-tab memory**:
```
User: "Create a Sales Analysis Agent"
DeepBot: "New Tab created. This Agent will focus on customer relationship management and sales data analysis"

User: "Remember: You are a Sales Expert responsible for customer follow-up and performance analysis"
Sales Agent: "Understood, I've saved my role and responsibilities"
```

### Multi-Agent Collaboration Example

1. **Sales Agent** — Customer relationship management and sales pipeline; stores customer info and sales strategies
2. **Marketing Agent** — Market analysis and campaigns; stores market data and promotion plans
3. **Solutions Agent** — Technical solution design and requirements analysis; stores solution templates and specs
4. **Product Agent** — Product planning and backlog management; stores roadmaps and user feedback
5. **R&D Agent** — Technical development and implementation; stores technical docs and coding standards
6. **Project Manager Agent** — Project coordination and progress tracking; stores project plans and resource allocation

Each Agent operates with independent memory and domain expertise, enabling efficient cross-department collaboration.

---

## ⏰ Scheduled Tasks

Create and manage scheduled tasks to automate recurring work:

### Features

- ✅ Cron expression support
- ✅ Dedicated Tab execution (locked, cannot be closed)
- ✅ Context reset between runs (retains last run's output as context)
- ✅ Execution history tracking

### Example

```
User: "Check desktop files every day at 9 AM"
DeepBot: "Scheduled task created — will run daily at 9:00"
```

---

## 🎨 Skill Extensions

The Skills system lets you compose multiple tools into reusable, complex workflows.

### Install an Existing Skill

```bash
# Use the Skill Manager tool in DeepBot
"Install weather skill"
```

### Create a Custom Skill

A Skill is a directory containing a `SKILL.md` file using YAML frontmatter + Markdown format.

#### 1. Create the Skill directory

```bash
mkdir -p ~/.agents/skills/my-skill
cd ~/.agents/skills/my-skill
```

#### 2. Create SKILL.md

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

Use the file_read tool:

```json
{
  "path": "~/example.txt"
}
```

### Step 2: Process data

Process the data as needed...

### Step 3: Save results

Use the file_write tool to save results...

## Notes

- Note 1
- Note 2
````

#### 3. Install the Skill

**Option 1: Direct placement** (recommended)

Place the Skill directory under `~/.agents/skills/` and restart DeepBot — it will be loaded automatically.

**Option 2: Use Skill Manager**

```bash
"Install local skill at path ~/.agents/skills/my-skill"
```

### Skill Directory

- **Default path**: `~/.agents/skills/`
- **Auto-discovery**: All installed Skills are loaded at startup
- **Dynamic management**: Install and uninstall at runtime

### Skill Capabilities

- 📖 Skills can call all 14 built-in tools
- 📝 Supports async operations and error handling
- 🔧 Compose multiple tools for complex multi-step workflows

---

## 🤖 Supported AI Models

- **Qwen** (Alibaba Cloud) — default model
- **OpenAI** (GPT-4, GPT-3.5)
- **Claude** (Anthropic)

Configure your API keys in System Settings to get started.

### ⚠️ Important: Avoid Reasoning Models

DeepBot is optimized for standard conversational models. Models with built-in thinking/reasoning modes can cause display issues with `<think>...</think>` tags, slower responses, and unnecessary overhead for simple tasks.

**Not recommended:**
- ❌ QwQ-32B-Preview
- ❌ OpenAI o1, o1-mini, o1-preview
- ❌ DeepSeek-R1
- ❌ Any model with explicit reasoning/thinking steps

---

## 📦 External Services

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
│   ├── main/           # Main process
│   │   ├── gateway.ts          # Session management
│   │   ├── agent-runtime/      # Agent runtime
│   │   ├── tools/              # Tool system
│   │   ├── scheduled-tasks/    # Scheduled tasks
│   │   ├── connectors/         # External connectors
│   │   └── database/           # Data storage
│   ├── renderer/       # Renderer process (React)
│   ├── shared/         # Shared utilities
│   └── types/          # Type definitions
├── docs/               # Documentation
└── scripts/            # Build scripts
```

---

## 📝 License

This project is licensed under the [MIT License](LICENSE).

---

## 🙏 Acknowledgments

DeepBot was inspired by:

- [Clawdbot](https://github.com/openclaw/openclaw) — architectural reference
- [@mariozechner/pi-agent-core](https://github.com/badlogic/pi-agent) — AI Agent Runtime

---

## 📧 Contact

- **Author**: Kevin Luo @ Deepglint
- **Issues**: [GitHub Issues](https://github.com/kevinluosl/deepbot/issues)

---

<div align="center">

**⭐ If DeepBot is useful to you, a star goes a long way!**

</div>
