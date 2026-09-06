# 第 2 片 Go 对照：同一条总线，CLI 当场印，Gin 先收齐

概念仍读 [../ts/02-events.md](../ts/02-events.md)。Go 只补事件的形状差、以及调试页怎么看见 fan-out。

## 第 1 节：和 TS 对齐的部分

| TS | Go |
|----|----|
| `src/events.ts` | [`internal/events/events.go`](../../reconstruct-go/internal/events/events.go) |
| `src/renderers/console.ts` | [`internal/render/console.go`](../../reconstruct-go/internal/render/console.go) |
| `new Agent(cfg, new ConsoleRenderer())` | `agent.New(cfg, render.Console{})` |
| `ask(): Promise<void>` | `Ask(...) error` |

CLI：

```bash
cd reconstruct-go
go run ./cmd/cli "请用 echo 工具重复：hello"
```

F5 选 **Debug reconstruct-go CLI**，断点打在 [`events.go`](../../reconstruct-go/internal/events/events.go) 的 `Emit`，或 [`loop.go`](../../reconstruct-go/internal/agent/loop.go) 里第一次 `events.Emit`。

## 第 2 节：Go 没有联合类型

TS 的 `AgentEvent` 是按 `type` 收窄的联合。Go 用一个 `Event` 结构体，`Type` 当判别字段，构造函数只填该 type 用得到的字段。JSON 标签与 TS 对齐（`toolCallId`、`isError`），方便以后第 5 片写同一份 jsonl。

`isError` 用 `*bool`，这样 `false` 也会进 JSON；若写成 `bool` 加 `omitempty`，成功的 `tool_result` 会把这个字段吞掉。

## 第 3 节：Gin 上的两个听众

CLI 的 `On` 在工具执行当下就 `fmt.Println`，所以终端是「直播」。

网页不能在 loop 里直接写浏览器：`POST /ask` 仍是一次请求一次响应，不是 SSE。所以 [`server.go`](../../reconstruct-go/internal/httpserver/server.go) 挂了两个听众：

1. **收集器**：把事件攒进切片，响应里带回 `events` 和从中取出的终答 `text`
2. **Console**：同一条事件再打到跑 `go run ./cmd/server` 的那个终端

这就是数组 fan-out：loop 仍然不知道有几个听众。浏览器里看完整列表；服务器终端看和 CLI 一样的打印。

```bash
cd reconstruct-go
go run ./cmd/server
```

打开 `http://127.0.0.1:8080/`，发送后对照页上的 JSON 和终端输出。

## 第 4 节：本片故意没有的

和 TS 第 2 片一样：JSONL、`--json`、中断、`read` / `bash`。没有把 Gin 改成流式推送。
