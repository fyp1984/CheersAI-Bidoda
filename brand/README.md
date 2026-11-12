# bidoda 品牌换皮 · 操作手册

bidoda 不完整改上游任何业务逻辑。上游 `OpenBidKit_Yibiao` 的源码与产物保持原样，本工程只维护**一份品牌清单 + 一个重放脚本**；上游发新版时重新下载、重跑脚本即可，不需要维护 fork、不需要合并 diff。

## 一、三条硬约束

1. **只替换中文品牌字样，绝不动 ASCII `yibiao` 技术标识符。** 界面里的「易标」是中文，而 `window.yibiao`、`yibiao-asset`、`--yibiao-trial-hardware-acceleration`、`yibiao:plugins-changed` 是内部 API / 协议 / 事件名，改了程序直接坏。`brand.json` 的 `textRules.protect` 显式列出保留项，替换时先占位再还原。
2. **禁用应用内自动更新。** 上游 `UpdateNotifier.tsx` / `SettingsPage.tsx` 带 `checkUpdate()`、`quitAndInstall()`，`client/package.json` 的 `publish` 指向 FB208 官方 Release。一旦点应用内「检查更新」，它会把 app 换回官方「易标」并把换皮冲掉。升级一律走本手册第四节。
3. **保留归属。** 上游是 AGPL-3.0-only + NOTICE；NOTICE 明确其归属声明为 AGPL §7(b) 要求保留项。运行时改系统名与 Logo 可以，但 LICENSE、NOTICE、原仓库链接、原作者信息不得抹除，也不得对外声称自研。见 `brand/ACKNOWLEDGEMENTS.md`。
4. **单一真相源、绝不容忍杂交。** bidoda 永远是「某一确切上游版本 + 品牌换皮」的原子镜像，不存在第三种状态。上游任何变动——含「议标」「竞争性谈判」「单一来源采购」「询价」等非招标采购方式这类敏感域元素——都不得导致半同步、半旧版、部分打补丁的杂交态：① 版本锁死在 `brand.json` 的 `versionLock.pinnedVersion`，运行实例靠 `dist/bidoda.app/Contents/Resources/BIDODA-PIN.json` 自报它对应哪个上游版本；② 用 `--freeze-baseline` 对官方原版建立逐文件 sha256 基线，`verify.mjs` 升级后比对，任何预期外差异即判为杂交并阻断；③ 上游新增敏感域元素（如议标、竞争性谈判等）未登记合规复核，升级默认阻断，绝不静默放行。详见技术方案 V5.0 §十。

## 二、今天就在本机跑起来（macOS arm64）

本机已具备 Node.js v22.22.2 / npm 10.9.7 / pnpm 10.32.1，符合上游 README 要求的 Node.js 22。缺的是 .NET 10 SDK——**只有自行打包（dist:mac）才需要，直接跑官方产物不需要**。

```bash
cd /Users/FYP/Documents/WorkSpace/bidoda-shell

# 1) 取官方安装包（任选其一，放进 releases/）
#    GitHub: https://github.com/FB208/OpenBidKit_Yibiao/releases/download/v2.31.7/Yibiao-2.31.7-mac-arm64.zip
#    国内加速: https://atomgit.com/FB208/OpenBidKit_Yibiao/releases  （官网 https://yibiao.pro/）
#    文件: Yibiao-2.31.7-mac-arm64.zip  (280.1 MB)

# 2) 放 CheersAI 方形 logo（PNG，建议 1024x1024 透明底）并生成图标
cp /你的路径/cheersai-logo.png brand/assets/cheersai-logo.png
bash brand/make-icons.sh

# 3) 装一次 asar 工具（Level 2 需要，约百 KB）
npm init -y >/dev/null 2>&1 || true
npm install --no-save @electron/asar

# 4) 先看变更清单，不落产物
node brand/apply.mjs --zip releases/Yibiao-2.31.7-mac-arm64.zip --dry-run

# 5) 确认无误后正式重放
node brand/apply.mjs --zip releases/Yibiao-2.31.7-mac-arm64.zip

# 6) 验收（断言落到产物内部内容，必须全绿）
node brand/verify.mjs

# 7) 启动
open dist/bidoda.app
```

首次启动若被 macOS 拦截（ad-hoc 签名 + 网络下载），用「访达 → 右键 → 打开」或在「系统设置 → 隐私与安全性」里允许一次。

**只想最快看到界面**：可先加 `--level 1`，只换应用名、图标与 Info.plist，不碰 asar，也不需要 `@electron/asar`；窗口标题与侧栏文字暂时仍是「易标」，之后再重放 Level 2。

## 三、命令与产物

