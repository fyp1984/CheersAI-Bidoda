#!/usr/bin/env python3
# 将 .app 内的可执行体与 Helper 包从上游名「易标投标工具箱」整体改名为 bidoda。
# 这是 Electron 换牌的必要一步：主 CFBundleName 已是 bidoda，Electron 运行时会按
# CFBundleName + " Helper (Renderer)" 查找 Helper 包；若文件夹名仍是「易标投标工具箱 Helper」，
# 渲染进程(UI)将无法启动。改名须与 plist 内的 CFBundleExecutable 保持一致。
import os, plistlib

APP = "/Users/FYP/Documents/WorkSpace/CheersAI-Bidoda/dist/bidoda.app"
OLD = "易标投标工具箱"
NEW = "bidoda"

def edit_plist(path, old, new):
    with open(path, "rb") as f:
        d = plistlib.load(f)
    changed = []
    for k in ("CFBundleExecutable", "CFBundleName"):
        if k in d and isinstance(d[k], str) and old in d[k]:
            d[k] = d[k].replace(old, new)
            changed.append(f"{k}={d[k]}")
    with open(path, "wb") as f:
        plistlib.dump(d, f)
    return changed

# 1) 主可执行体
main_bin = os.path.join(APP, "Contents", "MacOS", OLD)
if os.path.exists(main_bin):
    new_main = os.path.join(APP, "Contents", "MacOS", NEW)
    os.rename(main_bin, new_main)
    print("主二进制:", OLD, "->", NEW)
    print("  主 Info.plist:", edit_plist(os.path.join(APP, "Contents", "Info.plist"), OLD, NEW))
else:
    print("主二进制已改名或缺失，跳过:", main_bin)

# 2) 四个 Helper 包
suffixes = ["", " (GPU)", " (Plugin)", " (Renderer)"]
for s in suffixes:
    old_folder = os.path.join(APP, "Contents", "Frameworks", f"{OLD} Helper{s}.app")
    new_folder = os.path.join(APP, "Contents", "Frameworks", f"{NEW} Helper{s}.app")
    if not os.path.isdir(old_folder):
        print("跳过(不存在):", old_folder); continue
    # 2a 内部二进制先改名（此时文件夹仍是旧名）
    inner_old = os.path.join(old_folder, "Contents", "MacOS", f"{OLD} Helper{s}")
    inner_new = os.path.join(old_folder, "Contents", "MacOS", f"{NEW} Helper{s}")
    if os.path.exists(inner_old):
        os.rename(inner_old, inner_new)
    # 2b 改 plist（CFBundleExecutable 与 CFBundleName 都换牌为 bidoda）
    plist_p = os.path.join(old_folder, "Contents", "Info.plist")
    edits = edit_plist(plist_p, OLD, NEW)
    # 2c 文件夹改名（最后做，避免路径失效）
    os.rename(old_folder, new_folder)
    print(f"Helper{s or '(base)'}: 文件夹+二进制+plist 已换牌")
    print("  ", edits)

print("\n=== 改名后核对 ===")
for root, dirs, files in os.walk(APP):
    if "app.asar" in root:
        continue
    for f in files + dirs:
        if OLD in f:
            print("  仍有残留文件名:", os.path.join(root, f))
print("核对结束（无输出即全部清除）")
