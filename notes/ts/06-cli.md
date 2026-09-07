# 第 6 片：CLI 三种皮（单次、交互、`--json`）

前置阅读：[05-session.md](05-session.md)。本片不改 turn，不改 loop，不改 jsonl 形状。换的是：**同一套事件，三种入口**。Ctrl+C 仍走第 4 片那根 `AbortSignal`。

对照原文：[`cli.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/cli.ts)、[`json-renderer.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/renderers/json-renderer.ts)。我们不抄 TUI、不抄通用 [`args.ts`](../../vendor/pi-mono-a74c5da/packages/agent/src/args.ts)、不抄 Responses、不抄 `--api`。

## 第 1 节：本片要证明什么

第 5 片的 CLI 只能问一句就退。人要接着问，得再开进程加 `--continue`。程序要接这条事件流，只能去刮 `[assistant]` 这种给人看的字。

正确形状按因果是：

1. **听众仍是构造时挂上的。** `--json` 只是把 `ConsoleRenderer` 换成 `JsonRenderer`。loop 看不见这个差别。
2. **有没有位置参数，决定进程退不退。** 有句子：按顺序 `ask()` 再退（单次）。没有：循环里再读下一句（交互）。
3. **`--json` 且没有句子，stdin 不再是人打字。** 一行一条 JSON 命令：`message` 去 `ask()`，`interrupt` 去 `interrupt()`。事件一行一个 JSON 打到 stdout。

磁盘上的 session jsonl 和 `--json` 的 stdout 不要混：都是一行一个 JSON，听众不同。SessionManager 写文件；JsonRenderer 写 stdout。

每个位置参数是一句独立的 `user`。`npx tsx src/cli.ts "第一句" "第二句"` 会 `ask` 两次再退，中间不退进程。第 5 片曾把参数 `join` 成一句，本片改掉，和原文一致。

## 第 2 节：怎么选皮

```text
            有位置参数                 没有位置参数
Console     依次 ask，印给人看，退     readline：`>` 提示符，反复 ask
--json      依次 ask，事件打 stdout    stdin 收 JSON 命令，事件打 stdout
```

原文交互走 TUI（Escape 停、画旧事件）。我们交互走 readline + 已经有的 `ConsoleRenderer`。`interrupt()` 仍是第 4 片那个方法；提示符上 Ctrl+C 结束进程，正在 `ask` 时 Ctrl+C 只停这一 turn。

## 第 3 节：JsonRenderer 为什么几乎没有代码

[`json.ts`](../../reconstruct/src/renderers/json.ts) 就是 `JSON.stringify(event)` 再 `console.log`。它不 `switch` type。`token_usage` 在终端皮里被忽略，在 `--json` 里会出现，因为换的是听众，不是 loop 少发了。

协议出错（stdin 不是 JSON、缺 `content`）时，CLI **直接** `renderer.on({ type: "error", message })`，不经 `emitAll`。所以 `.sessions` 文件不记这些行。这不是 loop 的事件，是入口自己的失败。

## 第 4 节：`--json` 交互的 stdin

进程挂着，等一行：

```json
{"type": "message", "content": "1+1 等于几？不要调工具"}
{"type": "interrupt"}
```

上一句还在跑时又来一句 `message`：先记下，等当前 `ask()` 结束再问。`interrupt` 立刻 `agent.interrupt()`，不必等。

stdin 关掉（管道结束，或 Ctrl+D）进程退。不要在 JSON 流里印 `>`，那会把流弄脏。

## 第 5 节：文件怎么拆

| 文件 | 职责 |
|------|------|
| [`reconstruct/src/renderers/json.ts`](../../reconstruct/src/renderers/json.ts) | 最薄听众：事件 → stdout JSONL |
| [`reconstruct/src/cli.ts`](../../reconstruct/src/cli.ts) | 解析旗标、选皮、单次 / 交互 / JSON 交互 |
| [`reconstruct/src/events.ts`](../../reconstruct/src/events.ts) | 多一种 `{ type: "error"; message }` |
| [`reconstruct/src/renderers/console.ts`](../../reconstruct/src/renderers/console.ts) | 多印 `[error]` |

loop、工具、SessionManager、`eventsToMessages` **不改**。`error` 不进 `messages`（翻译里走 `default` 跳过）。

本片只有 `--continue` / `--json` / `--help` 和位置参数，不抄原文那份通用 args 解析器。

## 第 6 节：怎么跑

工作目录是 `reconstruct/`。

```bash
cd reconstruct

npx tsx src/cli.ts --help

npx tsx src/cli.ts "列出当前目录"
npx tsx src/cli.ts "1+1 等于几？不要调工具" "再加 3 呢？不要调工具"

# 无参数 = 交互。输入一句回车；exit 结束
npx tsx src/cli.ts
npx tsx src/cli.ts --continue

npx tsx src/cli.ts --json "1+1 等于几？不要调工具"
# stdout 每一行都是一条 AgentEvent，含 token_usage

printf '%s\n' '{"type":"message","content":"1+1 等于几？不要调工具"}' | npx tsx src/cli.ts --json
```

第二句单次若接在同一进程，模型应能用上一句的终答，不必 `--continue`。跨进程仍用 `--continue`。

Cursor 里：F5 选 **Debug reconstruct CLI** 仍是单次一句。要看 `--json`，把 `args` 改成 `src/cli.ts`、`--json` 和那句问。断点打在 [`JsonRenderer.on`](../../reconstruct/src/renderers/json.ts) 和 [`cli.ts`](../../reconstruct/src/cli.ts) 的 `runJsonInteractive`。

正在跑时 Ctrl+C：仍应印 `interrupted`（Console）或 stdout 一行 `{"type":"interrupted"}`（`--json`）。JSON 交互也可以往 stdin 写 `{"type":"interrupt"}`，走同一个 `interrupt()`。

## 第 7 节：看代码时盯这几行

1. `new Agent(config, renderer, session)`：`--json` 只换了中间那个听众。
2. `JsonRenderer.on`：没有 `switch`。
3. `messages.length === 0` 才进交互；有句子就 `runSingleShot`。
4. JSON 交互的 `interrupt` 调 `agent.interrupt()`，不 `process.exit`。
5. `reportError` / `renderer.on({ type: "error" })` 不经过 `emitAll`。

## 第 8 节：本片故意没有的

TUI、把旧事件重绘一遍、Escape 停、`--api responses`、命令行覆盖 `baseURL` / `apiKey`。缺了它们，三种皮已经能用同一套 loop。

## 第 9 节：你该能回答的问题

1. 为什么 `--json` 不必改 loop，只要换听众？
2. session 文件里的一行和 `--json` stdout 里的一行，谁写的、包不包 `timestamp`？
3. 无参数交互时，模型怎么还记得上一句？这和 `--continue` 是不是同一条路？
4. stdin 上的 `{"type":"interrupt"}` 和终端 Ctrl+C，最后有没有汇合到同一个 `interrupt()`？

答得出来再开第 7 片（Responses）：[07-responses.md](07-responses.md)。卡住就问。

Go 对照（stdin goroutine、Gin 不改）：[../go/06-cli.md](../go/06-cli.md)。
