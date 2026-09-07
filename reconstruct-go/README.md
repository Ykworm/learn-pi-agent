# reconstruct-go

第 5 片 Go 对照：同一套 Completions loop + 五个工作区工具 + 事件总线 + 可 cancel 的 `ctx` + JSONL session。日常用命令行（`--continue` 还原最近一份 jsonl）；调试 Gin 时网页一次返回事件列表，勾选继续走同一条路。

```bash
cd reconstruct-go

go run ./cmd/cli "列出当前目录"
ls .sessions
go run ./cmd/cli --continue "刚才 list 看到了哪些名字？不要再调工具"

go run ./cmd/cli "用 bash 跑 sleep 30，不要自己编结果"
# 看到 [tool] bash(...) 之后 Ctrl+C，应印 [interrupted]

# 调试时再开服务器，浏览器打开提示的地址
go run ./cmd/server
```

密钥：本目录 `config.local.json`，或沿用 `../reconstruct/config.local.json`。说明见 [notes/go/05-session.md](../notes/go/05-session.md)。
