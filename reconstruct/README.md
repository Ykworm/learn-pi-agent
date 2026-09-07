# reconstruct

第 5 片：Completions loop + 五个工作区工具 + 事件总线 + `AbortSignal` + JSONL session。CLI 挂 ConsoleRenderer 和 SessionManager；`--continue` 还原最近一份 jsonl。

```bash
cd reconstruct
cp config.local.example.json config.local.json
# 填入 apiKey

npx tsx src/cli.ts "列出当前目录"
ls .sessions
npx tsx src/cli.ts --continue "刚才 list 看到了哪些名字？不要再调工具"

npx tsx src/cli.ts "用 bash 跑 sleep 30，不要自己编结果"
# 看到 [tool] bash(...) 之后 Ctrl+C，应印 [interrupted]
```

`npx` 用的是本目录 `node_modules` 里的 `tsx`，不用全局安装。说明见 [notes/ts/05-session.md](../notes/ts/05-session.md)。
