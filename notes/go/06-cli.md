# 第 6 片 Go 对照：同一套三种皮，Ask 期间用 goroutine 读 stdin

概念仍读 [../ts/06-cli.md](../ts/06-cli.md)。Go 只补：阻塞的 `Ask` 怎么在跑的时候仍能收到 `interrupt` 命令，以及网页为什么**不必**再做一套 REPL。

## 第 1 节：和 TS 对齐的部分

| TS | Go |
|----|----|
| `src/renderers/json.ts` | [`internal/render/json.go`](../../reconstruct-go/internal/render/json.go) |
| `{ type: "error"; message }` | [`events.Error`](../../reconstruct-go/internal/events/events.go) |
| `npx tsx src/cli.ts` | `go run ./cmd/cli` |
| `runConsoleInteractive` | [`runConsoleInteractive`](../../reconstruct-go/cmd/cli/repl.go) |
| `runJsonInteractive` | [`runJSONInteractive`](../../reconstruct-go/cmd/cli/repl.go) |

CLI：

```bash
cd reconstruct-go
go run ./cmd/cli --help
go run ./cmd/cli "列出当前目录"
go run ./cmd/cli
go run ./cmd/cli --json "1+1 等于几？不要调工具"
printf '%s\n' '{"type":"message","content":"1+1 等于几？不要调工具"}' | go run ./cmd/cli --json
```

F5 选 **Debug reconstruct-go CLI**。看 `--json` 时把 `args` 改成 `--json` 和那句问。断点打在 [`Json.On`](../../reconstruct-go/internal/render/json.go)。

## 第 2 节：形状差

1. **没有 `Agent.Interrupt()`。** TS 的 `ask()` 自己握着 `AbortController`，CLI 调 `interrupt()`。Go 的 `Ask` 吃调用方传入的 `ctx`。单次和终端 REPL 用 `signal.NotifyContext`；JSON 交互把 `context.WithCancel` 的 `cancel` 存起来，stdin 上的 `interrupt` 当场调用它。
2. **JSON 交互必须另起 goroutine 读 stdin。** `Ask` 是同步堵住的。若主 goroutine 一边 `Ask` 一边 `Scan`，`interrupt` 那一行要等当前问完才能读到。所以：读 stdin 的 goroutine 解析命令；`message` 丢进带缓冲的 channel；`interrupt` 直接 `cancel()`。TS 靠 readline 的 `line` 回调，看起来像同线程，其实 `ask()` 在 await，事件循环还能收下一行。
3. **终端 REPL 的 Ctrl+C。** 只在 `Ask` 期间 `NotifyContext`。提示符上没人 listen，默认 SIGINT 结束进程。和 TS readline 在提示符上 `close()` 是同一件事。
4. **`token_usage` 里的 0。** TS 的 `JSON.stringify` 会留下 `"cacheWriteTokens":0`。Go 的字段带 `omitempty`，0 不会出现在 stdout 那一行里。这是同一份 `Event` 结构体从第 5 片 jsonl 带来的，本片不改。

## 第 3 节：Gin 不改

网页每个 POST 仍是新 Agent、一句 `Ask`、响应里带回这一次的 `events`。接着问勾选继续，走 jsonl，不是 CLI 那种进程内循环。本片不把 `--json` 协议搬到 HTTP 上。
