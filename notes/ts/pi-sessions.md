# 会话树与分叉：/tree、/fork 归谁管（v0.85.1）

第 5 片的 jsonl 是一条直线：事件按时间追加，下次全量读回。一年后的 session 文件是**一棵树**：每条 entry 带 `id` / `parentId`，可以在同一份文件里换分支（`/tree`），也可以剪一条路写成新文件（`/fork`、`/clone`）。本篇回答两个问题：这两件事分别归哪个组件管；`branchWithSummary` 为什么叫这个名字。

reconstruct 没有这一层。标本：`vendor/pi-v0.85.1/packages/coding-agent/`。官方说明书：[sessions.md](../../vendor/pi-v0.85.1/packages/coding-agent/docs/sessions.md)、[session-format.md](../../vendor/pi-v0.85.1/packages/coding-agent/docs/session-format.md)。本篇按因果把归属走一遍。

容易混的点先说破：树的**数据**确实都在 `SessionManager` 里，所以「都归 SessionManager 管」这句话对了一半。但 `/tree` 和 `/fork` 的**编排**不在同一个类。分清「谁动数据、谁动正在跑的进程」，归属就清楚了。

## 第 1 节：一条界线 —— 几个文件、换不换房子

| | `/tree` | `/fork` | `/clone` |
|---|---------|---------|----------|
| 几个 jsonl 文件 | 还是**同一个** | **新开一个** | **新开一个** |
| 树怎么动 | 挪叶子指针 | 拷出一条路写进新文件 | 拷出当前分支写进新文件 |
| `AgentSession` | **不换**，里面消息重建 | **换掉**，扩展卸了重装 | 同 `/fork` |
| 编排落在哪 | `AgentSession.navigateTree()` | `AgentSessionRuntime.fork()` | 同 `/fork`（`position: "at"`） |
| 扩展钩子 | `session_before_tree` / `session_tree` | `session_before_fork` / `session_start` | 同 `/fork` |

界线就一条：**要不要毁掉旧的 `AgentSession`，换一个正在跑的房子。**

- `/tree` 在同一份文件里跳，房子不换。归 L2 的 `AgentSession` 编排。
- `/fork` 和 `/clone` 要新文件，换完还要拆旧扩展、装新扩展、发 `session_start`。归旁边的 `AgentSessionRuntime`（[分层笔记](pi-v0.85.1-layers.md)里「`/new` `/resume` `/fork` 时毁掉旧的再造一个」的那位）。
- 两边写文件的动作都是 `SessionManager`：树是它的，新文件也是它造的。

loop 两边都不看。它只看见 `agent.state.messages`。跳完或换完之后，由上面把 `buildSessionContext().messages` 写回去。

## 第 2 节：jsonl 里的树长什么样

文件还是 JSONL，一行一条。树结构是 version 2 引入的（v1 是直线，加载时自动迁移；v3 只是把 `hookMessage` 改名叫 `custom`）：

- 每条 entry 有 `id` 和 `parentId`。`parentId: null` 是根。
- `SessionManager` 手里有一个 `leafId`：当前位置。追加一条，就是当前叶子的孩子。
- **只追加，不改旧行。** 换分支不是删历史，是把 `leafId` 挪回更早的 entry，下一句从那一点长出新枝。旧分支整截留在文件里。

```text
jsonl（追加序，旧行不动）：

  hdr  u1  a1  u2  a2  u3  a3  u3'  a3'

树（按 parentId 拼）：

  u1
  └─ a1
     └─ u2
        └─ a2
           ├─ u3 ── a3     ← 旧分支还在文件里
           └─ u3' ── a3'   ← leaf 挪回 a2 之后长出的新枝
```

`SessionManager` 上的三类读法：

| 方法 | 干什么 |
|------|--------|
| `getTree()` | 把全部 entry 按 `parentId` 拼成树，给 `/tree` 的画面用 |
| `branch(id)` / `resetLeaf()` | 只挪 `leafId` 指针，不写文件 |
| `buildSessionContext()` | 从根走到当前叶子，得到**那一条路**的 entry，再收成送给模型的 `messages` |

关键在最后一条：旁枝不进上下文。模型永远只看根到 leaf 的一条路，树的其他分支只是磁盘上的存档。所以 `/tree` 跳走之后，旧分支上说过的话，模型就「忘了」——这是第 5 节 `branchWithSummary` 存在的原因。

## 第 3 节：/tree —— 同一文件里挪指针

三层各管一段：

