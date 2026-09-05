/**
 * 为什么存在：Agent 的全部运行时就是「调 Completions → 有 tool_calls 就执行再调」；缺了这层就只是单次聊天。
 * 功能作用：在同一个 turn 里循环 POST Chat Completions，直到模型不再带 tool_calls，返回最后一段文本。
 *
 * 不在这里打印或写盘（那是第 2 片的事件听众）。第 2 次及以后的 HTTP 都由这个 while 发出。
 */
import type OpenAI from "openai";
import type {
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from "openai/resources/chat/completions.js";
import { ECHO_TOOL } from "../tools/echo.js";
import { runTool } from "../tools/run.js";

export const COMPLETION_TOOLS: ChatCompletionTool[] = [ECHO_TOOL];

export async function runCompletionsTurn(
	client: OpenAI,
	model: string,
	messages: ChatCompletionMessageParam[],
): Promise<string> {
	for (;;) {
		const response = await client.chat.completions.create({
			model,
			messages,
			tools: COMPLETION_TOOLS,
			tool_choice: "auto",
		});

		const message = response.choices[0]?.message;
		if (!message) {
			throw new Error("Chat Completions 没有返回 message");
		}

		const toolCalls = message.tool_calls;
		if (toolCalls && toolCalls.length > 0) {
			messages.push({
				role: "assistant",
				content: message.content ?? null,
				tool_calls: toolCalls,
			});

			for (const call of toolCalls) {
				if (call.type !== "function") {
					messages.push({
						role: "tool",
						tool_call_id: call.id,
						content: `不支持的 tool 类型: ${call.type}`,
					});
					continue;
				}
				const result = runTool(call.function.name, call.function.arguments);
				messages.push({
					role: "tool",
					tool_call_id: call.id,
					content: result,
				});
			}
			continue;
		}

		const text = message.content ?? "";
		messages.push({ role: "assistant", content: text });
		return text;
	}
}
