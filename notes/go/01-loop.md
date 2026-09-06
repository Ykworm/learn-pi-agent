# 第 1 片 Go 对照：同一套 loop，入口可以是 CLI 或 Gin

概念仍读 [../ts/00-completions-turn.md](../ts/00-completions-turn.md) 和 [../ts/01-loop.md](../ts/01-loop.md)。Go 只补启动、断点、以及和 TS 不同的 SDK 形状。

[`reconstruct-go/`](../../reconstruct-go) 里 turn 语义与 TS 相同：有 `tool_calls` 就本机执行再请求 DeepSeek。HTTP 客户端是官方 [`openai-go`](https://github.com/openai/openai-go)，不是社区库 `sashabaranov/go-openai`。

## 第 1 节：日常请用 CLI（不用 curl）

和 `npx tsx src/cli.ts "一句"` 对齐：

```bash
cd reconstruct-go
go run ./cmd/cli "请用 echo 工具重复：hello"
```

F5 选 **Debug reconstruct-go CLI**，会立刻进 `Ask` / loop，不必再发 HTTP。

Gin 还在：给「服务器 + 浏览器」调试用，不是日常提问方式。

| TS | Go |
|----|----|
| `reconstruct/src/cli.ts` | `cmd/cli/main.go` |
| （无内置网页） | `cmd/server` + 浏览器 `GET /` |
| `agent/loop.ts` | `internal/agent/loop.go` |

每个 CLI 进程、每个 `POST /ask` 都 `agent.New` 一次，不跨请求记对话。

## 第 2 节：要看 Gin / 在浏览器里问

```bash
cd reconstruct-go
go run ./cmd/server
```

浏览器打开 `http://127.0.0.1:8080/`，在文本框里输入后点发送。密钥规则与 TS 相同：`config.local.json` 或 `../reconstruct/config.local.json`。

## 第 3 节：如何断点

**问一句就停：** F5 → **Debug reconstruct-go CLI**，断点打在 [`loop.go`](../../reconstruct-go/internal/agent/loop.go)。

若调试器显示 `unreadable` / `protocol error E08`：那是旧 Delve（例如 1.23）硬啃 Go 1.27 的内存。本机已把 `dlv` 装到 `~/go/bin/dlv`（1.27.1）。Cursor 工作区已指定这份二进制。停掉当前调试会话后再 F5，**不要**另开 `go run`。

若 `go env GOROOT` 仍是 `/usr/local/go`（1.23.3 的标准库）而 `go version` 是 1.27：shell 里 `export GOROOT=/usr/local/go` 会把工具链拧成两截。调试和 `go install` 前先 `unset GOROOT`。

**跟着 HTTP 走：** F5 → **Debug reconstruct-go server**，等 `listening`，再用浏览器打开 `/` 点发送（不要再用 curl）。只 F5 不停在 `for` 上是正常的，要等一次提问。不要同时 `go run ./cmd/server` 和 F5，端口会冲突。

## 第 4 节：本片故意没有的

和 TS 第 1 片一样：事件总线、JSONL、中断、`read`/`bash`。没有交互 REPL（那是第 6 片）。

## 第 5 节：官方 SDK 带来的形状差

TS 官方 SDK 把响应 `ChatCompletionMessage` 和请求 `ChatCompletionMessageParam` 拆开；`tool_calls` 是 `function | custom` 联合类型。`sashabaranov/go-openai` 请求响应共用一个 struct，且 `ToolCall` 只有 `Function`。

换成 `github.com/openai/openai-go/v3` 之后，Go 与 TS 对齐：

1. `messages` 存的是 `ChatCompletionMessageParamUnion`。
2. 带 `tool_calls` 的 assistant 用 `msg.ToParam()` 推进历史，对应 TS 手拼 `{ role, content, tool_calls }`。
3. `call.AsAny()` 能分出 `ChatCompletionMessageFunctionToolCall` 和 `ChatCompletionMessageCustomToolCall`。第 1 片只注册 `echo`（function）；custom 会写回「不支持的 tool 类型」，与 TS 的 `call.type !== "function"` 相同。

第 2 片事件总线：[02-events.md](02-events.md)。
