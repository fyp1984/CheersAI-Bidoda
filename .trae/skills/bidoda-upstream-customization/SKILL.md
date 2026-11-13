---
name: bidoda-upstream-customization
description: 把上游开源易标 OpenBidKit_Yibiao 客户化为本地工程 bidoda（投标智囊团）。当上游发布新版本、需要去标识化重放、按全量清单核对改动、打包并做全量验收测试时使用。不用于改动上游业务逻辑。
---

# bidoda 上游客户化（易标 → 投标智囊团）

本工程**不维护上游 fork**：上游是只读黑盒，全部改动集中在品牌层，用「一份清单 + 一个脚本」重放。上游每发一版，从第一步重跑一遍。

**动手前的边界**：本 Skill 不用于改动上游业务逻辑。凡「必须改业务逻辑才能满足」的需求一律不做——改为「摘除入口」或「整体阻断升级」。

## 1. 产品定位（不可漂移的口径）

| 项 | 结论 |
| --- | --- |
| 产品名 | 投标智囊团（工程代号 `bidoda`，用于仓库 / 可执行体 / 内部标识） |
| 出品方 | CheersAI |
| 上游 | `FB208/OpenBidKit_Yibiao`，AGPL-3.0-only |
| 定位 | 面向企业与个人**自用**的智能投标平台，把「招标解析 → 目录 → 全局事实 → 正文生成 → 导出 Word → 查重 / 废标项 / 暗标检查」收进单机桌面工作区 |
| 部署形态 | macOS / Windows 本地桌面；配置、缓存、生成结果全部留本机 |
| 使用边界 | 同一法律主体内部、单机使用；**不对外销售、不对外分发、不向公众提供网络服务** |
| 不承诺 | 不输出中标率 / 胜率 / 概率，不对招标结果作预测；生成结果一律为**初稿**，须人工复核数字、编号、名称、资质与业绩 |

命名口径：中文名「投标智囊团」用于界面与对外呈现；ASCII 代号 `bidoda` 用于仓库与内部标识。

## 2. 工程分层与最小化改动判据

| 层 | 内容 | 约束 |
| --- | --- | --- |
| L0 上游黑盒（只读） | 上游官方产物 / 源码原样落盘 | 不 fork、不改任何业务逻辑文件 |
| L1 品牌换皮层 | `brand/brand.json`（唯一事实源）、`brand/apply.mjs`（重放）、`brand/assets/`（素材）、`deploy/` | 只替换中文品牌字样 / 应用名 / 图标；ASCII 技术标识符一律不动 |
| L2 运行与验收层 | 产物、`brand/verify.mjs`、产物基线、升级闸门 | 验收全绿才切换版本指针；失败保留旧版回滚 |

**手法优先级（禁止越级）**：① 纯文本替换 ＞ ② 资源覆盖 ＞ ③ 入口摘除 ＞ ④ 端点停用 ＞ ⑤ 改业务逻辑（**禁止**）。

**判据总纲**：品牌字样是中文（`易标`），内部标识符是 ASCII（`window.yibiao`）——**只替换中文品牌字样与产品私有标识**，天然避开技术标识符。

## 3. 唯一事实源与素材登记

| 路径 | 角色 |
| --- | --- |
| `brand/brand.json` | **唯一事实源**：`textRules`、`debranding.rules`（51 条）、`debranding.assert`、`versionLock`、`antiHybrid`、`domainSyncPolicy` |
| `brand/apply.mjs` | 重放引擎：换皮 + 去标识化规则 + `--freeze-baseline` + `--selftest` |
| `brand/verify.mjs` | 验收：产物内部断言 + `--debrand-check` + `--baseline-check` + `--selftest` |
| `brand/asar-manifest.mjs` | app.asar 逐文件 sha256 内存解析（零落盘），基线工具共用 |
| `brand/DEBRANDING-CHECKLIST.md` | 仓库侧改动全量登记（与本 Skill 的 `references/debranding-checklist.md` 须一致） |
| `brand/debrand-delta-<版本>.patch` | 第二轨整体改动补丁 |
| `brand/ACKNOWLEDGEMENTS.md`、`LICENSE`、`NOTICE` | AGPL §7(b) 归属声明，**不得删除** |
| `brand/make-icons.sh` | 由源图生成全套图标，**保持上游原文件名**只覆盖内容 |
| `vendor/baselines/<baselineId>/app.asar.sha256.json` | 产物基线（**随仓库入库**，靠 `.gitignore` 白名单 `vendor/*` + `!vendor/baselines/`） |

