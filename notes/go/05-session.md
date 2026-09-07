# 第 5 片 Go 对照：同一份 jsonl 形状，Gin 每个请求仍是新 Agent

概念仍读 [../ts/05-session.md](../ts/05-session.md)。Go 只补文件放哪、`messages` 怎么用 SDK 构造，以及网页为什么**必须**靠磁盘才能跨请求接着问。

## 第 1 节：和 TS 对齐的部分

| TS | Go |
|----|----|
| `src/session/manager.ts` | [`internal/session/manager.go`](../../reconstruct-go/internal/session/manager.go) |
| `src/session/messages.ts` | [`internal/session/messages.go`](../../reconstruct-go/internal/session/messages.go) |
| `{ type: "session_start"; ... }` | [`events.SessionStart`](../../reconstruct-go/internal/events/events.go) |
| `restoreFromEvents` | [`Agent.RestoreFromEvents`](../../reconstruct-go/internal/agent/agent.go) |
| `npx tsx src/cli.ts --continue "…"` | `go run ./cmd/cli --continue "…"` |

CLI：

```bash
cd reconstruct-go
go run ./cmd/cli "列出当前目录"
ls .sessions
go run ./cmd/cli --continue "刚才 list 看到了哪些名字？不要再调工具"
```

文件在 [`reconstruct-go/.sessions/`](../../reconstruct-go/.sessions/)，不要和 TypeScript 的 `reconstruct/.sessions` 混着用 `--continue`。格式对齐，目录分开。

F5 选 **Debug reconstruct-go CLI**，第二句把 `args` 改成 `--continue` 和追问。断点打在 [`EventsToMessages`](../../reconstruct-go/internal/session/messages.go)。

## 第 2 节：形状差

1. **带 `tool_calls` 的 assistant。** TS 是一个普通对象 `{ role: "assistant", tool_calls: [...] }`。Go 的 SDK 要填 `ChatCompletionAssistantMessageParam.ToolCalls`，再放进 `ChatCompletionMessageParamUnion{OfAssistant: &param}`。终答仍用 `openai.AssistantMessage(text)`。
2. **网页每个请求 `New` 一个 Agent。** 内存里没有跨 POST 的 `messages`。勾选「继续上一次 session」走的是和 CLI `--continue` 同一条路：读 jsonl → `RestoreFromEvents` → `Ask`。不勾选就新建文件。这不是另一种 session，只是调试页把旗标暴露成 checkbox。
3. **写盘是同步的。** TS 的 `on` 返回 Promise，里面其实是 `appendFileSync`。Go 的 `On` 直接 `OpenFile` 追加。失败打到 stderr，`Receiver.On` 没有 error 返回值。

## 第 3 节：Gin

打开提示的地址。先发一句「列出当前目录」，再勾选继续、问「刚才看到了哪些名字」。页上的 `events` 仍是**这一次** POST 新发出的；旧事件在 `.sessions` 文件里，不重复画到网页上（那是 TUI 的事）。
