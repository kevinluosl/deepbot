# DeepBot 工具使用指南

## 🔧 环境配置建议

### 推荐开发环境

为了充分发挥 DeepBot 的能力，建议配置以下开发环境：

#### 1. Python 环境（推荐使用 Conda）

**为什么推荐 Conda？**
- 隔离环境：避免不同项目的依赖冲突
- 版本管理：轻松切换 Python 版本
- 包管理：简化依赖安装和管理

**安装 Miniconda**

macOS (M1/M2/M3):
```bash
curl -O https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh
bash Miniconda3-latest-MacOSX-arm64.sh
source ~/miniconda3/bin/activate
```

macOS (Intel):
```bash
curl -O https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh
bash Miniconda3-latest-MacOSX-x86_64.sh
source ~/miniconda3/bin/activate
```

Linux:
```bash
curl -O https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
source ~/miniconda3/bin/activate
```

Windows:
```bash
# 下载并运行安装程序
curl -O https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe
# 双击运行 .exe 文件，按向导完成安装
```

**验证安装**:
```bash
conda --version
```

**在 Conda 中安装 Python**:
```bash
# 创建新环境并安装 Python 3.12
conda create -n deepbot python=3.12
conda create -n other python=3.12

# 激活环境
conda activate deepbot
conda activate other

# 验证
python --version
```

**设置环境变量**:
```bash
# macOS/Linux - 添加到 ~/.bashrc 或 ~/.zshrc
export PATH="$HOME/miniconda3/bin:$PATH"

# 重新加载配置
source ~/.bashrc  # 或 source ~/.zshrc
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

#### 3. 快速安装（不使用版本管理器）

如果不需要版本管理，可以直接安装：

**Python**:
```bash
# macOS
brew install python3

# Ubuntu/Debian
sudo apt-get install python3

# Windows
# 下载安装程序：https://www.python.org/downloads/
```

**Node.js**:
```bash
# macOS
brew install node

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_lts.sh | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
# 使用 Chocolatey: choco install nodejs
# 或使用 Winget: winget install OpenJS.NodeJS
# 或下载安装程序：https://nodejs.org/
```

#### 4. 环境检查

安装完成后，在 DeepBot 中执行环境检查：
1. 打开「系统配置」→「环境配置」
2. 点击「检查环境」按钮
3. 确认 Python、Conda、Node.js 都已正确安装

---

## 📸 图片显示规则

**当你需要在响应中显示图片时**，必须使用 Markdown 图片语法：

```markdown
![图片描述](图片路径)
```

**支持的路径格式**：
- 绝对路径：`![截图](/Users/username/Desktop/screenshot.png)`
- 用户目录：`![截图](~/Desktop/screenshot.png)`
- file:// 协议：`![截图](file:///Users/username/Desktop/screenshot.png)`

**响应示例**：
```
✅ 已成功加载并预览桌面图片：截屏2026-02-03 21.10.06.png

![截屏2026-02-03 21.10.06.png](~/Desktop/截屏2026-02-03 21.10.06.png)

📁 路径：~/Desktop/截屏2026-02-03 21.10.06.png
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
{ "action": "snapshot", "interactive": true }

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
2. 任务描述（description）必须完整保留用户输入，一字不改
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
  "description": "生成每日工作报告并保存到桌面",
  "schedule": {
    "type": "cron",
    "cronExpr": "0 9 * * *"
  }
}
```

### 正确理解用户需求

**用户说**："每隔10秒检查桌面有没有1.txt文件，没有就创建一个，有的话返回太好了，然后停止执行任务"

**正确拆分**：
1. **触发器**：每隔 10 秒 → `schedule: { type: "interval", intervalMs: 10000 }`
2. **任务内容**：检查桌面有没有1.txt文件，没有就创建一个，有的话返回太好了，然后停止执行任务 → `description`

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

### 任务描述规范

**好的描述**：
- ✅ "检查桌面有没有1.txt文件，没有就创建一个，有的话返回太好了，然后停止执行任务"
- ✅ "检查 ~/Documents 目录，如果有新文件就发送通知"
- ✅ "打开浏览器访问天气网站，获取今天的天气预报"

**不好的描述**：
- ❌ "每隔10秒检查文件"（不要重复时间间隔）
- ❌ "检查文件"（太模糊）
- ❌ "执行任务"（没说明做什么）

### 定时任务执行权限

定时任务可以执行以下操作：
- ✅ **可执行**：`list`、`delete`、`pause`、`resume`、`trigger`、`history`
- ❌ **不可执行**：`create`（防止无限创建任务）

任务可以理解"停止当前任务"指令，会自动调用 `delete` 操作。

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
1. 执行 Skill 前必须先调用 `info` 获取使用说明
2. 从 `readme` 中提取正确的执行命令（完整路径、脚本名、参数格式）
3. 不要猜测文件名和参数，只有 SKILL.md 才有正确答案

### 使用时机
用户说了以下关键词时使用：
- **搜索**："搜索 Skill"、"查找 Skill"、"有什么 Skill"
- **安装**："安装 Skill"、"添加 Skill"
- **列出**："列出已安装的 Skill"、"查看 Skill"
- **卸载**："卸载/删除 Skill"
- **查看详情**："查看 Skill 详情"、"Skill 使用说明"

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
  "command": "cd <defaultSkillDir>/video-transcript-downloader && python3 scripts/download.py --url 'https://youtube.com/watch?v=xxx'"
}
```

**本地安装示例**：
```json
// file:// 协议
{
  "action": "install",
  "name": "split_4_image",
  "repository": "file:///Users/jinyu/.deepbot/skills/split_4_image"
}

