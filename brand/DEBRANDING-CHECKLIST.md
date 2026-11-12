# bidoda 去标识化改动全量清单（DEBRANDING CHECKLIST）

> **用途**：本清单是本工程对上游「易标投标工具箱（OpenBidKit_Yibiao）」所做**全部改动**的逐项登记。
> **下一次上游升级时，必须按本清单全量核对，确保改动不被上游覆盖、不因版本回退而失效。**
>
> | 项 | 值 |
> | --- | --- |
> | 上游锁定版本 | `v2.32.2`（`brand/brand.json` → `versionLock.pinnedVersion`） |
> | 源码工作副本 | `work/win-build-2.32.2` |
> | 单一事实源 | [`brand/brand.json`](./brand.json) |
> | 重放引擎 | [`brand/apply.mjs`](./apply.mjs) |
> | 验收脚本 | [`brand/verify.mjs`](./verify.mjs) |
> | 整体改动补丁 | [`brand/debrand-delta-v2.32.2.patch`](./debrand-delta-v2.32.2.patch) |
> | 归属声明（AGPL §7(b)，**不得删除**） | [`brand/ACKNOWLEDGEMENTS.md`](./ACKNOWLEDGEMENTS.md)、`LICENSE`、`NOTICE` |

---

## 0. 升级后如何使用本清单

1. 下载上游新版 → 用 `apply.mjs` 重放 `brand.json` 中的 D3/D4 规则（第一轨）。
2. 再重放 `brand/debrand-delta-<新版>.patch`（第二轨，承接无法用单文件锚点表达的跨文件改动）。
3. **逐条**按下文「验证」列执行，任何一条不通过即视为**改动被覆盖 / 回退**，必须修复后才能出包。
4. 全部通过后再跑 `node brand/verify.mjs --debrand-check work/<新版工作副本>`，全绿才切换版本指针。
5. 失败时保留旧版可回滚；**禁止**使用应用内「检查更新」升级（会把品牌换回官方版）。

> 判据总纲：**只替换中文品牌字样与产品私有标识；内核级 ASCII 技术标识符（`window.yibiao` / `yibiao-asset` / 事件名 / IPC 通道 / 命令行开关）一律保留不动** —— 改动它们会直接破坏功能。

---

## 1. 机制：双轨重放 + 单一真相源

本工程对上游只做「版本锁定 + 换皮」，**不维护 fork**。改动分两轨承载，升级时**二者都必须执行**：

| 轨 | 载体 | 覆盖内容 | 重放方式 |
| --- | --- | --- | --- |
| 第一轨 | `brand.json` → `debranding.rules` | 可按「单文件精确锚点」表达的改动（入口摘除、端点停用、删除文件等） | `node brand/apply.mjs --target source --source-dir <client> --debrand D3,D4` |
| 第二轨 | `brand/debrand-delta-<version>.patch` | 跨近百文件的整体改动（openxmlhelper 命名空间改名、docx 协议标签改名、二进制图标替换等） | `git apply`（相对工作副本 HEAD） |

`op` 语义（`apply.mjs` 的 `applyOp`）：`replace`=精确串替换（全局）/ `remove-lines`=删除含锚点的整行 / `remove-block`=删除含 anchor 的行到其后首个 trim 等于 endAnchor 的行 / `set-const`=端点或开关常量替换 / `delete-file`=删除文件。**锚点未命中即按 `blockOnMiss: true` 阻断**（暴露而非静默放行）。

---

## 2. 改动分类清单

### A. 品牌换皮 · 图标与 Logo

| # | 改动点 | 说明 | 验证 |
| --- | --- | --- | --- |
| A1 | `client/assets/icon.ico` | 覆盖为 CheersAI 图标（Windows 可执行体与窗口图标） | `brand/verify.mjs` 校验图标内容哈希 |
| A2 | `client/assets/icon_{16,24,32,48,64,128,256}.png` | 覆盖为 CheersAI 图标 | 同上 |
| A3 | `client/assets/yibiao_256.ico` | **删除**（上游专有图标） | `Test-Path` 应为 `False` |
| A4 | 界面 Logo（侧栏品牌标） | `client/src/components/Sidebar.tsx` → `import logoUrl from '../../assets/icon_256.png'`，随 A2 一并换为新 Logo | 运行实例侧栏显示 CheersAI 标志 |
| A5 | 图标源文件 | `brand/assets/{icon.icns,icon.ico,icon_*.png,cheersai-logo.png}` + `make-icons.sh` | `node brand/verify.mjs` |

