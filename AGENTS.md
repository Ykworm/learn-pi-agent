# AGENTS.md

给在本仓库写代码的人 / 助手。这不是原始 pi-agent 的 system prompt，**不要**把它读进模型上下文。

## 这是什么

从 0 推演 pi 首个提交里的 `packages/agent`。当前切片要对齐两份实现：

| 目录 | 语言 | 第 2 片入口 |
|------|------|-------------|
| [`reconstruct/`](reconstruct/) | TypeScript | CLI：`npx tsx src/cli.ts`（打印由 ConsoleRenderer 做） |
| [`reconstruct-go/`](reconstruct-go/) | Go | CLI：`go run ./cmd/cli`；调试再用 Gin 网页看事件列表 |

文档分开两夹：[`notes/ts/`](notes/ts/)（含第 0 片概念）、[`notes/go/`](notes/go/)（Go 实现差异）。概念只在 `notes/ts` 的 `00-*.md` 维护一份。

## 双端一起改

改 loop、工具、事件、配置语义、当前切片行为时：**TypeScript 和 Go 同一回合都改完**，不要只交一边。

- 文件职责对齐：`agent/loop`、`agent/agent`、`events`、`renderers/console`（Go 在 `internal/render`）、`tools/echo`、`tools/run`、config 加载。
- 入口可以不同（TS 只有 CLI；Go 有 CLI，另加 Gin 网页方便调试），turn 语义必须相同：`user` 一次；有 `tool_calls` 就本机执行再请求；没有则结束。
- 事件语义必须相同：loop / `ask` 只 `emit`；听众数组全量 fan-out；不按 type 做中央路由。
- `config.json` 的 `baseURL` / `model` / `systemPrompt` 保持一致；Go 可多 `listen`。密钥只在 `config.local.json`，已 gitignore。
- 笔记：TS 行为写 `notes/ts`，Go 只写差异和启动 / 断点；交叉链接对方的 `02-events.md`。

## 代码怎么写

- 每个导出的类型 / 函数 / 文件头两句中文：**为什么存在**、**功能作用**。不复述语法。
- 按职责拆文件，一个文件一件主事。util 只放两处以上共用的逻辑。
- 精简。截断、abort、窄扩展点可以写。不要插件系统、空接口、用不上的抽象。
- 对照 `vendor/pi-mono-a74c5da`，不复制粘贴。不改 vendor。
- 只做当前切片。未开始的：JSONL、中断、`read`/`bash`、Responses、TUI、`--json`。

## 当前切片（第 2 片）

Completions loop + `echo` + 事件总线。loop 不打印；CLI 挂 ConsoleRenderer。Go 的 Gin 再挂一个收集器，响应里带回事件列表。

## 不要做的

- 不要把本文件、`AGENTS.md`、项目 README 注入给模型当 system prompt（那是原始 pi 刻意避免的「背后塞上下文」）。
- 不要提交 `config.local.json`、`.env`、API 密钥。
- 不要超前写第 3–7 片。
