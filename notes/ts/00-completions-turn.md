# 第 0 片补记：一个 turn 里到底发生了什么

读 Chat Completions / Agent loop 时容易绕进去的点，收在这里。第 1 片写代码前，这份比 `agent.ts` 更值得先读懂。

## 第 1 节：费解的地方（先点名）

1. `assistant` 是干什么的？`system` 是不是多余？
2. Agent 是不是按 assistant 的描述去调 Tools？调完 result 怎么「发给 Tools」？
3. `tool` 和下一条 `assistant` 中间没有 `user`，对话怎么还能继续？
4. 一个 turn 里能不能多次调工具？第 2 次 HTTP 是谁发的？
5. 用了 Agent 会不会自动读 `AGENTS.md` 塞进 system prompt？

下面按「正确图像」回答，不再按提问顺序散讲。

## 第 2 节：正确图像（一句话）

模型不会执行命令，也不会自己再打 HTTP。它每次只返回「说话」或「请调这些工具」。本地 Agent 的 `while` 负责：执行工具 → 把结果写成 `role: "tool"` → **再发一次 Completions**。直到某次返回没有 `tool_calls`，这个 turn 才结束。中间没有新的 `user`。

```text
人的一句 user
    → Agent 发第 1 次 HTTP
    → 模型：tool_calls
    → Agent 在本机执行工具
    → Agent 发第 2 次 HTTP（messages 末尾多了 tool 结果）
    → 模型：还要工具 或 开口说话
    → …重复…
    → 模型只回文本 → ask() 返回
```

## 第 3 节：四条 role（system 不是多余的）

`messages[]` 是整段对话的回放。模型只根据这份列表生成**下一条**。

| `role` | 谁写的 | 作用 |
|--------|--------|------|
| `system` | harness | 常驻说明书，通常一条，放最前。和某一轮任务无关。 |
| `user` | 人 | 这一次具体问题。一个 turn 里通常只有一条新的 `user`。 |
| `assistant` | 模型（上次返回，由 Agent 原样塞回） | 已经说过的话，或带 `tool_calls` 的「请执行」。不塞回去，模型就忘了自己要调过什么。 |
| `tool` | Agent（本机执行后） | 某个 `tool_call_id` 的执行结果。给**模型**看，不是再喂给 bash。 |

`system` 不是可删装饰。没有它 API 也能调，但 harness 没法稳定规定「你是谁、能用哪些工具」。第一版用 `--system-prompt`，默认 `"You are a helpful assistant."`。`user` 是这一次任务；二者分工不同。

OpenAI 后来还有 `developer`，更老的接口有 `function`。第一版 Completions 只需要上表四个。

## 第 4 节：result 不是发给 Tools 的

容易说反：以为「call 完要把 result 发回 Tools」。

- Tools 在本机已经跑完，产出的是字符串。
- 字符串要进入**下一次** Completions 请求，`role` 必须是 `"tool"`，并带上对应的 `tool_call_id`。
- 收件人是 LLM。工具进程已经结束。

`tool` 和下一条 `assistant` 之间没有 `user`，因为协议把「后面跟着 tool 消息」当成**同一轮的继续**，不是新对话。人没有再提问。

## 第 5 节：一个 turn 可以有多次工具调用

两层都成立。

- **同一条 assistant 里可以有多个 `tool_calls`**（一次要 glob 又要 rg）。Agent 逐个执行，每条结果都变成 `tool`，再一次 HTTP 送回去。
- **同一个 turn 里可以有多轮 HTTP**：模型看完结果还能再要工具。仍是那一次 `ask()`，仍没有新 `user`。

「本 turn 结束」不是模型另发结束标记，而是：**这次返回没有 `tool_calls`，只有文本**。`while` 停。Escape / 请求失败也会提前停。

人再打一句，才是下一个 turn，才会再 push 一条 `user`。

第 2 次、第 3 次 HTTP 都是 **Agent 本地 loop** 发的。模型没有「自己再请求」的能力。

## 第 6 节：例子（同一句 user，三次 HTTP）

用户只说：`src 里 loop 写在哪？`

**第 1 次 HTTP**（Agent 发）：messages = system + 这一条 user。模型一次要两个工具：

```text
assistant
  tool_calls:
    call_1  glob    { "pattern": "src/**/*.ts" }
    call_2  rg      { "args": "while ( tool_calls" }
```

本机执行后，messages 末尾是：

```text
system     You are a helpful assistant.
user       src 里 loop 写在哪？
assistant  tool_calls: [call_1 glob, call_2 rg]
tool       call_1 → reconstruct/src/.gitkeep
tool       call_2 → 没有匹配
```

**第 2 次 HTTP**（仍是 Agent 发，无新 user）。模型再要一次 `read`。再 append 一条 assistant（带 `tool_calls`）和一条 `tool`。

**第 3 次 HTTP**。模型只回文本，本 turn 结束：

```text
assistant  loop 在对照仓 agent.ts 的 callModelChatCompletionsApi；
           reconstruct/src 现在是空的。
```

计数：`user` 1 条；工具 3 次（前两次同一轮，`read` 下一轮）；HTTP 3 次；都由 Agent 发起。

## 第 7 节：第一版不读 AGENTS.md

原始 `pi-agent`（提交 `a74c5da`）**不会**读仓库里的 `AGENTS.md`。system 只有 `--system-prompt`。

Cursor、后来的 pi coding agent 往往会把 `AGENTS.md` 一类项目文件注入上下文；那是另一代产品。我们重建的 **agent 运行时第 1 片也不读它**。

本学习仓库根目录的 [`AGENTS.md`](../../AGENTS.md) 是给写代码的人 / 助手看的（怎么拆文件、TS 与 Go 一起改），**不会**自动塞进模型的 system prompt。

第 1 片把这个 turn 写成代码：TypeScript [01-loop.md](01-loop.md)；Go [../go/01-loop.md](../go/01-loop.md)。
