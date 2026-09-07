# AGENTS.md

给在本仓库写代码的人 / 助手。这不是原始 pi-agent 的 system prompt，**不要**把它读进模型上下文。

## 这是什么

从 0 推演 pi 首个提交里的 `packages/agent`。当前切片要对齐两份实现：

| 目录 | 语言 | 第 5 片入口 |
|------|------|-------------|
| [`reconstruct/`](reconstruct/) | TypeScript | CLI：`npx tsx src/cli.ts`；`--continue` 读最近一份 jsonl |
| [`reconstruct-go/`](reconstruct-go/) | Go | CLI：`go run ./cmd/cli`（同样 `--continue`）；调试再用 Gin 网页勾选继续 |

文档分开两夹：[`notes/ts/`](notes/ts/)（含第 0 片概念）、[`notes/go/`](notes/go/)（Go 实现差异）。概念只在 `notes/ts` 的 `00-*.md` 维护一份。

## 双端一起改

改 loop、工具、事件、配置语义、当前切片行为时：**TypeScript 和 Go 同一回合都改完**，不要只交一边。

- 文件职责对齐：`agent/loop`、`agent/agent`、`events`、`abort`（Go 在 `agent/interrupt.go`）、`session/manager`、`session/messages`、`renderers/console`（Go 在 `internal/render`）、`tools/read`、`tools/list`、`tools/bash`、`tools/glob`、`tools/rg`、`tools/run`、config 加载。
- 入口可以不同（TS 只有 CLI；Go 有 CLI，另加 Gin 网页方便调试），turn 语义必须相同：`user` 一次；有 `tool_calls` 就本机执行再请求；没有则结束。
- 事件语义必须相同：loop / `ask` 只 `emit`；听众数组全量 fan-out；不按 type 做中央路由。
- `config.json` 的 `baseURL` / `model` / `systemPrompt` 保持一致；Go 可多 `listen`。密钥只在 `config.local.json`，已 gitignore。
- 笔记：TS 行为写 `notes/ts`，Go 只写差异和启动 / 断点；交叉链接对方的 `05-session.md`。

## 代码怎么写

- 每个导出的类型 / 函数 / 文件头两句中文：**为什么存在**、**功能作用**。不复述语法。
- 按职责拆文件，一个文件一件主事。util 只放两处以上共用的逻辑。
- 精简。截断、abort、窄扩展点可以写。不要插件系统、空接口、用不上的抽象。
- 对照 `vendor/pi-mono-a74c5da`，不复制粘贴。不改 vendor。
- 只做当前切片。未开始的：Responses、TUI、`--json`、交互式多轮 REPL。

## 怎么讲、怎么想（教这个仓库时）

读者在学 harness，不是已经熟 Unix 和 Agent 行话。先弄清对方卡在哪一层，再讲；不要用对方没说过的对比当靶子。

- **两套词不要混。** 日常中文「工具 / 跑 rg」会把 Unix 命令和 LLM 的 function 叠在一起。分层时用领域词：function tool、tool schema、tool call、tool result、`runTool` switch、binary、exit code。`rg` 这个名字既是 ripgrep 这个 binary，也是 tool schema 里的 `name`；第一次出现要说清是哪一个。
- **按因果讲，不要倒着圆。** 先有 tool schema 里的 `name: "rg"`，才有 `case "rg"`，**tool call** 才会进 `runRg`，然后才是 spawn 和 exit code。不要先贴两行长得很像的 `spawn("bash", …)`，再解释「其实不是两种跑法」。
- **简单就说简单。** `runRg` 把 exit code 1 收成 `"No matches found"` 就是这段业务 if，不要说成 binary「自己处理错误」，也不要上升成架构。
- **不要否定自己刚发明的句子。** 对方没说「一个用 bash 跑、一个用 rg 跑」就不要先那么讲再澄清。分叉点是 `runTool` 的 switch，不是 spawn 像不像。
- **取消不是工具失败。** Ctrl+C 走 AbortSignal / `context`，事件是 `interrupted`。不要把 Interrupted 收成 `tool_result` + `isError`。原文 loop 的工具 `catch` 会吞掉，我们不抄。
- **Ctrl+C 不是 loop 听的。** 先有 `ask()` 里那一根 AbortController（Go：调用方传入的 `ctx`），CLI 的 SIGINT 才 `interrupt()` / cancel，然后同一根 signal 才进 Completions `create` 和 bash / rg 的 spawn。
- **例子要能对上对方刚跑出来的日志。** 用他们终端里的 tool call / 那句 `No matches found`，不要一上来甩完整 ripgrep CLI 手册。对方若还不熟 `find` / JSON schema，先别用 `{ pattern, path, flags }` 当跳板。

## 当前切片（第 5 片）

JSONL session。SessionManager 是听众，loop 只 `emit`；`--continue` 用 `eventsToMessages` 还原 Completions 的 `messages`。不把 `apiKey` 写进文件。Gin 每个请求仍是新 Agent，跨请求接着问也走同一份 jsonl。

## 不要做的

- 不要把本文件、`AGENTS.md`、项目 README 注入给模型当 system prompt（那是原始 pi 刻意避免的「背后塞上下文」）。
- 不要提交 `config.local.json`、`.env`、API 密钥。
- 不要超前写第 6–7 片。