> 替换图标时**保持上游原有文件名不变**，只覆盖内容，避免引用断链。

### B. 品牌换皮 · 产品名与文本

| # | 改动点 | 说明 | 验证 |
| --- | --- | --- | --- |
| B1 | 应用名 | 「易标投标工具箱」→「投标智囊团」（含 `bidoda` 英文代号） | `brand.json` → `assertions`；`verify.mjs` 断言 `mustNotContain: 易标投标工具箱` |
| B2 | `client/package.json` | `build.productName=bidoda`、`copyright` 含 CheersAI、`artifactName=bidoda-${version}-…`、`publish: []`（**禁用自动更新**） | 读取 `package.json` 核对 |
| B3 | `client/electron/resources/build-attestation.json` | `productName: 易标投标工具箱` → `bidoda` | 见 I 节 |
| B4 | `client/assets/macos-dmg/macOS使用说明.txt` | 品牌字样替换 | `git diff` 核对 |
| B5 | `client/开发说明.md`、`client/doc/html图片.md`、`client/electron/resources/agent-workspace.md`、`client/electron/resources/content-generation/受限HTML生成规范.md` | 文档内品牌字样与上游域名清理 | `verify.mjs --debrand-check` 域名红线 |

> **保留不动**：`window.yibiao`、`yibiao-asset`、`--yibiao-trial-hardware-acceleration`、`yibiao:plugins-changed`、`__yibiaoCheckRemoteNotice`、`openExternal`（见 `brand.json` → `textRules.protect`）。

### C. D3 · 运营入口摘除

| # | 改动点 | 文件 | 验证 |
| --- | --- | --- | --- |
| C1 | 移除「精选资源」主菜单项 | `src/app/menuConfig.ts` | 无 `id: 'resources'` |
| C2 | 移除「插件管理」菜单项 | `src/app/menuConfig.ts` | 无 `id: 'plugin-manager'` |
| C3 | 关闭开发者菜单（`getAppMenuItems` 恒返回 `appMenuItems`） | `src/app/menuConfig.ts` | `mustContain: return appMenuItems;` |
| C4 | 移除菜单星标提示 `githubStarNotice` | `src/app/menuConfig.ts` | 无 `notice: githubStarNotice` |
| C5 | 路由层摘除 ResourcesPage | `src/app/AppRouter.tsx` | 无 `ResourcesPage` |
| C6 | 侧栏广告卡摘除 | `src/components/Sidebar.tsx` | 无 `<SidebarAdCard` |
| C7 | 侧栏运营入口摘除（使用文档 / 公告 / 加群 + `NoticeBoardDialog`） | `src/components/Sidebar.tsx` | 无 `renderGroupChatButton` / `renderNoticeButton` / `renderUserGuideButton` / `加群` |
| C8 | 移除打赏弹窗 `DonationPromptProvider` | `src/app/providers/AppProviders.tsx`、`src/shared/ui/index.ts`、`src/shared/ui/DonationPromptProvider.tsx` | 无 `DonationPromptProvider` |
| C9 | 移除应用内更新提醒 `UpdateNotifier` | `src/App.tsx` | 无 `UpdateNotifier` |
| C10 | 移除授权状态弹窗 `LicenseStatusPrompt` | `src/App.tsx`、`src/app/LicenseStatusPrompt.tsx`（删除） | 无 `LicenseStatusPrompt` |
| C11 | 关于页移除「查看更新日志」按钮与 `ChangelogDialog` | `src/features/settings/pages/SettingsPage.tsx` | 无 `ChangelogDialog` / `查看更新日志` |
| C12 | 关于页移除使用文档链接 `wiki.agnet.top` | `src/features/settings/pages/SettingsPage.tsx` | 无 `wiki.agnet.top` |
| C13 | 删除 `src/app/useTextModelSetupRedirect.ts`（官方账号引导跳转） | — | 文件不存在 |

