# Event、Message、jsonl 条目

分层图里「UI 专用 role」容易看成第 2 片的 Event。对照课把「发生过的事」全写进事件账；一年后的产品拆成三本。本篇用 `!ls` 把三本对上。标本：`vendor/pi-v0.85.1/`。不要抄进 `reconstruct/`。

压缩摘要的切点和写回见 [pi-compaction.md](pi-compaction.md)。本篇只借用它说明：磁盘上的 `type` 和内存里的 `role` 不是同一层。

## 第 1 节：三本不要混

| 本 | 判别字段 | 活多久 | 干什么 |
|----|----------|--------|--------|
| `AgentEvent` | `type: "agent_start"` / `"message_update"` / `"tool_execution_*"` | 这一 turn 的过程 | 告诉听众 loop 走到哪了 |
| `AgentMessage`（`state.messages`） | `role: "user"` / `"bashExecution"` / `"compactionSummary"` | 整段对话 | TUI 画这个；`convertToLlm` 也读这个 |
| jsonl 的 `SessionEntry` | `type: "message"` / `"compaction"` / `"model_change"` | 落盘 | 树、fork、下次打开 |

reconstruct 是两本：事件给人看、落盘；`messages` 给模型看。官方 TUI **不**靠事件日志重绘。事件过了就过了，画面要从 `state.messages` 再画一遍。

所以产品发明的 `bashExecution`、`compactionSummary` 做成 **message 的 role**，不是 event 的 type：它们要当气泡留下来，下一轮 HTTP 还可能看见。

## 第 2 节：人打 `!ls`

人在终端里打 `!ls` 回车。皮先看第一个字符是不是 `!`。是的话这一句不当 prompt，不进 loop，也不让模型决定要不要调 bash tool。

剥掉 `!`，剩下 `ls`，本地 spawn 用户的 shell。`!!ls` 同样跑 `ls`，只是这条记录不进模型上下文。输入框一打出 `!` 会换边框颜色，那只是提示；真正分叉在回车：

```text
你敲的字
  ├─ 以 ! 开头  → handleBashCommand("ls") → executeBash
  └─ 普通句子   → session.prompt(...)     → 开 turn
```

这和 loop 里那个 function tool `bash` 不是一条路。那边是模型先发 tool call，结果是 `role: "toolResult"`。这边是人在皮里跑命令。

跑完之后，对话里多的**不是**一条 `role: "user"`、内容为 `"!ls"`。人这句话没有当 user 消息留下。留下的是：

```json
{
  "role": "bashExecution",
  "command": "ls",
  "output": "AGENTS.md\nreconstruct/\n…",
  "exitCode": 0,
  "cancelled": false,
  "truncated": false,
  "timestamp": 1733234567890
}
```

TUI 用 `command` / `output` / `exitCode` 画那块命令输出。

## 第 3 节：外层 `type`，里层 `role`

jsonl 每一行先是会话树上的一个节点。信封是 `type` / `id` / `parentId` / `timestamp`。

`type: "message"` 的意思是：这个节点里塞的是一条对话消息。人的一句、模型的一句、tool result、你打的 `!ls`，落盘时都走这个信封。里面再包一个 `message` 对象，用 `role` 分叉。

你先问「这个仓库叫什么？」，模型回「learn-pi-agent」，再打 `!ls`，磁盘上连续三行都是同一种信封：

```json
{"type":"message","id":"a1","parentId":null,"timestamp":"…","message":{"role":"user","content":"这个仓库叫什么？"}}
{"type":"message","id":"a2","parentId":"a1","timestamp":"…","message":{"role":"assistant","content":[{"type":"text","text":"learn-pi-agent"}],"api":"…","provider":"…","model":"…","usage":{…},"stopReason":"stop"}}
{"type":"message","id":"a3","parentId":"a2","timestamp":"…","message":{"role":"bashExecution","command":"ls","output":"AGENTS.md\n…","exitCode":0}}
```

外层 `type` 都是 `"message"`。分叉在里层 `role`。里层也不是只改了一个字段：`user` 的 `content` 常常是一句字符串；`assistant` 是块数组，还带 `api` / `provider` / `model` / `usage` / `stopReason`；`bashExecution` 换成 `command` / `output` / `exitCode`。形状跟着 role 变。

压缩**不是**再包一条 `type: "message"`。它自己就是另一种节点：

```json
{"type":"compaction","id":"c1","parentId":"a3","summary":"…","firstKeptEntryId":"…"}
```

打开会话时才把这行收成内存里的 `{ role: "compactionSummary", … }`。磁盘上没有 `message.role: "compactionSummary"` 这种行。代码里写明了：摘要不要写成 message 条目，否则树上不好找。

## 第 4 节：下一轮 HTTP 只吃三种 role

供应商 API 只认 `user` / `assistant` / `toolResult` 三种 role，不认 `bashExecution`。下一句你才真正 `prompt` 的时候，`convertToLlm` 把产品 role 译成模型认识的 user：

````text
Ran `ls`
```
AGENTS.md
reconstruct/
…
```
````

`!!ls` 的 Message 多一个 `"excludeFromContext": true`：画面还在，这一步直接跳过。压缩摘要同样译成一条 user，前后有固定套话，正文包在 `<summary>` 里。流程见 [pi-compaction.md](pi-compaction.md) 第 6 节。

`transformContext` 可选：修剪或注入。`convertToLlm` 每轮必做。

## 第 5 节：对照 reconstruct

| reconstruct（slice-07） | pi v0.85.1 |
|-------------------------|------------|
| Event 是对话真相；Console 和 jsonl 都听那一根 | 对话真相是 `state.messages`；Event 只是生命周期 |
| jsonl 一行一个 `type: "event"`，里面再包 `user_message` / `tool_call` | jsonl 一行一个 `SessionEntry`；对话走 `type: "message"` + 里层 `role` |
| `eventsToMessages` 把事件账译成 Completions 的 `messages` | `convertToLlm` 把 `state.messages`（含产品 role）译成 LLM 的 `Message[]` |
| 没有 `!` 前缀这条路；bash 只当 function tool | `!ls` → `role: "bashExecution"`；模型调的 bash 仍是 `toolResult` |

觉得自定义 role 像 Event，是因为 reconstruct 的 Event 承担了「对话真相」。官方把真相换到 `state.messages` 上了：要留在屏幕上的，用 `role`；只表示「这一秒 loop 在干嘛」的，才用 Event 的 `type`。
