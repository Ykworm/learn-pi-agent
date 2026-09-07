/**
 * 为什么存在：loop 不应内嵌每个工具的实现；HTTP 的 tools 字段和本机分发必须是同一张表。
 * 功能作用：导出 Completions / Responses 两套工具表；按名字执行，返回给模型看的文本。
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { FunctionTool } from "openai/resources/responses/responses.js";
import { BASH_TOOL, runBash } from "./bash.js";
import { GLOB_TOOL, runGlob } from "./glob.js";
import { LIST_TOOL, runList } from "./list.js";
import { READ_TOOL, runRead } from "./read.js";
import { RG_TOOL, runRg } from "./rg.js";

/**
 * 为什么存在：create() 的 tools 和 runTool 的 switch 必须是同一张表，漏登一边模型会调一个本机没有的名字。
 * 功能作用：本片注册 read / list / bash / glob / rg。
 */
export const COMPLETION_TOOLS: ChatCompletionTool[] = [READ_TOOL, LIST_TOOL, BASH_TOOL, GLOB_TOOL, RG_TOOL];

/**
 * 为什么存在：Responses 的 function tool 把 name 放在顶层，不再套一层 function。名字和 parameters 必须与 Completions 那张表相同。
 * 功能作用：同一批工具，改成 POST /v1/responses 要的外套。strict 关掉，避免我们的 schema 过不了严格模式。
 */
export const RESPONSE_TOOLS: FunctionTool[] = COMPLETION_TOOLS.flatMap((tool) => {
	if (tool.type !== "function") {
		return [];
	}
	return [
		{
			type: "function" as const,
			name: tool.function.name,
			description: tool.function.description ?? null,
			parameters: (tool.function.parameters ?? {
				type: "object",
				properties: {},
			}) as Record<string, unknown>,
			strict: false,
		},
	];
});

/**
 * 为什么存在：loop 只按名字调用，不内嵌每个工具的实现。
 * 功能作用：执行名为 name 的工具，argsJson 是模型给的参数字符串。signal 传给会起进程的 bash / rg。
 */
export async function runTool(name: string, argsJson: string, signal: AbortSignal): Promise<string> {
	switch (name) {
		case "read":
			return runRead(argsJson);
		case "list":
			return runList(argsJson);
		case "bash":
			return runBash(argsJson, signal);
		case "glob":
			return runGlob(argsJson);
		case "rg":
			return runRg(argsJson, signal);
		default:
			return `未知工具: ${name}`;
	}
}
