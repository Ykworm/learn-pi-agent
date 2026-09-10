# JSONL RPC 和 SSE 对照

假 Agent，不调模型。同一段 turn 走两根电线，看字节差在哪。

```bash
cd notes/ts/demos/jsonl-rpc-vs-sse
npx tsx run.ts
```

## 第 1 节：你会看到什么

1. **JSONL RPC**：`run.ts` `spawn` 一个子进程（`jsonl-rpc-server.ts`）。宿主往子进程 stdin 写一行命令；子进程 stdout 先回一条 `response`，再推事件。这是 `pi --mode rpc` 的缩小版。
2. **HTTP SSE**：同进程开一个 HTTP 服务。一次 `POST /prompt`，响应体按 `event:` / `data:` 帧推同一段 turn。供应商流式接口常见这套。

两边的事件内容来自同一份 [`fake-turn.ts`](fake-turn.ts)。

## 第 2 节：不要和另外两本账混

| 东西 | 在哪 | 干什么 |
|------|------|--------|
| 本 demo 的 JSONL | 进程间管道 | 宿主驱动 Agent |
| reconstruct 的 `--json` | CLI stdout | 第 6 片那种听众，祖先形态 |
| SessionManager 的 jsonl | 磁盘文件 | 对话落盘，下次 `--continue` |
| 供应商 SSE | 调模型的 HTTPS | token 一块一块回来（L4） |

`spawn` 就是操作系统里再开一个进程。Node 里是 `child_process.spawn`。已经在同一 Node 里时，官方建议直接 `createAgentSession()`，不必 spawn。
