<div align="center">

<img src="banner.png" alt="DeepBot Terminal" width="800"/>

**🤖 Universal Desktop AI Assistant | Intelligent, Secure, Extensible**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-28+-9feaf9.svg)](https://www.electronjs.org/)

[English](README.md) | [简体中文](README_CN.md)

</div>

---

## 📖 Introduction

DeepBot Terminal is a desktop AI assistant developed by members of DeepGlint GLINT LAB. Think of it as installing an intelligent brain for your computer. Whether it's organizing files, setting reminders, web automation, or complex multi-step tasks, DeepBot handles it all effortlessly through AI Agent technology. It supports multi-task parallel processing, scheduled tasks, skill extensions, while protecting your system security through strict safety mechanisms.

### ✨ Core Features

- 🎯 **Multi-Task Parallel Processing** - Handle multiple tasks simultaneously without interference
- 🔧 **10 Built-in Tools** - File operations, command execution, browser control, image generation, etc.
- 🧠 **Memory System** - Long-term memory of user preferences and important information
- ⏰ **Scheduled Tasks** - Automated execution of periodic tasks
- 🎨 **Skill Extensions** - Combine tools to implement complex functions through Skills
- 🔒 **Security Restrictions** - Strict path whitelist mechanism to protect system security
- 🤖 **Multi-Model Support** - Qwen, OpenAI, Claude, etc.
- 🌐 **Future Extensible** - Support for Feishu, Discord, Slack, and other platforms

---

## 🚀 Quick Start

### Requirements

- **Node.js**: 20.0.0 or higher
- **pnpm**: 10.23.0 or higher
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

DeepBot adopts a modular architecture with the following layers:

```
┌─────────────────────────────────────────┐
│      User Interface (Electron)          │
│  Future: Feishu/Discord/Slack           │
└─────────────────┬───────────────────────┘
                  │ IPC
┌─────────────────▼───────────────────────┐
│      Gateway (Session Management)       │
│    • Tab Management (Max 10)            │
│    • Message Queue                      │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│   Agent Runtime (One per Tab)           │
│    • Intelligent Decision & Orchestration│
│    • Auto-Continue (Max 100 times)      │
│    • Operation Tracking (Max 3 times)   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      10 Tools + Security Check          │
│    🔒 Path Whitelist • Workspace Isolation│
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
    Skills   Scheduled   Data Storage
                Tasks
```

### Architecture Overview

- **Gateway**: Manages all sessions, each Tab corresponds to an independent session
- **Agent Runtime**: Based on `@mariozechner/pi-agent-core`, responsible for intelligent decision-making and tool orchestration
- **Tools**: 10 built-in tools providing core capabilities like file, command, browser operations
- **Security Check**: All file and command operations are validated through path whitelist

---

## 🔧 10 Built-in Tools

| Tool | Function | Typical Use Cases |
|------|----------|-------------------|
| **File Tool** | File read/write operations | Read configs, save data, search files |
| **Exec Tool** | Execute command-line commands | Run scripts, system operations, install software |
| **Browser Tool** | Browser control | Web screenshots, automation, content extraction |
| **Calendar Tool** | Calendar management | View dates, calculate time, schedule reminders |
| **Environment Check** | Environment inspection | Detect system info, verify dependencies, diagnose issues |
| **Image Generation** | AI image generation | Create images, design materials, visual content |
| **Web Search** | Web search | Real-time info queries, data collection, content research |
| **Memory Tool** | Memory management | Store user preferences, read historical information |
| **Skill Manager** | Skill management | Install/uninstall/list skill packages |
| **Scheduled Task** | Scheduled tasks | Create/manage/execute scheduled tasks |

---

## 🔒 Security Mechanism

DeepBot implements strict security restrictions to ensure AI Agent can only access user-authorized directories:

### Path Whitelist

Only allows access to the following configured directories and their subdirectories:

| Directory Type | Default Path | Purpose | Configurable |
|---------------|--------------|---------|--------------|
| **Workspace** | `~` (User home) | File read/write, command execution | ✅ |
| **Scripts** | `~/.deepbot/scripts` | Python script storage | ✅ |
| **Skills** | `~/.deepbot/skills` | Skill package installation | ✅ |
| **Images** | `~/.deepbot/generated-images` | AI-generated image storage | ✅ |

### Security Check Flow

```
Tool Call → Path Security Check → Within Whitelist?
                                   ├─ Yes → Allow Execution
                                   └─ No → Reject, Return Error
```

---

## 🧠 Memory System

DeepBot supports long-term memory functionality to remember user preferences and important information:

- **Storage Location**: `~/.deepbot/memory/MEMORY.md`
- **Format**: Markdown format, structured storage
- **Auto-Injection**: Automatically loaded into system prompt for each conversation
- **Real-time Update**: Memory updates automatically reload all Agents

### Usage Example

```
User: "Remember: I prefer concise code"
DeepBot: "I've remembered your preference"

User: "What are my preferences?"
DeepBot: "You prefer concise code..."
```

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

The Skills system allows combining multiple tools to implement complex functions:

### Install Skills

```bash
# Use Skill Manager tool in DeepBot
"Install weather skill"
```

### Skill Directory

- **Default Path**: `~/.deepbot/skills/`
- **Auto-Discovery**: Automatically loads all installed Skills at startup
- **Dynamic Management**: Supports runtime install/uninstall

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
│   │   ├── tools/              # 10 tools
│   │   ├── scheduled-tasks/    # Scheduled tasks
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

- **Author**: Kevin Luo
- **Issue Reporting**: [GitHub Issues](https://github.com/kevinluosl/deepbot/issues)

---

<div align="center">

**⭐ If this project helps you, please give it a Star!**

Made with ❤️ by Kevin Luo

</div>
