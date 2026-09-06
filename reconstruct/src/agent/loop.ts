/**
 * 为什么存在：Agent 的全部运行时就是「调 Completions → 有 tool_calls 就执行再调」；缺了这层就只是单次聊天。
 * 功能作用：在同一个 turn 里循环 POST Chat Completions，直到模型不再带 tool_calls。发生了什么只 emit，不打印。
 */
import type OpenAI from "openai";
import type {
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from "openai/resources/chat/completions.js";
import { emitAll, type AgentEventReceiver } from "../events.js";
import { ECHO_TOOL } from "../tools/echo.js";
import { runTool } from "../tools/run.js";

/** 为什么存在：tools 字段和 loop 必须用同一份表。功能作用：本片只注册 echo。 */
export const COMPLETION_TOOLS: ChatCompletionTool[] = [ECHO_TOOL];

/**
 * 为什么存在：一个 turn 里可能多次 HTTP；发请求、执行工具、广播事件都在这里，ask() 不管。
 * 功能作用：循环直到没有 tool_calls。receivers 原样往下传，本函数不 switch 事件 type。
 */
export async function runCompletionsTurn(
	client: OpenAI,
	model: string,
	messages: ChatCompletionMessageParam[],
	receivers: readonly AgentEventReceiver[],
): Promise<void> {
	// 每个 turn 一次，不是每次 POST。原文 callModelChatCompletionsApi 也是进 while 之前发。
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
			// 带 tool_calls 的 assistant 必须先入 messages，模型下一轮才知道自己请过哪些工具。
			messages.push({
				role: "assistant",
				content: message.content ?? null,
				tool_calls: toolCalls,
			});

			for (const call of toolCalls) {
				const funcName = call.type === "function" ? call.function.name : call.custom.name;
				const funcArgs = call.type === "function" ? call.function.arguments : call.custom.input;
				// 先广播再执行：终端能看见「正在调」，而不是等工具跑完才出字。
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