### D. D4 · 网络与合规加固（端点停用 / 遥测关闭）

| # | 改动点 | 文件 | 常量 → 值 | 验证 |
| --- | --- | --- | --- | --- |
| D1 | IP 黑名单上报停用 | `electron/main.cjs` | `IP_BLOCK_LIST_ENDPOINT=''`；删 `void checkBlockedIpAfterStartup();` | 无 `analytics.agnet.top/ip-blocks` |
| D2 | 渲染层遥测停用 | `src/shared/analytics/analytics.ts` | `ANALYTICS_ENDPOINT=''` | 无 `analytics.agnet.top/track` |
| D3 | 远程公告停用 | `src/shared/remoteNotice.ts` | `NOTICE_ENDPOINT=''`、`NOTICE_LIST_ENDPOINT=''` | 无 `analytics.agnet.top/notice` |
| D4 | 更新日志远端停用 | `src/features/changelog/services/changelogService.ts` | `CHANGELOG_ENDPOINT=''` | 无 `analytics.agnet.top/changelogs` |
| D5 | 侧栏广告远端停用 | `src/components/SidebarAdCard.tsx` | `ADS_ENDPOINT=''` | 无 `analytics.agnet.top/ads` |
| D6 | 精选资源远端停用 | `src/features/resources/pages/ResourcesPage.tsx` | `RESOURCES_ENDPOINT=''` | 无 `analytics.agnet.top/resources` |
| D7 | 侧栏外链与系统设置停用 | `src/components/Sidebar.tsx` | `USER_GUIDE_URL=''`、`SYSTEM_SETTINGS_URL=''` | 无 `wiki.agnet.top` / `system-settings` |
| D8 | AI 服务遥测与模型信息停用 | `electron/services/aiService.cjs` | `ANALYTICS_ENDPOINT=''`、`MODEL_INFO_ENDPOINT=''` | 无 `analytics.agnet.top/model-info` |
| D9 | Agent 运行时遥测停用 | `electron/services/agent/agentRuntimeAnalytics.cjs` | `ANALYTICS_ENDPOINT=''` | 无 `analytics.agnet.top/track` |
| D10 | Agent 错误上报停用 | `electron/services/agent/agentErrorReporter.cjs` | `ANALYTICS_ENDPOINT=''` | 无 `analytics.agnet.top/agent-errors` |
| D11 | 插件市场停用 | `electron/services/pluginService.cjs` | `PLUGIN_MARKET_URL=''` | 无 `analytics.agnet.top/plugins` |
| D12 | 打赏/议题远端停用 | `electron/services/donationService.cjs` | `ISSUE_WIKI_API_BASE=''` | 无 `wiki.agnet.top/api` |
| D13 | 授权激活端点停用 + 弹窗关闭 | `electron/services/licenseService.cjs` | `LICENSE_ENDPOINT=''`；`debugLicenseDisabled=true` | 无 `license/activate`；`mustContain: debugLicenseDisabled = true;` |
| D14 | 自动更新源全部停用 | `electron/services/updateService.cjs` | `GITHUB_RELEASE_API` / `CLOUDFLARE_RELEASE_BASE_URL` / `ATOMGIT_REPOSITORY_URL` / `ATOMGIT_RELEASE_API_BASE_URL` 全置 `''` | 无 `openbidkit-oss.agnet.top` |
| D15 | 大模型设置中的官方 API 端点清除 | `src/features/settings/pages/SettingsPage.tsx` | `'https://v3.yibiao.pro/qhp-ai/anonymous/openai/v1'` → `''` | 无 `v3.yibiao.pro` |

> **例外（保留）**：`electron/services/dependencyService.cjs` 的 `DEPENDENCY_API_URL`（`analytics.agnet.top/dependencies`）**按 2026-11-12 决策 #4 暂保留**——避免影响双层 PDF / OCR 运行时依赖下载。已登记在 `brand.json` → `debranding.assert.forbiddenDomainAllowFiles`。升级时若上游调整该文件，需重新评估。

