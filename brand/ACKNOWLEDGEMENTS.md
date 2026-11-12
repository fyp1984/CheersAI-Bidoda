# 归属与许可声明 / Acknowledgements

**投标智囊团（工程代号 bidoda）是开源项目 OpenBidKit / 易标投标工具箱 的内部自用品牌封装，不是自研产品。**

| 项 | 内容 |
|---|---|
| 品牌封装 | 投标智囊团（工程代号 `bidoda`） |
| 出品方与技术支持 | CheersAI |
| 上游项目 | OpenBidKit / 易标投标工具箱 |
| 原始仓库 | https://github.com/FB208/OpenBidKit_Yibiao |
| 原作者 | mark / yibiaoai |
| 版权 | Copyright (C) 2025-2026 mark / yibiaoai |
| 许可证 | GNU Affero General Public License v3.0 only |
| 归属依据 | 上游 NOTICE 声明其为 AGPL-3.0 第 7(b) 条下要求保留的作者归属声明，在重新分发的副本、修改版本和对应源代码中均必须保留 |

## 使用边界

- 本封装**仅在同一法律主体内部使用**，不对外分发、不对外销售、不向公众提供网络服务。
- 不抹除上游归属，不声称完全自研；运行时系统名与 Logo 替换为「投标智囊团」（英文代号 `bidoda`）/ CheersAI，但上述归属信息、LICENSE 与 NOTICE 一律保留。
- 若未来改为对外分发、交付客户副本、或提供多人网络访问，须重新评估 AGPL-3.0 第 13 条的源码提供义务并取得法务意见。

## 改动范围

本封装**未改动上游任何业务逻辑**：仅替换中文品牌字样、应用显示名与图标资源，并禁用应用内自动更新。全部替换项集中在 `brand/brand.json`，由 `brand/apply.mjs` 重放，`brand/verify.mjs` 校验。所有 ASCII `yibiao` 技术标识符（`window.yibiao`、`yibiao-asset` 等）保持原样，改动它们会破坏功能。

本文件为依据上游公开仓库 README 与 NOTICE 整理的工程合规说明，不替代法律意见。
