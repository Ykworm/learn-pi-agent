# 本目录是什么

只读快照。不要改这里的文件，不要整仓抄进 `reconstruct/`。

这是 [earendil-works/pi](https://github.com/earendil-works/pi) 的 Git tag **`v0.85.1`**：

- 提交：`d981de1229ef899957bbe968bc8dcda02a21f477`
- 日期：2026-09-05
- 说明：`Release v0.85.1`

冻结时 npm 上 `@earendil-works/pi-coding-agent` 的 latest 就是这一版。对照课的标本仍是 [`../pi-mono-a74c5da/`](../pi-mono-a74c5da/)（2025-08 首个提交）；本目录只用来看「一年后的产品长什么样」。

稀疏快照，没有 TUI、没有测试、没有 `evals`：

| 路径 | npm 名 | 看什么 |
|------|--------|--------|
| [`packages/agent/`](packages/agent/) | `@earendil-works/pi-agent-core` | 今天的 Agent 运行时 |
| [`packages/ai/`](packages/ai/) | `@earendil-works/pi-ai` | 多家模型供应商 |
| [`packages/coding-agent/`](packages/coding-agent/) | `@earendil-works/pi-coding-agent` | CLI、`--mode rpc`、工具、session |
| [`packages/server/`](packages/server/) | `@earendil-works/pi-server` | 实验：本机 Unix socket 服务端 |
| [`packages/protocol/`](packages/protocol/) | `@earendil-works/pi-protocol` | 实验：CBOR 帧 |
| [`packages/client/`](packages/client/) | `@earendil-works/pi-client` | 实验：连上面那个 server |
| [`packages/chord/`](packages/chord/) | `@earendil-works/chord` | 实验协议里的 service 信封 |
| [`packages/session-backends/`](packages/session-backends/) | SQLite session 后端 | 可选持久化 |

`pi-server` / `pi-protocol` / `pi-client` **没有打进正式 `pi` 二进制**。日常嵌入仍是 `pi --mode rpc`（stdin/stdout JSONL）。网页包不在这一版里，继续看 [`../pi-web-ui-0.75.3/`](../pi-web-ui-0.75.3/)。

分层说明（L1–L5 组件 + 图）：[`notes/ts/pi-v0.85.1-layers.md`](../../notes/ts/pi-v0.85.1-layers.md)。
