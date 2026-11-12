#!/bin/bash
# 从 cheersai 源 logo 生成应用图标（macOS .icns + Windows .ico + 各尺寸 png）
# 用法：把 cheersai-logo.png 放到 brand/assets/ 后执行  bash brand/make-icons.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/assets/cheersai-logo.png"
OUT="$HERE/assets"

if [ ! -f "$SRC" ]; then
  echo "[FAIL] 找不到源 logo：$SRC"
  echo "请把 CheersAI 的方形 logo（PNG，建议 1024x1024 透明底）放到该路径后重跑。"
  exit 1
fi
if ! command -v sips >/dev/null 2>&1 || ! command -v iconutil >/dev/null 2>&1; then
  echo "[FAIL] 需要 macOS 自带的 sips 与 iconutil。"
  exit 1
fi

ICONSET="$OUT/bidoda.iconset"
mkdir -p "$ICONSET"
echo "源 logo：$SRC"

# macOS iconset 规范：标准尺寸 + @2x 变体
gen() { sips -z "$1" "$1" "$SRC" --out "$ICONSET/$2" >/dev/null 2>&1; }
gen 16   icon_16x16.png
gen 32   icon_16x16@2x.png
gen 32   icon_32x32.png
gen 64   icon_32x32@2x.png
gen 128  icon_128x128.png
gen 256  icon_128x128@2x.png
gen 256  icon_256x256.png
gen 512  icon_256x256@2x.png
gen 512  icon_512x512.png
gen 1024 icon_512x512@2x.png
iconutil -c icns "$ICONSET" -o "$OUT/icon.icns"
echo "已生成：$OUT/icon.icns"

# 各尺寸 png（供界面内引用，文件名与上游 client/assets/icon_*.png 对齐）
for s in 16 24 32 48 64 128 256; do
  sips -z "$s" "$s" "$SRC" --out "$OUT/icon_${s}.png" >/dev/null 2>&1
done
echo "已生成：icon_{16,24,32,48,64,128,256}.png"

# Windows .ico（仅当自行构建 Windows 版才需要）
if python3 -c "import PIL" >/dev/null 2>&1; then
  python3 - "$SRC" "$OUT/icon.ico" <<'PY'
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA')
im.save(sys.argv[2], sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
PY
  echo "已生成：$OUT/icon.ico"
else
  echo "[WARN] 未安装 Pillow，跳过 icon.ico。macOS 自用无需此文件；若需 Windows 版：python3 -m pip install Pillow 后重跑。"
fi

echo "完成。图标替换由 apply.mjs 执行，保持上游原文件名不变。"
