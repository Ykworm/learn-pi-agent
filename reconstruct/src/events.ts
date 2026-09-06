/**
 * 为什么存在：loop 不能既执行又打印，否则换终端 / JSON / 以后的 jsonl 就要改循环。
 * 功能作用：本片会广播的事件形状；emitAll 把同一条事件同步发给所有听众，不按 type 路由。
 */

/**
 * 为什么存在：把「已经发生的事」从 loop 里抽出来，听众才能各自处理，loop 才不用认识 stdout。
 * 功能作用：本片 Completions 会发出的全部 type。session_start / interrupted / thinking 是后面几片。
 */
export type AgentEvent =
	| { type: "user_message"; text: string } // 人的一句；在 ask() 发，不在 loop
	| { type: "assistant_start" } // 每个 turn 一次，在第一次 POST 之前
	| { type: "tool_call"; toolCallId: string; name: string; args: string }
	| { type: "tool_result"; toolCallId: string; result: string; isError: boolean }
	| { type: "assistant_message"; text: string } // 终答；ask() 不再 return 这段文本
	| {
			type: "token_usage";
			inputTokens: number;
			outputTokens: number;
			totalTokens: number;
			cacheReadTokens: number;
			cacheWriteTokens: number;
	  };

/**
 * 为什么存在：loop 只调用 on()，不关心谁在听、听了做什么。
 * 功能作用：处理一条事件。写成 Promise 是因为 emitAll 要按顺序 await：当前听众做完（以后包括写盘）再发下一条。
 */
export interface AgentEventReceiver {
	on(event: AgentEvent): Promise<void>;
}

/**
 * 为什么存在：不能在 loop 里写死「打给 Console」；听众是数组，第 5 片再往里加即可。
 * 功能作用：把同一条事件按数组顺序同步发给每一个 receiver。没有 type → 组件路由表。一个抛错就停。
 */
export async function emitAll(
	receivers: readonly AgentEventReceiver[],
	event: AgentEvent,
): Promise<void> {
	for (const receiver of receivers) {
		await receiver.on(event);
	}
}