### E. 官方账户 / 充值 / 发票体系删除

**删除的服务与类型（D4）**

- `electron/services/officialAccountService.cjs`
- `electron/services/officialInvoiceStore.cjs`
- `electron/ipc/officialAccountIpc.cjs`
- `src/shared/types/officialAccount.ts`

**删除的界面组件（D3）**

- `src/features/settings/components/OfficialAccountControls.tsx`
- `OfficialInvoiceAction.tsx`、`OfficialInvoicePanel.tsx`、`OfficialOrdersPanel.tsx`
- `OfficialRechargeDialog.tsx`、`OfficialRedeemAction.tsx`、`OfficialSourceSelect.tsx`
- `OfficialTransactionsPanel.tsx`、`officialDisplay.ts`、`useOfficialAccount.ts`

**就地改造（摘除注册/类型/调用）**

| 文件 | 改动 |
| --- | --- |
| `electron/ipc/index.cjs` | 摘除 `officialAccountIpc` 注册 |
| `electron/preload.cjs` | 摘除 `official-account:*` 通道与 `invokeOfficialAccount()`，移除 `window.yibiao.officialAccount` 全部方法与 `onBalanceInsufficient` |
| `src/shared/types/{config,index,ipc}.ts` | 移除 `OfficialAccount*` 类型、`official_api_model_type`、`ImageModelRatio`、`githubStarNotice` |
| `src/features/settings/pages/SettingsPage.tsx` | 删除官方设置区、`OfficialAccountControls`/`OfficialOrdersPanel`/`OfficialInvoicePanel`/`OfficialTransactionsPanel` offer、`updateOfficialApiModelType()`、`handleOfficialApiTabKeyDown()` 等 |
| `src/features/settings/types.ts` | 同步移除官方相关类型 |

**验证**：`brand.json` → `assert` 的 `mustNotContainMarkers`（`OfficialAccountControls`、`OfficialRechargeDialog`）；`verify.mjs` 对每条 `delete-file` 规则断言文件已删除。

### F. 第三方模型提供商剔除（official / jinlong / agnes）

**文件**：`client/electron/services/configStore.cjs`（规则 `del-providers-config-store`）

| # | 改动点 | 内容 |
| --- | --- | --- |
| F1 | 文本提供商白名单 | `['official','jinlong','volcengine','deepseek','agnes','custom']` → `['volcengine','deepseek','custom']` |
| F2 | 图片提供商白名单 | `['jinlong','volcengine','google-ai-studio','agnes','custom','comfyui']` → `['volcengine','google-ai-studio','custom','comfyui']` |
| F3 | 常量与默认值清理 | 删 `agnesImageRatios`、`official/jinlong/agnes` 的 baseURL 与 profile、`normalizeImageRatio()`、`official_api_model_type` 全链 |
| F4 | 默认提供商 | 文本默认 `official` → `custom`；图片默认 `jinlong` → `volcengine`；`useProviderDefaultImageModel=false` |
| F5 | `aiService.cjs` | 移除 jinlong（`jlaudeapi.com`）/agnes（`apihub.agnes-ai.com`）默认 baseUrl |
| F6 | `SettingsPage.tsx` | 移除 jinlong/agnes 预设、API Key 引导链接 `platform.agnes-ai.com` 等 |

**验证**：`mustNotContain: ["v3.yibiao.pro/qhp-ai", "jlaudeapi.com", "agnes-ai.com", "'official'", "'jinlong'", "'agnes'"]`。
> 🔎 **注意**：`YbTpl`、`YIBIAO_CONTENT_TABLE_` 为**未改名**的内部常量，属预期保留项，不在本清单改名范围。

### G. docx 私有协议标签改名（客户端 + openxmlhelper **双端必须同步**）

> ⚠️ 双端不同步会导致**协议断裂**（生成的 docx 无法被解析回填）。改名规则不在 `brand.json` 的 `textRules`，而由第二轨补丁整体重放。命名规则：`Yibiao/Yb/YIBIAO` → `Bidoda/Bd/BIDODA`。

