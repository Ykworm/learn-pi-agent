# reconstruct-go

第 6 片 Go 对照：同一套 Completions loop + 五个工作区工具 + 事件总线 + 可 cancel 的 `ctx` + JSONL session + CLI 三种皮。日常用命令行；调试 Gin 时网页一次返回事件列表，勾选继续走 jsonl。

```bash
cd reconstruct-go

go run ./cmd/cli "列出当前目录"
go run ./cmd/cli
go run ./cmd/cli --continue
go run ./cmd/cli --json "1+1 等于几？不要调工具"
printf '%s\n' '{"type":"message","content":"1+1 等于几？不要调工具"}' | go run ./cmd/cli --json

# 调试时再开服务器，浏览器打开提示的地址
go run ./cmd/server
```

密钥：本目录 `config.local.json`，或沿用 `../reconstruct/config.local.json`。说明见 [notes/go/06-cli.md](../notes/go/06-cli.md)。
