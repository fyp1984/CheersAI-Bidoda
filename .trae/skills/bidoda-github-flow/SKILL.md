---
name: bidoda-github-flow
description: 按已固化的 GitHub 链路交付 CheersAI-Bidoda 代码 —— 经本地代理提交、经 MCP GitHub 通道开 PR 并合并到 main、合并后清理分支（清理前二次确认）。当需要推送本地改动、发起或合并 PR、同步本地 main、排查 GitHub 连接与推送问题时使用。不用于创建仓库、管理 Issue、配置 Actions 或改动业务代码。
---

# bidoda GitHub 交付流程（提交 → PR → 合并 → 收尾）

本工程位于 `d:\workspace\CheersAI\CheersAI-Bidoda`，远端 `origin` = `https://github.com/fyp1984/CheersAI-Bidoda.git`，主干 `main`。**所有改动一律走「功能分支 → PR → 合并 main」**，禁止直接 push 到 `main`。

**边界**：本 Skill 只覆盖「把本地改动送到远端并合入 main」的这一条链路。不用于建仓库、管 Issue、配 Actions、改业务代码。

> 事实来源：2026-11-13 的 PR #5 实际交付（分支 `chore/upstream-skill-brand-official-deepseek`，合并提交 `b04fee8`）逐条固化。

## 1. 链路前提（先确认，再动手）

| 环节 | 事实 | 若不符则 |
| --- | --- | --- |
| 网络出口 | 直连 `github.com:443` 超时或被重置；本机代理端口 `127.0.0.1:10801`（Windows 系统代理已启用） | 见第 7 节故障排查 |
| Git 代理 | 已全局配置 `http.proxy` / `https.proxy` = `http://127.0.0.1:10801` | `git config --global --get-regexp proxy` 复核；缺失则补配 |
| Git 身份 | **未配置** `user.name` / `user.email`；历史作者统一为 `西北人 <fyp1984@yeah.net>` | 用 `-c` 单次传入（见 3.3），**不要**写入全局配置 |
| PR 通道 | 本机**未安装** `gh` CLI | 用 MCP 工具 `mcp_GitHub_*`（见第 5 节） |
| 推送凭据 | 系统凭据助手 `credential.helper=manager`，凭据已缓存 | 首次可能弹窗，属正常 |

```powershell
# 一次跑完前置自检
git -C d:\workspace\CheersAI\CheersAI-Bidoda config --global --get-regexp proxy
Test-NetConnection -ComputerName 127.0.0.1 -Port 10801 -InformationLevel Quiet
git -C d:\workspace\CheersAI\CheersAI-Bidoda status -sb
```

## 2. 交付流程总览

```text
0 预检 → 1 同步 main → 2 建分支 → 3 提交 → 4 推送 → 5 开 PR → 6 查可合并性并合并 → 7 同步本地 → 8 清理分支（二次确认）
```

## 3. 提交前准备

### 3.0 预检

```powershell
git status -sb            # 确认在 main、工作区状态符合预期
git diff --stat           # 确认改动清单与预期一致
git rev-parse --abbrev-ref HEAD
```

### 3.1 先把本地 main 对齐远端

避免基于过期 main 开分支导致 PR 冲突。

```powershell
git fetch origin --prune
git checkout main
git pull --ff-only origin main
```

### 3.2 建功能分支

命名沿用仓库既有约定（`feature/bidoda-shell-import`、`chore/brand-display-name-zh`、`feat/anti-hybrid-baseline-gate`）：

| 类型 | 前缀 | 用途 |
| --- | --- | --- |
| 新能力 | `feat/` | 新增功能 |
| 杂项 / 品牌 / 文档 | `chore/` | 非功能性改动 |
| 缺陷修复 | `fix/` | 修复 |

```powershell
git checkout -b chore/<slug>
```

### 3.3 暂存并提交

- **显式列出文件**，不用 `git add -A` / `git add .`，避免误纳敏感文件与临时产物。
- 提交身份用 `-c` 单次传入，行为与历史提交一致，且不污染 Git 配置。

```powershell
git add .trae/skills/<skill>/SKILL.md brand/brand.json
$msg = @'
chore(brand): <一句话中文摘要>

- <要点 1>
- <要点 2>
'@
git -c user.name="西北人" -c user.email="fyp1984@yeah.net" commit -m $msg
```

**提交信息规范**（Conventional Commits + 中文正文，对齐仓库历史）：

- 首行 `<type>(<scope>): <中文摘要>`，`type` ∈ `feat` / `fix` / `chore` / `docs`。
- 正文用 `-` 列表，写「**为什么改**」与关键锚点/文件，不复制 diff。
- 一个 PR 只解决一件事；同主题改动合并为一个 commit，避免噪音。

### 3.4 推送分支

```powershell
git push -u origin chore/<slug>
```

成功时远端会回显建 PR 的入口链接 `https://github.com/fyp1984/CheersAI-Bidoda/pull/new/<branch>`，可作兜底。

## 4. 验收（推送后、开 PR 前自查）

| 检查 | 命令 | 期望 |
| --- | --- | --- |
| 分支已跟踪远端 | `git status -sb` | `## <branch>...origin/<branch>`（无 ahead/behind） |
| 与远端一致 | `git rev-parse HEAD origin/<branch>` | 两个哈希相同 |
| 工作区干净 | `git status --porcelain` | 无输出 |
| 代理生效 | `git fetch origin --prune` | 退出码 0 |

