# reconstruct

第 6 片：Completions loop + 五个工作区工具 + 事件总线 + `AbortSignal` + JSONL session + CLI 三种皮（单次、交互、`--json`）。

```bash
cd reconstruct
cp config.local.example.json config.local.json
# 填入 apiKey

npx tsx src/cli.ts "列出当前目录"
npx tsx src/cli.ts "第一句" "第二句"
npx tsx src/cli.ts
npx tsx src/cli.ts --continue
npx tsx src/cli.ts --json "1+1 等于几？不要调工具"
printf '%s\n' '{"type":"message","content":"1+1 等于几？不要调工具"}' | npx tsx src/cli.ts --json
```

`npx` 用的是本目录 `node_modules` 里的 `tsx`，不用全局安装。说明见 [notes/ts/06-cli.md](../notes/ts/06-cli.md)。
