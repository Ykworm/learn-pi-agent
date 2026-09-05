# 第 1 片：Chat Completions 的 agent loop

前置阅读：[00-completions-turn.md](00-completions-turn.md)。本片第一次写代码：把「一个 turn」变成可运行的 `while`。

对照原文：[`vendor/.../agent.ts`](../vendor/pi-mono-a74c5da/packages/agent/src/agent.ts) 里的 `callModelChatCompletionsApi`。我们不抄事件、中断、Responses；只留 Completions + 一个 `echo` 工具。

## 第 1 节：本片要证明什么

Agent 还不是 CLI、不是 session、不是 TUI。它是：

1. 把 `user` 推进 `messages`
2. POST `/v1/chat/completions`
3. 若有 `tool_calls`：本机执行 → 推进 `tool` → **再 POST**（还是 Agent 发，没有新的 `user`）
4. 若只有文本：推进 `assistant`，本 turn 结束

`echo` 存在只为让模型有一个真正能调的函数。第 3 片再换成 `read` / `bash`。

## 第 2 节：文件怎么拆

| 文件 | 职责 |
|------|------|
| [`reconstruct/src/tools/echo.ts`](../reconstruct/src/tools/echo.ts) | 工具的 schema + 本机实现 |
| [`reconstruct/src/tools/run.ts`](../reconstruct/src/tools/run.ts) | 按名字分发 |
| [`reconstruct/src/agent/loop.ts`](../reconstruct/src/agent/loop.ts) | `for (;;)` 里发 HTTP、执行工具 |
| [`reconstruct/src/agent/agent.ts`](../reconstruct/src/agent/agent.ts) | 持有 `messages`，`ask()` 追加一条 user 再跑 loop |
| [`reconstruct/src/cli.ts`](../reconstruct/src/cli.ts) | 读配置文件和命令行上那一句 |
| [`reconstruct/src/config/load.ts`](../reconstruct/src/config/load.ts) | 读 `config.json` + 可选 `config.local.json` |
| [`reconstruct/config.json`](../reconstruct/config.json) | DeepSeek 的 `baseURL` / `model` / system prompt（无密钥） |

loop 不 `console.log`。终答由 CLI 打印。第 2 片才把「发生了什么」广播给听众。

## 第 3 节：怎么跑

DeepSeek 走 OpenAI-compatible 的 Chat Completions，所以 loop 不用改，只换配置。已提交的 [`config.json`](../reconstruct/config.json) 指向 `https://api.deepseek.com` 和 `deepseek-chat`。

密钥不要进 git。任选一种：

```bash
cd reconstruct
cp config.local.example.json config.local.json
# 编辑 config.local.json，把 apiKey 换成你的 DeepSeek 密钥
```

或设置环境变量 `DEEPSEEK_API_KEY`（名字由 config 里的 `apiKeyEnv` 指定）。

`npx` 是 npm 自带的「跑某个包里的命令」：优先用当前项目 `node_modules/.bin` 里的可执行文件，没有才临时下载。`npx tsx src/cli.ts "..."` 等于用本仓库装的 `tsx` 直接跑 TypeScript，不必全局安装 `tsx`，也不必先 `tsc`。

```bash
cd reconstruct
npx tsx src/cli.ts "请用 echo 工具重复：hello"
```

Cursor 里：打开 `reconstruct/src/agent/loop.ts` 的 `for (;;)` 打断点，F5 选 **Debug reconstruct CLI**。

## 第 4 节：看代码时盯这三行

1. `messages.push({ role: "user", ... })` 只在 `ask()` 里发生一次。
2. `messages.push({ role: "assistant", tool_calls })` 之后立刻 `runTool`，再 `push({ role: "tool", ... })`。
3. `continue` 回到 `create()` —— 这就是第 2 次 HTTP。

没有 `tool_calls` 时 `return text`。这就是「LLM 认为本 turn 结束」。

## 第 5 节：本片故意没有的

事件总线、JSONL、AbortSignal、`read`/`bash`、Responses API、`AGENTS.md`。缺了它们 loop 仍然能跑完一个 turn。

## 第 6 节：你该能回答的问题

1. 为什么 `runCompletionsTurn` 要用循环，而不是 `create()` 一次？
2. `echo` 的返回值进了哪条 message？下一次 HTTP 时模型怎么看见它？
3. 连续 `ask()` 两次（同一 `Agent` 实例），第二次的 `messages` 里为什么还留着第一次的对话？

答得出来再开第 2 片。卡住就问；可以在 loop 里下断点把 `messages` 看一遍。
