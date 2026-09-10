# 对照快照（只读）

本目录只用来对照阅读，不要改这里的文件。我们自己的实现写在仓库根的 `reconstruct/` 和 `reconstruct-go/`。

## `pi-mono-a74c5da/`

[badlogic/pi-mono](https://github.com/badlogic/pi-mono) 的 Git **首个提交**：

- 提交：`a74c5da112c29466f182a03108337a488c785d76`
- 日期：2025-08-09
- 说明：`Initial monorepo setup with npm workspaces and dual TypeScript configuration`

对照课第 0–7 片读 `packages/agent/`。`packages/tui` 与 `packages/pods` 不读。这一版没有网页组件。

## `pi-mono-v0.6.0/`

同一条产品线的**第一版网页包**（当时还叫 `@mariozechner/pi-web-ui`）。tag **`v0.6.0`**（2025-11-12，提交 `00d8286`）：

- [`packages/web-ui/`](pi-mono-v0.6.0/packages/web-ui/)
- [`packages/proxy/`](pi-mono-v0.6.0/packages/proxy/)：浏览器 CORS 代理

说明见 [`pi-mono-v0.6.0/README.md`](pi-mono-v0.6.0/README.md)。

## `pi-web-ui-0.75.3/`

官方 npm 名 **`@earendil-works/pi-web-ui`** 的最后一版（0.75.3，2026-05-18）。和上面是同一条线，2026-05-07 起从 `@mariozechner/*` 改名。源码随后从 monorepo 删除，npm 上 latest 仍停在这里。说明见 [`pi-web-ui-0.75.3/SNAPSHOT.md`](pi-web-ui-0.75.3/SNAPSHOT.md)。

先对照，不要抄进 reconstruct。今天的 pi main 没有这个包。

## `pi-v0.85.1/`

[earendil-works/pi](https://github.com/earendil-works/pi) 的 Git tag **`v0.85.1`**（2026-09-05，提交 `d981de1`）。冻结时这是 npm `@earendil-works/pi-coding-agent` 的 latest。

稀疏快照：`agent` / `ai` / `coding-agent` / 实验用的 `server`+`protocol`+`client`。没有 `packages/tui`。说明见 [`pi-v0.85.1/SNAPSHOT.md`](pi-v0.85.1/SNAPSHOT.md)。

对照课仍读 [`pi-mono-a74c5da/`](pi-mono-a74c5da/)。这个目录只用来看一年后的产品，不要抄进 reconstruct。分层图和组件说明：[notes/ts/pi-v0.85.1-layers.md](../notes/ts/pi-v0.85.1-layers.md)。
