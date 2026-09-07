# 第 4 片：`AbortSignal` 中断

前置阅读：[03-tools.md](03-tools.md)。本片不改工具表，也不改总线形状（只多一种 type）。改的是：**人可以停掉正在跑的这一 turn**。一根线就是 `AbortSignal`：`ask()` 造、`interrupt()` 拉、`create` / `spawn` 往下传。

看 [`bash.ts`](../../reconstruct/src/tools/bash.ts) 时：解析 `command`、`unknown`、`"command" in parsed`、`as { command: unknown }` 是 [第 3 片](03-tools.md) 第 6 节第 7 条。本片只加了第二参数 `signal`，以及 abort 时 throw `Interrupted`。

对照原文：[`vendor/.../agent.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/agent.ts) 的 `AbortController` / `interrupt()`，以及 [`tools.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/tools/tools.ts) 里 bash / rg 看 `signal`。我们不抄 TUI 的 Escape，也不抄 `--json` 的 interrupt 命令。

## 第 1 节：本片要证明什么

第 3 片的 `bash` 能 `sleep 30`。没有取消通道，Ctrl+C 只会打死整个 Node 进程，loop 来不及发事件，子进程也可能变成孤儿。

正确形状按因果是：

1. **`ask()` 为这一 turn `new AbortController()`**。Go 里对应一根可 cancel 的 `context`。
2. **CLI 收到 SIGINT 调 `interrupt()`**，也就是 `abortController.abort()`。loop **不**自己听 Ctrl+C。
3. **同一根 `AbortSignal` 交给两处会堵住的地方**：Completions 的 `create(..., { signal })`，以及 `bash` / `rg` 的 `spawn(..., { signal })`。
4. **loop 看见 aborted：`emit` `{ type: "interrupted" }`，再 throw `Interrupted`。** `ask()` 吞掉这个错误，进程正常结束，不是崩溃。
5. **不要把取消收成 `tool_result` + `isError`。** 那是工具失败。取消是人停这一 turn。

本片 CLI 仍是问一句就退。原文 TUI 用 Escape 调同一个 `interrupt()`；那是第 6 片的皮，不是另一套取消。

## 第 2 节：谁拿着 controller

```text
cli.ts          process.on("SIGINT") → agent.interrupt()
Agent.ask()     为本 turn new AbortController；catch 里吞 Interrupted
loop            只认识 signal；aborted 则 emit interrupted 再 throw
create / spawn  把 signal 传给 HTTP 和子进程
```

分叉点是 `interrupt()`，不是 loop 里有没有 `process.on`。

`read` / `list` / `glob` 不接 `signal`：它们很快，原文也只把 abort 接到 HTTP 和会起进程的 bash / rg。

`runBash` 里是 `spawn("bash", ["-c", command], { signal })`：本机的 `bash` 这个 binary 跑模型给的那条 command。第三个参数的 `signal` 是 Node 的约定：`abort()` 之后会杀掉这个子进程。第 5 节用 `sleep 30` 试 Ctrl+C，能停掉的就是这一下。没有 `{ signal }`，`interrupt()` 只停得了 HTTP，`sleep` 还在跑。`runRg` 同样把这根 signal 传给 `spawn`。

## 第 3 节：文件怎么拆

| 文件 | 职责 |
|------|------|
| [`reconstruct/src/abort.ts`](../../reconstruct/src/abort.ts) | 构造 / 识别 `Interrupted`（含 SDK 的 `AbortError`） |
| [`reconstruct/src/events.ts`](../../reconstruct/src/events.ts) | 多一种 `{ type: "interrupted" }` |
| [`reconstruct/src/agent/agent.ts`](../../reconstruct/src/agent/agent.ts) | 每 turn 一个 `AbortController`；`interrupt()` |
| [`reconstruct/src/agent/loop.ts`](../../reconstruct/src/agent/loop.ts) | HTTP 前、每个 tool 前检查；`create` 带 `signal`；工具抛 Interrupted 则 `abortTurn`，不写成 `tool_result` |
| [`reconstruct/src/tools/run.ts`](../../reconstruct/src/tools/run.ts) | `runTool(name, args, signal)`；只传给 bash / rg |
| [`reconstruct/src/tools/bash.ts`](../../reconstruct/src/tools/bash.ts) / [`rg.ts`](../../reconstruct/src/tools/rg.ts) | `spawn({ signal })`；aborted 则 throw Interrupted |
| [`reconstruct/src/renderers/console.ts`](../../reconstruct/src/renderers/console.ts) | 印 `[interrupted]` |
| [`reconstruct/src/cli.ts`](../../reconstruct/src/cli.ts) | SIGINT → `interrupt()` |

## 第 4 节：原文有一处不抄

原文 `executeTool` 在 bash / rg 里会把 `Interrupted` 再抛出去。但 Completions loop 里工具的 `catch` 把**所有**异常都做成 `tool_result` + `isError: true`，没有先认 Interrupted。于是取消可能变成一条失败的工具结果，loop 还继续 POST。

我们在 `catch` 里先 `isInterrupted`，再 `abortTurn`。这是有意不抄。

## 第 5 节：怎么跑

工作目录是 `reconstruct/`。先让模型去调 `bash` 跑 `sleep`，看到 `[tool] bash(...)` 之后按 Ctrl+C：

```bash
cd reconstruct
npx tsx src/cli.ts "用 bash 跑 sleep 30，不要自己编结果"
```

应看到 `[interrupted]`，**不应**看到把 `Interrupted` 印成一条 `tool_result`。进程退出码 0。

Cursor 里：F5 选 **Debug reconstruct CLI**，把 `args` 改成上面那句，断点打在 [`interrupt()`](../../reconstruct/src/agent/agent.ts) 和 [`abortTurn`](../../reconstruct/src/agent/loop.ts)。

HTTP 还在飞的时候 Ctrl+C，SDK 应收 `AbortError`，同样走 `abortTurn`。比 `sleep` 难卡时机。

## 第 6 节：看代码时盯这几行

1. `ask()` 里 `new AbortController()`。没有进行中的 ask 时 `interrupt()` 什么都不做。
2. `cli.ts` 的 SIGINT 只调 `interrupt()`，不 `process.exit`。
3. `create(..., { signal })` 和 `spawn("bash", ["-c", command], { signal })` 用的是同一根 signal。后者让 Node 在 abort 时杀掉子进程。`runBash` 取出 `command` 的那几行不是本片。
4. 工具 `catch`：`isInterrupted` 则 `abortTurn`，不要 `tool_result`。
5. Console 对 `interrupted` 印 `[interrupted]`。`token_usage` 仍然收到但不印。

## 第 7 节：本片故意没有的

JSONL（[05-session.md](05-session.md)）、Responses、TUI Escape、`--json` 的 interrupt 命令、交互式多轮（一次 Ctrl+C 之后还能再问）。缺了它们，这一 turn 已经能停。

## 第 8 节：你该能回答的问题

1. 为什么 loop 不 `process.on("SIGINT")`？SIGINT 进 Agent 的那一跳叫什么？
2. `bash` 的 `sleep` 被取消，事件流里最后一条应是什么 type？会不会再 POST 一次 Completions？
3. 原文工具 `catch` 若把 Interrupted 收成 `isError` 的 `tool_result`，模型下一轮会看见什么？我们为什么不抄？

答得出来再开第 5 片：[05-session.md](05-session.md)。卡住就问。

Go 对照（`context`、`NotifyContext`、`CommandContext`）：[../go/04-abort.md](../go/04-abort.md)。
