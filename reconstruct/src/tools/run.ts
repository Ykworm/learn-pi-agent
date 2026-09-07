/**
 * 为什么存在：loop 不应内嵌每个工具的实现；HTTP 的 tools 字段和本机分发必须是同一张表。
 * 功能作用：导出 Completions 用的工具表；按名字执行，返回给模型看的文本。
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
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
