# DeepBot 基础工具使用指南

本文档包含简单、直接的基础工具。复杂工具（Browser、定时任务、Skill、图片生成）请参考 TOOLS.md。

---

## File（文件操作工具）

**使用场景**：
- ✅ 读取配置文件、日志文件、文本文件
- ✅ 创建新文件、修改文件内容
- ✅ 批量替换文件中的文本
- ❌ 不要用于读取图片（图片会自动处理）
- ❌ 不要用于下载网页内容（使用 `browser` 工具）

### read
**用途**: 读取文件内容

**参数**:
- `path`: 文件路径（相对于工作区或绝对路径）

**示例**:
```json
{
  "path": "README.md"
}
```

### write
**用途**: 写入文件内容（覆盖）

**参数**:
- `path`: 文件路径
- `content`: 文件内容

**示例**:
```json
{
  "path": "output.txt",
  "content": "Hello World"
}
```

### edit
**用途**: 编辑文件内容（替换指定文本）

**参数**:
- `path`: 文件路径
- `oldText`: 要替换的旧文本
- `newText`: 新文本

**示例**:
```json
{
  "path": "config.json",
  "oldText": "\"debug\": false",
  "newText": "\"debug\": true"
}
```

**⚠️ 权限规则**:
- ✅ 允许访问工作区目录
- ✅ 允许访问用户主目录（~）
- ❌ 拒绝访问系统目录

---

## Exec（命令执行工具）

**使用场景**：
- ✅ 执行系统命令（ls, cat, mkdir, cp, mv）
- ✅ 运行 Python/Node.js 脚本
- ✅ 文件操作（复制、移动、删除）
- ✅ 查看系统信息（df, ps, top）
- ❌ 不要执行危险命令（rm -rf /, mkfs, shutdown）
- ❌ 不要执行长时间运行的命令（使用定时任务）

### bash
**用途**: 执行 Shell 命令

**参数**:
- `command`: 要执行的命令

**示例**:
```json
{
  "command": "ls -la"
}
```

**⚠️ 安全规则**:
- ❌ 禁止执行危险命令（如 `rm -rf /`）
- ❌ 禁止执行格式化命令（如 `mkfs`）
- ✅ 允许执行常规命令（如 `ls`, `cat`, `python3`）

**常用场景**:
- 执行 Python 脚本：`python3 {{scriptDir}}/my_script.py`
- 复制文件：`cp source.txt destination.txt`
- 创建目录：`mkdir -p ~/Documents/new_folder`
- 查看文件：`cat file.txt`

---

## Environment Check（环境检查工具）

### environment_check
**用途**: 检查系统环境依赖（Python、Node.js）并保存到数据库

**操作**:

#### check - 检查环境
检查 Python 和 Node.js 是否安装及版本信息

**参数**:
- `action`: "check"

**示例**:
```json
{
  "action": "check"
}
```

**返回结果**:
- Python 安装状态、版本、路径
- Node.js 安装状态、版本、路径

#### get_status - 获取状态
获取上次检查的环境状态（从数据库读取）

**参数**:
- `action`: "get_status"

**示例**:
```json
{
  "action": "get_status"
}
```

---

## Calendar（日历工具）

**⚠️ 平台限制**: 仅支持 macOS

### calendar_get_events
**用途**: 获取日历事件

**参数**:
- `dateRange`: 日期范围（"today", "tomorrow", "this week", "YYYY-MM-DD", "YYYY-MM-DD to YYYY-MM-DD"）
- `calendarName`: (可选) 日历名称

**示例**:
```json
{
  "dateRange": "today"
}
```

```json
{
  "dateRange": "2026-02-08 to 2026-02-15",
  "calendarName": "工作"
}
```

### calendar_create_event
**用途**: 创建日历事件

**参数**:
- `title`: 事件标题
- `startDate`: 开始时间（ISO 8601 格式）
- `endDate`: 结束时间（ISO 8601 格式）
- `location`: (可选) 事件地点
- `notes`: (可选) 事件备注
- `calendarName`: (可选) 日历名称

**示例**:
```json
{
  "title": "团队会议",
  "startDate": "2026-02-10T14:00:00",
  "endDate": "2026-02-10T15:00:00",
  "location": "会议室 A",
  "notes": "讨论项目进度"
}
```

**⚠️ 权限要求**:
- 系统偏好设置 > 安全性与隐私 > 隐私 > 自动化
- 允许 DeepBot 控制 Calendar.app

---

## Web Search（网络搜索工具）

**使用场景**：
- ✅ 获取最新的网络信息（新闻、天气、股票）
- ✅ 搜索实时数据（汇率、比赛结果、航班信息）
- ✅ 查找最新的技术文档和教程
- ✅ 获取当前事件和热点话题
- ❌ 不要用于已知的静态信息（使用你的知识库）
- ❌ 不要用于需要深度浏览的任务（使用 `browser` 工具）

### web_search
**用途**: 使用 Qwen 或 Gemini 进行网络搜索

**支持的提供商**:
- **Qwen**: 使用通义千问的网络搜索能力 (enable_search)
- **Gemini**: 使用 Google Search Grounding (google_search_retrieval)

**参数**:
- `query`: 搜索查询词（中文或英文）
- `enableSearch`: (可选) 是否启用网络搜索，默认 true（仅 Qwen 使用）

**示例**:

1. 搜索天气信息：
```json
{
  "query": "北京今天天气"
}
```

2. 搜索最新新闻：
```json
{
  "query": "人工智能最新进展"
}
```

3. 搜索技术问题：
```json
{
  "query": "TypeScript 5.0 新特性"
}
```

4. 搜索实时数据：
```json
{
  "query": "美元兑人民币汇率"
}
```

**返回结果**:
- 搜索答案（综合多个来源的信息）
- 参考来源列表（标题 + URL）

**⚠️ 使用建议**:
- 查询词要清晰具体，避免过于宽泛
- Qwen 对中文支持更好，Gemini 对英文支持更好
- 搜索结果会包含来源链接，可以引用
- 如果需要深度浏览网页内容，使用 `browser` 工具

**⚠️ 配置要求**:
- 需要在系统设置 > 工具配置 > Web Search 中配置
- Qwen: 需要通义千问 API Key（可与主模型共用）
- Gemini: 需要 Google Gemini API Key

---
