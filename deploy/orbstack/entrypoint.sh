#!/bin/bash
# 启动虚拟显示 + 窗口管理器 + VNC/noVNC，再以前端 dev 形态拉起整套 Electron 客户端
set -e

Xvfb :99 -screen 0 1440x900x24 -ac +extension GLX +render -noreset >/tmp/xvfb.log 2>&1 &
sleep 3
openbox >/tmp/openbox.log 2>&1 &

# VNC 暴露 5900，noVNC 经 websockify 推到 6080（浏览器访问）
x11vnc -display :99 -forever -nopw -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
websockify --web /usr/share/novnc 0.0.0.0:6080 localhost:5900 >/tmp/websockify.log 2>&1 &

export DISPLAY=:99
cd /app/client

echo "== bidoda dev container ready =="
echo "   浏览器访问:  http://localhost:6080/"
echo "   Vite dev:    http://localhost:5173/ (可选，调试用)"
echo "   源码:        /app/client  (OpenBidKit_Yibiao@main 已换皮为 bidoda)"

exec npm run dev
