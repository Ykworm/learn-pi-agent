# 对照快照：第一次出现的网页皮

只读。不要改这里的文件，不要把整包抄进 `reconstruct/`。

## 冻结点

[badlogic/pi-mono](https://github.com/badlogic/pi-mono) 的 Git tag **`v0.6.0`**：

- 提交：`00d8286523a3f0e048bd3da70364c2d4cd917d58`
- 日期：2025-11-12
- 说明：`Handle FinishReason.NO_IMAGE and fix optional chaining`

这是 monorepo **第一次带上 `packages/web-ui` 的 tagged 版本**（`v0.5.43` 还没有这个包）。不是今天的 pi。

本目录是稀疏快照，只留了网页相关两包：

| 路径 | 当时职责 |
|------|----------|
| [`packages/web-ui/`](packages/web-ui/) | `@mariozechner/pi-web-ui`：Lit 聊天组件 + 包内自己的 `Agent` |
| [`packages/proxy/`](packages/proxy/) | 浏览器跨域时用的 CORS / OAuth 代理 |

没有把当时的 `packages/agent`、`coding-agent`、`tui` 再拷一份。首个提交的 agent 仍看 [`../pi-mono-a74c5da/`](../pi-mono-a74c5da/)。

## 和首个提交、和今天的差别

- **2025-08-09 `a74c5da`：** 只有 `packages/agent` 的 TUI / Console / `--json`。没有网页组件。
- **2025-11-12 `v0.6.0`：** 网页是独立包。`ChatPanel` / `AgentInterface` `subscribe` 包内 `Agent` 的事件，在浏览器里画。模型 HTTP 多半从浏览器直发（或走 `packages/proxy`），**不是** Node 里跑完 turn 再 `POST /ask` 一次返回事件列表。
- **今天（约 0.85）：** `packages/web-ui` 已从 [pi-mono main](https://github.com/badlogic/pi-mono) 拿掉。剩下的 `packages/server` / `packages/client` 是 Unix socket + CBOR 的实验服务，不是这套 Lit 聊天组件。npm 上的 `@mariozechner/pi-web-ui` 停在 0.73.1。

## 先读哪几个文件

不要从 artifacts / sandbox 读起。先看事件怎么进屏幕：

1. [`packages/web-ui/README.md`](packages/web-ui/README.md) 和 [`packages/web-ui/example/`](packages/web-ui/example/)
2. [`packages/web-ui/src/agent/agent.ts`](packages/web-ui/src/agent/agent.ts) 的 `AgentEvent` / `subscribe`
3. [`packages/web-ui/src/components/AgentInterface.ts`](packages/web-ui/src/components/AgentInterface.ts) 怎样挂上 `session`
4. [`packages/web-ui/src/ChatPanel.ts`](packages/web-ui/src/ChatPanel.ts) 怎样把 Agent 和输入区拼在一起

和我们第 2 片同一句话：loop / `Agent` 只发事件；皮是听众。这里的皮是 DOM，不是 `console.log`。