**素材登记**

| 素材 | 位置 | 落点 |
| --- | --- | --- |
| CheersAI 源图（1024×1024 透明底 PNG） | `brand/assets/cheersai-logo.png` | 输入 |
| 生成图标 | `brand/assets/icon.icns`、`icon.ico`、`icon_{16,24,32,48,64,128,256}.png` | `brand/make-icons.sh` 产出 |
| Windows 可执行体 / 窗口图标 | 覆盖 `client/assets/icon.ico`、`icon_*.png` | 保持原文件名 |
| 界面 Logo（侧栏） | `client/src/components/Sidebar.tsx` → `import logoUrl from '../../assets/icon_256.png'` | 随图标替换生效 |
| 上游专有图标（删除） | `client/assets/yibiao_256.ico`、`group-chat-qr.png`、`macos-dmg/background_old*.png` | 见清单 A3 / K |
| 构建溯源 | `client/scripts/generate-build-attestation.cjs`、`electron/resources/build-attestation.json` | 见清单 I |
| 合规文档 | `brand/ACKNOWLEDGEMENTS.md` | 随产物保留 |

## 4. 修订逻辑

### 4.1 双轨重放（升级时**两轨都必须执行**）

| 轨 | 载体 | 覆盖内容 | 重放方式 |
| --- | --- | --- | --- |
| 第一轨 | `brand.json → debranding.rules` | 可用「单文件精确锚点」表达的改动（入口摘除、端点停用、删文件） | `node brand/apply.mjs --target source --source-dir <client> --debrand D3,D4` |
| 第二轨 | `brand/debrand-delta-<版本>.patch` | 跨近百文件的整体改动（openxmlhelper 命名空间、docx 协议标签改名、二进制图标替换） | `git apply`（相对工作副本 HEAD） |

### 4.2 `op` 语义（`apply.mjs → applyOp`，**未实现的 op 直接 fail**）

| op | 语义 |
| --- | --- |
| `replace` / `set-const` | 全局精确串替换（`split(anchor).join(value)`），命中数 = 出现次数，可 > 1 |
| `remove-lines` | 删除**所有**含 anchor 的整行 |
| `remove-block` | trim 等于 anchor 的行 → 其后首个 trim 等于 endAnchor 的行（含首尾）；**整行 trim 全等**匹配，非子串 |
| `delete-file` | 删除文件 |

每条规则任一 op 命中 0 即 MISS；`blockOnMiss: true` → 阻断。**锚点未命中必须暴露，而非静默放行。**

### 4.3 三条防杂交闸门

1. **单一真相源**：`brand.json → versionLock.pinnedVersion` 锁死；运行实例靠 `BIDODA-PIN.json` 自报上游版本。
2. **零补丁残留**：任何业务修正只能源于「重放到新版上游」，绝不在产物里手改逻辑。
3. **基线比对**：macOS 产物路线对**官方原版** `app.asar` 建「上游原版基线」；Windows 源码路线对**本工程打包产物**建「产物基线」（`--asar`，`baselineId` 形如 `<版本>-win`）。**自有面**（非 `node_modules/**`）漂移 = 阻断级；`node_modules` 漂移按 lockfile 钉版单列为信息性 WARN。

另有**域同步闸门**：上游新增「议标 / 竞争性谈判 / 单一来源采购 / 询价」等采购方式类域元素，未在 `brand.json → domainSyncPolicy.reviewedAndAdopted` 登记并经复核，升级**默认阻断**。

## 5. 全量改动清单（Checklist）

