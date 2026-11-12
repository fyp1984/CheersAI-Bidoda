# bidoda Windows 安装包 · 技术材料与联调指引

> 版本：2026-11-12 ｜ 用途：作为在 Windows 环境下按「同样技术方案与理念」产出 Windows 安装包并开展联调测试的技术参考。
> 本文档与 `02-需求分析/bidoda-产品PRD-V3.0`、`03-架构与设计/bidoda-技术方案-V5.0`、`brand/README.md` 配套使用。

---

## 〇、命名与商标提示（务必先读）

- 本文档所述产品是 **bidoda**——开源项目 **OpenBidKit / 易标投标工具箱** 的**内部自用品牌封装**，产品名 `bidoda`、Logo 用 CheersAI，**不是自研产品**，底层全部代码与逻辑来自上游。
- 请求中出现的名称「**币安 DODA**」**不可用**：「币安」是加密货币交易所 Binance 的中文商号，本产品是投标工具，二者无任何关联；以此名称发布会造成商标混淆且事实错误。本材料一律使用 **bidoda** 这一正确产品名。
- 合规边界不变：**仅同一法律主体内部单机使用，不对外销售、不对外分发、不向公众提供网络服务**。本材料中的「发布安装包」指**内部测试/自用分发**，不等于对外公开发布。若形态变为内网多人 Web 或对外交付，须重评 AGPL-3.0 §13 并取法务意见。

---

## 一、产品定位

| 项 | 结论 |
|---|---|
| 本质 | 上游 OpenBidKit_Yibiao（易标投标工具箱）的只读黑盒 + 外层品牌换皮，全量继承其功能、交互与业务逻辑 |
| 品牌承担 | 仅产品名 `bidoda`、Logo（CheersAI）、界面标识；不修改任何上游业务代码 |
| 使用主体 | 同一法律主体内部，Windows 本地桌面工作区（配置/缓存/生成结果留本机） |
| 上游许可证 | **AGPL-3.0-only + NOTICE**（§7(b) 归属声明必须保留） |
| 升级方式 | 外层版本「重放」，禁用应用内自动更新 |

一句话：**把易标这套已跑通的标书生产能力，以 bidoda 名称 + CheersAI 品牌在内部使用，上游升级时以重放跟上，而不是维护自己的分支。**

---

## 二、技术方案（与 macOS 同源）

### 2.1 三层架构

1. **L0 上游黑盒（只读）**：官方 Release 原样落盘，不 fork、不 diff、不改业务逻辑文件；AGPL-3.0-only。
2. **L1 品牌换皮层（bidoda 全部改动）**：`brand/brand.json`（唯一事实源）+ `apply.mjs`（重放）+ `make-icons.sh`（图标）。只替换**中文品牌字样／应用名／图标**，ASCII 技术标识符一律不动。
3. **L2 运行与验收层**：`dist/bidoda.app`（Windows 下为 `dist/bidoda/` 目录或安装后的程序）+ `verify.mjs`（产物内部断言）+ `REBRAND-REPORT.json` + 版本闸门。

数据流：**上游产物 → 换皮重放 → 产物验收 → 本地运行**；升级时回到第一步，用新版产物再跑一次完整链路。

### 2.2 「零改动」的准确含义

不是「一个文件都不碰」，而是：**改动集中、隔离、可重放、不与上游版本产生需人工合并的冲突**。品牌层只认 4 组稳定契约——产物目录结构、图标文件名、显示名字段、asar 内白名单文本。

**关键判据：品牌字样是中文，内部标识符是 ASCII。**
- 替换项（中文）：页面 `<title>`（`易标投标工具箱`→`bidoda`）、主窗口标题、侧栏 `易标` 文字、应用显示名。
- 一律不动（ASCII）：`window.yibiao`、`yibiao-asset`、`--yibiao-trial-hardware-acceleration`、`yibiao:plugins-changed`、`__yibiaoCheckRemoteNotice`、`v3.yibiao.pro`。
- **保留**（属上游官方服务，非我方品牌，改之误导）：`易标官方API`、`易标用户交流群二维码`、官方 GitHub 下载链接。
- 采用「先占位、后还原」保护机制，避免粗暴全局 `yibiao→bidoda` 替换把程序改坏。

