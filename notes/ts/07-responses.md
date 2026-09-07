# 第 7 片：第二条 API（Responses）

前置阅读：[06-cli.md](06-cli.md)。本片不换事件、不换五个工具的本机实现、不换三种 CLI 皮。换的是：**同一套 while，另一套 HTTP 信封**。

对照原文：[`agent.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/agent.ts) 里的 `callModelResponsesApi` / `setEvents` 的 Responses 一半，以及 [`tools.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/tools/tools.ts) 的 `toolsForResponses`。我们不抄 TUI、不抄 `previous_response_id`、不抄通用 [`args.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/args.ts)、不把 `reasoning.effort` 写死进每一请求。

## 第 1 节：本片要证明什么

第 1–6 片的 Agent 只会对 `POST /v1/chat/completions` 说话。请求体是 `messages[]`，每条有 `role`。模型若要调工具，回 `message.tool_calls`。本机结果再写成 `role: "tool"`。

Responses 是另一条路：`POST /v1/responses`。请求体是 `input[]`（条目带 `type`），说明书走 `instructions`。模型若要调工具，output 里出现 `type: "function_call"`。本机结果写成 `type: "function_call_output"`。

正确形状按因果是：

1. **先有 tool schema 里的 `name: "rg"`，才有 `runTool` 的 `case "rg"`。** 两条 API 只是 schema 外套不同：Completions 套一层 `function: { name, parameters }`；Responses 把 `name` 放在顶层。本机 `runTool` 仍按同一个名字分发。
2. **loop / `ask()` 仍然只 emit。** `--json`、Console、jsonl 听众都不改。`thinking` 两条路都会发：Completions 读 `message.reasoning_content`；Responses 读 output 里的 `reasoning`。
3. **磁盘仍是事件日志。** `--continue` 时按 session 头里的 `api` 选翻译函数：Completions 走 `eventsToMessages`，Responses 走 `eventsToResponsesInput`。不要把两套 input 形状写进 jsonl。

磁盘不存 `messages[]`，不是因为人看不懂 `role`。事件日志里还有 `token_usage`、`interrupted`、`assistant_start`，这些不能塞进 HTTP 请求体；Console / `--json` 听的也是事件。现在又有两套信封，一份 jsonl 才能翻译成 Completions 或 Responses。若永远只有 Completions、也不记用量和取消，直接存 `messages[]` 确实更短。

`config.json` 里 **Completions 和 Responses 各有一份 endpoint**。默认 `api` 仍是 `completions`（DeepSeek）。`--api responses` 会连 `baseURL` / `model` / 密钥一起换成 `responses` 那一套（示例是 OpenAI）。密钥写在 `config.local.json` 的 `completions.apiKey` / `responses.apiKey`，不要提交。旧的顶层 `"apiKey"` 只当作 Completions 的密钥，以免把 DeepSeek 的 key 发到 OpenAI。

## 第 2 节：两套信封

```text
Completions                         Responses
POST /v1/chat/completions           POST /v1/responses
messages: [{ role, content }]       input: [{ type, ... }]
system = messages[0]                system = instructions（不进 input）
tools[].function.name               tools[].name
assistant + tool_calls              type: function_call（call_id / name / arguments）
role: tool + tool_call_id           type: function_call_output（call_id / output）
choices[0].message.content          output[] 里 type: message 的 output_text
reasoning_content → 事件 thinking    type: reasoning → 事件 thinking
请求多带 thinking.enabled（DeepSeek）  本片不写死 reasoning.effort
```

`ask()` 仍然只 push 一次 user。有 function_call 就本机执行再请求；没有则结束。Ctrl+C 仍走第 4 片那根 `AbortSignal`。

原文 `ask()` 在 Responses 路上也 push `{ role: "user", content }`。这是 EasyInputMessage，协议允许。我们 live turn 同样这么写。还原时 function_call 必须带 **`call_id`**，才能和后面的 `function_call_output` 对上。原文 `setEvents` 写成了 `id`，和 loop 里用的 `call_id` 对不上；我们按协议用 `call_id`，不抄那个笔误。

## 第 3 节：文件怎么拆

| 文件 | 职责 |
|------|------|
| [`reconstruct/src/agent/responses.ts`](../../reconstruct/src/agent/responses.ts) | Responses 的 `for (;;)`：create、执行工具、emit |
| [`reconstruct/src/agent/loop.ts`](../../reconstruct/src/agent/loop.ts) | Completions 那条 loop，不删 |
| [`reconstruct/src/agent/agent.ts`](../../reconstruct/src/agent/agent.ts) | 按 `api` 选 loop；Completions 一本 `messages`，Responses 一本 `input` |
| [`reconstruct/src/tools/run.ts`](../../reconstruct/src/tools/run.ts) | `COMPLETION_TOOLS` 和 `RESPONSE_TOOLS` 同一批名字 |
| [`reconstruct/src/session/messages.ts`](../../reconstruct/src/session/messages.ts) | `eventsToMessages` + `eventsToResponsesInput` |
| [`reconstruct/src/cli.ts`](../../reconstruct/src/cli.ts) | 多 `--api completions\|responses` |
| [`reconstruct/src/events.ts`](../../reconstruct/src/events.ts) | 多 `{ type: "thinking"; text }` |

`--api` 只覆盖新 session。`--continue` 以 jsonl 文件头里的 `api` 为准，和 `model` / `baseURL` 一样。第 6 片留下的旧文件没有 `api` 字段，读的时候当成 `completions`。

## 第 4 节：怎么跑

工作目录是 `reconstruct/`。默认仍走 Completions，命令和第 6 片相同：

```bash
cd reconstruct
npx tsx src/cli.ts "列出当前目录"
```

session 行会多一个 `api=completions`。

要走 Responses，先在 `config.local.json` 填 `responses.apiKey`（或设 `OPENAI_API_KEY`），再：

```bash
npx tsx src/cli.ts --api responses "1+1 等于几？不要调工具"
```

这会改用 `config.json` 里 `responses` 那一套 `baseURL` / `model`，不是拿 DeepSeek 去打 `/v1/responses`。端点或模型要换，覆盖 `config.local.json` 的 `responses` 对象即可。

聊天页上的「think」和 Completions 的 `reasoning_content`、Responses 的 `reasoning` 是同一类东西：模型推理过程。Completions 这条 loop **读** `message.reasoning_content`，有就发 `thinking`。DeepSeek V4 默认有时不回这段，请求里带 `thinking: { type: "enabled" }` 才稳定。本仓库每次 Completions 都带 `tools`，DeepSeek 要求下一轮把 `reasoning_content` 挂回那条 assistant；`eventsToMessages` 也是这样还原。OpenAI 做 Responses，不是为了把 think 改个名；当时是一套以 item 为单位的新信封（`input` / `function_call` / `instructions`），原文加它是为了接 GPT-OSS。推理条目只是信封里顺带有的一种 type。

Cursor 里：F5 选 **Debug reconstruct CLI** 仍是 Completions。看 Responses 时把 `args` 加上 `--api`、`responses` 和那句问。断点打在 [`runResponsesTurn`](../../reconstruct/src/agent/responses.ts) 的 `client.responses.create`。

正在跑时 Ctrl+C：仍印 `interrupted`，走第 4 片那根 `AbortSignal`。

## 第 5 节：看代码时盯这几行

1. `ask()` 里 `if (this.api === "responses")` 才进 `runResponsesTurn`。三种 CLI 皮看不见这个分叉。
2. `RESPONSE_TOOLS` 从 `COMPLETION_TOOLS` 映射：`name` 仍是 `"rg"`，只是不再包在 `function` 里。
3. 有 `function_call`：先把 output item 推进 `input`，再 `runTool`，再推进 `function_call_output`。`call_id` 对上，不是 Completions 的 `tool_call_id` 字段名。
4. `eventsToResponsesInput` 看见 `thinking` 会写成 `reasoning`；`eventsToMessages` 把它挂到紧跟着的那条 assistant 的 `reasoning_content`。jsonl 里两种事件都在。
5. `instructions: systemPrompt` 每次 create 都带。input 数组里没有 `role: "system"`。

## 第 6 节：本片故意没有的

TUI、`previous_response_id`（服务端替你记会话）、把 `reasoning.effort` 写进每一请求、通用 args 解析器、命令行覆盖 `baseURL`。缺了它们，两条信封已经能共用同一套事件和工具。

## 第 7 节：你该能回答的问题

1. 为什么换 Responses 不必改 `runTool` 的 switch，也不必改 Console / `--json`？
2. Completions 的 `role: "tool"` 和 Responses 的 `function_call_output`，分别用哪一个 id 字段对上那一次 tool call？
3. `thinking` 会不会进 Completions 的 `messages`？会不会进 Responses 的 `input`？jsonl 里有没有它？
4. `--continue` 一份第 6 片留下的、头里没有 `api` 的 jsonl，会走哪条 loop？

答得出来这一片就结束了。卡住就问。不要自己先写 TUI。

Go 对照（SDK union、`instructions`、Gin 读 `config.api`）：[../go/07-responses.md](../go/07-responses.md)。
