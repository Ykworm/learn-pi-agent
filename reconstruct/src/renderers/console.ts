/**
 * 为什么存在：人要在终端看见 turn 里发生了什么；这些打印不能写在 loop 里。
 * 功能作用：第一个听众。收到全部事件，自己 switch：token_usage 忽略，其余按 type 打印。
 */
import type { AgentEvent, AgentEventReceiver } from "../events.js";

const TOOL_RESULT_PREVIEW_LINES = 10;

/** 为什么存在：终端只给人看前几行；事件里的 result 仍是工具返回的全文（已按 1 MB 切过）。
 *  功能作用：超过 10 行就只留下开头，并标明还有多少行没印。 */

function previewToolResult(result: string): string {
	const lines = result.split("\n");
	if (lines.length <= TOOL_RESULT_PREVIEW_LINES) {
		return result;
	}
	const hidden = lines.length - TOOL_RESULT_PREVIEW_LINES;
	return `${lines.slice(0, TOOL_RESULT_PREVIEW_LINES).join("\n")}\n... (${hidden} more lines)`;
}

export class ConsoleRenderer implements AgentEventReceiver {
	/**
	 * 为什么存在：fan-out 把每条事件都送来；这里才决定人眼看什么。
	 * 功能作用：按 type 打印。[user] / [assistant] / [tool] 是给人看的标签，不是 API 的 role。
	 */
	async on(event: AgentEvent): Promise<void> {
		switch (event.type) {
			case "session_start":
				console.log(`[session] ${event.sessionId}  model=${event.model}`);
				console.log();
				break;
			case "user_message":
				console.log("[user]");
				console.log(event.text);
				console.log();
				break;
			case "assistant_start":
				console.log("[assistant]");
				break;
			case "tool_call":
				console.log(`[tool] ${event.name}(${event.args})`);
				break;
			case "tool_result":
				if (event.isError) {
					console.error(previewToolResult(event.result));
				} else {
					console.log(previewToolResult(event.result));
				}
				console.log();
				break;
			case "assistant_message":
				console.log(event.text);
				console.log();
				break;
			case "interrupted":
				console.log("[interrupted]");
				console.log();
				break;
			case "token_usage":
				// 收到了但不印。SessionManager 会原样写入 jsonl。
				break;
		}
	}
}
