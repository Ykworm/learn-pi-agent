# 第 3 片 Go 对照：同一张工具表，`glob` 用 doublestar，`rg` 特殊处理退出码 1

概念仍读 [../ts/03-tools.md](../ts/03-tools.md)。Go 只补进程、路径、以及 `Run` 怎么把错误交给 loop。

## 第 1 节：和 TS 对齐的部分

| TS | Go |
|----|----|
| `src/tools/read.ts` | [`internal/tools/read.go`](../../reconstruct-go/internal/tools/read.go) |
| `src/tools/list.ts` | [`internal/tools/list.go`](../../reconstruct-go/internal/tools/list.go) |
| `src/tools/bash.ts` | [`internal/tools/bash.go`](../../reconstruct-go/internal/tools/bash.go) |
| `src/tools/glob.ts` | [`internal/tools/glob.go`](../../reconstruct-go/internal/tools/glob.go) |
| `src/tools/rg.ts` | [`internal/tools/rg.go`](../../reconstruct-go/internal/tools/rg.go) |
| `src/tools/cap.ts` | [`internal/tools/cap.go`](../../reconstruct-go/internal/tools/cap.go) |
| `COMPLETION_TOOLS` + `runTool` | [`CompletionsTools`](../../reconstruct-go/internal/tools/run.go) + `Run` |

CLI：

```bash
cd reconstruct-go
go run ./cmd/cli "列出当前目录"
go run ./cmd/cli "读 internal/agent/loop.go 的前 30 行"
go run ./cmd/cli "用 glob 找出 internal 下所有 .go 文件"
go run ./cmd/cli "用 rg 搜索 Run 出现在哪些文件"
```

工作目录是 `reconstruct-go/`。F5 选 **Debug reconstruct-go CLI**，断点打在 [`Run`](../../reconstruct-go/internal/tools/run.go)。

## 第 2 节：形状差

1. **异步。** TS 的 `runBash` / `runGlob` / `runRg` 是 Promise，loop 必须 `await runTool`。Go 的 `exec.CommandContext(...).Run()` 和 `GlobWalk` 会堵住当前 goroutine，`Run` 可以保持同步。同一根 cancel 见 [04-abort.md](04-abort.md)。
2. **错误。** `read` / `list` 找不到路径、`glob` / `rg` 没有匹配：返回字符串，`error` 为 nil。`bash` 非 0：`Run` 返回 `error`，loop 把 `isError` 打成 `true`。
3. **行窗口。** Go 用 `bufio.Scanner`。默认单行上限约 64 KB，长行会扫失败，所以把 buffer 抬到 1 MB（与工具输出上限相同）。
4. **路径。** `filepath.Abs` 相对 `os.Getwd()`，对应 TS 的 `path.resolve`。
5. **glob 实现。** TS 用 npm 的 `glob`（`dot: true`，会匹配点文件）。Go 用 [`doublestar`](https://github.com/bmatcuk/doublestar)；`**` 默认不进点目录，要搜 `.env` 这类名字得把点写进 pattern。
6. **rg 退出码 1。** `exec.ExitError` 且 `ExitCode()==1` 当成「没有匹配」，不是 `error`。TS 在 `close` 回调里看 `code === 1`。
7. **JSON。** TS 把 `JSON.parse` 收成 `unknown`，用 `"command" in parsed` 再取值；Go 是 `json.Unmarshal` 进带 `Command` 的 struct，没有 `as`。见 [../ts/03-tools.md](../ts/03-tools.md) 第 6 节第 7 条。

## 第 3 节：Gin

网页默认那一句仍是列目录。发送后对照 `events` 里的 `tool_call` / `tool_result` 和服务器终端：终端可能被 Console 截成 10 行，JSON 里仍是完整（已按 1 MB 切过的）结果。
