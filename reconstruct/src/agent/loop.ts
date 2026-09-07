/**
 * 为什么存在：Agent 的全部运行时就是「调 Completions → 有 tool_calls 就执行再调」；缺了这层就只是单次聊天。
 * 功能作用：在同一个 turn 里循环 POST Chat Completions，直到模型不再带 tool_calls，或 signal 被 abort。发生了什么只 emit，不打印。
 */
import type OpenAI from "openai";
import type {
	ChatCompletionCreateParamsNonStreaming,
	ChatCompletionMessage,
	ChatCompletionMessageParam,
} from "openai/resources/chat/completions.js";
import { abortTurn, isInterrupted } from "../abort.js";
import { emitAll, type AgentEventReceiver } from "../events.js";
import { completionsAssistant } from "../session/messages.js";
import { COMPLETION_TOOLS, runTool } from "../tools/run.js";

/**
 * 为什么存在：OpenAI 的 message 类型没有这个字段；DeepSeek 等厂商把 think 放在 content 旁边。
 * 功能作用：从 Completions 的 assistant message 取出 reasoning_content。没有就空串。
 */
function reasoningContentOf(message: ChatCompletionMessage): string {
	const value = (message as ChatCompletionMessage & { reasoning_content?: unknown }).reasoning_content;
	return typeof value === "string" ? value : "";
}

/**
 * 为什么存在：一个 turn 里可能多次 HTTP；发请求、执行工具、广播事件都在这里，ask() 不管。
 * 功能作用：循环直到没有 tool_calls。signal 被 abort 则发 interrupted 并结束。不 switch 事件 type。
 */
export async function runCompletionsTurn(
	client: OpenAI,
	model: string,
	messages: ChatCompletionMessageParam[],
	receivers: readonly AgentEventReceiver[],
	signal: AbortSignal,
): Promise<void> {
	await emitAll(receivers, { type: "assistant_start" });

	for (;;) {
		if (signal.aborted) {
			await abortTurn(receivers);
		}

		let response: Awaited<ReturnType<typeof client.chat.completions.create>>;
		try {
			// DeepSeek V4：不带 thinking.enabled，reasoning_content 有时是空的。
			response = await client.chat.completions.create(
				{
					model,
					messages,
					tools: COMPLETION_TOOLS,
					tool_choice: "auto",
					thinking: { type: "enabled" },
				} as ChatCompletionCreateParamsNonStreaming,
				{ signal },
			);
		} catch (err: unknown) {
			if (signal.aborted || isInterrupted(err)) {
				await abortTurn(receivers);
			}
			throw err;
		}

		const usage = response.usage;
		if (usage) {
			await emitAll(receivers, {
				type: "token_usage",
				inputTokens: usage.prompt_tokens || 0,
				outputTokens: usage.completion_tokens || 0,
				totalTokens: usage.total_tokens || 0,
				cacheReadTokens: usage.prompt_tokens_details?.cached_tokens || 0,
				cacheWriteTokens: 0,
			});
		}

		const message = response.choices[0]?.message;
		if (!message) {
			throw new Error("Chat Completions 没有返回 message");
		}

		const reasoning = reasoningContentOf(message);
		if (reasoning) {
			await emitAll(receivers, { type: "thinking", text: reasoning });
		}

		const toolCalls = message.tool_calls;
		if (toolCalls && toolCalls.length > 0) {
			messages.push(
				completionsAssistant({
					content: message.content ?? null,
					toolCalls,
					...(reasoning ? { reasoningContent: reasoning } : {}),
				}),
			);

			for (const call of toolCalls) {
				if (signal.aborted) {
					await abortTurn(receivers);
				}

				const funcName = call.type === "function" ? call.function.name : call.custom.name;
				const funcArgs = call.type === "function" ? call.function.arguments : call.custom.input;
				await emitAll(receivers, {
					type: "tool_call",
					toolCallId: call.id,
					name: funcName,
					args: funcArgs,
				});

				if (call.type !== "function") {
					const result = `不支持的 tool 类型: ${call.type}`;
					await emitAll(receivers, {
						type: "tool_result",
						toolCallId: call.id,
						result,
						isError: true,
					});
					messages.push({
						role: "tool",
						tool_call_id: call.id,
						content: result,
					});
					continue;
				}

				try {
					const result = await runTool(call.function.name, call.function.arguments, signal);
					await emitAll(receivers, {
						type: "tool_result",
						toolCallId: call.id,
						result,
						isError: false,
					});
					messages.push({
						role: "tool",
						tool_call_id: call.id,
						content: result,
					});
				} catch (err: unknown) {
					if (signal.aborted || isInterrupted(err)) {
						await abortTurn(receivers);
					}
					const result = err instanceof Error ? err.message : String(err);
					await emitAll(receivers, {
						type: "tool_result",
						toolCallId: call.id,
						result,
						isError: true,
					});
					messages.push({
						role: "tool",
						tool_call_id: call.id,
						content: result,
					});
				}
			}
			continue;
		}

		const text = message.content ?? "";
		messages.push(
			completionsAssistant({
				content: text,
				...(reasoning ? { reasoningContent: reasoning } : {}),
			}),
		);
		await emitAll(receivers, { type: "assistant_message", text });
		return;
	}
}
