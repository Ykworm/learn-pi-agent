# 第 3 片：工作区工具（`read` / `list` / `bash` / `glob` / `rg`）

前置阅读：[02-events.md](02-events.md)。本片不改 turn 语义，也不改总线：loop 仍然只 `emit`，有 `tool_calls` 就本机执行再 POST。换的是**模型能请本机做什么**。

对照原文：[`vendor/.../tools/tools.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/tools/tools.ts)。不抄 `AbortSignal`（第 4 片）。

## 第 1 节：本片要证明什么

第 1–2 片的 `echo` 只证明「模型能发出 `tool_calls`，本机执行后再送回」。它碰不到磁盘。coding agent 要站住，最少需要：

1. **看**：读一个文件（`read`），列一层目录（`list`），按文件名找（`glob`），按内容搜（`rg`）
2. **做**：跑一条命令（`bash`）——编辑、测试、git、以及一切还没做成专用工具的事，都先走这里

loop **几乎不用改**：还是按名字调用 `runTool`，把返回的字符串推进 `role: "tool"`。变的是工具表，以及「返回值可能很大」。

工具输出会进 `messages`，下一轮 HTTP 模型全看得见。一个 20 MB 的日志原样塞回去，上下文就爆了。所以本片的硬规则是：**进模型的文本超过约 1 MB 就截断，并写明 truncated**。这和终端打多少行是两回事。

## 第 2 节：五个工具各干什么

| 工具 | 模型看到的参数 | 本机做什么 |
|------|----------------|------------|
| `read` | `path`；可选 `offset` / `limit`（行，从 1 计） | 读文件。无窗口且大于 1 MB：只给前 1 MB。有窗口：按行跳过 / 截取，读够就停 |
| `list` | 可选 `path`（默认 `.`） | 当前这一层。目录名带 `/`。不递归 |
| `bash` | `command` | `bash -c` 跑一条。成功且没输出时回一句成功；非 0 当错误（`isError: true`） |
| `glob` | `pattern`；可选 `path` | 按 glob 模式递归找路径。目录名带 `/`。没有匹配不当错误 |
| `rg` | `args`（原样传给 ripgrep） | 按内容搜。退出码 1 = 没有匹配，返回说明文字，**不**标 `isError`。stdin 接到 `/dev/null` |

`echo` 删掉。原文就没有它。

原文的 `read` 只有 `path`，大文件切字节。我们多了行窗口，对应 [00-origin.md](00-origin.md) 第 4 节「截断」：第一版不会把整份大文件喂给模型；要看后面，再调 `bash`，或给 `read` 一个 `offset` / `limit`。

`bash` 没有沙箱。这和原文一样：能读工作区，也就能改工作区。本片不修这个。

## 第 3 节：两处截断不要混

| 哪里 | 截什么 | 为了谁 |
|------|--------|--------|
| 工具实现里 | 约 1 MB 字节 | **模型**。进 `messages` / `tool_result` 事件的 payload |
| ConsoleRenderer | 约 10 行 | **人眼**。事件里仍是那一长段；只是终端不刷屏 |

第 5 片写 jsonl 的听众会拿到完整（已按 1 MB 切过的）`tool_result`，不会经过 Console 的 10 行。

## 第 4 节：文件怎么拆

| 文件 | 职责 |
|------|------|
| [`reconstruct/src/tools/read.ts`](../../reconstruct/src/tools/read.ts) | `read` 的 schema + 本机实现 |
| [`reconstruct/src/tools/list.ts`](../../reconstruct/src/tools/list.ts) | `list` 的 schema + 本机实现 |
| [`reconstruct/src/tools/bash.ts`](../../reconstruct/src/tools/bash.ts) | `bash` 的 schema + `bash -c` |
| [`reconstruct/src/tools/glob.ts`](../../reconstruct/src/tools/glob.ts) | `glob` 的 schema + 本机实现 |
| [`reconstruct/src/tools/rg.ts`](../../reconstruct/src/tools/rg.ts) | `rg` 的 schema + 起 ripgrep |
| [`reconstruct/src/tools/cap.ts`](../../reconstruct/src/tools/cap.ts) | 工具共用的 1 MB 截断 |
| [`reconstruct/src/tools/run.ts`](../../reconstruct/src/tools/run.ts) | 名字分发；导出 `COMPLETION_TOOLS`（和 loop 同一份表） |
| [`reconstruct/src/agent/loop.ts`](../../reconstruct/src/agent/loop.ts) | `await runTool`（bash / glob / rg 是异步的）；不 `switch` 工具名 |

原文把五个工具塞进一个 `tools.ts`。我们按名字拆文件，分发仍只有一处。

## 第 5 节：怎么跑

工作目录是 `reconstruct/`，相对路径相对于这里。

```bash
cd reconstruct
npx tsx src/cli.ts "列出当前目录"
npx tsx src/cli.ts "读 src/agent/loop.ts 的前 30 行"
npx tsx src/cli.ts "用 bash 看现在的日期"
npx tsx src/cli.ts "用 glob 找出 src 下所有 .ts 文件"
npx tsx src/cli.ts "用 rg 搜索 runTool 出现在哪些文件"
```

每一行都是一次新进程、一个 turn。工具跑完 loop 会再 POST 一次，模型才开口；进程在终答之后退出。见 [00-completions-turn.md](00-completions-turn.md) 第 2 节。

Cursor 里：F5 选 **Debug reconstruct CLI**。断点打在 [`run.ts`](../../reconstruct/src/tools/run.ts) 的 `switch`，看模型要的名字和参数字符串。

## 第 6 节：看代码时盯这几行

1. `loop.ts` 仍然 `for (const call of toolCalls)`，仍然先 `tool_call` 再执行再 `tool_result`。它不出现工具名。
2. `COMPLETION_TOOLS` 只在 `run.ts` 组一次。HTTP 的 `tools` 字段和 `runTool` 的 `switch` 必须是同一张表。加 `glob` / `rg` 时这两处一起改。
3. `read` 在带 `offset` / `limit` 时按行读、读够就停，不是先 `readFile` 再切片（否则大文件窗口没有意义）。
4. `bash` 失败是 `throw`，loop 的 `catch` 把 `isError` 打成 `true`。`read` 找不到文件、`glob` / `rg` 没有匹配，都是**返回**字符串，不当异常。
5. Console 对 `tool_result` 只印前 10 行。事件对象本身没有被改短。
6. `rg` 把 stdin 接到 `/dev/null`。若让它继承终端 stdin，在某些环境下会卡住等输入。
7. 模型给的 `arguments` 是 JSON 字符串。`JSON.parse` 在库类型里是 `any`，我们赋给 `unknown`，所以**刚 parse 完**不能写 `parsed.command`。`typeof === "object"`、不是 `null`、再 `"command" in parsed` 之后，TypeScript 已经收窄，可以直接 `parsed.command`（类型仍是 `unknown`）。`(parsed as { command: unknown }).command` 和它运行时一样，是手写取出字段，不是编译器逼写的。有这个键还不等于是字符串，下一行才 `typeof === "string"`。`read` / `list` / `glob` / `rg` 同一套。

## 第 7 节：本片故意没有的

本片当时没有 AbortSignal、JSONL、Responses、TUI、`--json`。没有单独的 `write` 工具：改文件先走 `bash`。取消这一 turn 见 [04-abort.md](04-abort.md)。

## 第 8 节：你该能回答的问题

前半（`read` / `list` / `bash`）：

1. 为什么换工具几乎不用改 loop？要改的那一处是什么？
2. 一个 5 MB 的文件，模型第一次 `read` 会看见什么？它怎样才能看到第 4000 行附近？
3. Console 只印 10 行。下一轮 HTTP 里，模型看到的 `role: "tool"` 是 10 行还是最多 1 MB？

后半（`glob` / `rg`）：

4. `list` 不递归。为什么还要单独做 `glob`，而不是让模型 `bash find`？
5. 用 `bash` 调 `rg` 搜一个不存在的词，和直接调 `rg` 工具，`isError` 有什么差别？
6. `rg` 的参数为什么是一整段 `args` 字符串，而不是 `{ pattern, path, flags }`？

答得出来再开第 4 片（`AbortSignal`）：[04-abort.md](04-abort.md)。卡住就问。

Go 对照（`doublestar`、`rg` 退出码 1）：[../go/03-tools.md](../go/03-tools.md)。
