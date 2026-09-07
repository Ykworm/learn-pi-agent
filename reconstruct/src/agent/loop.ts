/**
 * 为什么存在：Agent 的全部运行时就是「调 Completions → 有 tool_calls 就执行再调」；缺了这层就只是单次聊天。
 * 功能作用：在同一个 turn 里循环 POST Chat Completions，直到模型不再带 tool_calls，或 signal 被 abort。发生了什么只 emit，不打印。
 */
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { interruptedError, isInterrupted } from "../abort.js";
import { emitAll, type AgentEventReceiver } from "../events.js";
import { COMPLETION_TOOLS, runTool } from "../tools/run.js";

/**
 * 为什么存在：取消发生在 create() 途中、工具执行前、工具抛 Interrupted，都要先广播再停。
 * 功能作用：发 interrupted，再 throw。ask() 会吞掉这个错误。
 */
async function abortTurn(receivers: readonly AgentEventReceiver[]): Promise<never> {
	await emitAll(receivers, { type: "interrupted" });
	throw interruptedError();
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
			response = await client.chat.completions.create(
				{
					model,
					messages,
					tools: COMPLETION_TOOLS,
					tool_choice: "auto",
				},
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

		const toolCalls = message.tool_calls;
		if (toolCalls && toolCalls.length > 0) {
			messages.push({
				role: "assistant",
				content: message.content ?? null,
				tool_calls: toolCalls,
			});

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
		messages.push({ role: "assistant", content: text });
		await emitAll(receivers, { type: "assistant_message", text });
		return;
	}
}