// 绝对路径
{
  "action": "install",
  "name": "split_4_image",
  "repository": "/Users/jinyu/.deepbot/skills/split_4_image"
}

// 用户目录
{
  "action": "install",
  "name": "split_4_image",
  "repository": "~/.deepbot/skills/split_4_image"
}
```

### 🔴 强制要求：执行 Skill 前必须先调用 `info` 获取使用说明

**正确流程（3 步，缺一不可）**：
1. **调用 `info`** 获取 SKILL.md 内容
2. **阅读 `readme` 字段**，从中提取正确的执行命令（包括完整路径、脚本名、参数格式）
3. **使用 `bash` 工具**执行提取的命令

### 📋 执行命令提取规则

从 `readme` 中查找以下信息：
- **完整路径**：如 `<defaultSkillDir>/skill-name/scripts/main.py`（使用 `api_get_config` 查询 defaultSkillDir）
- **脚本名称**：精确匹配 readme 中的文件名（不要猜测或修改）
- **参数格式**：精确使用 readme 中的参数名（如 `--input` 不是 `--file`）
- **执行方式**：如 `python3`、`node`、`bash`（根据 readme 说明）

### ✅ 正确示例

```json
// 步骤 1: 获取使用说明
{
  "action": "info",
  "name": "example-skill"
}

// 步骤 2: 从 readme 中提取到的执行命令示例：
// python3 <defaultSkillDir>/example-skill/scripts/process.py \
//   --input "data.txt" \
//   --output "result.txt"

// 步骤 3: 执行（使用提取的完整路径和参数）
{
  "command": "cd <defaultSkillDir>/example-skill && python3 scripts/process.py --input 'data.txt' --output 'result.txt'"
}
```

### ❌ 错误示例（不要这样做）

```json
// ❌ 错误 1: 没有先调用 info，直接猜测执行命令
{
  "command": "python3 <defaultSkillDir>/example-skill/main.py ..."  // 文件名可能错误！
}

// ❌ 错误 2: 调用了 info 但没有仔细阅读 readme，自己编造文件名
{
  "command": "python3 <defaultSkillDir>/example-skill/scripts/run.py ..."  // readme 中是 process.py！
}

// ❌ 错误 3: 参数名自己编造
{
  "command": "python3 <defaultSkillDir>/example-skill/scripts/process.py --file ... --out ..."  // readme 中是 --input 和 --output！
}
```

### 🎯 为什么必须这样做

每个 Skill 实现方式不同：
- **语言不同**：Node.js / Python / Bash / 可执行文件
- **文件名不同**：`main.py` / `process.py` / `run.py` / `index.js` 等
- **参数不同**：`--input` / `--file` / `-i` / `--source` 等
- **路径不同**：`scripts/` / `bin/` / `src/` / 根目录

**只有 SKILL.md 才有正确答案，不要猜测！**

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
  "outputPath": "~/Desktop/cat_$(date +%s%3N).jpg"
}
```

### ⚠️⚠️⚠️ 用户指定保存路径时的处理规则（极其重要）⚠️⚠⚠

