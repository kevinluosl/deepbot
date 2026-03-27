# DeepBot 工具使用指南

## 🔧 环境配置建议

### 推荐开发环境

为了充分发挥 DeepBot 的能力，建议配置以下开发环境：

#### 1. Python 环境

**安装 Python**

macOS:
```bash
# 使用 Homebrew 安装（推荐）
brew install python

# 或下载官方安装包
# https://www.python.org/downloads/
```

Linux (Ubuntu/Debian):
```bash
# 更新包列表
sudo apt update

# 安装 Python 3
sudo apt install python3 python3-pip

# 验证安装
python --version
pip --version
```

Windows:
```bash
# 使用 Chocolatey
choco install python

# 或使用 Winget
winget install Python.Python.3

# 或下载官方安装包
# https://www.python.org/downloads/windows/
```

**验证安装**:
```bash
# 检查 Python 版本
python --version

# 检查 pip 版本
pip --version
```

#### 2. Node.js 环境（推荐使用 nvm）

**为什么推荐 nvm？**
- 版本管理：轻松切换不同项目的 Node.js 版本
- 避免冲突：与系统 Node.js 隔离
- 简单升级：一条命令安装最新版本

**安装 nvm**

macOS/Linux:
```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/latest/install.sh | bash

# 重新加载配置
source ~/.bashrc  # 或 source ~/.zshrc

# 验证安装
nvm --version
```

Windows:
```bash
# 下载 nvm-windows
# https://github.com/coreybutler/nvm-windows/releases
# 下载 nvm-setup.exe 并安装

# 验证安装
nvm version
```

**使用 nvm 安装 Node.js**:
```bash
# 安装最新 LTS 版本
nvm install --lts

# 使用已安装的版本
nvm use --lts

# 设置默认版本
nvm alias default node

# 验证
node --version
npm --version
```

