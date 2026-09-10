/**
 * 为什么存在：程序要消费同一条事件流，不能去解析 Console 的 `[assistant]` 文本。
 * 功能作用：最薄的听众。每条事件一行 JSON 打到 stdout。不 switch type。
 */
import type { AgentEvent, AgentEventReceiver } from "../events.js";

export class JsonRenderer implements AgentEventReceiver {
	async on(event: AgentEvent): Promise<void> {
		console.log(JSON.stringify(event));
	}
}