| 旧（上游） | 新（bidoda） |
| --- | --- |
| `YIBIAOANCHOR` | `BIDODAANCHOR` |
| `YIBIAOTOC` | `BIDODATOC` |
| `YIBIAOHEADING` | `BIDODAHEADING` |
| `YIBIAOFIGURE` / `YIBIAOFIGURECAPTION` | `BIDODAFIGURE` / `BIDODAFIGURECAPTION` |
| `YIBIAOLISTO` / `YIBIAOLISTU` | `BIDODALISTO` / `BIDODALISTU` |
| `YIBIAOTABLECAPTION` | `BIDODATABLECAPTION` |
| `YIBIAOLAYOUT` + `yb_layout_` | `BIDODALAYOUT` + `bd_layout_` |
| `{{YBPAGE:…}}` | `{{BDPAGE:…}}` |
| `yibiao:field:` / `yibiao:format:` / `yibiao:body:` / `yibiao:toc` | `bidoda:field:` / `bidoda:format:` / `bidoda:body:` / `bidoda:toc` |
| `_YbP` / `_YbPE` / `_YbPS` / `_YbR` / `_YbD` / `_YbH` | `_BdP` / `_BdPE` / `_BdPS` / `_BdR` / `_BdD` / `_BdH` |

**客户端侧文件**：`electron/services/rulePageTables.cjs`、`technicalPlanToc.cjs`、`technicalPlanExport.cjs`、`scripts/check-template-positions.cjs`、`开发说明.md`

**openxmlhelper 侧文件**：`Jobs/PageReferenceBuilder.cs`、`Jobs/RestrictedHtmlDocumentRenderer.cs`、`Jobs/TableOfContentsBuilder.cs`、`Jobs/TemplateFieldSdtWriter.cs`、`Ooxml/PairedMarkers.cs`、`tools/WordStructureCheck/Primitives.cs` 等

**验证**：工作副本中 `YIBIAOANCHOR|YIBIAOTOC|YBPAGE:|yb_layout_|_YbP` 命中数为 **0**（见 `brand.json` → `assert.mustNotContainText`）；`BIDODAANCHOR|BIDODATOC|BDPAGE:|bd_layout_|_BdP` 必须存在（`mustContainKeep`）。openxmlhelper 需**重新编译**并做二进制 UTF-16 校验（`YIBIAO=0` / `BIDODA*` 齐全）。

### H. openxmlhelper 命名空间改名

| # | 改动点 | 内容 |
| --- | --- | --- |
| H1 | 全局命名空间 | `Yibiao.OpenXmlHelper` → `Bidoda.OpenXmlHelper`（整个工程全部 `.cs` 源文件，约 90+ 个，含 `tools/WordStructureCheck`） |
| H2 | 工程文件 | `OpenXmlHelper.csproj`、`WordStructureCheck.csproj` 同步 |
| H3 | 重新编译 | `dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true … -o vendor/openxml-tools/win32-x64`；**编译产物 `bin/`、`obj/` 必须先清理**，否则残留旧命名空间 |

**验证**：`git grep "Yibiao.OpenXmlHelper"` 命中数为 0；编译产物二进制 UTF-16 中 `Yibiao` 命中数为 0。

### I. 构建溯源 keyId

| # | 改动点 | 文件 | 内容 |
| --- | --- | --- | --- |
| I1 | 溯源 keyId | `electron/resources/build-attestation.json` | `development-build-key` → `bidoda-build-key-2026-01` |
| I2 | 生成脚本默认值与环境变量 | `scripts/generate-build-attestation.cjs` | `YIBIAO_LICENSE_KEY_ID` → `BIDODA_LICENSE_KEY_ID`；默认 `official-build-key-2026-01` → `bidoda-build-key-2026-01`；`productName` 默认值 → `投标智囊团` |

### J. 隐私声明改写

| # | 改动点 | 文件 | 内容 |
| --- | --- | --- | --- |
| J1 | 隐私声明第 03 条 | `src/features/settings/pages/SettingsPage.tsx` | 由「统计上报」口径改为「**不做任何统计上报**」 |

### K. 删除的上游资源文件（汇总）

