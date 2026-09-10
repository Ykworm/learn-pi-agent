# 第 7 片 Go 对照：同一套两条信封，SDK 的 union 更吵

概念仍读 [../ts/07-responses.md](../ts/07-responses.md)。Go 只补：Responses 的 input 怎么用官方 SDK 拼，以及网页为什么**不必**再做一套 `--api` 旗标。

## 第 1 节：和 TS 对齐的部分

| TS | Go |
|----|----|
| `src/agent/responses.ts` | [`internal/agent/responses.go`](../../reconstruct-go/internal/agent/responses.go) |
| `RESPONSE_TOOLS` | [`tools.ResponsesTools`](../../reconstruct-go/internal/tools/run.go) |
| `eventsToResponsesInput` | [`session.EventsToResponsesInput`](../../reconstruct-go/internal/session/messages.go) |
| `{ type: "thinking"; text }` | [`events.Thinking`](../../reconstruct-go/internal/events/events.go) |
| `--api responses` | `go run ./cmd/cli --api responses "..."` |

CLI：

```bash
cd reconstruct-go
go run ./cmd/cli "列出当前目录"
go run ./cmd/cli --api responses "1+1 等于几？不要调工具"
```

F5 选 **Debug reconstruct-go CLI**。看 Responses 时把 `args` 改成 `--api`、`responses` 和那句问。断点打在 [`runResponsesTurn`](../../reconstruct-go/internal/agent/responses.go)。

## 第 2 节：形状差

1. **input 的类型。** TS 是 `ResponseInputItem[]`。Go 是 `responses.ResponseInputParam`（也就是 `[]ResponseInputItemUnionParam`）。user 用 `ResponseInputItemParamOfMessage`；工具结果自己填 `CallID` + `Output.OfString`。模型吐出来的 output item 用 `param.Override` 把原始 JSON 塞回下一轮 input，避免把 SDK 的 union 字段挨个抄一遍。
2. **`instructions`。** 和 TS 一样：system 不进 input 数组，每次 `Responses.New` 带上。Completions 仍把 system 放在 `messages[0]`。
3. **`ToParam` 丢掉 `reasoning_content`。** Completions 的 `msg.ToParam()` 只抄官方字段。有 think 时用 `SetExtraFields` 把 `reasoning_content` 挂回去，和 TS 的 `completionsAssistant` 同一件事。请求上也要 `SetExtraFields` 带 `thinking.enabled`，否则 DeepSeek 有时不回这段。还原走 [`EventsToMessages`](../../reconstruct-go/internal/session/messages.go)：`thinking` 事件挂到紧跟着的那条 assistant。
4. **Gin 不增加 `--api`。** 网页读的是配置里的 `api` 字段，会带上那一套 endpoint。要在调试页走 Responses，把 `config.local.json` 的 `api` 写成 `responses` 并填 `responses.apiKey`，不要给 POST body 再发明一个字段。每个请求仍是新 Agent；跨请求继续走 jsonl 头里的 `api`。

## 第 3 节：Gin

打开提示的地址。默认仍是 Completions 那一套 DeepSeek。若把 `api` 写成 `responses`，网页会走 `responses` 的 baseURL 和密钥。
