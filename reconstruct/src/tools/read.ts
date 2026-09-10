/**
 * 为什么存在：coding agent 必须能看工作区里的文件；echo 做不到。
 * 功能作用：按 path 读文件。无窗口且大于 1 MB 只给文件头；有 offset / limit 则按行取窗口。
 */
import { closeSync, createReadStream, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { capText, MAX_TOOL_BYTES } from "./cap.js";

/**
 * 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 read。
 * 功能作用：声明 path / offset / limit。真正读盘的是 runRead。
 */
export const READ_TOOL: ChatCompletionTool = {
	type: "function",
	function: {
		name: "read",
		description: "读文件内容。大文件请用 offset / limit 按行取窗口，不要一次要全文。",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "要读的文件路径" },
				offset: {
					type: "number",
					description: "从第几行开始（从 1 计）。省略则从文件头。",
				},
				limit: {
					type: "number",
					description: "最多返回多少行。省略则读到文件尾或 1 MB 上限。",
				},
			},
			required: ["path"],
		},
	},
};

function asInt(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return undefined;
	}
	return Math.trunc(value);
}

async function readLineWindow(file: string, offset: number, limit: number | undefined): Promise<string> {
	const start = Math.max(1, offset);
	const stream = createReadStream(file, { encoding: "utf8" });
	const rl = createInterface({ input: stream });
	const lines: string[] = [];
	let n = 0;
	let bytes = 0;
	try {
		for await (const line of rl) {
			n += 1;
			if (n < start) {
				continue;
			}
			const nextBytes = bytes + Buffer.byteLength(line, "utf8") + (lines.length > 0 ? 1 : 0);
			if (nextBytes > MAX_TOOL_BYTES) {
				return capText(lines.join("\n"));
			}
			lines.push(line);
			bytes = nextBytes;
			if (limit !== undefined && lines.length >= limit) {
				break;
			}
		}
	} finally {
		rl.close();
		stream.destroy();
	}
	return lines.join("\n");
}

/**
 * 为什么存在：schema 只是说明书；本机还得真的打开文件。
 * 功能作用：解析 arguments。无窗口且大于 1 MB 只给文件头；有 offset / limit 则按行取窗口。
 */
export async function runRead(argsJson: string): Promise<string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(argsJson);
	} catch {
		return "read: arguments 不是合法 JSON";
	}
	if (typeof parsed !== "object" || parsed === null || !("path" in parsed)) {
		return "read: 缺少 path";
	}
	const pathValue = (parsed as { path: unknown }).path;
	if (typeof pathValue !== "string" || pathValue.trim() === "") {
		return "read: path 必须是字符串";
	}

	const file = resolve(pathValue);
	if (!existsSync(file)) {
		return `File not found: ${file}`;
	}

	const stats = statSync(file);
	if (!stats.isFile()) {
		return `Not a file: ${file}`;
	}

	const offset = asInt((parsed as { offset?: unknown }).offset);
	const limit = asInt((parsed as { limit?: unknown }).limit);
	if (offset !== undefined && offset < 1) {
		return "read: offset 从 1 计";
	}
	if (limit !== undefined && limit < 1) {
		return "read: limit 至少为 1";
	}

	if (offset !== undefined || limit !== undefined) {
		return readLineWindow(file, offset ?? 1, limit);
	}

	if (stats.size > MAX_TOOL_BYTES) {
		const fd = openSync(file, "r");
		try {
			const buf = Buffer.alloc(MAX_TOOL_BYTES);
			const n = readSync(fd, buf, 0, MAX_TOOL_BYTES, 0);
			return `${buf.subarray(0, n).toString("utf8")}\n\n... [truncated - exceeded 1MB] ...`;
		} finally {
			closeSync(fd);
		}
	}

	return readFileSync(file, "utf8");
}