**逐项底稿：[`references/debranding-checklist.md`](./references/debranding-checklist.md)（A–L 全量条目 + 每条验证方式）。升级时必须打开它逐条核对，本节仅是分类索引。**

| 组 | 范围 | 条目 | 关键断言 |
| --- | --- | --- | --- |
| A | 图标与 Logo | A1–A5 | 图标内容哈希一致；`client/assets/yibiao_256.ico` 已删 |
| B | 产品名与文本 | B1–B5 | 无「易标投标工具箱」；`publish: []` |
| C | D3 运营入口摘除 | C1–C13 | 无 `ResourcesPage` / `SidebarAdCard` / `DonationPromptProvider` / `LicenseStatusPrompt` / `wiki.agnet.top`；`UpdateNotifier` 不再被任何文件挂载（`src/App.tsx` 已摘除 import 与挂载） |
| D | D4 网络与合规加固 | D1–D15 | 无 `analytics.agnet.top` / `wiki.agnet.top` / `v3.yibiao.pro` / `openbidkit-oss.agnet.top` |
| E | 官方账户 / 充值 / 发票体系删除 | 15 个整文件删除 + 5 处就地改造 | 无 `OfficialAccountControls` / `OfficialRechargeDialog` |
| F | 第三方提供商剔除（official / jinlong / agnes） | F1–F6 | 无 `jlaudeapi.com` / `agnes-ai.com` / `'official'` / `'jinlong'` / `'agnes'` |
| G | docx 协议标签改名（双端同步） | 10 条映射 | `YIBIAOANCHOR\|YIBIAOTOC\|YBPAGE:\|yb_layout_\|_YbP` 命中 0，且 `BIDODA*` 齐全 |
| H | openxmlhelper 命名空间改名 | H1–H3 | `Yibiao.OpenXmlHelper` 命中 0（含编译产物 UTF-16） |
| I | 构建溯源 keyId | I1–I2 | keyId 与 productName 已客户化 |
| J | 隐私声明改写 | J1 | 口径为「不做任何统计上报」 |
| K | 删除的上游资源文件 | 5 个文件 | 路径均不存在 |
| L | 诊断源码包重生成 | L1 | `source.zip` 随包发布 |

**唯一保留例外**：`electron/services/dependencyService.cjs` 的 `DEPENDENCY_API_URL`（避免影响双层 PDF / OCR 依赖下载），已登记在 `brand.json → debranding.assert.forbiddenDomainAllowFiles`；上游若调整该文件须重新评估。其余不得误删项见第 8 节。

## 6. 升级执行流程（新版发布时照此执行）

1. **锁定版本**：更新 `brand.json → versionLock.pinnedVersion`、`upstream.pinnedVersion`、`upstream.releaseAsset`。
2. **取源码工作副本**：`node brand/apply.mjs --target source --source-dir <新版 client>`，副本落在 `work/<版本>`。
3. **重放第一轨**：`node brand/apply.mjs --target source --source-dir <副本>/client --debrand D3,D4`。
4. **重放第二轨**：`git apply brand/debrand-delta-<版本>.patch`；上游改动导致冲突时逐项手工对齐，并**更新补丁与版本号**。
5. **逐条核对** `references/debranding-checklist.md`（A–L）。任何一条不通过即视为被覆盖 / 回退，修复后才继续。
6. **跑全量验收**（第 7 节）：`node .trae/skills/bidoda-upstream-customization/scripts/acceptance.mjs --work work/<版本>`。
7. **打包**：前端构建 → 生成诊断源码包 → 去标识化验收 → 生成构建证明 → electron-builder 出 exe/zip。
8. **建产物基线并入库**：`--freeze-baseline --asar <产物>/win-unpacked/resources/app.asar --baseline-id <版本>-win`，基线提交进 `vendor/baselines/`。
9. **产出物验收**（第 7 节末）。
10. **全绿才切换版本指针**；任一失败保留旧版回滚，**绝不出包**。
11. **同步三处**：`brand/DEBRANDING-CHECKLIST.md`、本 Skill 的 `references/debranding-checklist.md`、`brand.json → debranding.assert`。