### 2.3 升级重放四步

1. 取新版官方产物放入 `releases/`；**不点应用内检查更新**（其 `publish` 指向上游官方 Release，触发即把换皮冲掉）。
2. `--dry-run` 预览变更集，异常扩大说明上游结构变化，须复核 `brand.json`。
3. 正式重放 → `verify.mjs` 验收全绿才切版本指针。
4. 失败保留上一版（`bidoda.prev-<时间戳>` 移动保留，不删除）回滚。

### 2.4 防杂交总闸（最高优先级）

bidoda 永远是「某一确切上游版本 + 品牌换皮」的**原子镜像**，不存在第三种状态：
- **单一真相源**：`brand.json` 的 `versionLock.pinnedVersion` 锁定上游版本；运行实例靠 `BIDODA-PIN.json` 自报对应上游版本。
- **零补丁**：任何业务修正只能源于「重放换皮到新版上游」，绝不在 `vendor/` 原版或 `dist/` 产物里手改逻辑。
- **二进制决策**：上游发新版只有「全量采纳」或「整体阻断」两条路，禁止部分采纳/混装。
- **域同步闸门**：上游引入「议标／竞争性谈判／单一来源采购／询价」等非招标采购方式，未登记合规复核（`domainSyncPolicy.reviewedAndAdopted`）则升级默认阻断，绝不静默放行。
- **防杂交技术闸门**：`apply.mjs --freeze-baseline` 对官方原版建逐文件 sha256 基线，`verify.mjs` 升级后比对，任何预期外差异＝漂移＝杂交，默认阻断。

---

## 三、产品功能（全量继承上游）

| 类别 | 能力 |
|---|---|
| 主流程 | 选标书 → 生成设置 → 招标文件解析 → 目录 → 全局事实设定 → 生成正文导出 Word（六步固定流程；正文任务启动后生成设置锁定） |
| 需求解析 | 18 个预设解析项（项目信息、评分要求、无效标与废标项等） |
| 事实与知识 | 文档知识库（上传→解析→全库检索→勾选）、资信库（`valid_from`/`valid_to`）、全局事实设定 |
| 检查 | 标书查重、废标项检查、暗标合规检查（C# 确定性规则，含隐私/字体/页面/表格/一致性等） |
| 扩展场景 | 多标段/多阶段、商务标、可研报告、AI 生图、模板样式、图文混排、字数控制、插件系统、断点续跑 |
| 资源与在线 | 标讯、精选资源、官方账号（充值/开票/订单）、许可证与统计服务（由 Cloudflare Worker 提供） |
| 模型接入 | OpenAI-like API、ollama、LM Studio 等本地模型，**用户自配** |
| 更新 | 应用内自动更新（electron-updater）——**必须禁用** |

**能力边界**：功能/交互/生成质量/检查规则全部由上游版本决定；上游「怎么写」含允许模型补写缺失信息的档位，生成结果须人工复核数字、编号、名称、资质与业绩，**不得直接递交**；本产品不承诺中标、不输出任何中标率/胜率/概率。

---

## 四、引用的开源软件及功能介绍

### 4.1 上游主体（被复用方）

| 项目 | OpenBidKit / 易标投标工具箱 |
|---|---|
| 仓库 | https://github.com/FB208/OpenBidKit_Yibiao |
| 原作者 | mark / yibiaoai ｜ 版权 © 2025-2026 |
| 许可证 | GNU Affero General Public License v3.0 **only** |
| 归属依据 | NOTICE 声明为 AGPL §7(b) 要求保留的作者归属声明，重分发副本/修改版/对应源码均须保留 |

### 4.2 上游技术栈（实测，v2.31.7）

