# demo 与 pi v0.85.1 的差距

对照课冻结在 `slice-07` 之后，「demo 和今天的 pi 差多少、差在哪层」要一眼可查，不能像当年那样凭印象。这份笔记把差距按 L1–L5 分层列成表：已对齐 / 部分对齐 / 未实现 / 明确不做，给「再开一片选什么」做依据。

- demo 冻结点：Git tag `slice-07`（TS [`reconstruct/`](../../reconstruct/) + Go [`reconstruct-go/`](../../reconstruct-go/)）
- pi 冻结点：Git tag `v0.85.1`（提交 `d981de1`，2026-09-05），快照 [vendor/pi-v0.85.1/](../../vendor/pi-v0.85.1/SNAPSHOT.md)
- 盘点日期：2026-09-10。分层口径和行内术语见 [pi-v0.85.1-layers.md](pi-v0.85.1-layers.md)

## 第 1 节：一句话结论

L3 运行时内核（loop、事件、取消、两条信封）已对齐；差距集中在 L2 产品壳（`AgentSession`、分支 session、compaction、扩展体系）和 L4 的多供应商与认证。

| 状态 | 数量 | 含义 |
|------|------|------|
| 已对齐 | 7 | 语义相同，TS / Go 双端各一份 |
| 部分对齐 | 8 | 形状对，粒度或集合不同 |
| 未实现 | 15 | demo 没有这块 |
| 明确不做 | 1 | 仓库规则禁止（TUI） |

## 第 2 节：L3 Agent 运行时（对照课主轴）

| 状态 | 能力 | pi v0.85.1 | demo（slice-07） |
|------|------|------------|------------------|
| 已对齐 | turn loop | 有 tool call 就本机执行再请求，直到没有 | 同语义，TS / Go 双端各一份 |
| 已对齐 | 事件 fan-out | `subscribe` 听众数组，只 emit、不按 type 中央路由 | `events` / `emitAll` 同语义 |
| 部分 | 事件粒度 | 生命周期：`agent_start` / `message_update` / `tool_execution_*` / `turn_end` | 流水账：`tool_call` 等一条条，画面靠 `eventsToMessages` 译回 |
| 已对齐 | 取消 | `AbortSignal`；取消不是工具失败 | `AbortSignal`（TS）/ `ctx`（Go），事件 `interrupted` |
| 部分 | 工具执行 | 默认并行（`toolExecution: "parallel"`），可切串行 | 串行执行，输出截断（`cap`） |
| 部分 | 对话真相 | `Agent.state.messages`（+ `streamingMessage` 半成品） | jsonl 事件账是真相，messages 是译回的视图 |
| 未做 | 上下文装配注入点 | `transformContext` / `convertToLlm` / `streamFn` / 工具前后钩子 | 无；loop 内固定拼装 |
| 未做 | 自定义 role | `bashExecution` / `compactionSummary` / `branchSummary` / `custom` | 只有 user / assistant / tool result |
| 未做 | turn 队列 | `steer` / `followUp` / `waitForIdle` / `reset` | 一句一个 turn，无插队概念 |

## 第 3 节：L4 模型 I/O

| 状态 | 能力 | pi v0.85.1 | demo（slice-07） |
|------|------|------------|------------------|
| 已对齐 | OpenAI Completions | `pi-ai` 里的一家信封 | 手写 `chat/completions` 流 |
| 已对齐 | OpenAI Responses | 同上 | 手写 Responses 流，`--api` 切换 |
| 部分 | provider 分派 | `streamSimple` 按 `model.api` 自动选 provider | `--api` 手动二选一 |
| 未做 | 其他供应商 | Anthropic / Gemini / Mistral / Bedrock 等 20+ 模型目录 | 无 |
| 未做 | 认证 | OAuth（设备码 / 浏览器登录）+ 凭证存储 | 只读 `apiKeyEnv` 环境变量 |
| 未做 | 韧性 | 429 / 5xx 自动 retry、超时配置 | 无重试 |

## 第 4 节：L2 产品壳（差距主力）

| 状态 | 能力 | pi v0.85.1 | demo（slice-07） |
|------|------|------------|------------------|
| 部分 | session 落盘 | jsonl 树（`id` / `parentId`）：`branch` / `fork` / `tree` | 线性 jsonl（`.sessions`），`--continue` 恢复 |
| 未做 | compaction | 找切点 → 模型写摘要 → 重建 messages | 无 |
| 未做 | `AgentSession` 枢纽 | `createAgentSession()` 工厂 + 产品事件（compaction / queue） | 无此层；CLI 直接调 loop |
| 部分 | 默认工具集 | `read` / `bash` / `edit` / `write`（`grep` / `find` / `ls` 可选） | `read` / `list` / `bash` / `glob` / `rg`（对齐首版；改文件走 `bash`） |
| 未做 | 扩展体系 | Extensions / Skills / prompt 模板 / slash 命令 | 无 |
| 部分 | 配置 | `SettingsManager`：global + project 两层 | 单文件 `config.json`（+ gitignore 的 `config.local.json`） |
| 未做 | 登录与切模型 | `/login` `/model` `/thinking` 运行时可切 | 改配置文件后重启 |

## 第 5 节：L1 皮（只换听众）

| 状态 | 能力 | pi v0.85.1 | demo（slice-07） |
|------|------|------------|------------------|
| 已对齐 | 单次执行 | `pi -p`（print mode） | CLI 带句子单次 |
| 已对齐 | JSON 事件流 | `--mode json`，一行一条事件 | `--json` 只换听众，不改 loop |
| 部分 | 交互皮 | 流式渲染、slash 补全、运行中切模型 | TS readline；Go Gin 网页一次 POST 一句 |
| 未做 | RPC 嵌入 | `--mode rpc`：stdin/stdout JSONL，命令带 `id`、事件回推 | 无（Go 的 HTTP 口不是这个协议） |
| 未做 | 同进程嵌入 | import 库后 `session.subscribe(听众)` | demo 是 CLI 程序，未包成可嵌入库 |
| 不做 | 全屏 TUI | `pi-tui`：差分渲染编辑器 / Markdown / overlay | 仓库规则明确禁止，不走这条路 |

## 第 6 节：实验侧路（pi 正式二进制也不含）

| 状态 | 能力 | pi v0.85.1 | demo（slice-07） |
|------|------|------------|------------------|
| 未做 | socket server / client | `pi-server` + `pi-protocol`：本机 Unix socket + 长度前缀 CBOR | 无 |
| 未做 | SQLite session 后端 | `session-backends/sqlite-node`：harness 可选持久化 | 无 |
| 未做 | `AgentHarness` | 比 `Agent` 更重的 durable 运行时（`run_*` / `navigation_*` 事件） | 无 |

## 第 7 节：若再开新切片

差距最小又最「Agent 本身」的方向：抽 `AgentSession` 这一层（CLI 不再直接调 loop）、补 `edit` / `write` 工具、并行 tool call、session 分支（fork / tree）。compaction 和扩展体系更大，单开一片再议。TUI 与 RPC 按仓库规则不走。

开工前按 [AGENTS.md](../../AGENTS.md) 的冻结流程：确认 TS、Go、笔记都齐，提交、打 annotated tag、连 tag 一起 push，然后才在一片冻净的工作区里写下一片。
