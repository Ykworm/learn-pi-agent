# reconstruct

第 7 片：Completions 或 Responses + 五个工作区工具 + 事件总线 + `AbortSignal` + JSONL session + CLI 三种皮。默认 Completions。

```bash
cd reconstruct
cp config.local.example.json config.local.json
# 填 completions.apiKey（DeepSeek）和可选的 responses.apiKey（OpenAI）

npx tsx src/cli.ts "列出当前目录"
npx tsx src/cli.ts --api responses "1+1 等于几？不要调工具"
```

`npx` 用的是本目录 `node_modules` 里的 `tsx`，不用全局安装。说明见 [notes/ts/07-responses.md](../notes/ts/07-responses.md)。
