# 自定义工具使用指南

本文件包含第三方插件工具的使用说明。

---

## Email（邮件收发）

发送邮件时：
1. 先用 `skill_manager(list)` 查看本地已安装的邮件 Skill，找到合适的直接使用
2. 如果没有，搜索并安装 `imap-smtp-email-chinese`，然后按 Skill 说明配置并使用

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