- **数据**：`SessionManager.branch()` / `resetLeaf()` / `branchWithSummary()`。挪指针，可选追加一行 `branch_summary`。
- **编排**：`AgentSession.navigateTree()`。算新旧叶子的共同祖先、问扩展（`session_before_tree`，可取消、可自带摘要）、可选跑一次摘要模型、把 `buildSessionContext().messages` 塞回 `agent.state.messages`、发 `session_tree`。
- **皮**：TUI 的 `TreeSelectorComponent` 把 `getTree()` 画出来给人点。本仓库不做这层。

选中之后的规则（[sessions.md](../../vendor/pi-v0.85.1/packages/coding-agent/docs/sessions.md) 和 `navigateTree()` 一致）：

| 选中的 entry | 叶子挪到哪 | 编辑器 |
|--------------|-----------|--------|
| user / custom 消息 | 它的 `parentId`（根消息则 `null`） | 那句话进编辑器，改完重发 = 新分支 |
| assistant / tool / summary 等 | 那条本身 | 空，从那个点继续 |

`/tree` 全程不写新文件。jsonl 里能看到的痕迹只有两种：新长出来的分支条目，以及可选的一行 `branch_summary`。

## 第 4 节：/fork 和 /clone —— 新文件 + 换房子

`/fork` 要的是**另一份 jsonl**。数据侧还是 `SessionManager`：

- `createBranchedSession(leafId)`：把**根到目标叶子的那一条路**拷成新文件，header 里写 `parentSession` 指回原文件。`/fork`（从某句 user 消息**之前**切开）和 `/clone`（从当前叶子整条拷）都用它。
- `forkFrom(sourcePath, targetCwd)`：启动参数 `--fork <path|id>` 走这条。整份源文件**全拷**（所有分支都过去），header 换成新 id、新 cwd、`parentSession` 指向源文件。用在把别的项目的会话拿过来接着跑。

编排侧不在 `SessionManager`。fork 完要换掉正在跑的 `AgentSession`：拆旧扩展、装新扩展、发 `session_start { reason: "fork", previousSessionFile }`。这些归 `AgentSessionRuntime.fork()`。所以「`/fork` 归 SessionManager 管」只对一半：**文件它造，换房子在 Runtime。**

皮这边很薄：`/fork` 弹一个 user 消息选择器，选中哪句就从那句的 `parentId` 切开，那句的文本进编辑器让你改；`/clone` 不选人，直接拿当前叶子。

## 第 5 节：为什么有个 branchWithSummary

`branchWithSummary` 不是 `/tree` 的同义词，只是它**可选的一个步骤**。两个「分支」叠在一起了：

1. `/tree` 跳到树上的另一个点，这件事本身就是换分支。不摘要，就是一次普通的 `branch()`：指针挪过去，下一句挂在那边。
2. 跳走之后，旧叶子上那半截对话对新分支**不可见**（第 2 节：`buildSessionContext` 只走根到 leaf）。pi 会问你要不要把丢下的那一截收成摘要，追加在新分支的起点上，带到新线上接着用。

要摘要，才调 `branchWithSummary()`：挪指针 + 追加一行 `branch_summary`（`fromId` 记下旧叶子，表示摘要讲的是哪一截）。函数名说的是第二种情况——**带着摘要的分支切换**。

和 compaction 并排看：

- **compaction**：同一条线太长，把**前面**收成摘要，尾巴留下接着走。
- **branch summary**：换线，把**没走的那条**收成摘要，带到新线上。

摘要的 markdown 结构、文件追踪、`serializeConversation` 和 compaction 共用；但切点逻辑（`prepareCompaction` / `findCutPoint`）不走这条路，钩子是 `session_before_tree` 不是 `session_before_compact`。详见 [pi-compaction.md](pi-compaction.md) 第 8 节。

## 第 6 节：对照 reconstruct

reconstruct 的 `SessionManager`（第 5 片）是一条直线 jsonl 事件账：没有 `id` / `parentId`，没有叶子指针，`eventsToMessages` 全量带上。没有树，自然没有 `/tree` / `/fork` 的归属问题。

若以后要在 reconstruct 里加分支，形状应对齐本篇，而不是改 loop：

- 树结构属于 `SessionManager`：entry 带 `id` / `parentId`，只追加，挪指针不写文件
- `/tree` 类操作归未来的 `AgentSession` 层：挪指针、重建 `messages` 写回 `agent.state`
- `/fork` 类操作归「换 session」的编排层：造新文件、换掉正在跑的 session
- loop 两边都不看，只看 `state.messages`

现在不要把这些写进 `reconstruct/`。对照课停在第 7 片。本篇是只读分析。
