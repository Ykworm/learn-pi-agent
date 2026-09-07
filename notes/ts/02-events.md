# 第 2 片：事件总线（全量 fan-out）

前置阅读：[01-loop.md](01-loop.md)。本片不改 turn 语义：还是 Completions + `echo`。改的是「发生了什么」怎么离开 loop。

对照原文：[`vendor/.../agent.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/agent.ts) 里的 `AgentEvent`、`comboReceiver`，以及 [`console-renderer.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/renderers/console-renderer.ts)。我们不抄 spinner、颜色、JSONL、`--json`。

## 第 1 节：本片要证明什么

第 1 片的 CLI 在 `ask()` 返回之后打印终答。工具有没有被调、用量是多少，loop 外面看不见。若把 `console.log` 写进 loop，以后要换一种输出（JSONL、网页、TUI）就得改循环。

正确形状：

1. loop / `ask()` **只广播**：`await receiver.on(event)`
2. **每一个**听众都收到 **全部** type（全量 fan-out）
3. 没有「type → 组件」总路由表。Console 在自己的 `on()` 里 `switch`；`token_usage` 收到了但什么都不印
4. 第 5 片的 SessionManager（[05-session.md](05-session.md)）、第 6 片的 JsonRenderer 会再挂上同一条总线；本片只挂打印（Go 调试页再挂一个收集器）

这不是带 broker 的消息队列。没有按 tag 拉队列，也没有消费组。就是进程内 `for (r of receivers) await r.on(event)`。一个听众抛错会传到 loop。

## 第 2 节：本片会发出的事件

Completions 这一路，一次带 `echo` 的 turn 通常是：

```text
user_message
assistant_start          ← 每个 turn 一次，不是每次 HTTP
token_usage              ← 第 1 次 POST 回来
tool_call
tool_result
token_usage              ← 第 2 次 POST 回来
assistant_message        ← 终答；ask() 不再 return 这段文本
```

当时故意还没有：`session_start`（第 5 片）、`interrupted`（第 4 片已补）、`thinking`（第 7 片 Responses）。

`assistant_start` 在进入 `for (;;)` **之前**发一次，和原文 `callModelChatCompletionsApi` 相同。

## 第 3 节：文件怎么拆

| 文件 | 职责 |
|------|------|
| [`reconstruct/src/events.ts`](../../reconstruct/src/events.ts) | `AgentEvent` 联合类型 + `emitAll` |
| [`reconstruct/src/renderers/console.ts`](../../reconstruct/src/renderers/console.ts) | 第一个听众：给人看 |
| [`reconstruct/src/agent/loop.ts`](../../reconstruct/src/agent/loop.ts) | 还是那个 `for (;;)`，多了 emit |
| [`reconstruct/src/agent/agent.ts`](../../reconstruct/src/agent/agent.ts) | 持有 `receivers[]`；`ask()` 先 `user_message` |
| [`reconstruct/src/cli.ts`](../../reconstruct/src/cli.ts) | `new Agent(config, new ConsoleRenderer())` |

原文把 renderer 和 SessionManager 写死在 `comboReceiver` 里。我们用数组，第 5 片再往数组里加一个听众，loop 不用改。

## 第 4 节：怎么跑

和第 1 片相同，输出会变长：先 `[user]` / `[assistant]` / `[tool]`，最后才是终答。`token_usage` 不会出现在终端上，但事件确实发过。

```bash
cd reconstruct
npx tsx src/cli.ts "请用 echo 工具重复：hello"
```

第 3 片起当前树请用 [03-tools.md](03-tools.md) 第 5 节的命令。当时的 `echo` 见 tag `slice-02`。

Cursor 里：F5 选 **Debug reconstruct CLI**，断点打在 [`events.ts`](../../reconstruct/src/events.ts) 的 `emitAll`，看同一条事件被哪些听众的 `on` 接到。

## 第 5 节：看代码时盯这几行

1. `ask()` 里 `emitAll(..., user_message)` 然后才 `messages.push({ role: "user" })`。事件给人看；`messages` 给模型看。两份账。
2. `runCompletionsTurn` 开头一次 `assistant_start`，然后才 `for (;;)`。
3. 有 `tool_calls` 时：先 `tool_call`，再 `runTool`，再 `tool_result`。打印发生在执行当下，不是等 turn 结束。
4. 终答是 `assistant_message`。`ask()` 的返回值是 `void`。

## 第 6 节：本片故意没有的

JSONL 落盘见 [05-session.md](05-session.md)。`--json`、Responses、TUI。原文 ConsoleRenderer 的 spinner / chalk 也不抄。缺了它们，总线已经能换听众。`interrupted` 见 [04-abort.md](04-abort.md)。

## 第 7 节：你该能回答的问题

1. 为什么 loop 里不能 `if (tool_calls) console.log(...)`，而要先变成事件再让 Console `switch`？
2. Console 对 `token_usage` 什么都不做。这条事件有没有发生？第 5 片谁会需要它？
3. 若 `new Agent(config, console, another)`，loop 要不要改？`another` 会不会漏掉 `tool_call`？
4. `user_message` 为什么在 `ask()` 里发，不在 loop 里发？

答得出来再开第 3 片。卡住就问。

第 3 片：[03-tools.md](03-tools.md)。Go 对照（结构体事件、Gin 收集器）：[../go/02-events.md](../go/02-events.md)。
