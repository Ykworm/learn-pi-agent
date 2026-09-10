# 这些组件是怎么长出来的

分层图（[pi-v0.85.1-layers.md](pi-v0.85.1-layers.md)）是**一年后的产品横切面**。你卡，是因为一张图把还没长出来的和已经会的叠在一起。本篇按时间讲。`createAgentSessionRuntime` 先别读。

对照课已经走完的，就是 2025-08 首个提交里能跑的那一层。后面都是在那一层**外面**长的。

## 第 1 节：三个叫 session 的东西

不要把词叠在一起：

| 说法 | 它是什么 | 你已经见过的 |
|------|----------|--------------|
| 对话 session 文件 | 磁盘上的 jsonl。一行一条记录，下次还能接着问 | 第 5 片 `SessionManager`、`.sessions/` |
| `AgentSession` | **进程里的产品对象**。手里握着 Agent、工具表、SessionManager、压缩、扩展 | 首个提交里**没有**这个类；当时 CLI 直接 `new Agent` |
| OS 进程 | `pi` 这个程序。`spawn` 是再开一个这种进程 | 你跑 `npx tsx src/cli.ts` 就是一个进程 |

`AgentSession` 不是对话文件，也不是进程。它是「把产品壳装在内存里」的那一个对象。对话文件是它里面的 `SessionManager` 在写。进程是它住的房子。

## 第 2 节：时间线（只记因果）

```text
2025-08  首个提交 a74c5da = 对照课第 0–7 片
         Agent.ask + loop + 事件 + 五个工具 + jsonl 文件 + CLI 三种皮
         原文交互皮已经是 TUI；本仓库改成 readline，TUI 不做

2025-11  v0.6.0 网页皮
         又一种听众：浏览器里 subscribe Agent，不是 POST /ask

之后     产品功能往 Agent 外面抽
         技能、扩展、压缩、edit/write、登录、模型目录
         抽出 AgentSession，让 TUI / Print / RPC / 嵌入方共用
         模型 I/O 搬进 pi-ai；loop 搬进 pi-agent-core

2026-09  v0.85.1
         分层图上的那些格子。createAgentSession() 是进 L2 的工厂，不是第四张皮
```

对照课的刀序没有变。第 1 片的 loop 今天还在 L3。变的是：**多了一个同进程听众，产品壳从 CLI 里长出来，单独成了一层。**

## 第 3 节：皮还是三种 CLI，嵌入方是第四个听众

首个提交（第 6 片）只有三种入口，差别只是听众：

| 当时 | 人怎么说话 | 事件怎么出来 |
|------|------------|--------------|
| 单次 | 命令行参数一句 | 终端字 / 退 |
| 交互 | 终端里接着打 | 原文 TUI；本仓库 readline |
| `--json` | 有句子就问完退；没句子则 stdin 一行一条 JSON | stdout 一行一条事件 |

一年后还是「只换听众」。多出来的不是第四张皮函数，是：已经在 Node 里就自己 `subscribe`，不必 spawn。

| 今天 L1 | 对应当时 | 多出来的 |
|---------|----------|----------|
| Interactive | 交互 | 官方这条**就是 TUI**（`pi-tui` 自绘屏幕），不是「普通命令行问答」。要普通问答：反复跑 `pi -p`，或用本仓库的 readline |
| Print | 单次 | `pi -p` 打终答文本；`--mode json` 打事件 JSONL。**不是**磁盘 session 文件 |
| RPC | `--json` 没句子那条 | 命令集变大了（prompt / abort / 切模型…），仍是 stdin/stdout JSONL |
| 嵌入方 `subscribe` | 当时没有同进程 SDK | 你的程序当听众。先进 `createAgentSession()` 拿到 `AgentSession`，再订事件 |

`createAgentSession()` 画在皮和 `AgentSession` 之间：三种 CLI 皮和嵌入方都走它。不要把它和 TUI 并列成「第四种皮」。

`spawn`：宿主进程（IDE、你的 demo）再开一个 `pi --mode rpc` 子进程，管道当电线。同进程嵌入连这根管子都没有，`subscribe` 就是函数调用。

Print 默认不是「把 LLM 的 JSONL 打出来」。`pi -p` 只打给人看的终答。要事件流用 `--mode json`。RPC 才是双向 JSONL：你还能往里写命令。

## 第 4 节：subscribe 和「Agent、工具、jsonl、登录、扩展」怎么连

先有东西在跑，才有事件可订。因果是：