> **禁止**在应用内点「检查更新」——其 `publish` 指向上游官方 Release，会把品牌换回官方版。

## 7. 全量验收

**一条命令跑完所有闸门**（自证 + 工作副本红线 + 产物基线）：

```powershell
# 工作副本阶段
node .trae/skills/bidoda-upstream-customization/scripts/acceptance.mjs --work work/win-build-<版本>

# 出包后（先建基线再比对）
node .trae/skills/bidoda-upstream-customization/scripts/acceptance.mjs --work work/win-build-<版本> `
  --asar "<产物>/win-unpacked/resources/app.asar" --baseline-id <版本>-win --freeze
```

退出码 0 = 全绿可出包；非 0 = 有闸门未通过，**禁止出包**。脚本内的闸门清单见 `scripts/acceptance.mjs` 顶部注释；需要单步排查时，直接调 `brand/apply.mjs` / `brand/verify.mjs` 的对应开关。

**负例必须被拦住**：对合成或篡改过的 `app.asar` 跑 `--baseline-check`，必须返回非 0。校验脚本没被已知正例与反例自证过，等于没有校验。

**产出物验收**

1. 产物基线比对通过（自有面 `electron/` + `dist/` + `assets/` + `package.json` 逐文件一致）。
2. exe 版本资源：ProductName = `bidoda`、FileDescription = `bidoda` / `投标智囊团独立桌面客户端`、LegalCopyright 含 `CheersAI`；图标为 CheersAI 图标。
3. 对安装包内 `app.asar` 复跑域名 / 文案红线（`易标`、运营域名、官方账户标记均 0 命中）。
4. 启动冒烟：`bidoda.exe` 启动后进程稳定存活、无崩溃。

## 8. 红线（不得误删 / 不得越级）

| 项 | 理由 |
| --- | --- |
| `LICENSE` / `NOTICE` / `brand/ACKNOWLEDGEMENTS.md` / 原仓库链接 / 原作者信息 | AGPL-3.0-only §7(b) 归属声明，法律要求保留 |
| ASCII 技术标识符 `window.yibiao` / `yibiao-asset` / `yibiao:plugins-changed` / `--yibiao-trial-hardware-acceleration` / `__yibiaoCheckRemoteNotice` / `openExternal` | 内核级标识符，改动即破坏功能 |
| `dependencyService.cjs` 的 `DEPENDENCY_API_URL` | 避免影响双层 PDF / OCR 依赖下载，已登记为允许例外 |
| `YbTpl`、`YIBIAO_CONTENT_TABLE_` 等内部常量 | 非对外协议标签，未纳入改名范围 |
| `CFBundleIdentifier` | 改动会切换 Electron userData 目录，既有配置看似丢失 |
| 改业务逻辑 | 优先级第 ⑤ 档，**禁止**；改为摘除入口或整体阻断升级 |

## 9. 已知坑

- Windows 打包若遇 `app.asar` 占用，**换全新输出目录**（如 `release-win5`）规避构建冲突。
- 替换图标**保持上游原文件名**只覆盖内容，避免引用断链（`CFBundleIconFile`、electron-builder 配置）。
- PowerShell 环境脚本执行策略可能禁用 `npx` / `npm run`，直接调 `node .\node_modules\...`。
- 直连 GitHub 可能超时，必要时用镜像（如 `https://gh-proxy.com/`）。
- 产物含 2.6 万+ 文件，asar 必须**内存解析**；逐文件落盘会被拖慢甚至杀掉。
- `.gitignore` 必须写 `vendor/*` + `!vendor/baselines/`：整目录 `vendor/` 排除时无法在其下开白名单，基线会静默不入库。

## 10. 维护规则

新增任何去标识化改动，必须**同时**更新三处：`brand/DEBRANDING-CHECKLIST.md`、本 Skill 的 `references/debranding-checklist.md`、`brand.json → debranding.assert` 的对应断言。漏任一处视为流程不完整——下一次升级会漏检并导致改动被覆盖。
