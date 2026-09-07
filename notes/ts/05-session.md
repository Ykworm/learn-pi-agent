# 第 5 片：JSONL session，事件还原成 messages

前置阅读：[04-abort.md](04-abort.md)。本片不改 turn 语义，也不改 loop：有 `tool_calls` 仍本机执行再 POST；Ctrl+C 仍走同一根 `AbortSignal`。换的是：**发生过的事能写到磁盘，下一进程能接着问**。

对照原文：[`session-manager.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/session-manager.ts)，以及 [`agent.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/agent.ts) 里的 `setEvents`。我们不抄 `~/.pi/sessions`、不抄把 `apiKey` 写进文件、不抄 Responses 那一半翻译、不抄 `--json`（那是第 6 片 stdout 上的事件流）。

## 第 1 节：本片要证明什么

第 1–4 片每个 CLI 进程问一句就退。`Agent` 的 `messages` 只活在内存里。再开一次进程，模型不记得上一句 `list` 看见了什么。

正确形状按因果是：

1. **SessionManager 只是又一个听众。** loop / `ask()` 仍然只 `emit`。构造写成 `new Agent(config, console, session)`，`receivers[]` 变长，loop 不用改。
2. **磁盘上存的是事件日志，不是 `messages[]`。** 一行一个 JSON。人、终端、以后的别的 UI，读的都是同一份 type。
3. **下一进程要再 POST Completions，必须把事件翻译回 API 的 `messages`。** 原文方法叫 `setEvents`。我们把翻译做成纯函数 `eventsToMessages`，`Agent.restoreFromEvents` 只负责换掉内存里那份 `messages`。
4. **CLI 的 `--continue` 选最近改过的那份 jsonl**，还原后再 `ask()` 新的一句。新事件追加到**同一个文件**后面。

本片 CLI 仍是问一句就退。多轮靠「再开一次进程 + `--continue`」，不是交互式 REPL。交互是第 6 片。

磁盘 jsonl 和 `--json` 不要混：本片写的是 **session 文件**；第 6 片 `--json` 是 **stdout 上的事件流**。都是一行一个 JSON，听众不同。

## 第 2 节：两本账

```text
事件（给人看、落盘）          messages（给模型看）
user_message                  role: user
assistant_start               （不进 messages；翻译时用来丢掉未完成的 tool_call）
token_usage                   （不进 messages）
tool_call / tool_result       role: assistant + tool_calls，然后 role: tool
assistant_message             role: assistant
interrupted                   （不进 messages）
session_start                 （不进 messages）
```

`ask()` 仍然先 `user_message` 再 `messages.push({ role: "user" })`。SessionManager 收到的是事件；它**不**改 `messages`。

`system` 不做成事件。它来自配置，翻译时每次重新插到 `messages` 开头。

## 第 3 节：文件里两行长什么样

新 session 的第一行是文件头，**不是** `AgentEvent`：

```json
{"type":"session","id":"...","timestamp":"...","cwd":"...","config":{"baseURL":"...","model":"...","systemPrompt":"..."}}
```

`config` **不写 apiKey**。原文把整份 `AgentConfig` 序列化进去，我们不抄。

后面每一条事件一行：

```json
{"type":"event","timestamp":"...","event":{"type":"user_message","text":"列出当前目录"}}
```

`timestamp` 只给文件看，不发给模型。

文件放在 [`reconstruct/.sessions/`](../../reconstruct/.sessions/)，已 gitignore。原文按 `~/.pi/sessions/` + 工作目录分夹；本片只有一个学习项目，不必抄那套路径。

原文 `--continue` 会再往文件里追加一行 `session` 头。我们只在**新文件**写一次头；继续时只追加 `event` 行。读的时候若文件里出现多段头（手工拼过），仍用**最后一次**的 `config`。

## 第 4 节：`eventsToMessages` 为什么要攒 `tool_call`

Completions 规定：带 `tool_calls` 的那条 `role: "assistant"`，后面必须紧跟对应的 `role: "tool"`。事件日志里 `tool_call` 和 `tool_result` 是分开的两条。所以翻译时：

