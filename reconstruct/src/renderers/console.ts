/**
 * 为什么存在：人要在终端看见 turn 里发生了什么；这些打印不能写在 loop 里。
 * 功能作用：第一个听众。收到全部事件，自己 switch：token_usage 忽略，其余按 type 打印。
 */
import type { AgentEvent, AgentEventReceiver } from "../events.js";

export class ConsoleRenderer implements AgentEventReceiver {
	/**
	 * 为什么存在：fan-out 把每条事件都送来；这里才决定人眼看什么。
	 * 功能作用：按 type 打印。[user] / [assistant] / [tool] 是给人看的标签，不是 API 的 role。
	 */
	async on(event: AgentEvent): Promise<void> {
		switch (event.type) {
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
					console.error(event.result);
				} else {
					console.log(event.result);
				}
				console.log();
				break;
			case "assistant_message":
				console.log(event.text);
				console.log();
				break;
			case "token_usage":
				// 收到了但不印。第 5 片写 jsonl 的听众会全收，包括这一条。
				break;
		}
	}
}
