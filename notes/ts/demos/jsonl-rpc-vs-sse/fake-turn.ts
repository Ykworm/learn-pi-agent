/**
 * 为什么存在：两根电线要对比同一段 turn，不能一边编一套事件。
 * 功能作用：给出一段固定的假 Agent 事件，不调模型、不跑工具。
 */

export type AgentEvent = {
	type: string;
	[key: string]: unknown;
};

/** 一次「列出当前目录」的假 turn。事件名靠近今天 pi RPC，不是 reconstruct 的 tool_call 流水账。 */
export function fakeTurnEvents(userText: string): AgentEvent[] {
	return [
		{ type: "agent_start" },
		{
			type: "message_update",
			assistantMessageEvent: { type: "text_delta", delta: "我先看一下目录。" },
		},
		{
			type: "tool_execution_start",
			toolName: "bash",
			args: { command: "ls" },
		},
		{
			type: "tool_execution_end",
			toolName: "bash",
			result: "README.md\nnotes/\nreconstruct/",
		},
		{
			type: "message_update",
			assistantMessageEvent: {
				type: "text_delta",
				delta: `目录里有 README.md。你刚才说：${userText}`,
			},
		},
		{ type: "turn_end" },
	];
}