| 层 | 技术 | 作用 |
|---|---|---|
| 桌面框架 | **Electron 41.10.2** + electron-builder 26.8.1（`asar:true`） | 跨平台桌面壳；bidoda 的 Windows 安装包即基于此产物换皮 |
| 渲染层 | **React 19.1.1** + **Vite 7.1.7** + **TypeScript 5.9.2** | 前端 UI 与构建 |
| 主进程 | CommonJS（`electron/main.cjs`），Renderer 经 `window.yibiao` 调用 | 窗口/进程/IPC 主控 |
| 数据与任务 | **better-sqlite3 12.10.0**，配置存本地文件，耗时任务在 Main 后台运行并支持恢复 | 工作区数据库与任务调度 |
| 文档处理 | **.NET 10 Open XML 助手**（`openxmlhelper/`，C# 确定性规则）、**Docling / MinerU** 解析、`pdfjs-dist`、`docx`、`xlsx` | 招标文件解析、Word 导出、暗标合规检查 |
| Agent | **@earendil-works/pi-coding-agent 0.80.10** + **@modelcontextprotocol/sdk 1.32.1** | 标书生成智能体；依赖 `agent-tools`（fd/jq/rg）辅助命令 |
| 在线服务 | **Cloudflare Worker** | 公告、资源、插件、模型信息、许可证、统计 |
| 更新 | **electron-updater 6.8.3**（`publish` 指向上游官方 Release） | 应用内更新——已禁用 |
| 许可证 | AGPL-3.0-only + NOTICE | 合规红线 |

### 4.3 bidoda 换皮工程自带的工具/依赖

| 工具 | 用途 |
|---|---|
| `brand/brand.json` | 换皮唯一事实源（替换规则、保护串、版本锁、域同步策略） |
| `brand/apply.mjs` | 重放脚本：解压官方包→改名→换皮→重签名→生成报告；含 `--dry-run`/`--freeze-baseline`/`--selftest` |
| `brand/verify.mjs` | 验收脚本：断言落到产物**内部实际内容**（逐文件 sha256、品牌字样清除、ASCII 标识符仍存在、图标哈希一致、版本自报一致、域同步闸门） |
| `brand/make-icons.sh` | 由 CheersAI 源图生成各尺寸图标（保持上游原文件名） |
| `@electron/asar` | 读写 `app.asar`（Level 2 文本替换所需） |
| CJK 字体（容器场景） | 文泉驿 / Noto CJK，修复无中文字体导致的豆腐块乱码 |
| `codesign`（macOS）/ `rcedit`（Windows，见下） | 应用签名/图标资源改写 |

> 上游在线服务与官方账号入口照搬全部产品逻辑，内部自用不启用、不改动、不隐藏。

---

## 五、Windows 安装包构建与联调（对应 macOS 已验证路径）

### 5.1 路线选择

| 路线 | 输入 | 改动位置 | 适用 |
|---|---|---|---|
| **产物路线（推荐，与 macOS 同源）** | 官方预编译 Windows Release（`Yibiao-<版本>-win-x64.zip`） | 解压目录内的可执行体、图标、`resources/app.asar` | 最快本地可用；上游源码一行不动 |
| 源码路线（可选） | 上游 `client/` | `package.json` 的 `build` 字段与 3 个源文件 | 需自行 `npm run dist:win` 时 |

> Windows 上**无 Info.plist、无 Helper 包**（Helper 是 macOS 概念）。进程名来自主可执行体文件名，故 Windows 换牌比 macOS 更简单。

### 5.2 产物路线步骤（Windows 版 apply.mjs 待补，当前按 macOS 逻辑映射）

```bat
:: 1) 取官方 Windows 安装包（放进 releases/），例如
::    Yibiao-2.31.7-win-x64.zip
:: 2) 准备 CheersAI 方形 logo (PNG 1024x1024 透明底)
:: 3) 解压到 work/ 工作副本
:: 4) 改名：Yibiao.exe（或 易标投标工具箱.exe）→ bidoda.exe
::    （Windows 单 exe 承载所有进程类型，无需单独 Helper 包）
:: 5) 图标：用 rcedit 改写 exe 内嵌图标资源为 cheersai.ico（保持资源 ID，避免引用断链）
::    rcedit bidoda.exe --set-icon brand\assets\cheersai.ico
:: 6) asar 换皮（同 macOS Level 2）：对 resources/app.asar 白名单文本做
::    易标投标工具箱→bidoda、易标→bidoda；保留易标官方API/易标用户交流群二维码；
::    ASCII window.yibiao 等不动
:: 7) 放入合规文件：ACKNOWLEDGEMENTS.md / LICENSE / NOTICE 到 resources/ 或程序根
:: 8) 验收：逐文件 sha256 比对 + 品牌字样清除 + ASCII 标识符仍存在 + 版本自报一致
:: 9) 打包为安装包（见 5.4）
```

