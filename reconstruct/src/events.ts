/**
 * 为什么存在：loop 不能既执行又打印，否则换终端 / JSON / 以后的 jsonl 就要改循环。
 * 功能作用：本片会广播的事件形状；emitAll 把同一条事件同步发给所有听众，不按 type 路由。
 */

export type AgentEvent =
	| { type: "user_message"; text: string }
	| { type: "assistant_start" }
	| { type: "tool_call"; toolCallId: string; name: string; args: string }
	| { type: "tool_result"; toolCallId: string; result: string; isError: boolean }
	| { type: "assistant_message"; text: string }
	| {
			type: "token_usage";
			inputTokens: number;
			outputTokens: number;
			totalTokens: number;
			cacheReadTokens: number;
			cacheWriteTokens: number;
	  };

export interface AgentEventReceiver {
	on(event: AgentEvent): Promise<void>;
}

export async function emitAll(
	receivers: readonly AgentEventReceiver[],
	event: AgentEvent,
): Promise<void> {
	for (const receiver of receivers) {
		await receiver.on(event);
	}
}
