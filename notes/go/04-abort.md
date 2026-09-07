# 第 4 片 Go 对照：同一根 cancel，CLI 用 `NotifyContext`，没有 `interrupt()` 方法

概念仍读 [../ts/04-abort.md](../ts/04-abort.md)。Go 只补 `AbortController` 换成 `context` 之后，controller 放在哪、子进程怎么杀。

## 第 1 节：和 TS 对齐的部分

| TS | Go |
|----|----|
| `src/abort.ts` | [`internal/agent/interrupt.go`](../../reconstruct-go/internal/agent/interrupt.go) 的 `ErrInterrupted` |
| `{ type: "interrupted" }` | [`events.Interrupted()`](../../reconstruct-go/internal/events/events.go) |
| `ask()` 里 `new AbortController()` | CLI / Gin **调用方**传入可 cancel 的 `ctx`；`Ask` 不再自建 |
| `agent.interrupt()` | 没有这个方法。CLI：`signal.NotifyContext`；Gin：`c.Request.Context()` |
| `create(..., { signal })` | `Chat.Completions.New(ctx, ...)` |
| `spawn({ signal })` | `exec.CommandContext(ctx, ...)` |
| `ask()` 吞 `Interrupted` | `Ask` 把 `ErrInterrupted` 收成 `nil` |

CLI：

```bash
cd reconstruct-go
go run ./cmd/cli "用 bash 跑 sleep 30，不要自己编结果"
```

看到 `[tool] bash(...)` 之后 Ctrl+C，应印 `[interrupted]`。F5 选 **Debug reconstruct-go CLI**，把 `args` 改成这句，断点打在 [`abortTurn`](../../reconstruct-go/internal/agent/loop.go)。

## 第 2 节：形状差

1. **controller 在谁手里。** TS 的 `AbortController` 是 `Agent` 字段，CLI 只能通过 `interrupt()` 碰它。Go 的 cancel 是 `context` 的惯例：谁调 `Ask`，谁提供 `ctx`。CLI 用 `signal.NotifyContext` 包住 `Ask`；网页用请求自带的 `ctx`（关标签 / 断开连接会 cancel）。语义仍是「这一 turn 一根取消通道」。
2. **没有 `interrupt()`。** 再包一层只为模仿 TS 的方法名，没有第二处调用方需要它。第 6 片若做交互式 CLI，再在 `Agent` 上留 cancel 也可以。
3. **子进程。** 对应 TS 的 `spawn("bash", ["-c", command], { signal })`。Go 是 `exec.CommandContext(ctx, "bash", "-c", command)`：`ctx` 取消时杀掉这个进程。第 1 节用 `sleep 30` 试 Ctrl+C，能停掉的就是这一下。没有 `CommandContext`，`NotifyContext` 只停得了 HTTP，`sleep` 还在跑。`RunBash` / `RunRg` 先看 `ctx.Err()`，有则把 cancel 交回 loop，不要当成 `bash` 非 0 或 `rg` 的字符串错误。
4. **Gin。** [`server.go`](../../reconstruct-go/internal/httpserver/server.go) 本来就把 `c.Request.Context()` 传进 `Ask`。客户端断开时 loop 走同一条 `abortTurn`。`Ask` 吞掉 `ErrInterrupted` 后，HTTP 仍是 200，JSON 的 `events` 里会有 `interrupted`，`text` 可能为空。

## 第 3 节：本片故意没有的

和 TS 一样：JSONL 见 [05-session.md](05-session.md)；TUI Escape、`--json` 仍未做。没有把 Gin 改成 SSE 流式推 `interrupted`。
