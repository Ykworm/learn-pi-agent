/**
 * 为什么存在：对照 JSONL RPC，把同一段假 turn 改走 HTTP SSE，让帧格式可见。
 * 功能作用：POST /prompt 的响应体就是 event-stream，写完 turn_end 关连接。
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { fakeTurnEvents } from "./fake-turn.ts";

export function startSseServer(): Promise<{ url: string; close: () => Promise<void> }> {
	const server = http.createServer((req, res) => {
		if (req.method !== "POST" || req.url !== "/prompt") {
			res.writeHead(404);
			res.end();
			return;
		}

		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => chunks.push(c));
		req.on("end", () => {
			let message = "";
			try {
				const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { message?: string };
				message = body.message ?? "";
			} catch {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "invalid JSON" }));
				return;
			}

			res.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "close",
			});
			for (const event of fakeTurnEvents(message)) {
				res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
			}
			res.end();
		});
	});

	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (!addr || typeof addr === "string") {
				reject(new Error("SSE server has no port"));
				return;
			}
			const { port } = addr as AddressInfo;
			resolve({
				url: `http://127.0.0.1:${port}`,
				close: () =>
					new Promise<void>((done, fail) => {
						server.close((err) => (err ? fail(err) : done()));
					}),
			});
		});
	});
}
