/**
 * 为什么存在：演示 `pi --mode rpc` 那根 stdin/stdout JSONL 电线，不必真的装 pi。
 * 功能作用：从 stdin 读一行一条命令，往 stdout 写 response 和事件，也是一行一条 JSON。
 */

import { fakeTurnEvents } from "./fake-turn.ts";

function write(obj: unknown): void {
	process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function handleLine(line: string): void {
	const trimmed = line.replace(/\r$/, "").trim();
	if (!trimmed) return;

	let cmd: { id?: string; type?: string; message?: string };
	try {
		cmd = JSON.parse(trimmed) as { id?: string; type?: string; message?: string };
	} catch {
		write({ type: "response", command: "unknown", success: false, error: "invalid JSON" });
		return;
	}

	if (cmd.type === "prompt") {
		write({ id: cmd.id, type: "response", command: "prompt", success: true });
		for (const event of fakeTurnEvents(cmd.message ?? "")) {
			write(event);
		}
		return;
	}

	write({
		id: cmd.id,
		type: "response",
		command: cmd.type ?? "unknown",
		success: false,
		error: `unsupported command: ${cmd.type}`,
	});
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
	buffer += chunk;
	while (true) {
		const i = buffer.indexOf("\n");
		if (i === -1) return;
		handleLine(buffer.slice(0, i));
		buffer = buffer.slice(i + 1);
	}
});
process.stdin.on("end", () => {
	if (buffer.trim()) handleLine(buffer);
});
