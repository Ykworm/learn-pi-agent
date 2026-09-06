/**
 * 为什么存在：Agent 的全部运行时就是「调 Completions → 有 tool_calls 就执行再调」；缺了这层就只是单次聊天。
 * 功能作用：在同一个 turn 里循环 POST Chat Completions，直到模型不再带 tool_calls。发生了什么只 emit，不打印。
 *
 * 第 2 次及以后的 HTTP 都由这个 while 发出。assistant_start 只在进入循环前广播一次，不是每次 POST。
 */
import type OpenAI from "openai";
import type {
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from "openai/resources/chat/completions.js";
import { emitAll, type AgentEventReceiver } from "../events.js";
import { ECHO_TOOL } from "../tools/echo.js";
import { runTool } from "../tools/run.js";

export const COMPLETION_TOOLS: ChatCompletionTool[] = [ECHO_TOOL];

export async function runCompletionsTurn(
	client: OpenAI,
	model: string,
	messages: ChatCompletionMessageParam[],
	receivers: readonly AgentEventReceiver[],
): Promise<void> {
	await emitAll(receivers, { type: "assistant_start" });

	for (;;) {
		const response = await client.chat.completions.create({
			model,
			messages,
			tools: COMPLETION_TOOLS,
			tool_choice: "auto",
		});

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
					const result = runTool(call.function.name, call.function.arguments);
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
