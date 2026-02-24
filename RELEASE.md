# DeepBot 发布指南

## 📦 打包发布流程

### 1. 准备工作

**检查清单**：
- [ ] 更新版本号（`package.json` 中的 `version`）
- [ ] 运行 `pnpm run type-check` 确保无类型错误
- [ ] 测试所有核心功能
- [ ] 更新 CHANGELOG（如果有）

### 2. 构建命令

#### 开发测试打包（不签名）
```bash
# 只打包不生成安装包（用于测试）
pnpm run pack
```

#### 生产环境打包

**macOS**：
```bash
# 打包 macOS 版本（dmg + zip）
pnpm run dist:mac

# 输出文件：
# - release/DeepBot Matrix Terminal-0.1.0-arm64.dmg  (Apple Silicon)
# - release/DeepBot Matrix Terminal-0.1.0-x64.dmg    (Intel)
# - release/DeepBot Matrix Terminal-0.1.0-arm64-mac.zip
# - release/DeepBot Matrix Terminal-0.1.0-mac.zip
```

**Windows**：
```bash
# 打包 Windows 版本（安装包 + 便携版）
pnpm run dist:win

# 输出文件：
# - release/DeepBot Matrix Terminal Setup 0.1.0.exe  (安装包)
# - release/DeepBot Matrix Terminal 0.1.0.exe        (便携版)
```

**Linux**：
```bash
# 打包 Linux 版本（AppImage + deb）
pnpm run dist:linux

# 输出文件：
# - release/DeepBot Matrix Terminal-0.1.0.AppImage
# - release/deepbot-matrix-terminal_0.1.0_amd64.deb
```

**全平台**：
```bash
# 打包所有平台（需要在对应平台上运行）
pnpm run dist
```

### 3. 安装包说明

#### macOS
- **DMG 文件**：拖拽安装，适合大多数用户
- **ZIP 文件**：解压即用，适合开发者

**安装步骤**：
1. 下载 `.dmg` 文件
2. 双击打开
3. 拖拽 DeepBot 到 Applications 文件夹
4. 首次运行需要在"系统偏好设置 > 安全性与隐私"中允许

#### Windows
- **Setup.exe**：标准安装包，推荐
- **Portable.exe**：便携版，无需安装

**安装步骤**：
1. 下载 `Setup.exe`
2. 双击运行安装向导
3. 选择安装路径
4. 完成安装

#### Linux
- **AppImage**：通用格式，无需安装
- **deb**：Debian/Ubuntu 系统安装包

**安装步骤（AppImage）**：
```bash
chmod +x DeepBot-Matrix-Terminal-0.1.0.AppImage
./DeepBot-Matrix-Terminal-0.1.0.AppImage
```

**安装步骤（deb）**：
```bash
sudo dpkg -i deepbot-matrix-terminal_0.1.0_amd64.deb
```

### 4. 代码签名（可选，推荐）

#### macOS 代码签名

**前置要求**：
- Apple Developer 账号
- 开发者证书（Developer ID Application）

**签名命令**：
```bash
# 设置环境变量
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password

# 打包并签名
pnpm run dist:mac
```

**公证（Notarization）**：
```bash
# 设置环境变量
export APPLE_ID=your@email.com
export APPLE_ID_PASSWORD=app-specific-password
export APPLE_TEAM_ID=your_team_id

# 打包、签名并公证
pnpm run dist:mac
```

#### Windows 代码签名

**前置要求**：
- 代码签名证书（Code Signing Certificate）

**签名命令**：
```bash
# 设置环境变量
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your_password

# 打包并签名
pnpm run dist:win
```

### 5. 发布渠道

#### 方式 1：GitHub Releases（推荐）
1. 在 GitHub 创建新的 Release
2. 上传打包好的文件
3. 编写 Release Notes
4. 发布

#### 方式 2：自建下载服务器
1. 将打包文件上传到服务器
2. 提供下载链接
3. 配置 CDN 加速（可选）

#### 方式 3：企业内部分发
1. 通过企业内网分发
2. 使用 MDM 系统推送
3. 邮件发送下载链接

### 6. 自动更新（可选）

如需支持自动更新，可以集成 `electron-updater`：

```bash
pnpm add electron-updater
```

配置 `package.json`：
```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "deepbot"
    }
  }
}
```

### 7. 常见问题

#### Q: macOS 提示"无法打开，因为无法验证开发者"
**A**: 右键点击应用 → 选择"打开" → 点击"打开"按钮

#### Q: Windows 提示"Windows 已保护你的电脑"
**A**: 点击"更多信息" → 点击"仍要运行"

#### Q: 打包后文件太大
**A**: 
- 检查 `files` 配置，排除不必要的文件
- 使用 `asar` 压缩（electron-builder 默认启用）
- 移除未使用的依赖

#### Q: 打包失败
**A**:
- 检查 Node.js 版本（需要 20+）
- 清理缓存：`rm -rf node_modules dist dist-electron release`
- 重新安装：`pnpm install`
- 查看详细日志：`DEBUG=electron-builder pnpm run dist`

### 8. 版本管理

**语义化版本**：
- `0.1.0` → `0.1.1`：Bug 修复
- `0.1.0` → `0.2.0`：新功能
- `0.1.0` → `1.0.0`：重大更新

**发布前检查**：
```bash
# 1. 更新版本号
npm version patch  # 0.1.0 → 0.1.1
npm version minor  # 0.1.0 → 0.2.0
npm version major  # 0.1.0 → 1.0.0

# 2. 提交代码
git add .
git commit -m "chore: release v0.1.1"
git tag v0.1.1
git push origin main --tags

# 3. 打包发布
pnpm run dist:mac
```

### 9. 分发清单

**给客户的文件**：
- [ ] 安装包（dmg/exe/AppImage）
- [ ] 安装说明文档
- [ ] 用户手册（可选）
- [ ] 许可证文件

**内部存档**：
- [ ] 源代码（Git Tag）
- [ ] 构建日志
- [ ] 测试报告
- [ ] 发布说明

---

## 🚀 快速开始

**首次发布**：
```bash
# 1. 确保代码无误
pnpm run type-check

# 2. 打包 macOS 版本
pnpm run dist:mac

# 3. 测试安装包
open release/*.dmg

# 4. 发布到 GitHub Releases
```

**后续发布**：
```bash
# 1. 更新版本号
npm version patch

# 2. 打包
pnpm run dist:mac

# 3. 上传到发布渠道
```
