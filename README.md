# 从 0 推演原始 pi-agent

这不是 pi 的 fork。我们用 Git 首个提交里的 `packages/agent` 当解剖标本，假装自己是作者，按因果顺序把同一套核心再搭一遍。

对照原文：[badlogic/pi-mono@a74c5da](https://github.com/badlogic/pi-mono/commit/a74c5da112c29466f182a03108337a488c785d76)（2025-08-09，当时版本号 0.5.0）。作者后来写的动机见 [What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)。

## 当前进度

**第 1 片：Chat Completions loop。** 笔记见 [notes/01-loop.md](notes/01-loop.md)。`reconstruct/` 里有 `ask()` + `echo` 工具，还没有事件总线。

## 目录

| 路径 | 作用 |
|------|------|
| [`vendor/`](vendor/README.md) | 冻结的原文快照，只读 |
| [`notes/`](notes/00-origin.md) | 推演笔记。[为什么造](notes/00-origin.md)、[一个 turn](notes/00-completions-turn.md)、[第 1 片 loop](notes/01-loop.md) |
| [`reconstruct/`](reconstruct/README.md) | 手写实现。第 1 片：loop + `echo` |

本阶段只读 `vendor/pi-mono-a74c5da/packages/agent/`。不读 TUI，不读 pods。

## 学习版本

`main` 始终是最新进度。每学完一片打一个 annotated tag，作为可回退的学习版本：

| Tag | 含义 |
|-----|------|
| `slice-00` | 第 0 片结束：对照仓 + 笔记 + 空脚手架 |
| `slice-01` | 第 1 片结束：Chat Completions loop |
| `slice-02` … `slice-07` | 对应第 2–7 片 |

回到某一片结束时的树：

```bash
git checkout slice-00
```

看完后回到最新：

```bash
git checkout main
```

不给每片长期开 branch。切片是一条直线上的冻结点。若要在某一片上随便改，从 tag 拉临时分支：

```bash
git checkout -b experiment/slice-00 slice-00
```

## 教学节奏

每一片：先讲原理 → 再写一小段带注释的代码 → 讨论 → 你说学会了再开下一片。不要一次把框架写完。

## 代码风格（第 1 片起生效）

- 注释写两句中文：为什么存在、功能作用。不复述语法。
- 按职责拆文件，一个文件一件主事。util 只放两处以上真正共用的函数。
- 力求精简。截断、abort、窄扩展点可以写；不要为假想需求堆抽象。

## 切片

| 片 | 内容 | 状态 |
|----|------|------|
| 0 | 为什么造、首版目录 | 结束（无 agent 代码） |
| 1 | Chat Completions + agent loop | 进行中 |
| 2 | 事件总线（全量 fan-out） | 未开始 |
| 3 | 工具：`read` / `list` / `bash`，再 `glob` / `rg` | 未开始 |
| 4 | `AbortSignal` 中断 | 未开始 |
| 5 | JSONL session，事件还原成 messages | 未开始 |
| 6 | CLI：单次、交互、`--json` | 未开始 |
| 7 | 第二条 API：Responses | 未开始 |
