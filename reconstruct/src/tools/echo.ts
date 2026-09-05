/**
 * 为什么存在：第 1 片只需要一个真工具，证明模型能发出 tool_calls、本机执行后再把结果送回。
 * 功能作用：把参数里的 text 原样返回。schema 给 Chat Completions 用，runEcho 给 loop 用。
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

export const ECHO_TOOL: ChatCompletionTool = {
	type: "function",
	function: {
		name: "echo",
		description: "把 text 原样返回。复述或确认一段文字时使用。",
		parameters: {
			type: "object",
			properties: {
				text: { type: "string", description: "要原样返回的文本" },
			},
			required: ["text"],
		},
	},
};

export function runEcho(argsJson: string): string {
	try {
		const parsed: unknown = JSON.parse(argsJson);
		if (typeof parsed !== "object" || parsed === null || !("text" in parsed)) {
			return "echo: 缺少 text";
		}
		const text = (parsed as { text: unknown }).text;
		if (typeof text !== "string") {
			return "echo: text 必须是字符串";
		}
		return text;
	} catch {
		return "echo: arguments 不是合法 JSON";
	}
}
