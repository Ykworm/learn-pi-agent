# reconstruct

第 1 片：Completions loop + `echo`，默认走 DeepSeek（OpenAI-compatible）。

```bash
cd reconstruct
cp config.local.example.json config.local.json
# 填入 apiKey

npx tsx src/cli.ts "请用 echo 工具重复：hello"
```

`npx` 用的是本目录 `node_modules` 里的 `tsx`，不用全局安装。配置说明见 [notes/01-loop.md](../notes/01-loop.md) 第 3 节。
