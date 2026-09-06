/**
 * 为什么存在：要把 system / 历史 messages 和一次 ask() 绑在一起，否则每次提问都丢上下文。
 * 功能作用：构造 OpenAI client 与 messages；ask() 广播 user_message，追加一条 user，再跑完一个 turn。终答走事件，不从 ask 返回。
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { emitAll, type AgentEventReceiver } from "../events.js";
import { runCompletionsTurn } from "./loop.js";

export type AgentConfig = {
	apiKey: string;
	baseURL?: string;
	model: string;
	systemPrompt: string;
};

export class Agent {
	private readonly client: OpenAI;
	private readonly model: string;
	private readonly messages: ChatCompletionMessageParam[] = [];
	private readonly receivers: AgentEventReceiver[];

	constructor(config: AgentConfig, ...receivers: AgentEventReceiver[]) {
		this.model = config.model;
		this.receivers = receivers;
		this.client = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseURL,
		});
		this.messages.push({ role: "system", content: config.systemPrompt });
	}

	async ask(userText: string): Promise<void> {
		await emitAll(this.receivers, { type: "user_message", text: userText });
		this.messages.push({ role: "user", content: userText });
		await runCompletionsTurn(this.client, this.model, this.messages, this.receivers);
	}
}
