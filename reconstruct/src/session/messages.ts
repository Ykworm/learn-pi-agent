/**
 * 为什么存在：磁盘上是事件日志，Completions 只要 messages[]；两本账不能当同一份用。
 * 功能作用：按 type 翻译成 Chat Completions 的 messages。system 来自配置，不来自事件。
 */
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { AgentEvent } from "../events.js";

type PendingToolCall = {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
};

/**
 * 为什么存在：原文 setEvents 把翻译和写入 Agent 绑在一起；纯函数才能单独盯 pendingToolCalls。
 * 功能作用：user / tool_call / tool_result / assistant_message 进 messages；其余 type 跳过。
 */
export function eventsToMessages(
	events: readonly AgentEvent[],
	systemPrompt: string,
): ChatCompletionMessageParam[] {
	const messages: ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt }];
	let pendingToolCalls: PendingToolCall[] = [];

	for (const event of events) {
		switch (event.type) {
			case "user_message":
				messages.push({ role: "user", content: event.text });
				break;
			case "assistant_start":
				pendingToolCalls = [];
				break;
			case "tool_call":
				pendingToolCalls.push({
					id: event.toolCallId,
					type: "function",
					function: { name: event.name, arguments: event.args },
				});
				break;
			case "tool_result":
				if (pendingToolCalls.length > 0) {
					messages.push({
						role: "assistant",
						content: null,
						tool_calls: pendingToolCalls,
					});
					pendingToolCalls = [];
				}
				messages.push({
					role: "tool",
					tool_call_id: event.toolCallId,
					content: event.result,
				});
				break;
			case "assistant_message":
				messages.push({ role: "assistant", content: event.text });
				break;
			default:
				break;
		}
	}

	return messages;
}
