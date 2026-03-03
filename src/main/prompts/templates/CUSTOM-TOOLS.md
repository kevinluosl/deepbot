# 自定义工具使用指南

本文件包含第三方插件工具的使用说明。

---

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
- ✅ 发送带抄送/密送的邮件
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
  "body": "<h1>项目进度</h1><ul><li>功能 A：已完成</li><li>功能 B：进行中</li></ul>",
  "html": true
}
```

3. 发送带附件的邮件：
```json
{
  "to": "client@example.com",
  "subject": "合同文件",
  "body": "请查收附件中的合同",
  "attachments": [
    "~/Documents/contract.pdf",
    "~/Documents/invoice.xlsx"
  ]
}
```

4. 发送带抄送的邮件：
```json
{
  "to": "manager@company.com",
  "cc": "team@company.com,hr@company.com",
  "subject": "请假申请",
  "body": "申请明天请假一天"
}
```

5. 从文件读取邮件正文：
```json
{
  "to": "newsletter@example.com",
  "subject": "月度通讯",
  "bodyFile": "~/Documents/newsletter.html",
  "html": true
}
```

### 错误处理

根据错误信息指导用户：

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| "邮件工具未配置" | 配置文件不存在 | 告诉用户：需要创建配置文件 `~/.deepbot/tools/email-tool/config.json`，参考上面的配置格式 |
| "认证失败" | 账号或密码错误 | 告诉用户：检查配置中的账号和密码/授权码（QQ 邮箱必须使用授权码，Gmail 必须使用应用专用密码） |
| "连接超时" / "连接被拒绝" | 网络或 SMTP 配置错误 | 告诉用户：检查网络连接和 SMTP 服务器配置 |

### 注意事项
- 工具会自动处理错误并返回详细的错误信息
- 不要重复调用，失败一次就告知用户原因
- 附件路径必须是绝对路径或 `~` 开头的路径
- 配置文件路径是固定的，不要告诉用户错误路径（如 `~/.deepbot/config/email.json`）

---

## Connector（连接器工具）

### 核心原则
1. 仅在连接器会话中可用（从飞书等外部平台发起的对话）
2. 不能在 DeepBot Terminal UI 会话中使用
3. 发送失败时，检查文件路径和格式是否正确
4. 注意外部平台的文件大小限制（如飞书单个文件限制 20MB）

### 使用前提

**连接器会话判断**：
- ✅ 连接器会话：从飞书、钉钉、企业微信等外部平台发起的对话
- ❌ 普通会话：在 DeepBot Terminal UI 中发起的对话

**限制**：
- 在普通 UI 会话中调用会返回错误："此工具仅在连接器会话中可用"

### 使用场景
- ✅ 在连接器会话中发送图片到外部平台（如飞书）
- ✅ 在连接器会话中发送文件到外部平台（如飞书）
- ❌ 不能在普通会话中使用（仅限连接器会话）
- ❌ 不能在 UI 发起的会话中使用

### 示例

**connector_send_image（发送图片）**：

1. 发送图片（无说明）：
```json
{
  "imagePath": "/Users/username/Pictures/chart.png"
}
```

2. 发送图片（带说明）：
```json
{
  "imagePath": "/Users/username/Documents/report-chart.png",
  "caption": "这是本月的销售数据图表"
}
```

**connector_send_file（发送文件）**：

1. 发送文件（使用原文件名）：
```json
{
  "filePath": "/Users/username/Documents/report.pdf"
}
```

2. 发送文件（自定义文件名）：
```json
{
  "filePath": "/Users/username/Documents/monthly-report-2024-02.pdf",
  "fileName": "2月份报告.pdf"
}
```

### 错误处理

根据错误信息指导用户：

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| "此工具仅在连接器会话中可用" | 在普通 UI 会话中调用 | 告诉用户：这个功能只能在飞书等外部平台的对话中使用，不能在 DeepBot Terminal 的 UI 中使用 |
| "图片文件不存在" / "文件不存在" | 文件路径错误 | 告诉用户：指定的文件路径不存在，请确认路径是否正确 |
| "不支持的图片格式" | 图片格式不支持 | 告诉用户：只支持 JPG、PNG、GIF、BMP、WebP 格式，请转换图片格式后重试 |
| "路径不是文件" | 路径是目录 | 告诉用户：指定的路径是一个目录，不是文件，请提供文件的完整路径 |

### 使用建议

**路径处理**：
- 使用绝对路径（如 `/Users/username/Documents/file.pdf`）
- 或使用 `~` 开头的路径（如 `~/Documents/file.pdf`）

**配合其他工具**：
- 先使用 `file_read` 读取文件内容，确认文件存在后再发送

**文件大小限制**：
- 注意外部平台可能有文件大小限制
- 飞书单个文件限制通常为 20MB

**典型使用场景**：
- 用户要求："把这个图片发给我"
- 用户要求："发送这个文档"
- 用户要求："把刚才生成的图表发到飞书"

### 支持的格式

**connector_send_image**：
- JPG / JPEG
- PNG
- GIF
- BMP
- WebP

**connector_send_file**：
- 任意文件类型（PDF、Word、Excel、ZIP 等）

---
