/**
 * 为什么存在：同一段假 turn，先走 JSONL RPC 再走 SSE，对照电线而不是对照概念词。
 * 功能作用：spawn 假 RPC 子进程；再开一个 HTTP SSE 服务。把两边的字节打到终端。
 */

import { spawn } from "node:child_process";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startSseServer } from "./sse-server.ts";

const here = dirname(fileURLToPath(import.meta.url));
const prompt = { id: "req-1", type: "prompt", message: "列出当前目录" };

function banner(title: string): void {
	console.log(`\n======== ${title} ========\n`);
}

async function runJsonlRpc(): Promise<void> {
	banner("1. JSONL RPC（一根双工管子，像 pi --mode rpc）");
	console.log("宿主 spawn 子进程。stdin 写命令，stdout 读 response + 事件。没有 HTTP。");
	console.log(`spawn: node ${process.execArgv.join(" ")} jsonl-rpc-server.ts\n`);

	const child = spawn(process.execPath, 
		[...process.execArgv, join(here, "jsonl-rpc-server.ts")], {
		stdio: ["pipe", "pipe", "inherit"],
	});

	const outgoing = `${JSON.stringify(prompt)}\n`;
	process.stdout.write(`>> stdin  ${outgoing}`);
	child.stdin.write(outgoing);
	child.stdin.end();

	await new Promise<void>((resolve, reject) => {
		child.stdout.setEncoding("utf8");
		let buf = "";
		child.stdout.on("data", (chunk: string) => {
			buf += chunk;
			while (true) {
				const i = buf.indexOf("\n");
				if (i === -1) return;
				const line = buf.slice(0, i);
				buf = buf.slice(i + 1);
				if (line.length > 0) process.stdout.write(`<< stdout ${line}\n`);
			}
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0 || code === null) resolve();
			else reject(new Error(`jsonl-rpc-server exited ${code}`));
		});
	});
}

async function runSse(): Promise<void> {
	banner("2. HTTP SSE（一次 POST，响应体是 event-stream）");
	console.log("供应商流式接口常见这套：一个 HTTP 请求，响应体按 SSE 帧推。事件只能服务器→客户端。\n");

	const { url, close } = await startSseServer();
	console.log(`SSE server ${url}\n`);
	const body = JSON.stringify({ message: prompt.message });
	console.log(`>> POST ${url}/prompt`);
	console.log(`>> ${body}\n`);

	await new Promise<void>((resolve, reject) => {
		const req = http.request(
			new URL("/prompt", url),
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body),
				},
			},
			(res) => {
				console.log(`<< HTTP ${res.statusCode} Content-Type: ${res.headers["content-type"]}\n`);
				let buf = "";
				res.setEncoding("utf8");
				res.on("data", (chunk: string) => {
					buf += chunk;
					while (true) {
						const i = buf.indexOf("\n\n");
						if (i === -1) return;
						const frame = buf.slice(0, i);
						buf = buf.slice(i + 2);
						process.stdout.write(`<< SSE\n${frame}\n\n`);
					}
				});
				res.on("end", () => resolve());
			},
		);
		req.on("error", reject);
		req.end(body);
	});

	await close();
}

async function main(): Promise<void> {
	await runJsonlRpc();
	await runSse();

	banner("对照");
	console.log(`JSONL RPC
  - 一条管道。命令和事件混在同一根 stdout 里，靠 JSON 的 type 区分。
  - 帧是换行：一行一个 JSON。没有 event: / data: 前缀。
  - response 是对那条命令的回执（id 对得上）；后面的 agent_start 不是回执，是订阅推过来的。
  - 真实 pi：child_process.spawn("pi", ["--mode", "rpc"])，或同进程 createAgentSession()（连 spawn 都没有）。

HTTP SSE
  - 一次 POST。请求体是命令，响应体是事件流。没有 stdin。
  - 帧是 SSE：event 行 + data 行 + 空行。
  - 只能服务器往客户端推。下一句 prompt 再 POST 一次。
  - 模型供应商的 token 流（chat.completion.chunk）也是这种帧，但那是 L4 信封，不是 Agent 事件。

都不是磁盘上的 session jsonl。那是 SessionManager 的听众在写文件。`);
}

void main();
