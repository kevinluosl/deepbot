# DeepBot Web Server - Docker 镜像
# 支持 linux/amd64 和 linux/arm64（buildx 多架构）

# ---- 构建阶段 ----
FROM node:22-bookworm-slim AS builder

# 安装 git（pnpm 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制 package 文件
COPY package.json pnpm-lock.yaml .npmrc .pnpmfile.cjs ./

# 安装 pnpm
RUN npm install -g pnpm@10.23.0 --registry=https://registry.npmmirror.com

# 配置 git 将 SSH 协议重写为 HTTPS（避免 Docker 环境中 SSH 密钥问题）
RUN git config --global url."https://github.com/".insteadOf "git@github.com:"

# 从 package.json 中移除 @electron/rebuild 和 electron-rebuild（Web 版不需要）
RUN node -e "const pkg=require('./package.json'); \
    delete pkg.devDependencies['@electron/rebuild']; \
    delete pkg.devDependencies['electron-rebuild']; \
    require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));"

# 安装依赖（使用 BuildKit cache mount 加速 pnpm 下载）
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --ignore-scripts

# 复制源码
COPY . .

# 构建 web server 和前端
RUN pnpm run build:web

# 安装生产依赖到新目录（不使用 prune，直接全新安装）
RUN mkdir -p /tmp/prod && \
    cp package.json pnpm-lock.yaml .npmrc .pnpmfile.cjs /tmp/prod/ && \
    cd /tmp/prod && \
    pnpm install --prod --ignore-scripts --prefer-offline

# Docker 环境下 mock electron 包（避免运行时加载失败）
RUN mkdir -p /tmp/prod/node_modules/electron && \
    echo "module.exports = new Proxy({}, { get: () => {} });" > /tmp/prod/node_modules/electron/index.js

# ---- 运行阶段 ----
FROM node:22-bookworm-slim

# 安装运行时依赖：Python 3.11、pip、Playwright 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    # Playwright Chromium 运行时依赖
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# 移除 PEP 668 限制标记，允许 pip install --user 正常工作
RUN rm -f /usr/lib/python*/EXTERNALLY-MANAGED

WORKDIR /app

# 从构建阶段复制产物（只复制生产依赖）
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/dist-web ./dist-web
COPY --from=builder /tmp/prod/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src/main/prompts ./src/main/prompts

# 创建数据目录（volume 挂载点）
RUN mkdir -p /data/workspace /data/skills /data/memory /data/sessions /data/db

# 设置 Docker 模式标识
ENV DEEPBOT_DOCKER=true
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Python 包持久化：安装到 /data/scripts，通过 volume 挂载保留
ENV PYTHONUSERBASE=/data/scripts
ENV PIP_USER=1

# npm 全局包持久化：安装到 /data/scripts/npm-global，通过 volume 挂载保留
ENV NPM_CONFIG_PREFIX=/data/scripts/npm-global

# 统一 PATH：包含 Python 用户包和 npm 全局包的可执行目录
ENV PATH="/data/scripts/bin:/data/scripts/npm-global/bin:$PATH"

# Web server 端口
EXPOSE 3000

# 创建启动脚本
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# 启动服务\n\
exec node dist-server/server/index.js\n\
' > /app/start.sh && chmod +x /app/start.sh

# 启动命令
CMD ["/app/start.sh"]
