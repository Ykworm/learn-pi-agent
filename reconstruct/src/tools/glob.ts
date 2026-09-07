/**
 * 为什么存在：list 只列一层；按文件名递归找若走 bash find，退出码和路径格式都不稳。
 * 功能作用：在 path（默认 cwd）下按 glob 模式列出匹配项。目录名带 /。超过 1 MB 截断。
 */
import { glob } from "glob";
import { resolve } from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { capText } from "./cap.js";

/**
 * 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 glob。
 * 功能作用：声明 pattern 和可选 path。真正搜盘的是 runGlob。
 */
export const GLOB_TOOL: ChatCompletionTool = {
	type: "function",
	function: {
		name: "glob",
		description: "按 glob 模式找文件，例如 **/*.ts。只返回路径，不读内容。",
		parameters: {
			type: "object",
			properties: {
				pattern: {
					type: "string",
					description: "glob 模式，例如 **/*.ts 或 src/**/*.json",
				},
				path: {
					type: "string",
					description: "搜索起点（默认：当前工作目录）",
				},
			},
			required: ["pattern"],
		},
	},
};

/**
 * 为什么存在：schema 只是说明书；本机还得按模式走目录树。
 * 功能作用：解析 arguments，返回排序后的相对路径；没有匹配则说明找不到。错误当字符串返回，不 throw。
 */
export async function runGlob(argsJson: string): Promise<string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(argsJson);
	} catch {
		return "glob: arguments 不是合法 JSON";
	}
	if (typeof parsed !== "object" || parsed === null || !("pattern" in parsed)) {
		return "glob: 缺少 pattern";
	}
	const pattern = (parsed as { pattern: unknown }).pattern;
	if (typeof pattern !== "string" || pattern.trim() === "") {
		return "glob: pattern 必须是字符串";
	}

	const pathValue = (parsed as { path?: unknown }).path;
	const root = pathValue === undefined || pathValue === "" ? "." : pathValue;
	if (typeof root !== "string") {
		return "glob: path 必须是字符串";
	}

	try {
		const matches = await glob(pattern, {
			cwd: resolve(root),
			dot: true,
			nodir: false,
			mark: true,
		});
		if (matches.length === 0) {
			return "No files found matching the pattern";
		}
		return capText(matches.sort().join("\n"));
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return `Glob error: ${message}`;
	}
}