### 5.3 Windows 特有注意

- **可执行体改名 + 图标**：Windows 不像 macOS 有 plist，`CFBundleIdentifier` 概念不存在；改名后 Electron 的 `userData` 目录可能变化——若需保留既有配置，按上游 `appId` 约定处理（等同 macOS 保留 `CFBundleIdentifier` 的思路）。
- **图标改写**：用 `rcedit`（electron-builder 自带工具）改写 exe 内嵌图标；若暂不做图标替换，内部测试可先沿用上游图标，仅改文字与 exe 名。
- **签名**：内部测试可**不签名**（SmartScreen 会告警但可运行）；正式对内分发建议用自签名证书或企业代码签名证书做 Authenticode 签名。
- **agent-tools 缺失**：若 Windows 上 Pi Agent 报「常用命令目录不存在」，在 `resources/agent-tools/win-<arch>/bin/` 放入 `fd.exe`/`jq.exe`/`rg.exe`（上游仅发布 mac/win 版，须自备）。

### 5.4 安装包封装（NSIS / Inno Setup）

产物路线产出的是解压即可运行的绿色目录。要「安装包」形态，二选一：
- **电子 builder 自带**：若走源码路线，`npm run dist:win` 可直接产出 NSIS 安装包（`target: nsis`）。
- **产物路线手动封装**：用 NSIS 或 Inno Setup 把换皮后的 `dist/bidoda/` 目录打包为 `bidoda-<版本>-win-x64-setup.exe`，并把 LICENSE/NOTICE/ACKNOWLEDGEMENTS 作为安装附带的合规文件。

### 5.5 联调测试清单

1. 启动 `bidoda.exe`，确认主窗口标题、侧栏文字为 `bidoda`、界面无「易标」字样。
2. 在「设置」中自备 LLM 端点（OpenAI 兼容 / Ollama / LM Studio）+ key——**部署层无法代填**，这是 AI 标书生成等功能的必备前提。
3. 跑通主流程：选标书 → 生成设置 → 招标解析 → 目录 → 全局事实设定 → 生成正文 → 导出 Word。
4. 验证检查能力：标书查重、废标项检查、暗标合规检查。
5. 离线验证：断网后本地主流程与生成不依赖在线服务（在线功能降级但不影响生成导出）。
6. 验收脚本：运行 verify 等价断言（asar 逐文件 sha256、品牌字样清除、ASCII 标识符保留、版本自报一致、域同步闸门）。

---

## 六、合规边界（重申）

- 允许：同一法律主体内部使用、运行时系统名与 Logo 改为 bidoda / CheersAI。
- 不允许：对外销售、向其他组织或个人交付副本、把副本交外部承包商、向公众提供网络服务。
- 必须保留：上游 LICENSE / NOTICE / 原仓库链接 / 原作者 `mark`/`yibiaoai` 信息；不抹除归属、不声称完全自研；随安装包附带《归属与许可声明》。
- 形态若变（内网多人 Web、对外交付）须重评 AGPL-3.0 §13 并取得法务意见。

> 本文件为基于公开仓库 README/NOTICE 与本机实测整理的工程说明，不替代法律意见。

---

## 七、已知限制

| 项 | 说明 |
|---|---|
| asar 内构建产物形态未实测 | 渲染层 `.tsx` 经 Vite 打包后字符串形态可能与源码不同；首次拿到 Windows 包须用 `--dry-run` + verify 实测确认命中 |
| Windows 版 apply.mjs 待补齐 | 当前换皮脚本以 macOS 为基准，Windows 路径（exe 改名、rcedit 图标、NSIS 封装）需按 5.2 映射实现 |
| 在线服务依赖 | 公告/资源/插件市场/模型信息/许可证/统计由 Cloudflare Worker 提供，离线时这些入口可能不可用 |
| 官方账号与充值入口 | 上游内置，内部自用不启用；不改动、不隐藏 |
| 上游生成纪律 | 「怎么写＝胡咧咧」允许模型补写缺失信息，生成结果须人工复核 |
