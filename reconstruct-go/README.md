# reconstruct-go

第 2 片 Go 对照：同一套 Completions loop + `echo` + 事件总线。日常用命令行（Console 当场打印）；调试 Gin 时网页一次返回事件列表。

```bash
cd reconstruct-go

# 和 TypeScript CLI 一样：问一句就结束
go run ./cmd/cli "请用 echo 工具重复：hello"

# 调试时再开服务器，浏览器打开提示的地址，对照页上的 events 和终端输出
go run ./cmd/server
```

密钥：本目录 `config.local.json`，或沿用 `../reconstruct/config.local.json`。说明见 [notes/go/02-events.md](../notes/go/02-events.md)。
