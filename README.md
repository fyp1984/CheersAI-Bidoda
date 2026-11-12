# bidoda-shell

bidoda 的品牌换皮工程：完整复用开源项目 [OpenBidKit / 易标投标工具箱](https://github.com/FB208/OpenBidKit_Yibiao) 的全部代码与产品逻辑，上游源码与业务逻辑零改动，本工程只维护品牌清单与重放脚本。**仅内部自用，不对外销售、不对外分发。**

## 目录

| 路径 | 内容 |
|---|---|
| `brand/brand.json` | 品牌替换的唯一事实源（替换项、保护项、白名单、验收断言、升级策略） |
| `brand/apply.mjs` | 换皮重放脚本（支持 `--dry-run`、`--level 1/2`、产物路线与源码路线） |
| `brand/verify.mjs` | 产物验收脚本，断言落到 asar 内部逐文件 sha256 与标识符保留 |
| `brand/make-icons.sh` | 由 cheersai 源 logo 生成 `.icns` / `.ico` / 各尺寸 png |
| `brand/ACKNOWLEDGEMENTS.md` | AGPL-3.0 归属与许可声明，随产物保留 |
| `brand/README.md` | 本地运行、升级、合规与排障手册 |
| `releases/` | 上游官方安装包（本地浏览器下载后放入） |
| `vendor/` | 上游源码只读基线（当前为一次中断克隆的残留，见手册第六节） |
| `work/` | 解压与 asar 中间产物 |
| `dist/` | `bidoda.app` 与 `REBRAND-REPORT.json` |

## 快速开始

```bash
npm install --no-save @electron/asar
bash brand/make-icons.sh                       # 需先放 brand/assets/cheersai-logo.png
node brand/apply.mjs --selftest               # 替换规则自证，必须全绿
node brand/apply.mjs --zip <上游 zip> --dry-run
node brand/apply.mjs --zip <上游 zip>
node brand/verify.mjs                         # 全绿才可使用
open dist/bidoda.app
```

完整步骤见 `brand/README.md`。

## 文档基线

产品需求与技术方案位于文档空间：

- `02-需求分析/bidoda-产品PRD-V3.0-2026-11-10.md`
- `03-架构与设计/bidoda-技术方案-V5.0-2026-11-10.md`

历史基线已整体归档，取代关系见 `08-归档/归档说明.md` 第五节。旧代码仓 `/Users/FYP/Documents/WorkSpace/bidoda/` 冻结保留，不删除、不修改。