`client/assets/yibiao_256.ico`、`client/assets/group-chat-qr.png`、`client/assets/macos-dmg/background_old.png`、`client/assets/macos-dmg/background_old2.png`、`client/tmp_outline_diff.patch`

### L. 诊断源码包

| # | 改动点 | 说明 |
| --- | --- | --- |
| L1 | 诊断源码包重生成 | `node client/scripts/prepare-diagnosis-source.cjs` → `client/vendor/diagnosis-source/source.zip`，随包发布 |

---

## 3. 全量验收命令

```powershell
# 1) 清单驱动断言（域名红线 / 文本红线 / 保留项），落到工作副本实际内容
node brand/verify.mjs --debrand-check work\win-build-2.32.2\client

# 2) 旧标识残留总检（应仅剩 dependencyService.cjs 的允许例外）
git -C work\win-build-2.32.2 grep -n -E "analytics\.agnet\.top|wiki\.agnet\.top|jlaudeapi|agnes-ai|v3\.yibiao\.pro"

# 3) docx 协议旧标签残留（应为 0）
git -C work\win-build-2.32.2 grep -n -E "YIBIAOANCHOR|YIBIAOTOC|YBPAGE:|yb_layout_|_YbP"

# 4) openxmlhelper 旧命名空间残留（应为 0）
git -C work\win-build-2.32.2 grep -n "Yibiao.OpenXmlHelper"

# 5) 应用内自动更新残留（应为 0）
git -C work\win-build-2.32.2 grep -n -E "quitAndInstall|checkForUpdates|UpdateNotifier"
```

产出物验收（打包后）：对 `dist/bidoda.app` 或 Windows 安装包内 `app.asar` 复跑 `verify.mjs`，并核对 Product Name / File Description / Copyright 为 `bidoda` / 投标智囊团 / CheersAI。

---

## 4. 升级操作流程（防覆盖 · 防回退）

1. **锁定版本**：更新 `brand.json` → `versionLock.pinnedVersion` 与 `upstream.releaseAsset`。
2. **建基线**：`node brand/apply.mjs --freeze-baseline`（对新版官方原版建逐文件 sha256 基线）。
3. **重放第一轨**：`node brand/apply.mjs --target source --source-dir <新版 client> --debrand D3,D4`。
4. **重放第二轨**：`git apply brand/debrand-delta-<版本>.patch`（若上游改动导致补丁冲突，须逐项手工对齐并**更新补丁与 version 号**）。
5. **逐条核对本清单**（第 2 节 A–L）。
6. **跑第 3 节全部验收命令** + `verify.mjs`。
7. **全绿**才切换版本指针；**任一失败**保留旧版回滚，**绝不出包**。

> 三项防杂交闸门（`brand.json`）：① 单一真相源 `versionLock.pinnedVersion`；② 零补丁残留；③ `--freeze-baseline` 基线比对。上游任何预期外差异即阻断。

---

## 5. 需人工确认的保留项（**不得误删**）

| 项 | 理由 |
| --- | --- |
| `LICENSE` / `NOTICE` / `brand/ACKNOWLEDGEMENTS.md` / 原仓库链接 / 原作者信息 | AGPL-3.0-only §7(b) 归属声明，法律要求保留 |
| ASCII 技术标识符 `window.yibiao` / `yibiao-asset` / `yibiao:plugins-changed` / `--yibiao-trial-hardware-acceleration` / `__yibiaoCheckRemoteNotice` / `openExternal` 等 | 内核级标识符，改动即破坏功能 |
| `dependencyService.cjs` 的 `DEPENDENCY_API_URL` | 2026-11-12 决策 #4：避免影响双层 PDF/OCR 依赖下载，暂保留 |
| `YbTpl`、`YIBIAO_CONTENT_TABLE_` 等内部常量 | 非对外协议标签，未纳入改名范围（预期保留） |
| `CFBundleIdentifier` | 故意不改：改动会导致 Electron userData 目录变更、既有配置看似丢失 |

---

*本清单为工程改动登记，任何新增去标识化改动必须同步登记到此文件，否则视为流程不完整。*
