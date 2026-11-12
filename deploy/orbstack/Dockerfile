# bidoda (易标 OpenBidKit) 开发态容器 —— 外部端 / 不打包 / OrbStack
# 容器内拉取上游源码（走 Mac 本机网络，快），以 dev 形态运行整套 Electron 客户端，
# 通过 Xvfb 虚拟显示 + noVNC 把 GUI 推到浏览器，供本机测试全流程。
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

# 1) 系统依赖：Electron 运行时 + 原生模块编译工具 + 虚拟显示/VNC + git + 中文字体（修复容器内中文乱码）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git gnupg \
    python3 make g++ \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libxshmfence1 libgtk-3-0 \
    xvfb x11vnc novnc websockify openbox \
    fonts-wqy-zenhei fonts-wqy-microhei fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# 2) Node.js 22（README 要求）
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 3) 拉取上游源码（Mac 网络，快）。bidoda 仅换皮，此处用官方源码原样运行。
RUN git clone --depth 1 -b main https://github.com/FB208/OpenBidKit_Yibiao.git /app

WORKDIR /app/client

# 4) 安装客户端依赖（含 better-sqlite3 等原生模块，容器内编译）
RUN npm ci || npm install

# 5) 容器以 root 运行 Electron 必须 --no-sandbox：把 electron 二进制包一层 wrapper
RUN mv node_modules/electron/dist/electron node_modules/electron/dist/electron.bin \
    && printf '#!/bin/bash\nexec "$(dirname "$0")/electron.bin" --no-sandbox "$@"\n' \
       > node_modules/electron/dist/electron \
    && chmod +x node_modules/electron/dist/electron

# 6) 补齐 Linux 缺失的 agent-tools 辅助命令（fd/jq/rg）。
#    上游只为 mac/win 在 vendor/agent-tools 发布这些工具，Linux 需自行提供，
#    否则 Pi Agent warmup 报「常用命令目录不存在」，AI 生成标书全流程跑不全。
#    应用 dev 态从 process.resourcesPath 解析（= node_modules/electron/dist/resources），
#    同时把 client/vendor 处也补一份，覆盖两种解析分支。
RUN apt-get update && apt-get install -y --no-install-recommends fd-find jq ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && for d in \
         /app/client/node_modules/electron/dist/resources/agent-tools/linux-arm64/bin \
         /app/client/vendor/agent-tools/linux-arm64/bin; do \
         mkdir -p "$d" \
         && ln -sf /usr/bin/jq "$d/jq" \
         && ln -sf /usr/bin/rg "$d/rg" \
         && ln -sf /usr/bin/fdfind "$d/fd"; \
       done

# 7) bidoda 换皮：将源码树中的「易标」品牌字样替换为「bidoda」。
#    与 macOS 桌面版换皮规则一致：易标->bidoda；保留易标官方API/易标用户交流群二维码
#    （上游官方服务引用，非我方品牌）；ASCII 标识符（window.yibiao 等）不动。
COPY brand.cjs /app/brand.cjs
RUN node /app/brand.cjs /app/client && rm -f /app/brand.cjs

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 6080 5173

ENTRYPOINT ["/entrypoint.sh"]
