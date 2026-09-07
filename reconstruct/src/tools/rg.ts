/**
 * 为什么存在：按内容搜若走 bash grep，没有匹配时退出码 1 会被当成失败；rg 专门处理这件事，并且不从 stdin 读。
 * 功能作用：把 args 原样交给 ripgrep。没有匹配返回说明文字，不当错误。输出超过 1 MB 截断。
 */
import { spawn } from "node:child_process";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { interruptedError, isInterrupted } from "../abort.js";
import { capText, MAX_TOOL_BYTES } from "./cap.js";

/**
 * 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 rg。
 * 功能作用：声明 args。真正起进程的是 runRg。
 */
export const RG_TOOL: ChatCompletionTool = {
	type: "function",
	function: {
		name: "rg",
		description: "用 ripgrep 搜文件内容。args 原样传给 rg，不要给搜索词加引号。",
		parameters: {
			type: "object",
			properties: {
				args: {
					type: "string",
					description: '直接传给 rg 的参数，例如 "-l runTool" 或 "--type ts COMPLETION_TOOLS src/"',
				},
			},
			required: ["args"],
		},
	},
};

function takeChunk(current: string, chunk: string): string {
	if (Buffer.byteLength(current, "utf8") >= MAX_TOOL_BYTES) {
		return current;
	}
	return capText(current + chunk);
}

/**
 * 为什么存在：schema 只是说明书；本机还得起 rg。退出码 1 表示没有匹配，不是失败。
 * 功能作用：解析 args，stdin 接到 /dev/null。signal 传给 spawn。exit code 1 仍是没匹配；被 abort 则 throw Interrupted。
 */
export function runRg(argsJson: string, signal: AbortSignal): Promise<string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(argsJson);
	} catch {
		return Promise.resolve("rg: arguments 不是合法 JSON");
	}
	if (typeof parsed !== "object" || parsed === null || !("args" in parsed)) {
		return Promise.resolve("rg: 缺少 args");
	}
	const args = (parsed as { args: unknown }).args;
	if (typeof args !== "string" || args.trim() === "") {
		return Promise.resolve("rg: args 必须是字符串");
	}

	return new Promise((resolve, reject) => {
		const child = spawn("bash", ["-c", `rg ${args} < /dev/null`], { signal });
		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data: Buffer) => {
			stdout = takeChunk(stdout, data.toString("utf8"));
		});
		child.stderr?.on("data", (data: Buffer) => {
			stderr = takeChunk(stderr, data.toString("utf8"));
		});
		child.on("error", (err) => {
			if (signal.aborted || isInterrupted(err)) {
				reject(interruptedError());
				return;
			}
			resolve(`ripgrep error: ${err.message}`);
		});
		child.on("close", (code) => {
			if (signal.aborted) {
				reject(interruptedError());
				return;
			}
			if (code === 1) {
				resolve("No matches found");
				return;
			}
			const text = [stdout, stderr].filter((part) => part.length > 0).join("\n");
			if (code !== 0 && code !== null) {
				resolve(`ripgrep error: ${text || `exit ${code}`}`);
				return;
			}
			resolve(text.trim() || "No matches found");
		});
	});
}