```text
createAgentSession() 组装：
  Agent（L3 loop）
  + 工具表（read/bash/edit/write 的名字 → 真正的 function tool）
  + SessionManager（jsonl 文件听众）
  + ModelRuntime（登录、模型目录）
  + ResourceLoader 扫到的扩展 / 技能
  → 得到 AgentSession

皮：session.subscribe(听众)
    session.prompt("一句话")

prompt 启动 loop。
loop 只 emit。
AgentSession 自己先订了一份（用来写 jsonl、压缩、转给扩展）。
皮再订一份（用来画屏幕 / 写 stdout / 写 RPC 电线）。
全量 fan-out，和第 2 片同一个形状。
```

`subscribe` **不是**那些组件的替代。它是那些组件已经装好之后，**往外看**的窗口。没组装就没有事件；只组装不订阅，turn 仍会跑，只是你看不见。

工具：schema 里的 `name: "read"` 先进工具表，loop 收到 tool call 才 `runTool`。`AgentSession` 不替 loop 执行工具；它把名字对应的 tool 对象写进 `agent.state.tools`，loop 按名字调。和第 3 片 `runTool` 的 switch 同一分叉点，登记处从 CLI 搬到了 `AgentSession`。

## 第 5 节：cwd 和 `~/.pi/agent`

`cwd` 是**你正在做的那个项目目录**（启动 `pi` 时的当前工作目录）。工具的相对路径、项目里的 `AGENTS.md` / 扩展，都相对它。

`~/.pi/agent` 是**用户全局的家**，不是项目仓库，也没有把项目软链进去。第一次用可能几乎是空的，用过之后常见：

| 路径 | 干什么 |
|------|--------|
| `auth.json` | 密钥 / OAuth 登录态 |
| `settings.json` | 默认模型等 |
| `models.json` | 你加的模型，或刷新下来的目录 |
| `sessions/<把 cwd 编成的目录>/` | 这个项目的对话 jsonl |
| `prompts/` `themes/` `bin/` | 可选 |

会话文件按 cwd 编码放进全局目录：目录名 = `--` + cwd 去掉开头的 `/`、剩下的 `/` 全换成 `-` + `--`（`/Users/me/proj` → `sessions/--Users-me-proj--/`）。**只是借路径当目录名，不是 symlink**，项目代码仍在原来的地方。

首个提交更简单：模型名写在 CLI 参数里，密钥环境变量。一年后有 Claude / GPT / Gemini / 订阅登录，模型 id 和「怎么鉴权、上下文多长」会变，所以有一份**模型目录**（内置 + 可刷新 + `models.json` 覆盖）。没有目录，TUI 的模型选择器和 `/login` 就不知道能切到谁。reconstruct 不需要它：`config.json` 里写死一个 `model` 就够。

## 第 6 节：ResourceLoader 不是 ClassLoader

相似的只有一句：按约定从几个根目录**找文件**。

Java `ClassLoader` 还要：字节码、双亲委派、linkage、命名空间。`DefaultResourceLoader` 没有这些。它是启动时扫一遍：

- 全局 `~/.pi/agent/`
- 项目侧：`cwd`（和它的祖先目录）里的 `AGENTS.md`，`<cwd>/.pi/` 下的 `skills/`、`extensions/`…

读 markdown / 扩展脚本，交给 `AgentSession`。更像「配置发现」，不像加载类。先记住：不传路径就按默认目录找；传入 `resourceLoader` 就用你的。

## 第 7 节：现在先不要读的

| 名字 | 干什么 | 何时再看 |
|------|--------|----------|
| `createAgentSessionServices()` | 按 cwd 准备 settings / loader / ModelRuntime，还不造 session | 你要自己换工作目录时 |
| `createAgentSessionRuntime()` | `/new` `/resume` `/fork` 时毁掉旧 `AgentSession` 再造一个 | 你已经会一份 session 的 prompt / subscribe 之后 |
| Event / Message / jsonl 的 `type` | 自定义 role 不是第 2 片那种事件 | 会 `prompt` / `subscribe` 之后读 [pi-messages.md](pi-messages.md) |
| Compaction 实现细节 | 窗口满了把旧消息收成摘要 | 会 `prompt` / `subscribe` 之后读 [pi-compaction.md](pi-compaction.md) |
| 扩展钩子、pi-tui | 产品功能 | 对照课明确说不做 TUI；扩展不是 loop |

工厂三件套里，**只记 `createAgentSession()` → `AgentSession`**。旁边两个是「换房子」用的。

## 第 8 节：建议的下一眼

1. 跑 [demos/jsonl-rpc-vs-sse](demos/jsonl-rpc-vs-sse/README.md)，看 RPC 和 SSE 的字节差。
2. 把分层图里 L1 的四个听众格子，对照第 3 节那张表；工厂在皮和 `AgentSession` 之间。
3. 还想看皮：官方网页是 `vendor/pi-web-ui-0.75.3/` 的 `subscribe`，不是 Gin 的 `POST /ask`。
4. 还想看 Agent：继续盯 reconstruct 的 loop。今天的 L3 就是它搬家之后的名字。
