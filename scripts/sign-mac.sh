#!/bin/bash

# macOS Ad-hoc 签名脚本
# 这个脚本会在构建后自动对应用进行 ad-hoc 签名
# 不需要 Apple 开发者账号，但可以避免"包损坏"的提示

set -e

APP_PATH="$1"

if [ -z "$APP_PATH" ]; then
  echo "错误: 未提供应用路径"
  exit 1
fi

if [ ! -d "$APP_PATH" ]; then
  echo "错误: 应用路径不存在: $APP_PATH"
  exit 1
fi

echo "🔐 开始对应用进行 ad-hoc 签名..."
echo "   应用路径: $APP_PATH"

# 使用 ad-hoc 签名（使用 - 作为身份标识）
# --deep: 深度签名，包括所有嵌入的框架和库
# --force: 强制重新签名
# --timestamp: 添加时间戳（虽然 ad-hoc 签名不需要，但保持一致性）
codesign --deep --force --sign - "$APP_PATH"

echo "✅ Ad-hoc 签名完成"

# 验证签名
echo "🔍 验证签名..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

echo "✅ 签名验证通过"
echo ""
echo "📝 注意事项："
echo "   - 这是 ad-hoc 签名，不是 Apple 开发者签名"
echo "   - 用户首次打开时仍需右键点击选择'打开'"
echo "   - 但不会再显示'应用已损坏'的提示"
echo "   - 如需完全无提示，需要 Apple 开发者账号进行公证"
