# reconstruct

第 2 片：Completions loop + `echo` + 事件总线。CLI 挂 ConsoleRenderer，loop 不打印。

```bash
cd reconstruct
cp config.local.example.json config.local.json
# 填入 apiKey

npx tsx src/cli.ts "请用 echo 工具重复：hello"
```

`npx` 用的是本目录 `node_modules` 里的 `tsx`，不用全局安装。说明见 [notes/ts/02-events.md](../notes/ts/02-events.md)。