**核心规则**：
1. **直接使用 outputPath 参数**：当用户指定保存路径时，必须在调用 `image_generation` 工具时直接传递 `outputPath` 参数
2. **不要生成后再移动**：❌ 不要先生成到默认目录，再用 `exec` 工具移动文件
3. **一步到位**：✅ 直接在 `image_generation` 调用中指定 `outputPath`，工具会直接保存到目标位置

**✅ 正确做法（用户指定路径）**：
```json
// 用户说："生成一张图片，保存到桌面，文件名用时间戳"
{
  "prompt": "一只可爱的小猫",
  "outputPath": "~/Desktop/cat_$(date +%s%3N).jpg"
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
  "command": "cp <imageDir>/generated-123.jpg ~/Desktop/cat_123.jpg"
}
```

**使用场景示例**：

**场景 1：用户指定目录和文件名模式**
```
用户："生成 10 张图片，保存到 ~/Desktop/train_new/，文件名格式：20260208-102632_clean_6grid_时间戳.jpeg"
```
```json
// 第 1 张
{
  "prompt": "...",
  "outputPath": "~/Desktop/train_new/20260208-102632_clean_6grid_$(date +%s%3N).jpeg"
}
// 第 2 张
{
  "prompt": "...",
  "outputPath": "~/Desktop/train_new/20260208-102632_clean_6grid_$(date +%s%3N).jpeg"
}
```

**场景 2：用户只指定目录**
```
用户："生成图片保存到桌面"
```
```json
{
  "prompt": "...",
  "outputPath": "~/Desktop/generated_$(date +%s%3N).jpg"
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
  "path": "~/Documents/config.json"
}

// 2. 写入文件
{
  "tool": "file_write",
  "path": "~/Documents/output.txt",
  "content": "Hello, World!"
}

// 3. 编辑文件（替换文本）
{
  "tool": "file_edit",
  "path": "~/Documents/config.json",
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

### 使用场景
- ✅ 执行系统命令（ls, cat, mkdir, cp, mv）
- ✅ 运行 Python/Node.js 脚本
- ✅ 文件操作（复制、移动、删除）
- ✅ 查看系统信息（df, ps, top）
- ❌ 不要执行危险命令（rm -rf /, mkfs, shutdown）
- ❌ 不要执行长时间运行的命令（使用定时任务）

### 示例

**在 Conda 环境中执行 Python 脚本**：
```bash
conda run -n deepbot python script.py
```

### 安全规则
- ❌ 禁止：`rm -rf /`、`mkfs`、`shutdown`
- ✅ 允许：`ls`、`cat`、`python3`、`cp`、`mkdir`

---

## API（系统配置）

### 工具列表
- `api_get_config` - 获取系统配置
- `api_set_workspace_config` - 设置工作目录配置
- `api_set_model_config` - 设置模型配置
- `api_set_image_generation_config` - 设置图片生成工具配置
- `api_set_web_search_config` - 设置 Web 搜索工具配置

### 核心原则
1. 使用前先查询配置（使用 `api_get_config`）
2. 只更新需要修改的字段（未提供的字段保持不变）
3. 配置更新后下次创建新会话时生效

### 使用场景

#### 查询配置
- ✅ 查询所有配置：`{ "configType": "all" }`
- ✅ 查询工作目录配置：`{ "configType": "workspace" }`
- ✅ 查询模型配置：`{ "configType": "model" }`
- ✅ 查询图片生成工具配置：`{ "configType": "image-generation" }`
- ✅ 查询 Web 搜索工具配置：`{ "configType": "web-search" }`

#### 更新配置
- ✅ 更新工作目录：使用 `api_set_workspace_config`
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

// 3. 更新脚本目录
{
  "tool": "api_set_workspace_config",
  "scriptDir": "/Users/username/my-scripts"
}

// 4. 更新模型配置
{
  "tool": "api_set_model_config",
  "providerType": "qwen",
  "modelName": "qwen-max",
  "apiKey": "sk-xxx"
}

// 5. 更新图片生成工具配置
{
  "tool": "api_set_image_generation_config",
  "model": "wanx-v1",
  "apiKey": "sk-xxx"
}

// 6. 更新 Web 搜索工具配置
{
  "tool": "api_set_web_search_config",
  "provider": "qwen",
  "model": "qwen-max",
  "apiKey": "sk-xxx"
}
```

### 注意事项
- ⚠️ 配置更新后，需要创建新会话才能生效
- ⚠️ API Key 等敏感信息会被加密存储
- ⚠️ 只更新提供的字段，未提供的字段保持原值

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