| 命令 | 作用 |
|---|---|
| `node brand/apply.mjs --zip <zip>` | 解压官方包 → 复制为 `dist/bidoda.app` → 换皮 → ad-hoc 重签名 |
| `--level 1` | 只换应用显示名 / 图标 / Info.plist，跳过 asar |
| `--dry-run` | 只打印变更清单，不写 `dist/`、不签名 |
| `--app <path.app>` | 跳过解压，直接对已解压的 .app 操作 |
| `--target source --source-dir <client/>` | 可选路线：生成源码工作副本，供 `npm ci && npm run dev` 自行构建 |
| `node brand/verify.mjs` | 验收，失败返回非 0 |
| `node brand/apply.mjs --freeze-baseline --zip <官方原版 zip>` | 对**官方原版**（非换皮）建立上游版本基线 `vendor/baselines/<版本>/app.asar.sha256.json`，供防杂交比对 |
| `node brand/verify.mjs --selftest` | 自证域同步 / 防杂交纯函数逻辑 |

产物与证据：
- `dist/bidoda.app` — 换皮后的应用；旧产物重跑时会被移动为 `bidoda.app.prev-<时间戳>`，**不删除、可回滚**。
- `dist/REBRAND-REPORT.json` — 逐文件 sha256 清单、变更集、警告、上游版本号。
- `Contents/Resources/ACKNOWLEDGEMENTS.md`、`LICENSE`、`NOTICE` — 合规归属。

## 四、上游升级（「丝滑」的真实含义）

上游迭代很快，本次核查时最新版 `v2.31.7` 就发布于 2026-11-10；`sql/workspace_schema.sql` 已到 `PRAGMA user_version = 44`。所以「丝滑」不是「跟着它自动更新」，而是**把升级变成一次可控的重放**：

1. 下载新版官方 zip，放进 `releases/`；**不要在应用内点检查更新**。
2. 同一份官方原版首次须建立基线：`node brand/apply.mjs --freeze-baseline --zip <官方原版 zip>`（只做一次，按版本累积在 `vendor/baselines/`）。
3. `node brand/apply.mjs --zip <新 zip> --dry-run`，确认变更集没有异常扩大（新增文件里出现大量非白名单变更＝上游结构变了，要复核 `brand.json`）。
4. 正式重放 → `node brand/verify.mjs` **全绿**才切换版本指针。此时 `verify.mjs` 会自动比对当前产物与基线，任何预期外差异＝杂交，默认阻断。
5. 若上游引入「议标」「竞争性谈判」「单一来源采购」「询价」等敏感域元素：先评估并在 `brand.json` 的 `domainSyncPolicy.reviewedAndAdopted` 登记（版本 / 法律地位 / 适用边界 / 救济渠道 / 我方守门补充），否则 `verify.mjs` 的域同步闸门会 FAIL、禁止升级放行。
6. 失败则保留旧 `bidoda.app.prev-*` 回滚，并把新版列入待适配。
7. 更新 `brand.json` 的 `versionLock.pinnedVersion`、`upstream.pinnedVersion` 与 `dist/REBRAND-REPORT.json` 留痕。

**验收断言必须落到产物内部实际内容**：`verify.mjs` 会逐文件比对 sha256（证明非白名单文件字节未变）、检查中文品牌字样已清除、并检查 ASCII 技术标识符**仍然存在**（证明没改坏）。只查「文件存在」不算验收。

## 五、合规边界（内部自用）

- 允许：同一法律主体内部使用、运行时系统名与 Logo 改为 bidoda / CheersAI。
- 不允许：对外销售、向其他组织或个人交付副本、把副本交给外部承包商、向公众提供网络服务。
- 依据：上游 README 末段与 `NOTICE` 要求保留归属；FSF GPL FAQ 关于组织内部使用修改版的说明；AGPL-3.0 第 13 条关于「修改版让用户通过网络交互须提供对应源码」的规定。**若未来形态变为内网多人 Web 或对外交付，须重新评估第 13 条并取得法务意见。**
- 本文件为工程合规说明，不替代法律意见。

## 六、已知环境与坑

- 本机沙箱到 GitHub 大文件吞吐实测约 33 KB/s、Release 直连 `http=000`，**280 MB 安装包需在本机浏览器下载**，不要在本环境里等。
- `.NET 10 SDK` 本机缺失，仅影响自行执行 `npm run dist:mac` 打包；运行官方产物不受影响。
- 改动 `.app` 后必须 `codesign --force --deep --sign -`，否则 macOS 因签名破坏拒绝启动（脚本已内置）。
- `CFBundleIdentifier` 故意不改：改了会换 Electron `userData` 目录，既有配置与工作区会看似「丢失」。
- 替换图标时**保持上游原文件名**只覆盖内容，避免 `CFBundleIconFile` 引用断链。
- `vendor/OpenBidKit_Yibiao/` 目前只有一次中断的浅克隆残留（`.git` 11 MB，工作树未检出），取 LICENSE/NOTICE 时若缺失，请从上游仓库单独下载放入。

产品需求与技术方案见文档空间 `02-需求分析/bidoda-产品PRD-V3.0-2026-11-10.md`、`03-架构与设计/bidoda-技术方案-V5.0-2026-11-10.md`。
