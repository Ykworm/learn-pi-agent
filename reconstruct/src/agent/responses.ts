/**
 * 为什么存在：Responses 和 Completions 是两套信封，不是两套 Agent；缺了这层就只能走 /v1/chat/completions。
 * 功能作用：在同一个 turn 里循环 POST /v1/responses，直到这次 output 没有 function_call。发生了什么只 emit，不打印。
 */
import type OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses.js";
import { abortTurn, isInterrupted } from "../abort.js";
import { emitAll, type AgentEventReceiver } from "../events.js";
import { RESPONSE_TOOLS, runTool } from "../tools/run.js";

/**
 * 为什么存在：output 里的条目要原样塞回下一轮 input，模型才记得自己刚说过 / 要调过什么。
 * 功能作用：把 SDK 的 output item 当成下一次请求的 input item。
 */
function asInputItem(item: unknown): ResponseInputItem {
	return item as ResponseInputItem;
}

/**
 * 为什么存在：一个 turn 里可能多次 HTTP；发请求、执行工具、广播事件都在这里，ask() 不管。
 * 功能作用：循环直到这次 output 没有 function_call。system 走 instructions，不进 input。signal 被 abort 则发 interrupted。
 */
export async function runResponsesTurn(
	client: OpenAI,
	model: string,
	systemPrompt: string,
	input: ResponseInputItem[],
	receivers: readonly AgentEventReceiver[],
	signal: AbortSignal,
): Promise<void> {
	await emitAll(receivers, { type: "assistant_start" });

	for (;;) {
		if (signal.aborted) {
			await abortTurn(receivers);
		}

		let response: Awaited<ReturnType<typeof client.responses.create>>;
		try {
			response = await client.responses.create(
				{
					model,
					instructions: systemPrompt,
					input,
					tools: RESPONSE_TOOLS,
					tool_choice: "auto",
					parallel_tool_calls: true,
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
				inputTokens: usage.input_tokens || 0,
				outputTokens: usage.output_tokens || 0,
				totalTokens: usage.total_tokens || 0,
				cacheReadTokens: usage.input_tokens_details?.cached_tokens || 0,
				cacheWriteTokens: 0,
			});
		}

		const output = response.output ?? [];
		let sawFunctionCall = false;
		let sawMessage = false;

		for (const item of output) {
			input.push(asInputItem(item));

			switch (item.type) {
				case "reasoning": {
					for (const content of item.content ?? []) {
						if (content.type === "reasoning_text") {
							await emitAll(receivers, { type: "thinking", text: content.text });
						}
					}
					for (const part of item.summary ?? []) {
						if (part.type === "summary_text") {
							await emitAll(receivers, { type: "thinking", text: part.text });
						}
					}
					break;
				}
				case "message": {
					for (const content of item.content ?? []) {
						if (content.type === "output_text") {
							await emitAll(receivers, { type: "assistant_message", text: content.text });
						} else if (content.type === "refusal") {
							await emitAll(receivers, {
								type: "assistant_message",
								text: `Refusal: ${content.refusal}`,
							});
						}
					}
					sawMessage = true;
					break;
				}
				case "function_call": {
					if (signal.aborted) {
						await abortTurn(receivers);
					}
					sawFunctionCall = true;
					const callId = item.call_id;
					await emitAll(receivers, {
						type: "tool_call",
						toolCallId: callId,
						name: item.name,
						args: item.arguments,
					});
					try {
						const result = await runTool(item.name, item.arguments, signal);
						await emitAll(receivers, {
							type: "tool_result",
							toolCallId: callId,
							result,
							isError: false,
						});
						input.push({
							type: "function_call_output",
							call_id: callId,
							output: result,
						});
					} catch (err: unknown) {
						if (signal.aborted || isInterrupted(err)) {
							await abortTurn(receivers);
						}
						const result = err instanceof Error ? err.message : String(err);
						await emitAll(receivers, {
							type: "tool_result",
							toolCallId: callId,
							result,
							isError: true,
						});
						input.push({
							type: "function_call_output",
							call_id: callId,
							output: result,
						});
					}
					break;
				}
				default:
					break;
			}
		}

		if (sawFunctionCall) {
			continue;
		}
		if (sawMessage) {
			return;
		}
		return;
	}
}