## 5. 开 PR 与合并（MCP GitHub 通道）

`gh` 未安装，改用 MCP 工具。先用 `ToolSearch` 载入以下三个工具，再用 `DeferExecuteTool` 调用：

| 工具 | 用途 |
| --- | --- |
| `mcp_GitHub_create_pull_request` | 建 PR |
| `mcp_GitHub_get_pull_request` | 查 PR 状态与 base/head sha |
| `mcp_GitHub_merge_pull_request` | 合并 PR |

```jsonc
// mcp_GitHub_create_pull_request
{ "owner": "fyp1984", "repo": "CheersAI-Bidoda",
  "title": "<与 commit 首行同口径>",
  "head": "chore/<slug>", "base": "main",
  "body": "## 变更内容\n\n### 1. ...\n\n## 验证\n- <验收证据>" }
```

**合并前先判定冲突**：调 `mcp_GitHub_get_pull_request`，比较 `head.sha` 与 `base.sha` —— `head` 是 `base` 的直系后代（`git merge-base --is-ancestor <head> <base>` 为真）即无冲突。有冲突则先合并 main 回分支后重推，**不得强推**。

```jsonc
// mcp_GitHub_merge_pull_request（沿用仓库历史的 merge commit 风格）
{ "owner": "fyp1984", "repo": "CheersAI-Bidoda", "pull_number": 5,
  "merge_method": "merge",
  "commit_title": "Merge pull request #5 from fyp1984/chore/<slug>" }
```

合并成功后记录返回的 `sha`（即 main 上的合并提交）。

## 6. 合并后收尾

### 6.1 同步本地 main

```powershell
git checkout main
git fetch origin --prune
git pull --ff-only origin main
git status -sb                  # 期望：## main...origin/main（无 ahead/behind）
git rev-parse HEAD origin/main  # 期望：两个哈希相同
git log --oneline -5
```

### 6.2 清理分支（**删除前必须二次确认**）

规则：

1. 合并完成后分支即无用 —— 其提交已是 `main` 的祖先（`git merge-base --is-ancestor <branch> main` 为真，`git log main..<branch>` 为空）。
2. 但**删除动作需二次确认**：先向用户说明「分支内容已并入 main、本地/远端将被删除、远端可 Restore」，得到明确同意后再执行。一次确认只覆盖一次删除。
3. 本地删除用 `-d`（未合并会被拒绝，天然安全），**不要**用 `-D`。
4. 远端删除同样需确认；删除后本地跑 `git fetch origin --prune` 清掉过期引用。

```powershell
# 确认分支已无独有提交
git merge-base --is-ancestor chore/<slug> main   # 退出码 0 = 已并入
git log main..chore/<slug> --oneline             # 期望：空

# 得到用户二次确认后执行
git branch -d chore/<slug>
git push origin --delete chore/<slug>
git fetch origin --prune
```

## 7. 故障排查

| 现象 | 原因 | 处置 |
| --- | --- | --- |
| `Failed to connect to github.com:443` / `Recv failure: Connection was reset` | 直连被阻断 | 确认 `127.0.0.1:10801` 存活；确认 `http.proxy` 已配。代理未启动时临时绕过 `git -c http.proxy= pull` |
| 浏览器能上、`git` 不通 | Git 不读 Windows 系统代理 | 必须显式 `git config --global http.proxy ...` |
| `Author identity unknown` | 未配置 Git 身份 | 用 `-c user.name="西北人" -c user.email="fyp1984@yeah.net"` 重跑 commit |
| `gh: 无法将“gh”项识别为...` | `gh` CLI 未安装 | 走 MCP `mcp_GitHub_*`，不要为单次交付去装 `gh` |
| `LF will be replaced by CRLF` | Windows 换行转换 | 仅警告，可忽略 |
| 推送要求登录 | 凭据未缓存 | 让 `credential.helper=manager` 弹窗完成一次授权 |
| 代理完全不可用且必须拉取 | 应急通道 | 用镜像 `https://gh-proxy.com/https://github.com/...` **仅拉取**（见红线） |

## 8. 红线

| 项 | 理由 |
| --- | --- |
| 直接 `git push origin main` | 破坏 PR 评审与历史可追溯性；仓库历史全部为 PR 合并 |
| `git push --force` / `--force-with-lease` | 改写远端历史，可能覆盖他人提交 |
| 用 `git add -A` / `git add .` | 易把 `.env`、凭据、临时产物与 `work/` 大文件带入提交 |
| 把 token / 密码交给第三方镜像反代 | 公共反代可见凭据；镜像**只用于公有仓库拉取** |
| 把 `user.name` / `user.email` 写进全局配置 | 本仓库约定用 `-c` 单次传入，避免污染其他项目 |
| 未经二次确认删除分支 | 用户明确要求删除动作需二次确认 |
| 删除 `vendor/baselines/`、`brand/ACKNOWLEDGEMENTS.md`、`LICENSE` / `NOTICE` | 属工程红线资产（见 `bidoda-upstream-customization` Skill） |
| 在未同步 main 的情况下开分支并提交 | 会造成 PR 冲突或基于过期基线 |

## 9. 维护规则

流程中任一项固化事实发生变化（代理端口、远端地址、身份口径、PR 通道、合并方式、分支命名约定），**必须同步修订本 Skill 第 1 节事实表与对应步骤**，否则下一次交付会照抄过期口径。改动本 Skill 后，按第 4 节验收「工作区干净 + 与远端一致」再走一次本流程提交。