1. 看见 `tool_call`：先攒着，不要立刻写成一条 assistant。
2. 看见第一条 `tool_result`：把攒着的全部 `tool_call` 打成**一条** assistant，再追加这一条 tool。
3. 看见 `assistant_start`：把还没配对的 `tool_call` 丢掉。上一 turn 若在工具中途 `interrupted`，那些 call 没有 result，不能带进下一轮 HTTP。
4. `token_usage` / `interrupted` / `session_start`：跳过。

一次带 `list` 的 turn，还原后的 `messages` 大约是：

```text
system
user                  ← user_message
assistant + tool_calls ← 攒齐的 tool_call，在第一条 tool_result 时写出
tool                  ← tool_result
assistant             ← assistant_message（终答）
```

## 第 5 节：文件怎么拆

| 文件 | 职责 |
|------|------|
| [`reconstruct/src/session/manager.ts`](../../reconstruct/src/session/manager.ts) | 听众：追加 jsonl；`--continue` 找到最近那份；读出 header + 事件 |
| [`reconstruct/src/session/messages.ts`](../../reconstruct/src/session/messages.ts) | `eventsToMessages`：事件 → Completions 的 `messages` |
| [`reconstruct/src/events.ts`](../../reconstruct/src/events.ts) | 多一种 `{ type: "session_start"; ... }` |
| [`reconstruct/src/agent/agent.ts`](../../reconstruct/src/agent/agent.ts) | `emitSessionStart`；`restoreFromEvents` |
| [`reconstruct/src/renderers/console.ts`](../../reconstruct/src/renderers/console.ts) | 印 `[session] ...` |
| [`reconstruct/src/cli.ts`](../../reconstruct/src/cli.ts) | 始终挂上 SessionManager；`--continue` / `-c` |

loop、工具、abort **不改**。

## 第 6 节：怎么跑

工作目录是 `reconstruct/`。

```bash
cd reconstruct
npx tsx src/cli.ts "列出当前目录"
ls .sessions
# cat 最新那个 .jsonl：第一行 type=session，后面每条事件一行，含 token_usage

npx tsx src/cli.ts --continue "刚才 list 看到了哪些名字？不要再调工具"
```

第二句若还原成功，模型应能直接说名字，**不应**再发一次 `list`。终端会先印 `[continue] …` 和 `[session] …`。

Cursor 里：F5 选 **Debug reconstruct CLI**。第一句照旧；第二句把 `args` 改成 `--continue` 和那句追问。断点打在 [`eventsToMessages`](../../reconstruct/src/session/messages.ts) 和 [`restoreFromEvents`](../../reconstruct/src/agent/agent.ts)。

Ctrl+C 仍走第 4 片。`interrupted` 会写进 jsonl，翻译时跳过。

## 第 7 节：看代码时盯这几行

1. `cli.ts`：`new Agent(config, new ConsoleRenderer(), session)`。loop 仍然看不见 SessionManager 这个类型。
2. `SessionManager.on`：整条 `AgentEvent` 原样包进 `{ type: "event", event }`。它不 `switch` type。
3. `eventsToMessages` 的 `pendingToolCalls`：flush 发生在 `tool_result`，不是 `tool_call`。
4. `assistant_start` 把 `pendingToolCalls` 清空。这是给中途取消用的，不是装饰。
5. `restoreFromEvents` **替换** `this.messages`，不是 append。构造时那条 `system` 会被翻译结果里的 `system` 盖掉。

## 第 8 节：本片故意没有的

交互式多轮（进程不退、终端里再问）、`--json`、Responses 的 `setEvents`、TUI 把旧事件重绘一遍、session 树 / compaction。缺了它们，两进程已经能接着聊。

## 第 9 节：你该能回答的问题

1. 为什么磁盘不直接存 `messages[]`，而要存事件再翻译？
2. 看见 `tool_call` 为什么不立刻写成 `role: "assistant"`？第一条 `tool_result` 时发生了什么？
3. `token_usage` 在 jsonl 里。下一轮 HTTP 的 `messages` 里有没有它？
4. 上一句在 `bash sleep` 时 Ctrl+C，jsonl 末尾是 `interrupted`。`--continue` 之后模型会不会看见一个没有 `tool_result` 的 `tool_calls`？

答得出来再开第 6 片（CLI 三种皮：问一句、交互、`--json`）。卡住就问。

Go 对照（目录、Gin 勾选继续）：[../go/05-session.md](../go/05-session.md)。