**设置环境变量**:
```bash
# macOS/Linux - nvm 会自动添加到 ~/.bashrc 或 ~/.zshrc
# 如果没有自动添加，手动添加以下内容：

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

**nvm 和系统 Node.js 的区分**:
- nvm 通过修改 PATH 环境变量来控制使用哪个 Node.js
- 建议：安装 nvm 后卸载系统 Node.js，统一用 nvm 管理
- 查看当前使用的 Node.js：`which node`（macOS/Linux）或 `where node`（Windows）
- 切换版本：`nvm use <version>`


# macOS
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_lts.sh | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
# 使用 Chocolatey: choco install nodejs
# 或使用 Winget: winget install OpenJS.NodeJS
# 或下载安装程序：https://nodejs.org/
``
#### 3. 环境检查

安装完成后，在 DeepBot 中执行环境检查：
1. 打开「系统配置」→「环境配置」
2. 点击「检查环境」按钮
3. 确认 Python 已正确安装

---

## 📸 图片显示规则

**当你需要在响应中显示图片时**，必须使用 Markdown 图片语法：

```markdown
![图片描述](图片路径)
```

**支持的路径格式**：
- 绝对路径：`![截图](/path/to/screenshot.png)`
- 用户目录：`![截图](~/path/to/screenshot.png)`
- file:// 协议：`![截图](file:///path/to/screenshot.png)`

**响应示例**：
```
✅ 已成功加载并预览图片：screenshot.png

![screenshot.png](~/path/to/screenshot.png)

📁 路径：~/path/to/screenshot.png
📏 尺寸：27.05 KB｜🖼️ 格式：PNG
```

## Browser（浏览器控制）

### 核心原则
1. 必须先手动启动 Chrome（端口 9222）
2. 每次打开新页面后，必须先 `snapshot` 查看内容
3. 不要猜测 @ref，必须从 `snapshot` 返回的列表中选择
4. @ref 是确定性的：从 snapshot 获取的 ref 直接指向精确元素，无需重新查询 DOM
5. 页面变化后必须重新 `snapshot` 获取新的元素列表
6. @ref 在页面变化后会失效，必须从新的 snapshot 中获取新的 ref

### 使用前提
需要手动启动 Chrome 并开启远程调试：
```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="~/.deepbot/browser-profile"

# Windows
chrome.exe --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

### 使用场景
- ✅ 自动化网页操作（填表、点击、滚动）
- ✅ 网页数据抓取
- ✅ 网页截图
- ✅ 多标签页管理
- ❌ 不要用于简单的网页内容获取（使用 `web_fetch`）

### 标准工作流程
```
1. 打开网页：open → snapshot
2. 交互操作：snapshot（找 @ref）→ click/fill/type
3. 页面变化后：重新 snapshot 获取新的元素列表
```

### @ref 系统说明
- `snapshot` 操作会返回页面上所有可交互元素的列表
- 每个元素都有一个唯一的 @ref（如 @e1, @e2, @e36）
- @ref 编号是随机的，每个页面都不同
- 必须使用 `snapshot` 返回的 @ref，不要猜测
- @ref 是确定性的：指向 snapshot 时的精确元素，无需重新查询

### 为什么使用 @ref
1. **确定性**: ref 指向 snapshot 时的精确元素
2. **快速**: 无需重新查询 DOM
3. **AI 友好**: snapshot + ref 工作流最适合 LLM

### 示例

**基础浏览**：
```json
// 1. 打开网页
{ "action": "open", "url": "https://www.example.com" }

// 2. 获取页面快照
{ "action": "snapshot", "interactive": false }

// 3. 点击元素（使用 snapshot 返回的 @ref）
{ "action": "click", "ref": "@e2" }
```

**多标签页使用**：
```json
// 1. 创建新标签页
{ "action": "tab", "tabAction": "new" }

// 2. 在新标签页打开网址
{ "action": "open", "url": "https://www.jd.com" }

// 3. 切换回第一个标签页
{ "action": "tab", "tabAction": "switch", "tabIndex": 1 }
```

### 💡 标签页使用场景
- 需要同时浏览多个网页时，使用新标签页而不是在同一标签页跳转
- 对比不同页面内容时，在不同标签页打开
- 保留重要页面时，在新标签页打开其他链接
- 多任务并行处理（如同时查看多个商品、多个文档）

### ⚠️ 在新标签页打开网址的正确步骤
1. 先执行 `{ action: "tab", tabAction: "new" }` 创建新标签页
2. 新标签页会自动成为当前标签页
3. 然后执行 `{ action: "open", url: "https://example.com" }` 在新标签页中打开网址
4. 必须分两步执行，不能在同一个工具调用中同时完成

### 标签页工作流程示例
```
场景：同时打开淘宝和京东对比商品价格

步骤 1: 打开淘宝
{ action: "open", url: "https://www.taobao.com" }
{ action: "snapshot", interactive: false }

步骤 2: 创建新标签页并打开京东
{ action: "tab", tabAction: "new" }
{ action: "open", url: "https://www.jd.com" }
{ action: "snapshot", interactive: false }

步骤 3: 切换回淘宝标签页
{ action: "tab", tabAction: "switch", tabIndex: 1 }
{ action: "snapshot", interactive: false }
```

### 注意事项
- 必须先手动启动 Chrome（端口 9222）
- 截图默认保存到 `/tmp/screenshot-{timestamp}.png`
- 可以使用 `screenshotPath` 参数指定保存路径
- `fill` 会清空输入框后输入，`type` 不会清空
- `get` 操作支持获取：text（文本）、value（值）、title（标题）、url（URL）
- 页面变化后（如点击、导航），必须重新 `snapshot` 获取新的元素列表
- @ref 在页面变化后会失效，必须从新的 snapshot 中获取新的 ref

---

## Scheduled Task（定时任务）

### 核心原则
1. 用户说了时间/次数关键词时，**必须使用定时任务**
2. 任务描述（description）必须完整表达用户意图，来自外部连接器时需将代词替换为具体身份
3. 定时任务 = 触发器（schedule）+ 任务内容（description）
4. 不要把时间间隔写进 description
5. 每次触发时，系统在新 Tab 中执行 `description` 中的任务

### 使用时机
用户说了以下关键词时使用：
- **执行次数**："执行 N 次"、"运行 N 次"、"重复 N 次"
- **时间间隔**："每隔 X 秒/分钟/小时"、"每天"、"每周"
- **循环/重复**："循环执行"、"重复执行"、"定时执行"
- **具体时间**："明天 X 点"、"每天 X 点"、"每周 X"

### ⚠️ 重要：只要用户消息中包含上述关键词，**无论任务描述多复杂**，都必须使用定时任务工具

### 判断示例
```
"执行10次..." → ✅ 定时任务（maxRuns: 10）
"每隔5秒..." → ✅ 定时任务（interval: 5000）
"每隔10秒执行一次：遍历目录..." → ✅ 定时任务（关键词在句首）
"遍历目录..." → ❌ 直接执行（无时间/次数关键词）
```

### 使用场景
- ✅ 周期性任务（每隔 N 秒/分钟/小时）
- ✅ 定时任务（每天 X 点、每周 X）
- ✅ 限次任务（执行 N 次后停止）
- ✅ 一次性任务（明天 X 点）
- ❌ 不要用于立即执行的任务

### 示例

**周期性任务 + 限次**：
```json
{
  "action": "create",
  "name": "问候5次",
  "description": "给用户发送你好",
  "schedule": {
    "type": "interval",
    "intervalMs": 10000,
    "maxRuns": 5
  }
}
```

**每天定时**：
```json
{
  "action": "create",
  "name": "每日报告",
  "description": "生成每日工作报告并保存到指定目录",
  "schedule": {
    "type": "cron",
    "cronExpr": "0 9 * * *"
  }
}
```

### 正确理解用户需求

**用户说**："每隔10秒检查指定目录有没有1.txt文件，没有就创建一个，有的话返回太好了，然后停止执行任务"

**正确拆分**：
1. **触发器**：每隔 10 秒 → `schedule: { type: "interval", intervalMs: 10000 }`
2. **任务内容**：检查指定目录有没有1.txt文件，没有就创建一个，有的话返回太好了，然后停止执行任务 → `description`

### ⚠️⚠️⚠️ 重要：任务描述（description）必须完整保留用户输入 ⚠️⚠️⚠️

**规则**：
- ✅ **完整保留**：用户说什么，`description` 就写什么（一字不改）
- ❌ **禁止修改**：不要优化、不要扩展、不要改写用户的任务描述
- ❌ **禁止添加**：不要添加"请"、"帮我"等礼貌用语
- ❌ **禁止删减**：不要删除任何细节要求

**常见错误**：
- ❌ 把"每隔10秒"写进 description（时间间隔由 schedule 控制）
- ❌ 描述太模糊（要说清楚具体做什么）
- ❌ 修改或优化用户的任务描述（必须原样保留）

### ⚠️ 重要：来自外部连接器（飞书等）的任务，必须在 description 中明确"我"和"群"的具体身份

定时任务执行时运行在独立的新 Tab 中，**没有原始会话的上下文**。如果用户在飞书中说"每天给我发天气"，description 里的"我"在执行时无法被识别。

**必须在 description 中将代词替换为具体信息**：

| 用户说的 | description 中必须写成 |
|---------|----------------------|
| 我、我自己 | 具体用户名（从 `[来自: 发送信息者：xxx]` 中获取） |
| 这个群、群里 | 具体群名称（从 `[来自: 来自群：xxx]` 中获取） |
| 这里、这个会话 | 对应的 Tab 名称（如 `FS-产品讨论群`、`FS-张三`） |

**示例**：

用户（张三）在"产品讨论群"中说："每天早上 9 点给我发今天的天气"

- ❌ 错误：`description: "每天早上9点给我发今天的天气"`（"我"在执行时无法识别）
- ✅ 正确：`description: "搜索今天的天气，通过 feishu_send_message 发送给张三（userId: ou_xxx），或发送到产品讨论群（tabName: FS-产品讨论群）"`

**规则**：
1. 任务来自飞书私聊：将"我"替换为发送者姓名，并在 description 中注明 userId 或 tabName
2. 任务来自飞书群组：将"群"替换为具体群名称，并在 description 中注明 tabName（如 `FS-产品讨论群`）
3. 如果任务需要回复结果给用户，必须在 description 中明确指定发送目标（userId 或 tabName）

### 任务描述规范

**好的描述**：
- ✅ "检查指定目录有没有1.txt文件，没有就创建一个，有的话返回太好了，然后停止执行任务"
- ✅ "搜索今天的天气，通过 feishu_send_message 发送给张三（tabName: FS-张三）"
- ✅ "生成每日工作报告，通过 feishu_send_message 发送到产品讨论群（tabName: FS-产品讨论群）"

**不好的描述**：
- ❌ "每隔10秒检查文件"（不要重复时间间隔）
- ❌ "检查文件"（太模糊）
- ❌ "执行任务"（没说明做什么）
- ❌ "给我发天气"（"我"在执行时无法识别，必须替换为具体用户名和发送目标）

### 定时任务执行机制

**触发时的执行方式**：
- 系统在新 Tab 中创建 Agent 实例执行 `description` 中的任务
- Agent 可以使用所有工具（`web_search`、`browser`、`exec` 等）
- 唯一限制：不能创建新的定时任务（防止无限递归）

**示例**：任务描述"搜索今天的科技新闻并整理成报告"
- Agent 会使用 `web_search` 搜索新闻
- 然后使用 `exec` 将结果保存到文件

**定时任务工具操作权限**：
- ✅ 可执行：`list`、`delete`、`pause`、`resume`、`trigger`、`history`
- ❌ 不可执行：`create`（防止无限递归）

任务可以理解"停止当前任务"指令，会自动调用 `delete` 操作

### Cron 表达式

格式：`分 时 日 月 星期`

常用示例：
- `0 9 * * *` - 每天 9:00
- `0 */2 * * *` - 每 2 小时
- `0 9 * * 1` - 每周一 9:00
- `0 0 1 * *` - 每月 1 号 0:00

### 数据库路径
`~/.deepbot/scheduled-tasks.db`（系统配置文件，不受工作目录限制）

---

## Skill Manager（Skill 管理）

### 核心原则
1. **执行 Skill 前必须先调用 `info` 获取 SKILL.md**：了解正确的使用方式、配置要求、执行命令
2. **检查并完成配置**：从 SKILL.md 中确认所需配置（如 API Key、环境变量），缺失时先自动配置或要求用户提供
3. **从 `readme` 中提取正确的执行命令**：完整路径、脚本名、参数格式，不要猜测
4. **适用于所有安装位置**：无论 Skill 安装在配置目录还是其他目录，都遵循相同流程

### 🔍 URL 安装流程（通用处理）

**场景 1：用户提出需求，但不确定使用哪个 Skill**

1. **先查找本地已安装的 Skill**
   ```json
   { "action": "list" }
   ```

2. **如果本地没有，搜索官方仓库**
   ```json
   { "action": "search", "query": "关键词" }
   ```

**场景 2：用户提供了 URL 并要求安装某个东西**

⚠️ **重要**：用户提供 URL 时，不要直接假设是 Skill！先获取内容判断类型。

**正确流程**：

1. **使用 `web_fetch` 获取 URL 内容**
   ```json
   { "tool": "web_fetch", "url": "用户提供的URL", "mode": "full" }
   ```

2. **分析内容，判断项目类型**
   - **Python 包**：查找 `setup.py`、`pyproject.toml`、`requirements.txt`
   - **Node.js 包**：查找 `package.json`、`npm install` 说明
   - **Skill 包**：查找 `SKILL.md` 文件或 skills/ 目录
   - **普通软件**：查找安装说明、下载链接
   - **脚本工具**：查找可执行脚本文件

3. **根据项目类型选择安装方式**

   **类型 A：Skill 包**
   ```json
   {
     "action": "install",
     "name": "skill-name",
     "repository": "https://github.com/{owner}/{repo}/tree/{branch}/{skillPath}"
   }
   ```

   **类型 B：Python 包**
   ```json
   {
     "tool": "exec",
     "command": "pip install package-name"
   }
   ```
   或者如果有 requirements.txt：
   ```json
   {
     "tool": "exec", 
     "command": "pip install -r requirements.txt"
   }
   ```

   **类型 C：Node.js 包**
   ```json
   {
     "tool": "exec",
     "command": "npm install -g package-name"
   }
   ```

   **类型 D：需要克隆的项目**
   ```json
   {
     "tool": "exec",
     "command": "git clone <仓库地址> && cd <项目目录> && <安装命令>"
   }
   ```

   **类型 E：直接下载的工具**
   - 使用 `web_fetch` 下载文件
   - 使用 `file_write` 保存到合适位置
   - 使用 `exec` 设置执行权限

**示例 1**（Python 包）：

用户说："安装 https://github.com/microsoft/markitdown"

```
步骤 1: web_fetch("https://github.com/microsoft/markitdown")
步骤 2: 分析内容，发现是 Python 包（有 setup.py 和 pip install 说明）
步骤 3: 执行安装
{
  "tool": "exec",
  "command": "pip install markitdown"
}
```

**示例 2**（Skill 包）：

用户说："安装 https://github.com/openclaw/skills"

```
步骤 1: web_fetch("https://github.com/openclaw/skills")
步骤 2: 分析内容，发现是 Skill 仓库（有 skills/ 目录和多个 SKILL.md）
步骤 3: 询问用户要安装哪个具体的 Skill
步骤 4: 安装指定的 Skill
{
  "action": "install",
  "name": "specific-skill",
  "repository": "https://github.com/openclaw/skills/tree/main/skills/specific-skill"
}
```

**示例 3**（Node.js 工具）：

用户说："安装 https://github.com/some/nodejs-tool"

```
步骤 1: web_fetch("https://github.com/some/nodejs-tool")
步骤 2: 分析内容，发现是 Node.js 包（有 package.json 和 npm install 说明）
步骤 3: 执行安装
{
  "tool": "exec",
  "command": "npm install -g nodejs-tool"
}
```

**示例 4**（需要克隆的项目）：

用户说："安装 https://github.com/some/custom-tool"

```
步骤 1: web_fetch("https://github.com/some/custom-tool")
步骤 2: 分析内容，发现需要克隆后本地安装（README 说明了安装步骤）
步骤 3: 执行克隆和安装
{
  "tool": "exec",
  "command": "cd ~/.deepbot/tools && git clone https://github.com/some/custom-tool && cd custom-tool && ./install.sh"
}
```

### 使用时机
用户说了以下关键词时使用：
- **搜索 Skill**："搜索 Skill"、"查找 Skill"、"有什么 Skill"
- **安装 Skill**："安装 Skill"、"添加 Skill"
- **列出 Skill**："列出已安装的 Skill"、"查看 Skill"
- **卸载 Skill**："卸载/删除 Skill"
- **查看 Skill 详情**："查看 Skill 详情"、"Skill 使用说明"

⚠️ **重要**：当用户提供 URL 要求安装时，不要直接假设是 Skill！
- 先用 `web_fetch` 获取内容判断项目类型
- 根据项目类型选择合适的安装方式（pip、npm、git clone、skill_manager 等）
- 只有确认是 Skill 包时才使用 `skill_manager` 工具

### 安装方式

**支持两种安装方式**：

**1. 从 GitHub 安装（远程）**
- `repository`: GitHub 仓库 URL

**2. 从本地目录安装（本地）**
- `repository`: 本地路径（支持 `file://`、绝对路径、`~` 开头、相对路径）

**本地安装行为**：
- 如果 Skill 已在默认 Skill 目录中：直接注册，不复制文件
- 如果 Skill 在其他位置：复制到默认 Skill 目录
- 自动验证 SKILL.md 是否存在

### 使用场景
- ✅ 搜索可用的 Skills
- ✅ 安装新的 Skills（远程或本地）
- ✅ 查看已安装的 Skills
- ✅ 获取 Skill 使用说明
- ✅ 卸载不需要的 Skills

### 正确执行流程（3 步）
```
1. skill_manager(info) → 获取 SKILL.md
2. 阅读 readme 字段 → 提取执行命令
3. exec(bash) → 执行提取的命令
```

### 示例

**安装并使用 Skill**：
```json
// 1. 搜索 Skill
{ "action": "search", "query": "youtube" }

// 2. 安装 Skill（远程）
{
  "action": "install",
  "name": "video-transcript-downloader",
  "repository": "https://github.com/openclaw/skills/tree/main/skills/steipete/video-transcript-downloader"
}

// 3. 查看使用说明
{ "action": "info", "name": "video-transcript-downloader" }

// 4. 执行（使用从 readme 中提取的命令）
{
  "command": "cd <defaultSkillDir>/video-transcript-downloader && python scripts/download.py --url 'https://youtube.com/watch?v=xxx'"
}
```

**本地安装示例**：
```json
// file:// 协议
{
  "action": "install",
  "name": "split_4_image",
  "repository": "file://~/.agents/skills/split_4_image"
}

// 绝对路径
{
  "action": "install",
  "name": "split_4_image",
  "repository": "~/.agents/skills/split_4_image"
}

// 用户目录
{
  "action": "install",
  "name": "split_4_image",
  "repository": "~/.agents/skills/split_4_image"
}
```

**配置 Skill 环境变量**：
```json
// 获取当前配置
{ "action": "get-env", "name": "skill-name" }

// 设置 API Key（写入 Skill 目录的 .env 文件，持久化保存，Docker 环境也有效）
{
  "action": "set-env",
  "name": "skill-name",
  "env": "API_KEY=your-key-here"
}

// 多个变量用换行分隔
{
  "action": "set-env",
  "name": "skill-name",
  "env": "API_KEY=xxx\nAPI_SECRET=yyy"
}
```

### 🔴 强制要求：执行 Skill 的完整流程（5 步，缺一不可）

**步骤 1：调用 `info` 获取 SKILL.md**
```json
{
  "action": "info",
  "name": "skill-name"
}
```

**步骤 2：阅读 SKILL.md 内容**
- 查看 `readme` 字段：了解 Skill 的功能、使用方法、执行命令
- 查看 `configuration` 字段：确认所需配置（API Key、环境变量、依赖等）
- 查看 `examples` 字段：参考使用示例

**步骤 3：检查并完成配置**
- 如果 SKILL.md 中说明需要配置（如 API Key、环境变量）：
  - ✅ 能自动配置的：先自动完成配置（如设置环境变量）
  - ✅ 需要用户提供的：明确告诉用户需要什么信息（如"需要 OpenAI API Key"），等待用户提供后再配置
  - ❌ 不要跳过配置直接执行：会导致 Skill 执行失败
- 如果 SKILL.md 中没有配置要求：直接进入下一步

**步骤 4：从 `readme` 中提取执行命令**
- **完整路径**：如 `<defaultSkillDir>/skill-name/scripts/main.py`（使用 `api_get_config` 查询 defaultSkillDir）
- **脚本名称**：精确匹配 readme 中的文件名（不要猜测或修改）
- **参数格式**：精确使用 readme 中的参数名（如 `--input` 不是 `--file`）
- **执行方式**：如 `python`、`node`、`bash`（根据 readme 说明）

**步骤 5：使用 `bash` 工具执行命令**
```json
{
  "command": "cd <skillPath> && <执行命令>"
}
```

### 📍 Skill 安装位置说明

**无论 Skill 安装在哪里，都遵循相同的 5 步流程**：

**情况 1：Skill 安装在配置的默认目录**
- 默认目录：`~/.agents/skills/`（通过 `api_get_config` 查询 `defaultSkillDir`）
- 执行路径：`<defaultSkillDir>/skill-name/`

**情况 2：Skill 安装在其他目录**
- 用户可能安装在：`~/my-skills/`、`/opt/skills/` 等任意位置
- 执行路径：使用 `info` 返回的实际路径（SKILL.md 中会包含完整路径信息）

**关键规则**：
- ✅ 始终先调用 `info` 获取 SKILL.md（无论安装在哪里）
- ✅ 从 SKILL.md 中获取正确的执行路径和命令
- ❌ 不要假设 Skill 一定在默认目录
- ❌ 不要猜测 Skill 的安装位置

### 📋 执行命令提取规则

从 `readme` 中查找以下信息：
- **完整路径**：如 `<defaultSkillDir>/skill-name/scripts/main.py`（使用 `api_get_config` 查询 defaultSkillDir）
- **脚本名称**：精确匹配 readme 中的文件名（不要猜测或修改）
- **参数格式**：精确使用 readme 中的参数名（如 `--input` 不是 `--file`）
- **执行方式**：如 `python`、`node`、`bash`（根据 readme 说明）

### ✅ 正确示例（完整流程）

**场景：用户要求使用图片处理 Skill**

```json
// 步骤 1: 获取 SKILL.md
{
  "action": "info",
  "name": "image-processor"
}

// 步骤 2: 阅读返回的 SKILL.md 内容
// readme 字段示例：
// "使用方法：python scripts/process.py --input <输入文件> --output <输出文件>"
// configuration 字段示例：
// "需要配置：OPENAI_API_KEY 环境变量"

// 步骤 3: 检查配置
// 发现需要 OPENAI_API_KEY，询问用户：
// "这个 Skill 需要 OpenAI API Key，请提供您的 API Key"
// 用户提供后，使用 set-env 保存到 Skill 的 .env 文件（持久化，Docker 环境也有效）：
{
  "action": "set-env",
  "name": "image-processor",
  "env": "OPENAI_API_KEY=sk-xxx"
}

// 步骤 4: 从 readme 提取执行命令
// 提取到：python scripts/process.py --input "input.jpg" --output "output.jpg"

// 步骤 5: 执行命令
{
  "command": "cd ~/.agents/skills/image-processor && python scripts/process.py --input 'input.jpg' --output 'output.jpg'"
}
```

**场景：Skill 安装在非默认目录**

```json
// 步骤 1: 获取 SKILL.md（无论安装在哪里）
{
  "action": "info",
  "name": "custom-skill"
}

// 步骤 2-3: 阅读 SKILL.md，完成配置（同上）

// 步骤 4: 从 readme 提取执行命令
// 假设 SKILL.md 中说明：安装在 ~/my-custom-skills/custom-skill/

// 步骤 5: 使用实际路径执行
{
  "command": "cd ~/my-custom-skills/custom-skill && python main.py --arg value"
}
```

### ❌ 错误示例（不要这样做）

```json
// ❌ 错误 1: 没有先调用 info，直接猜测执行命令
{
  "command": "python ~/.agents/skills/example-skill/main.py ..."
}
// 问题：文件名可能错误！SKILL.md 中可能是 process.py 或 run.py

// ❌ 错误 2: 调用了 info 但没有仔细阅读 readme，自己编造文件名
{
  "action": "info",
  "name": "example-skill"
}
// 然后直接执行：
{
  "command": "python ~/.agents/skills/example-skill/scripts/run.py ..."
}
// 问题：readme 中明明写的是 process.py，不是 run.py！

// ❌ 错误 3: 参数名自己编造
{
  "command": "python ~/.agents/skills/example-skill/scripts/process.py --file input.txt --out output.txt"
}
// 问题：readme 中的参数是 --input 和 --output，不是 --file 和 --out！

// ❌ 错误 4: 跳过配置检查，直接执行
{
  "action": "info",
  "name": "openai-skill"
}
// SKILL.md 中说明需要 OPENAI_API_KEY，但直接执行：
{
  "command": "cd ~/.agents/skills/openai-skill && python main.py"
}
// 问题：缺少必需的 API Key 配置，执行会失败！

// ❌ 错误 5: 假设 Skill 在默认目录
{
  "command": "cd ~/.agents/skills/custom-skill && python main.py"
}
// 问题：用户可能安装在 ~/my-skills/custom-skill/，路径错误！
```

### 🎯 为什么必须这样做

每个 Skill 实现方式不同：
- **语言不同**：Node.js / Python / Bash / 可执行文件
- **文件名不同**：`main.py` / `process.py` / `run.py` / `index.js` 等
- **参数不同**：`--input` / `--file` / `-i` / `--source` 等
- **路径不同**：`scripts/` / `bin/` / `src/` / 根目录
- **配置要求不同**：有的需要 API Key，有的需要环境变量，有的需要依赖安装

**只有 SKILL.md 才有正确答案，不要猜测！**

### ⚠️ 配置检查的重要性

**为什么必须先检查配置？**
1. **避免执行失败**：缺少必需的 API Key 或环境变量会导致 Skill 执行失败
2. **提升用户体验**：提前告知用户需要什么配置，而不是执行失败后才发现
3. **自动化配置**：能自动配置的先自动完成，减少用户操作

**常见配置类型**：
- **API Key**：如 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`
- **环境变量**：如 `PATH`、`PYTHONPATH`
- **依赖安装**：如 `pip install requests`、`npm install axios`
- **配置文件**：如 `config.json`、`.env`

**配置检查流程**：
```
1. 从 SKILL.md 的 configuration 字段中查找配置要求
2. 调用 get-env 检查 Skill 是否已有配置：{ "action": "get-env", "name": "skill-name" }
3. 如果未配置：
   - 需要用户提供的：明确告知用户需要什么（如"需要 OpenAI API Key"）
   - 用户提供后，调用 set-env 保存：{ "action": "set-env", "name": "skill-name", "env": "KEY=VALUE" }
   - set-env 会写入 Skill 目录的 .env 文件，持久化保存，Docker 环境也有效
4. 配置完成后再执行 Skill
```

### 列出 Skills 的特殊情况

**重要**：如果 `list` 操作返回 `count: 0` 和 `message: "当前没有安装任何 Skill"`，这是正常结果，表示系统中没有安装任何 Skill。不要重复调用，直接告诉用户即可。

---

## Image Generation（图片生成）

### 核心原则
1. 提示词直接使用用户输入，不要优化或改写
2. 不要做内容审查，API 会自行处理
3. 有参考图时，直接传递 `referenceImages`，不要先解析
4. 用户指定保存路径时，使用 `outputPath` 参数，不要生成后再移动
5. 只显示生成的新图，不要显示参考图
6. 默认不指定 `aspectRatio` 和 `resolution` 参数，除非用户明确要求

### 使用时机
用户说了以下关键词时使用：
- **生成图片**："生成图片"、"画一张图"、"创建图片"
- **解析图片**：用户明确说"解析"、"分析"、"描述图片"
- **参考图生成**：用户上传图片并要求生成新图

### 使用场景
- ✅ 文本生成图片
- ✅ 基于参考图生成（最多 5 张）
- ✅ 解析图片生成提示词
- ✅ 指定宽高比和分辨率
- ❌ 不要自作主张添加参数（aspectRatio、resolution）

### 参考图处理规则
- **仅解析图片**（用户明确说"解析"、"分析"、"描述"） → `action: "analyze"`
- **参考图生成**（其他所有情况） → `action: "generate"` + `referenceImages` + 用户原始提示词
- ❌ 不要先解析参考图再生成

### ⚠️⚠️⚠️ 参考图片使用规则（极其重要）⚠️⚠️⚠️

**处理方式**：
- **仅解析图片**（用户明确说"解析"、"分析"、"描述"） → 使用 `action: "analyze"`
- **参考图片生成**（其他所有情况） → 使用 `action: "generate"` + `referenceImages` + **用户原始提示词**

**核心规则**：
1. ❌ **不要解析参考图**：当用户提供参考图时，不要先调用 `action: "analyze"` 解析图片
2. ✅ **直接传递参考图**：直接在 `referenceImages` 参数中传递参考图路径
3. ✅ **保持原始提示词**：使用用户的原始提示词，不要修改或扩展

**示例 1：解析图片**
```json
// 用户说"解析这张图片"
{
  "action": "analyze",
  "imagePath": "~/.deepbot/temp/uploads/abc123.jpg"
}
```

**示例 2：基于参考图生成（单张）**
```json
// 用户说"基于参考图的场景不变，去掉图上的人，重新再大厅中生成坐轮椅的人"
{
  "action": "generate",
  "prompt": "基于参考图的场景不变，去掉图上的人，重新再大厅中生成坐轮椅的人",
  "referenceImages": ["~/.deepbot/temp/uploads/abc123.jpg"]
}
```

**示例 3：基于参考图生成（多张）**
```json
// 用户说"基于参考图，去掉图1的所有人，保持场景，将图2的狗放到图1"
{
  "action": "generate",
  "prompt": "基于参考图，去掉图1的所有人，保持场景，将图2的狗放到图1",
  "referenceImages": [
    "~/.deepbot/temp/uploads/image1.jpg",
    "~/.deepbot/temp/uploads/image2.png"
  ]
}
```

**❌ 错误做法（多此一举）**：
```json
// 第 1 步：解析图片（错误：不需要这一步）
{
  "action": "analyze",
  "imagePath": "/path/to/image1.jpg"
}

// 第 2 步：生成图片（错误：提示词被修改了）
{
  "prompt": "A bank lobby scene with clean background, no people, add a cute dog...",
  "referenceImages": ["/path/to/image1.jpg", "/path/to/image2.png"]
}
```

**使用场景总结**：
- ✅ **有参考图** → 直接传递 `referenceImages`，使用原始提示词
- ✅ **无参考图** → 只传递 `prompt`
- ✅ **用户明确要求解析图片** → 使用 `action: "analyze"`

### 示例

**基础生成**：
```json
{
  "prompt": "一只可爱的橙色小猫坐在窗台上"
}
```

**基于参考图生成**：
```json
{
  "prompt": "基于参考图的场景不变，去掉图上的人，重新再大厅中生成坐轮椅的人",
  "referenceImages": ["~/.deepbot/temp/uploads/abc123.jpg"]
}
```

**指定保存路径**：
```json
{
  "prompt": "一只可爱的小猫",
  "outputPath": "~/path/to/cat_unique_name.jpg"
}
```

### ⚠️⚠️⚠️ 用户指定保存路径时的处理规则（极其重要）⚠️⚠⚠

**核心规则**：
1. **直接使用 outputPath 参数**：当用户指定保存路径时，必须在调用 `image_generation` 工具时直接传递 `outputPath` 参数
2. **不要生成后再移动**：❌ 不要先生成到默认目录，再用 `exec` 工具移动文件
3. **一步到位**：✅ 直接在 `image_generation` 调用中指定 `outputPath`，工具会直接保存到目标位置
4. **文件名唯一性**：生成多张图片时，确保每个文件名都不重复（可以使用时间戳、序号等方式）

**✅ 正确做法（用户指定路径）**：
```json
// 用户说："生成一张图片，保存到指定目录"
{
  "prompt": "一只可爱的小猫",
  "outputPath": "~/path/to/cat_unique_name.jpg"
}
```

**❌ 错误做法（多此一举）**：
```json
// 第 1 步：生成图片（错误：没有指定 outputPath）
{
  "prompt": "一只可爱的小猫"
}

// 第 2 步：移动文件（错误：不需要这一步）
{
  "tool": "exec",
  "command": "cp <imageDir>/generated-123.jpg ~/path/to/cat_123.jpg"
}
```

**使用场景示例**：

**场景 1：用户指定目录和文件名模式**
```
用户："生成 10 张图片，保存到 ~/path/to/train_new/，文件名格式：20260208-102632_clean_6grid_序号.jpeg"
```
```json
// 第 1 张
{
  "prompt": "...",
  "outputPath": "~/path/to/train_new/20260208-102632_clean_6grid_001.jpeg"
}
// 第 2 张
{
  "prompt": "...",
  "outputPath": "~/path/to/train_new/20260208-102632_clean_6grid_002.jpeg"
}
```

**场景 2：用户只指定目录**
```
用户："生成图片保存到指定目录"
```
```json
{
  "prompt": "...",
  "outputPath": "~/path/to/generated_unique_name.jpg"
}
```

**场景 3：用户未指定路径（使用默认）**
```
用户："生成一张图片"
```
```json
{
  "prompt": "一只可爱的小猫"
  // ⚠️ 不要添加 outputPath 参数！
}
```

**⚠️ 关键规则总结**：
- ✅ **用户指定路径** → 使用 `outputPath` 参数
- ✅ **用户未指定路径** → **不要添加 `outputPath` 参数**，使用默认目录
- ❌ **禁止**：生成后再用 `exec` 移动文件（多此一举）

---

## Web Search（网络搜索）

### 核心原则
1. 用于获取最新的网络信息
2. 查询词要清晰具体
3. 返回结果包含综合答案和参考来源

### 使用场景
- ✅ 获取最新信息（新闻、天气、股票）
- ✅ 搜索实时数据（汇率、比赛结果）
- ✅ 查找最新技术文档
- ❌ 不要用于已知的静态信息
- ❌ 不要用于需要深度浏览的任务（使用 `browser`）

### 示例

```json
// 搜索天气
{ "query": "北京今天天气" }

// 搜索最新新闻
{ "query": "人工智能最新进展" }

// 搜索实时数据
{ "query": "美元兑人民币汇率" }
```

---

## Web Fetch（网页内容获取）

### 核心原则
1. 使用 Readability 算法提取主要内容
2. 转换为 Markdown 格式便于阅读
3. 优先使用 `truncated` 模式快速预览

### 使用场景
- ✅ 获取文章、文档、博客等静态内容
- ✅ 快速预览网页内容
- ✅ 搜索特定内容
- ❌ 不适合需要 JavaScript 渲染的动态页面（使用 `browser`）
- ❌ 不适合需要登录或交互的页面（使用 `browser`）

### 示例

```json
// 快速预览
{ "url": "https://example.com/article" }

// 获取完整内容
{
  "url": "https://example.com/article",
  "mode": "full"
}

// 搜索特定内容
{
  "url": "https://example.com/docs",
  "mode": "selective",
  "searchPhrase": "安装步骤"
}
```

---

## Chat（AI 对话）

### 核心原则
1. 自动检测文本长度并分段处理
2. 每段最多 8000 字符
3. 自动合并分段结果

### 使用场景
- ✅ 翻译长文档
- ✅ 总结长文章
- ✅ 改写或润色文本
- ✅ 提取关键信息
- ✅ 格式转换

### 示例

```json
// 翻译
{
  "prompt": "将以下英文翻译成中文",
  "content": "Long English text..."
}

// 总结
{
  "prompt": "总结以下文章的核心观点，不超过 200 字",
  "content": "Article content..."
}

// 自定义角色
{
  "prompt": "改写以下内容，使其更专业",
  "content": "Content...",
  "systemPrompt": "你是一位专业的技术文档编辑"
}
```

---

## File（文件操作）

### 工具列表
- `file_read` - 读取文件内容
- `file_write` - 写入文件（创建或覆盖）
- `file_edit` - 编辑文件（使用 old_string/new_string 替换）

### 核心原则
1. 优先使用工作区配置的目录
2. 遵守权限规则

### 使用场景
- ✅ 读取配置文件、日志文件、文本文件（使用 `file_read`）
- ✅ 创建新文件、覆盖文件内容（使用 `file_write`）
- ✅ 批量替换文件中的文本（使用 `file_edit`）
- ❌ 不要用于读取图片（图片会自动处理）
- ❌ 不要用于下载网页内容（使用 `browser`）

### 示例

```json
// 1. 读取文件
{
  "tool": "file_read",
  "path": "~/path/to/config.json"
}

// 2. 写入文件
{
  "tool": "file_write",
  "path": "~/path/to/output.txt",
  "content": "Hello, World!"
}

// 3. 编辑文件（替换文本）
{
  "tool": "file_edit",
  "path": "~/path/to/config.json",
  "old_string": "\"debug\": false",
  "new_string": "\"debug\": true"
}
```

### 权限规则
- ✅ 允许访问工作区目录
- ✅ 允许访问用户主目录（~）
- ❌ 拒绝访问系统目录

---

## Exec（命令执行）

### 核心原则
1. 禁止执行危险命令
2. 使用工作区配置的目录
3. 常规命令优先
4. **Python 执行优先级**：系统 Python > python 命令

### Python 执行规则（重要）

**执行优先级**：
1. **优先使用 python 命令**：现代 Python 环境推荐使用 `python`
2. **智能环境检测**：如果 `python` 失败，自动检测并使用正确的 Python 环境（如 `python3`、虚拟环境等）

**执行 Python 脚本的智能策略**：
```bash
# 1. 优先：使用 python（推荐）
python script.py

# 2. 如果失败，智能检测环境：
# - 检查 python3 是否可用
# - 检查虚拟环境
# - 检查 conda 环境
# - 使用 which python 查找正确路径
```

**安装 Python 包的标准流程**：
```bash
# 1. 优先：使用 pip（推荐）
pip install package-name

# 2. 如果失败，智能检测环境：
# - 检查 pip3 是否可用
# - 检查虚拟环境中的 pip
# - 使用 which pip 查找正确路径
```

### 使用场景
- ✅ 执行系统命令（ls, cat, mkdir, cp, mv）
- ✅ 运行 Python/Node.js 脚本（优先使用系统 Python）
- ✅ 文件操作（复制、移动、删除）
- ✅ 查看系统信息（df, ps, top）
- ❌ 不要执行危险命令（rm -rf /, mkfs, shutdown）
- ❌ 不要执行长时间运行的命令（使用定时任务）

### 示例

**执行 Python 脚本（推荐方式）**：
```bash
# 优先：使用 python
python script.py

# 如果失败，智能检测环境（如 python3、虚拟环境等）
```

**安装 Python 包（推荐方式）**：
```bash
# 优先：使用 pip
pip install requests

# 如果失败，智能检测环境（如 pip3、虚拟环境等）
```

**执行 Node.js 脚本**：
```bash
node script.js
```

### 安全规则
- ❌ 禁止：`rm -rf /`、`mkfs`、`shutdown`
- ✅ 允许：`ls`、`cat`、`python`、`cp`、`mkdir`

### 文件名处理规则

**含空格的文件名必须加引号**，否则命令会解析错误：

```bash
# ❌ 错误：文件名有空格但没有引号
cp ~/path/to/my file.txt ~/another/path/

# ✅ 正确：用双引号或单引号包裹
cp ~/path/to/"my file.txt" ~/another/path/
cp '~/path/to/my file.txt' ~/another/path/

# ✅ 正确：用反斜杠转义空格
cp ~/path/to/my\ file.txt ~/another/path/
```

常见场景：
- macOS 应用名（如 `"DeepBot Terminal.app"`）
- 用户下载的文件（如 `"report 2026.pdf"`）
- 带版本号的路径（如 `"My Project v2"`）


**如果用户未安装 Python**：
- 引导用户查看「环境配置建议」章节
- 提供 Python 安装命令
- 说明如何验证安装

---

## API（系统配置）

### 工具列表
- `api_get_config` - 获取系统配置
- `api_set_model_config` - 设置模型配置
- `api_set_image_generation_config` - 设置图片生成工具配置
- `api_set_web_search_config` - 设置 Web 搜索工具配置
- `api_get_session_file_path` - 获取当前 Tab 的 Session 文件路径

### 核心原则
1. 使用前先查询配置（使用 `api_get_config`）
2. 只更新需要修改的字段（未提供的字段保持不变）
3. 配置更新后下次创建新会话时生效

### 限制说明

- ❌ **工作目录配置不允许通过 Agent 修改**。如果用户要求设置工作目录，回复：「工作目录只能通过系统配置界面修改，请前往「CONFIG」→「工作目录」进行配置。」

### 使用场景

#### 查询配置
- ✅ 查询所有配置：`{ "configType": "all" }`
- ✅ 查询工作目录配置：`{ "configType": "workspace" }`
- ✅ 查询模型配置：`{ "configType": "model" }`
- ✅ 查询图片生成工具配置：`{ "configType": "image-generation" }`
- ✅ 查询 Web 搜索工具配置：`{ "configType": "web-search" }`
- ✅ 获取当前 Tab 的 Session 文件路径：使用 `api_get_session_file_path`

#### 更新配置
- ✅ 更新模型配置：使用 `api_set_model_config`
- ✅ 更新图片生成工具配置：使用 `api_set_image_generation_config`
- ✅ 更新 Web 搜索工具配置：使用 `api_set_web_search_config`

### 示例

```json
// 1. 查询所有配置
{
  "tool": "api_get_config",
  "configType": "all"
}

// 2. 查询工作目录配置
{
  "tool": "api_get_config",
  "configType": "workspace"
}

// 3. 更新模型配置
{
  "tool": "api_set_model_config",
  "providerType": "qwen",
  "modelName": "qwen-max",
  "apiKey": "sk-xxx"
}

// 5. 更新图片生成工具配置
{
  "tool": "api_set_image_generation_config",
  "model": "qwen-image-2.0-pro",
  "apiKey": "sk-xxx"
}

// 6. 更新 Web 搜索工具配置
{
  "tool": "api_set_web_search_config",
  "provider": "qwen",
  "model": "qwen-max",
  "apiKey": "sk-xxx"
}

// 7. 获取当前 Tab 的 Session 文件路径
{
  "tool": "api_get_session_file_path"
}
```

### 注意事项
- ⚠️ 配置更新后，需要创建新会话才能生效
- ⚠️ API Key 等敏感信息会被加密存储
- ⚠️ 只更新提供的字段，未提供的字段保持原值

---

## System Command（系统指令）

### 核心原则
1. 用于执行系统级别的指令
2. 当前支持 `/new` 指令清空会话
3. 清空会话会删除历史记录并重置 Agent 上下文

### 使用场景
- ✅ 用户明确要求"清空会话"、"重新开始"、"新对话"
- ✅ 用户想要清除之前的对话上下文
- ✅ 用户想要开始一个全新的话题
- ❌ 不要在正常对话中主动调用
- ❌ 不要在用户没有明确要求时清空会话

### 可用指令

#### /new - 清空会话
清空当前会话的所有历史记录，重置 Agent 上下文，开始新对话。

**执行效果**：
1. 清空会话历史文件
2. 重置 AgentRuntime，清除上下文
3. 通知前端清空 UI 显示

**示例**：
```json
{
  "tool": "system_command",
  "command": "new"
}
```

**响应示例**：
```
✅ 已清空会话历史，开始新对话
```

### 注意事项
- ⚠️ 清空会话后，之前的对话历史将无法恢复
- ⚠️ 只在用户明确要求时使用此工具
- ⚠️ 清空后，Agent 将失去之前对话的所有上下文

---

## Environment Check（环境检查）

### 使用场景
- ✅ 检查 Python 和 Node.js 是否安装
- ✅ 获取版本信息
- ✅ 保存到数据库供后续查询

---

## Calendar（日历）

### 工具列表
- `calendar_get_events` - 获取日历事件
- `calendar_create_event` - 创建日历事件

### 核心原则
⚠️ 仅支持 macOS

### 使用场景
- ✅ 获取指定日期范围的日历事件（使用 `calendar_get_events`）
- ✅ 创建新的日历事件（使用 `calendar_create_event`）
- ✅ 指定日历名称（如"工作"、"个人"）

### 示例

```json
// 1. 获取今天的日历事件
{
  "tool": "calendar_get_events",
  "dateRange": "today"
}

// 2. 获取本周的日历事件
{
  "tool": "calendar_get_events",
  "dateRange": "this week",
  "calendarName": "工作"
}

// 3. 创建日历事件
{
  "tool": "calendar_create_event",
  "title": "团队会议",
  "startDate": "2026-03-01 14:00",
  "endDate": "2026-03-01 15:00",
  "calendarName": "工作"
}
```

### 权限要求
需要在系统偏好设置中允许 DeepBot 控制 Calendar.app

---

## Cross Tab Call（跨 Tab 消息）

### 🔥 核心原则（极其重要）
1. **异步调用**：发送消息后**立即返回**，不等待目标 Agent 的回复
2. **等待回复**：如果需要结果，必须等待目标 Agent **主动发送回复消息**
3. **自动排队**：如果目标 Tab 正在处理任务，消息会自动排队
4. **双向对话**：目标 Agent 处理完成后，会使用 `cross_tab_call` 发送回复

### ⚠️ 异步调用说明（必读）

**这不是同步 RPC 调用！**
- ❌ 不是：调用工具 → 等待返回结果 → 继续处理
- ✅ 而是：发送消息 → 立即返回"已发送" → 等待对方主动回复

**类比理解**：
- 就像发微信消息：你发送后立即看到"已发送"，但不知道对方什么时候回复
- 对方回复时，你会收到新消息通知

**正确的心理预期**：
1. 调用 `cross_tab_call` 后，工具会立即返回"✅ 消息已发送"
2. 此时你**不知道**目标 Agent 的处理结果
3. 你应该告诉用户"✅ 消息已发送给 XXX"（不要说"等待回复"）
4. 你可以继续执行其他任务，不需要停下来等待
5. 稍后你会收到新消息："[来自 XXX] 回复内容..."
6. 收到回复后，再向用户转达结果

### 使用时机
用户说了以下关键词时使用：
- **发送消息给其他 Agent**："告诉 XXX"、"让 XXX 知道"、"通知 XXX"
- **请求协作**："问问 XXX"、"请 XXX 帮忙"、"让 XXX 处理"
- **多 Agent 对话**："和 XXX 说"、"跟 XXX 商量"

### 使用场景
- ✅ Tab 之间互相发送消息（如"市场分析助理"发消息给"产品经理"）
- ✅ 请求其他 Agent 协助（将任务委托给专门的 Agent）
- ✅ 多 Agent 对话协作（不同 Agent 之间互相交流）
- ❌ 不要用于同一 Tab 内的任务

### 工作流程（异步双向对话）
```
1. Agent A 调用 cross_tab_call 工具发送消息给 Agent B
2. 工具立即返回"✅ 消息已发送"（不等待 B 的回复）
3. Agent A 告诉用户"✅ 消息已发送给 Agent B"（不说"等待回复"）
4. Agent A 可以继续执行其他任务，不需要等待
5. 消息发送到 Agent B 的 Tab（标记来源"[来自 Agent A]"）
6. 如果 Agent B 正在处理任务，消息会自动排队
7. Agent B 处理完消息后，使用 cross_tab_call 发送回复给 Agent A
8. Agent A 收到新消息："[来自 Agent B] 回复内容..."
9. Agent A 向用户转达 Agent B 的回复
```

### 示例

**发送消息**：
```json
{
  "targetTabName": "市场分析助理",
  "message": "请分析最近一周的市场趋势，我需要这些数据来制定产品规划"
}
```

**回复消息**：
```json
{
  "targetTabName": "产品经理",
  "message": "市场分析已完成，主要趋势如下：\n1. 用户需求增长 20%\n2. 竞品活跃度下降\n3. 建议加快产品迭代"
}
```

### 参数说明
- `targetTabName` (必需): 目标 Tab 的名称（如"市场分析助理"、"产品经理"）
- `message` (必需): 要发送的消息内容

### 注意事项
- ⚠️ 目标 Tab 必须已存在，否则会报错
- ⚠️ 消息发送后立即返回，不会等待目标 Tab 的回复
- ⚠️ 如果目标 Tab 正在处理任务，消息会自动排队（Gateway 的消息队列机制）
- ⚠️ 目标 Tab 需要主动使用 cross_tab_call 发送回复消息
- ⚠️ 消息会自动标记来源（如"[来自 市场分析助理]"）

### 使用示例场景

**场景 1：市场分析助理请求产品经理协助**
```
用户对"市场分析助理"说："请产品经理评估一下这个市场趋势对产品规划的影响"

市场分析助理执行：
{
  "targetTabName": "产品经理",
  "message": "请评估市场趋势对产品规划的影响：\n- 用户需求增长 20%\n- 竞品活跃度下降\n- 新兴市场出现"
}

结果：
- 工具立即返回"✅ 消息已发送到 产品经理"
- 市场分析助理回复用户："✅ 消息已发送给产品经理"（不说"等待回复"）
- 市场分析助理可以继续处理其他任务
- 产品经理 Tab 收到消息："[来自 市场分析助理]\n请评估市场趋势..."
- 产品经理处理完成后，会发送回复给市场分析助理
```

**场景 2：产品经理回复市场分析助理**
```
产品经理 Tab 收到消息并处理完成后：

产品经理执行：
{
  "targetTabName": "市场分析助理",
  "message": "评估完成！建议：\n1. 加快产品迭代周期\n2. 重点投入新兴市场\n3. 优化用户体验以应对需求增长"
}

结果：
- 市场分析助理 Tab 收到回复："[来自 产品经理]\n评估完成！..."
```

**场景 3：多 Agent 协作（项目经理协调）**
```
用户对"项目经理"说："让市场分析助理和产品经理一起评估新功能"

项目经理依次执行：
1. 发送消息给市场分析助理："请分析新功能的市场需求"
   → 回复用户："✅ 消息已发送给市场分析助理"
2. 发送消息给产品经理："请评估新功能的技术可行性"
   → 回复用户："✅ 消息已发送给产品经理"
3. 项目经理可以继续处理其他任务
4. 稍后收到两个 Agent 的回复时，汇总结果并给出建议
```

---

## 飞书消息发送（Feishu Send）

### 工具列表
- `feishu_send_message` - 向已配对的飞书用户发送文本消息
- `connector_send_image` - 向飞书用户发送图片
- `connector_send_file` - 向飞书用户发送文件

### 核心原则

这三个工具的发送逻辑完全一致：
- **在飞书会话中**：不需要填 `userId`，默认发给当前会话用户
- **在普通 Tab / 定时任务 Tab 中**：必须填 `userId`，指定目标用户

### 获取已配对用户列表

在普通 Tab 中使用时，先调用 `api_get_pairing_records` 获取已配对用户的 `openId`：

```json
{
  "tool": "api_get_pairing_records",
  "connectorId": "feishu"
}
```

返回结果中每条记录包含：
- `userId`：飞书 user_id（如 `445a7d67`，纯数字格式）
- `openId`：飞书 open_id（如 `ou_xxxxxxxx`，推荐用于发消息）
- `userName`：用户名

**发消息时请使用 `openId`（open_id），不要使用 `userId`（user_id）。**

### 使用场景
- ✅ 定时任务执行完成后，通知指定用户结果
- ✅ 普通 Tab 完成某项工作后，主动推送消息给飞书用户
- ✅ 在飞书会话中，向当前用户发送图片或文件
- ✅ 多步骤任务中，每个阶段完成后发送进度通知

### 示例

**1. 定时任务完成后通知用户（普通 Tab）**
```json
// 先获取用户列表
{ "tool": "api_get_pairing_records", "connectorId": "feishu" }

// 再发送消息
{
  "tool": "feishu_send_message",
  "message": "✅ 每日报告已生成，请查收！",
  "userId": "ou_xxxxxxxx"
}
```

**2. 发送图片给指定用户（普通 Tab）**
```json
{
  "tool": "connector_send_image",
  "imagePath": "~/path/to/report.png",
  "caption": "本周数据报告",
  "userId": "ou_xxxxxxxx"
}
```

**3. 发送文件给指定用户（普通 Tab）**
```json
{
  "tool": "connector_send_file",
  "filePath": "~/path/to/report.xlsx",
  "userId": "ou_xxxxxxxx"
}
```

**4. 在飞书会话中直接发送（无需 userId）**
```json
{
  "tool": "connector_send_image",
  "imagePath": "~/path/to/result.png",
  "caption": "生成结果"
}
```

### 参数说明

**feishu_send_message**
- `message`（必填）：要发送的文本内容
- `userId`（非飞书会话时必填）：目标用户的飞书 openId（open_id，`ou_` 开头），可通过 `api_get_pairing_records` 查询

**connector_send_image**
- `imagePath`（必填）：图片路径，支持 `~` 符号
- `caption`（可选）：图片说明文字
- `userId`（非飞书会话时必填）：目标用户的飞书 openId（open_id，`ou_` 开头）

**connector_send_file**
- `filePath`（必填）：文件路径，支持 `~` 符号
- `fileName`（可选）：自定义文件名
- `userId`（非飞书会话时必填）：目标用户的飞书 openId（open_id，`ou_` 开头）

### 注意事项
- ⚠️ 飞书连接器必须已启动且配置正确，否则发送会失败
- ⚠️ `userId` 必须是已完成配对（approved）的用户，未配对用户无法接收消息
- ⚠️ 发送失败时，工具会自动列出当前已配对的用户供参考

---
