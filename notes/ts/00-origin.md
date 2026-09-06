# 第 0 片：为什么要自己造一个 agent harness

本片没有代码。目标是搞清：作者在气什么、第一版已经长什么样、我们为什么不从今天的四包架构开始。

对照阅读：

- 动机：[Mario 的原文](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)（2025-11-30，比首个提交晚约三个月，但问题陈述仍适用）
- 标本：[vendor/pi-mono-a74c5da/packages/agent](../vendor/pi-mono-a74c5da/packages/agent)
- 一个 turn 如何调工具：[00-completions-turn.md](00-completions-turn.md)

## 第 1 节：作者在解决什么

Mario 当时已经会用 Claude Code 一类 harness，但有三件事让他决定自己写：

1. **上下文不透明。** 写代码时，精确控制「模型到底看见什么」比多几个功能更重要。现成工具会在背后注入上下文，界面上还看不见。
2. **内部不可检视。** 他想要一份能自己后处理的 session 格式，以及能在核心之上换一套 UI 的简单接口。现成 API 像是功能堆出来的，不是为这个目的设计的。
3. **prompt 和工具乱变。** 上游每次发版都改 system prompt 和工具表，工作流和模型行为跟着漂。

治理规则很硬：**自己用不上的，就不做。** 第一版已经能跑，不是空架子；但它仍然很小。后来的 `pi-ai`、`pi-agent-core`、`pi-coding-agent` 是这一层长出来的，不是另一套东西。

所以我们从 2025-08-09 的 `packages/agent` 开始，而不是从今天的 monorepo 开始。

## 第 2 节：首个提交已经是产品

提交 `a74c5da` 一共 63 个文件。三个包：

| 包 | 当时的职责 | 本阶段 |
|----|------------|--------|
| `packages/agent` | 通用 agent：loop、工具、session、CLI | 只解剖这个 |
| `packages/tui` | 差分渲染的终端 UI | 不读、不抄 |
| `packages/pods` | GPU 上管 vLLM | 与 agent 无关，忽略 |

`@mariozechner/pi-agent` 当时是 0.5.0，依赖 OpenAI SDK、`glob`、`chalk`，以及同仓的 `pi-tui`。命令行入口是 `pi-agent`。

请先打开这些文件的**文件名和行数**，不要一上来通读 484 行 loop：

| 文件 | 大约行数 | 它在整条链上的位置 |
|------|----------|-------------------|
| `src/agent.ts` | 484 | Chat Completions / Responses 的 `while` 循环；`Agent.ask`；`AgentEvent` |
| `src/tools/tools.ts` | 264 | `read` / `list` / `bash` / `glob` / `rg` |
| `src/session-manager.ts` | 176 | JSONL 事件日志 |
| `src/cli.ts` | 294 | 单次提问、交互、`--json` |
| `src/args.ts` | 204 | 参数解析（我们第 6 片前不抄） |
| `src/renderers/console-renderer.ts` | 130 | 终端听众，内部 `switch (event.type)` |
| `src/renderers/json-renderer.ts` | 7 | 每条事件 `JSON.stringify` |
| `src/renderers/tui-renderer.ts` | 353 | 本阶段不读 |
| `src/index.ts` | 15 | 包导出 |

一张图把关系说完：

```text
cli.ts
  -> Agent.ask(userMessage)
       -> Completions 或 Responses 循环
            -> executeTool
            -> receiver.on(event)   // 广播，不是按 type 路由
                 -> ConsoleRenderer / JsonRenderer
                 -> SessionManager 追加 jsonl
  --continue 时：读 jsonl -> setEvents -> 再变成 messages[]
```

作者真正先要站住的，是中间那条 loop，不是 TUI。第 1 片我们只手写 loop。

## 第 3 节：若我们就是作者，刀序会是什么样

不是按文件清单抄，而是按「缺了下一刀就跑不起来」：

1. 先能对 Chat Completions 说话，并且遇到 `tool_calls` 就本地执行再问一次（第 1 片）。
2. loop 不要 `console.log`：改成广播事件，打印和存盘都是听众（第 2 片）。
3. 把 `read` / `list` / `bash` 做成真工具；大输出截断；`read` 用行窗口看大文件（第 3 片）。
4. Escape 必须停得下来：`AbortSignal`（第 4 片）。
5. 把事件写成 JSONL，才能 `--continue`；再把事件翻译回 API 的 `messages`（第 5 片）。
6. 同一套事件，换三种 CLI 皮：问一句就退、交互、stdin/stdout JSON（第 6 片）。
7. 再兼容 Responses API（第 7 片）。

第 0 片只要求你能把这张刀序讲给自己听。

## 第 4 节：术语压缩（后面几片会展开）

**Chat Completions。** `POST /v1/chat/completions`。请求是一组带 `role` 的消息。模型回文本，或回 `tool_calls`。Agent = 有工具就执行，把结果塞回 `messages`，再请求，直到只说话。

**emit。** 循环里只调用 `receiver.on(event)`，自己不打印、不写盘。所有听众都收到全部 type（全量 fan-out）。没有「type → 组件」总路由表。Console 在自己的 `on()` 里 `switch`；JSON 和 session 通常全收。像进程内 pub/sub，不是带 broker 的 MQ。

**AbortSignal。** `AbortController.abort()` 发出取消。HTTP、bash、loop 都看同一根 `signal`。没有它，Escape 停不了正在跑的模型和子进程。

**截断。** 工具输出进 `messages`。超过约 1 MB 就标 truncated。第一版**不会**把整份大文件喂给模型。要看后面的内容：再调 `bash`/`rg`，或给 `read` 加 `offset`/`limit`。

**print / RPC。** 都是不用 TUI、走 stdio。print 跑一次就退；RPC 进程一直活、stdin 收命令。第一版的 `--json` 是二者的种子。

**事件还原成 API。** 磁盘存事件日志，API 要 `messages[]`。`setEvents`（我们会叫 `eventsToMessages`）按 type 翻译。`thinking`、token 统计不进 messages。

## 第 5 节：本片你该能回答的问题

读完 vendor 目录（不用读懂 `agent.ts` 每一行）之后，试着回答：

1. 为什么不直接学今天的 `pi-ai` + `pi-agent-core` + `pi-coding-agent`？
2. 第一版三个包里，哪个才是 agent 的骨架？哪些文件我们故意先不碰？
3. 若明天从空白目录开工，你的第一刀会写什么？（提示：还不是事件、不是 JSONL。）

Chat Completions 的 role、谁发第 2 次 HTTP、一个 turn 里多次调工具：见 [00-completions-turn.md](00-completions-turn.md)。

答得出来，第 0 片就结束了。卡住就问。不要自己先写 loop。
