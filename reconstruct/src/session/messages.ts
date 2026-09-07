/**
 * 为什么存在：磁盘上是事件日志，两条 API 各自要不同形状的 input；两本账不能当同一份用。
 * 功能作用：按 type 翻译成 Completions 的 messages，或 Responses 的 input。system 不来自事件。
 */
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions.js";
import type { ResponseInputItem } from "openai/resources/responses/responses.js";
import type { AgentEvent } from "../events.js";

type PendingToolCall = {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
};

/**
 * 为什么存在：标准 ChatCompletionMessageParam 没有 reasoning_content；Completions 每次都带 tools 时，DeepSeek 要求把这个字段送回去。
 * 功能作用：拼一条 assistant。有 reasoning 就挂上，没有就不写这个键。
 */
export function completionsAssistant(args: {
	content: string | null;
	toolCalls?: readonly PendingToolCall[] | readonly ChatCompletionMessageToolCall[];
	reasoningContent?: string;
}): ChatCompletionMessageParam {
	const message: Record<string, unknown> = {
		role: "assistant",
		content: args.content,
	};
	if (args.toolCalls && args.toolCalls.length > 0) {
		message.tool_calls = args.toolCalls;
	}
	if (args.reasoningContent) {
		message.reasoning_content = args.reasoningContent;
	}
	return message as unknown as ChatCompletionMessageParam;
}

function takeReasoning(pending: { text: string }): string | undefined {
	const text = pending.text;
	pending.text = "";
	return text || undefined;
}

/**
 * 为什么存在：原文 setEvents 把翻译和写入 Agent 绑在一起；纯函数才能单独盯 pendingToolCalls。
 * 功能作用：user / tool_call / tool_result / assistant_message 进 messages。thinking 不单独成一条 role，挂到紧跟着的那条 assistant 的 reasoning_content。
 */
export function eventsToMessages(
	events: readonly AgentEvent[],
	systemPrompt: string,
): ChatCompletionMessageParam[] {
	const messages: ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt }];
	let pendingToolCalls: PendingToolCall[] = [];
	const pendingReasoning = { text: "" };

	for (const event of events) {
		switch (event.type) {
			case "user_message":
				messages.push({ role: "user", content: event.text });
				break;
			case "assistant_start":
				pendingToolCalls = [];
				pendingReasoning.text = "";
				break;
			case "thinking":
				pendingReasoning.text = pendingReasoning.text
					? `${pendingReasoning.text}\n${event.text}`
					: event.text;
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
					const reasoningContent = takeReasoning(pendingReasoning);
					messages.push(
						completionsAssistant({
							content: null,
							toolCalls: pendingToolCalls,
							...(reasoningContent ? { reasoningContent } : {}),
						}),
					);
					pendingToolCalls = [];
				}
				messages.push({
					role: "tool",
					tool_call_id: event.toolCallId,
					content: event.result,
				});
				break;
			case "assistant_message": {
				const reasoningContent = takeReasoning(pendingReasoning);
				messages.push(
					completionsAssistant({
						content: event.text,
						...(reasoningContent ? { reasoningContent } : {}),
					}),
				);
				break;
			}
			default:
				break;
		}
	}

	return messages;
}

/**
 * 为什么存在：同一份 jsonl 要再 POST /v1/responses 时，必须变成 type 条目，不能再用 role 消息。
 * 功能作用：user / thinking / tool_call / tool_result / assistant_message 进 input。system 不进数组，loop 用 instructions。
 */
export function eventsToResponsesInput(events: readonly AgentEvent[]): ResponseInputItem[] {
	const input: ResponseInputItem[] = [];

	for (const event of events) {
		switch (event.type) {
			case "user_message":
				input.push({ role: "user", content: event.text });
				break;
			case "thinking":
				input.push({
					type: "reasoning",
					content: [{ type: "reasoning_text", text: event.text }],
				} as ResponseInputItem);
				break;
			case "tool_call":
				input.push({
					type: "function_call",
					call_id: event.toolCallId,
					name: event.name,
					arguments: event.args,
				});
				break;
			case "tool_result":
				input.push({
					type: "function_call_output",
					call_id: event.toolCallId,
					output: event.result,
				});
				break;
			case "assistant_message":
				input.push({
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: event.text }],
				} as ResponseInputItem);
				break;
			default:
				break;
		}
	}

	return input;
}
