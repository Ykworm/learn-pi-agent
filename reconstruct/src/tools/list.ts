/**
 * 为什么存在：模型经常要先看见「这里有哪些名字」，再决定 read 哪一个。
 * 功能作用：列一层目录。目录名带 /。不递归。
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { capText } from "./cap.js";

/**
 * 为什么存在：HTTP 的 tools 字段要一份 JSON Schema，模型才知道能调 list。
 * 功能作用：声明可选 path。真正列目录的是 runList。
 */
export const LIST_TOOL: ChatCompletionTool = {
	type: "function",
	function: {
		name: "list",
		description: "列出目录内容。目录名以 / 结尾。只列这一层，不递归。",
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "目录路径（默认：当前工作目录）",
				},
			},
		},
	},
};

/**
 * 为什么存在：schema 只是说明书；本机还得真的读一层目录。
 * 功能作用：解析 arguments，返回这一层的名字；目录带 /。超过 1 MB 截断。
 */
export function runList(argsJson: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(argsJson);
	} catch {
		return "list: arguments 不是合法 JSON";
	}
	if (typeof parsed !== "object" || parsed === null) {
		return "list: arguments 必须是对象";
	}

	const pathValue = (parsed as { path?: unknown }).path;
	const path = pathValue === undefined || pathValue === "" ? "." : pathValue;
	if (typeof path !== "string") {
		return "list: path 必须是字符串";
	}

	const dir = resolve(path);
	if (!existsSync(dir)) {
		return `Directory not found: ${dir}`;
	}
	if (!statSync(dir).isDirectory()) {
		return `Not a directory: ${dir}`;
	}

	const names = readdirSync(dir, { withFileTypes: true }).map((entry) =>
		entry.isDirectory() ? `${entry.name}/` : entry.name,
	);
	return capText(names.join("\n"));
}
