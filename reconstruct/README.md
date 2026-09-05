# reconstruct

我们假装自己是作者、从 0 搭起来的 pi-agent。第 1 片已经有 Completions loop 和一个 `echo` 工具。

```bash
cd reconstruct
export OPENAI_API_KEY=sk-...
npx tsx src/cli.ts "请用 echo 工具重复：hello"
```

笔记：[notes/01-loop.md](../notes/01-loop.md)。
