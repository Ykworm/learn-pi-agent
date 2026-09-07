/**
 * 为什么存在：还没有专用工具的操作（改文件、跑测试、git）都先走 shell；本片不单独做 write。
 * 功能作用：用 bash -c 执行 command。输出超过 1 MB 截断。非 0 退出码抛错，让 loop 标 isError。
 */
import { spawn } from "node:child_process";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { interruptedError, isInterrupted } from "../abort.js";
import { capText, MAX_TOOL_BYTES } from "./cap.js";

/**
 * 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 bash。
 * 功能作用：声明 command。真正起进程的是 runBash。
 */
export const BASH_TOOL: ChatCompletionTool = {
	type: "function",
	function: {
		name: "bash",
		description: "在 bash 里执行一条命令。工作目录是进程的 cwd。",
		parameters: {
			type: "object",
			properties: {
				command: { type: "string", description: "要执行的命令" },
			},
			required: ["command"],
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
 * 为什么存在：schema 只是说明书；本机还得起 bash。失败必须变成异常，loop 才能标 isError。
 * 功能作用：解析 command，bash -c 执行。把 signal 传给 spawn。非 0 退出码 reject；被 abort 则 throw Interrupted。
 */
export function runBash(argsJson: string, signal: AbortSignal): Promise<string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(argsJson);
	} catch {
		return Promise.resolve("bash: arguments 不是合法 JSON");
	}
	if (typeof parsed !== "object" || parsed === null || !("command" in parsed)) {
		return Promise.resolve("bash: 缺少 command");
	}
	const command = (parsed as { command: unknown }).command;
	if (typeof command !== "string" || command.trim() === "") {
		return Promise.resolve("bash: command 必须是字符串");
	}

	return new Promise((resolve, reject) => {
		const child = spawn("bash", ["-c", command], { signal });
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
			reject(err);
		});
		child.on("close", (code) => {
			if (signal.aborted) {
				reject(interruptedError());
				return;
			}
			const text = [stdout, stderr].filter((part) => part.length > 0).join("\n");
			if (code !== 0 && code !== null) {
				reject(new Error(text || `Command failed: exit ${code}`));
				return;
			}
			resolve(text || "Command executed successfully");
		});
	});
}
